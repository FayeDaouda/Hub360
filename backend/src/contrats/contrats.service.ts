import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, StatutAnnexeContrat } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { genererJeton, hacherJeton } from '../auth/jetons';
import { CrmService } from '../crm/crm.service';
import { montantHtLignes, refDevis } from '../devis/domaine';
import { ventilationTva } from '../projets/domaine/gardes';
import { ReglagesService } from '../reglages/reglages.service';
import {
  VARIABLES_CONTRAT,
  formatFcfa,
  modeContrat,
  remplirModele,
  type Signataire,
  signataireRequis,
  variablesInconnues,
} from './domaine';
import { FichierContratDto, ParametresContratDto, SignerContratDto } from './dto';

const AVEC_DETAIL = {
  annexes: { orderBy: { ordre: 'asc' } },
  devis: { include: { lignes: true } },
  dossier: { include: { client: true } },
  societe: { select: { nom: true } },
} satisfies Prisma.ContratInclude;

type ContratDetail = Prisma.ContratGetPayload<{ include: typeof AVEC_DETAIL }>;
type LigneMontant = { tauxTva: Prisma.Decimal; quantite: Prisma.Decimal; prixUnitaire: Prisma.Decimal };
type SignatairesSociete = {
  contratSignataireNom: string | null;
  contratSignataireFonction: string | null;
  contratSignataireCeoNom: string | null;
  contratSignataireCeoFonction: string | null;
};

const montantTtcLignes = (lignes: LigneMontant[]) =>
  lignes.reduce(
    (s, l) =>
      s +
      ventilationTva(Math.round(l.quantite.toNumber() * l.prixUnitaire.toNumber()), l.tauxTva.toNumber()).montantTtc,
    0,
  );

// Nom et fonction du signataire requis, tels que réglés dans Paramètres →
// Contrats (null si non renseignés).
function signataireDe(s: SignatairesSociete, qui: Signataire) {
  const [nom, fonction] =
    qui === 'ceo'
      ? [s.contratSignataireCeoNom, s.contratSignataireCeoFonction]
      : [s.contratSignataireNom, s.contratSignataireFonction];
  return nom && fonction ? { nom, fonction } : null;
}

// Contrat d'un dossier CRM (étape G, cadrage validé 27/09/2026) — cf. modèle
// Contrat dans schema.prisma. Préparé une fois l'offre ACCEPTÉE ; sa
// signature (lien public ou papier scanné) déclenche l'Onboard, dans la même
// transaction (CrmService.onboarderParContrat).
@Injectable()
export class ContratsService {
  constructor(
    private prisma: PrismaService,
    private crm: CrmService,
    private email: EmailService,
    private reglages: ReglagesService,
  ) {}

  // Signataire requis pour une offre, selon le seuil de contresignature CEO
  // (Réglages · Règles et délais, montant TTC).
  private async signatairePour(societeId: string, lignes: LigneMontant[]) {
    const montantTtc = montantTtcLignes(lignes);
    const seuil = await this.reglages.regle<number>(societeId, 'seuil_contresignature_ceo');
    return { qui: signataireRequis(montantTtc, seuil), montantTtc, seuil };
  }

  // -- Back-office (dossier) ---------------------------------------------------

  // Contrat du dossier (null s'il n'est pas encore préparé) + ce qu'il faut
  // pour le préparer : offre acceptée, mode prévu, réglages manquants.
  async get(societeId: string, dossierId: string) {
    const dossier = await this.prisma.dossierCrm.findFirst({
      where: { id: dossierId, societeId },
      include: {
        contrat: { include: AVEC_DETAIL },
        offres: { where: { statut: 'accepte' }, include: { lignes: true }, take: 1 },
        societe: true,
      },
    });
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    const offre = dossier.offres[0] ?? null;
    const seuil = dossier.societe.contratSeuilSurMesureHt?.toNumber() ?? null;
    const montantHt = offre ? montantHtLignes(offre.lignes) : null;
    const mode = montantHt != null ? modeContrat(montantHt, seuil) : null;
    const requis = offre ? await this.signatairePour(societeId, offre.lignes) : null;
    return {
      contrat: dossier.contrat ? this.formater(dossier.contrat) : null,
      preparation: {
        offreAcceptee: offre
          ? { id: offre.id, reference: refDevis(offre), montantHt, montantTtc: requis!.montantTtc }
          : null,
        modePrevu: mode,
        seuilSurMesureHt: seuil,
        // Qui signe pour la société : le CEO au-delà du seuil (TTC), sinon l'Architecte DPLG.
        signataire: requis
          ? {
              qui: requis.qui,
              seuilTtc: requis.seuil,
              ...(signataireDe(dossier.societe, requis.qui) ?? { nom: null, fonction: null }),
            }
          : null,
        reglagesManquants: this.reglagesManquants(dossier.societe, mode, requis?.qui ?? 'dplg'),
      },
    };
  }

  async preparer(societeId: string, dossierId: string) {
    const dossier = await this.prisma.dossierCrm.findFirst({
      where: { id: dossierId, societeId },
      include: {
        contrat: { select: { id: true } },
        client: true,
        societe: true,
        offres: { where: { statut: 'accepte' }, include: { lignes: true }, take: 1 },
      },
    });
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    if (dossier.statut !== 'offre_envoyee') {
      throw new ConflictException('Le contrat se prépare quand l’offre du dossier a été envoyée et acceptée.');
    }
    if (dossier.contrat) throw new ConflictException('Ce dossier a déjà un contrat.');
    const offre = dossier.offres[0];
    if (!offre) {
      throw new ConflictException('Le contrat se prépare une fois l’offre acceptée par le client.');
    }
    const montantHt = montantHtLignes(offre.lignes);
    const mode = modeContrat(montantHt, dossier.societe.contratSeuilSurMesureHt?.toNumber() ?? null);
    const { qui } = await this.signatairePour(societeId, offre.lignes);
    const manquants = this.reglagesManquants(dossier.societe, mode, qui);
    if (manquants.length) {
      throw new UnprocessableEntityException(
        `Contrat impossible à préparer — à renseigner dans Paramètres → Contrats : ${manquants.join(', ')}.`,
      );
    }
    const gabarit = await this.prisma.annexeContratGabarit.findMany({
      where: { societeId, supprimeLe: null },
      orderBy: { ordre: 'asc' },
    });

    await this.prisma.contrat.create({
      data: {
        societeId,
        dossierCrmId: dossierId,
        devisId: offre.id,
        mode,
        montantOffreHt: montantHt,
        signataireNom: signataireDe(dossier.societe, qui)!.nom,
        signataireFonction: signataireDe(dossier.societe, qui)!.fonction,
        contenu:
          mode === 'modele'
            ? this.generer(dossier.societe.contratModele!, {
                societe: dossier.societe.nom,
                dossier,
                offre,
                montantHt,
                signataire: signataireDe(dossier.societe, qui)!,
              })
            : null,
        annexes: {
          create: gabarit.map((g) => ({
            libelle: g.libelle,
            automatique: g.automatique,
            // L'offre acceptée est jointe d'office — pas un fichier.
            statut: g.automatique === 'offre' ? 'jointe' : 'a_joindre',
            ordre: g.ordre,
          })),
        },
      },
    });
    return this.get(societeId, dossierId);
  }

  // Régénère le texte depuis le modèle et le signataire ACTUELS (réglages
  // corrigés entre-temps) — brouillon en mode modèle seulement.
  async regenerer(societeId: string, dossierId: string) {
    const c = await this.brouillon(societeId, dossierId);
    if (c.mode !== 'modele') throw new ConflictException('Contrat sur mesure : rien à générer.');
    const societe = await this.prisma.societe.findUniqueOrThrow({ where: { id: societeId } });
    const { qui } = await this.signatairePour(societeId, c.devis.lignes);
    const manquants = this.reglagesManquants(societe, 'modele', qui);
    if (manquants.length) {
      throw new UnprocessableEntityException(`À renseigner dans Paramètres → Contrats : ${manquants.join(', ')}.`);
    }
    const signataire = signataireDe(societe, qui)!;
    await this.prisma.contrat.update({
      where: { id: c.id },
      data: {
        signataireNom: signataire.nom,
        signataireFonction: signataire.fonction,
        contenu: this.generer(societe.contratModele!, {
          societe: societe.nom,
          dossier: c.dossier,
          offre: c.devis,
          montantHt: c.montantOffreHt.toNumber(),
          signataire,
        }),
      },
    });
    return this.get(societeId, dossierId);
  }

  // Contrat sur mesure : le document rédigé à part.
  async deposerDocument(societeId: string, dossierId: string, f: FichierContratDto) {
    const c = await this.brouillon(societeId, dossierId);
    if (c.mode !== 'sur_mesure') {
      throw new ConflictException('Ce contrat est généré depuis le modèle — pas de document à déposer.');
    }
    await this.prisma.contrat.update({
      where: { id: c.id },
      data: { documentNom: f.nom, documentUrl: f.url },
    });
    return this.get(societeId, dossierId);
  }

  async majAnnexe(
    societeId: string,
    dossierId: string,
    annexeId: string,
    statut: StatutAnnexeContrat,
    fichier?: FichierContratDto,
  ) {
    const c = await this.brouillon(societeId, dossierId);
    const annexe = c.annexes.find((a) => a.id === annexeId);
    if (!annexe) throw new NotFoundException('Annexe introuvable');
    if (annexe.automatique) {
      throw new ConflictException('L’offre acceptée est jointe d’office.');
    }
    await this.prisma.annexeContrat.update({
      where: { id: annexeId },
      data: {
        statut,
        fichierNom: statut === 'jointe' ? fichier!.nom : null,
        fichierUrl: statut === 'jointe' ? fichier!.url : null,
      },
    });
    return this.get(societeId, dossierId);
  }

  // Envoi au client : chaque annexe jointe ou « non nécessaire », document
  // déposé si sur mesure. Nouveau lien public (jeton, seul le hash stocké).
  async envoyer(societeId: string, dossierId: string) {
    const c = await this.brouillon(societeId, dossierId);
    const aJoindre = c.annexes.filter((a) => a.statut === 'a_joindre').map((a) => a.libelle);
    if (aJoindre.length) {
      throw new UnprocessableEntityException(
        `Annexes à joindre (ou marquer « non nécessaire ») : ${aJoindre.join(', ')}.`,
      );
    }
    if (c.mode === 'sur_mesure' && !c.documentUrl) {
      throw new UnprocessableEntityException('Dépose d’abord le contrat rédigé sur mesure.');
    }
    const { clair, hash } = genererJeton();
    await this.prisma.contrat.update({
      where: { id: c.id },
      data: { statut: 'envoye', tokenPublicHash: hash, dateEnvoi: new Date() },
    });
    const lienPublic = `${process.env.FRONT_URL || 'http://localhost:3000'}/contrat/${clair}`;
    const emailEnvoye = c.dossier.client.email
      ? (
          await this.email.envoyerContrat({
            email: c.dossier.client.email,
            clientNom: c.dossier.client.nom,
            societeNom: c.societe.nom,
            codeDossier: c.dossier.code,
            lien: lienPublic,
          })
        ).envoye
      : false;
    return { ...(await this.get(societeId, dossierId)), lienPublic, emailEnvoye };
  }

  // Retire l'envoi (correction avant signature) : le lien cesse de marcher,
  // le contrat redevient modifiable.
  async retirerEnvoi(societeId: string, dossierId: string) {
    const c = await this.charger(societeId, dossierId);
    if (c.statut !== 'envoye') throw new ConflictException('Seul un contrat envoyé non signé se retire.');
    await this.prisma.contrat.update({
      where: { id: c.id },
      data: { statut: 'brouillon', tokenPublicHash: null, dateEnvoi: null },
    });
    return this.get(societeId, dossierId);
  }

  // Contrat papier signé, scanné, déposé par l'équipe — vaut signature :
  // Onboard dans la même transaction.
  async signerPapier(societeId: string, dossierId: string, userId: string, scan: FichierContratDto) {
    const c = await this.charger(societeId, dossierId);
    if (c.statut === 'signe') throw new ConflictException('Ce contrat est déjà signé.');
    if (c.statut === 'brouillon') this.exigerPret(c);
    const r = await this.crm.onboarderParContrat(societeId, dossierId, userId, async (tx) => {
      await tx.contrat.update({
        where: { id: c.id },
        data: {
          statut: 'signe',
          signeLe: new Date(),
          modeSignature: 'papier',
          scanNom: scan.nom,
          scanUrl: scan.url,
          tokenPublicHash: null,
        },
      });
    });
    return { ...(await this.get(societeId, dossierId)), facturesPreparees: r.facturesPreparees };
  }

  // -- Lien public (sans compte) ------------------------------------------------

  async getPublic(token: string) {
    const c = await this.chargerParToken(token);
    const { montantTtc } = this.montants(c);
    return {
      societe: c.societe.nom,
      clientNom: c.dossier.client.nom,
      codeDossier: c.dossier.code,
      programme: c.dossier.programme,
      mode: c.mode,
      contenu: c.contenu,
      document: c.documentNom ? { nom: c.documentNom } : null,
      signataire: { nom: c.signataireNom, fonction: c.signataireFonction },
      offre: {
        reference: refDevis(c.devis),
        montantHt: c.montantOffreHt.toNumber(),
        montantTtc,
      },
      annexes: c.annexes.map((a) => ({
        id: a.id,
        libelle: a.libelle,
        statut: a.statut,
        automatique: a.automatique,
        fichierNom: a.fichierNom,
      })),
      statut: c.statut,
      signeLe: c.signeLe,
      // Signable : envoyé, non signé, et le dossier attend encore sa signature
      // (pas déclaré perdu entre-temps).
      peutSigner: c.statut === 'envoye' && c.dossier.statut === 'offre_envoyee',
    };
  }

  // Fichier d'une annexe ou du contrat sur mesure (data URI) — même jeton.
  async fichierPublic(token: string, cible: 'document' | string) {
    const c = await this.chargerParToken(token);
    if (cible === 'document') {
      if (!c.documentUrl) throw new NotFoundException('Document introuvable');
      return { nom: c.documentNom, url: c.documentUrl };
    }
    const a = c.annexes.find((x) => x.id === cible && x.fichierUrl);
    if (!a) throw new NotFoundException('Annexe introuvable');
    return { nom: a.fichierNom, url: a.fichierUrl };
  }

  async signerPublic(token: string, dto: SignerContratDto, ip: string | null) {
    const c = await this.chargerParToken(token);
    if (c.statut !== 'envoye') throw new ConflictException('Ce contrat n’attend pas de signature.');
    await this.crm.onboarderParContrat(c.societeId, c.dossierCrmId, null, async (tx) => {
      const { count } = await tx.contrat.updateMany({
        where: { id: c.id, statut: 'envoye' },
        data: {
          statut: 'signe',
          signeLe: new Date(),
          modeSignature: dto.mode,
          signeParNom: dto.nom.trim(),
          signatureTrace: dto.mode === 'trace' ? dto.signatureTrace : null,
          signeIp: ip,
        },
      });
      if (count === 0) throw new ConflictException('Ce contrat vient d’être signé.');
    });
    return this.getPublic(token);
  }

  // -- Réglages société (Paramètres → Contrats) ------------------------------

  async getParametres(societeId: string) {
    const [s, annexes] = await Promise.all([
      this.prisma.societe.findUniqueOrThrow({ where: { id: societeId } }),
      this.prisma.annexeContratGabarit.findMany({
        where: { societeId, supprimeLe: null },
        orderBy: { ordre: 'asc' },
      }),
    ]);
    return {
      modele: s.contratModele,
      signataireNom: s.contratSignataireNom,
      signataireFonction: s.contratSignataireFonction,
      signataireCeoNom: s.contratSignataireCeoNom,
      signataireCeoFonction: s.contratSignataireCeoFonction,
      seuilSurMesureHt: s.contratSeuilSurMesureHt?.toNumber() ?? null,
      variables: VARIABLES_CONTRAT,
      annexes: annexes.map((a) => ({ id: a.id, libelle: a.libelle, automatique: a.automatique })),
    };
  }

  async majParametres(societeId: string, dto: ParametresContratDto) {
    if (dto.modele) {
      const inconnues = variablesInconnues(dto.modele);
      if (inconnues.length) {
        throw new UnprocessableEntityException(
          `Champs inconnus dans le modèle : ${inconnues.map((v) => `{{${v}}}`).join(', ')}.`,
        );
      }
    }
    const vide = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
    await this.prisma.societe.update({
      where: { id: societeId },
      data: {
        contratModele: vide(dto.modele),
        contratSignataireNom: vide(dto.signataireNom),
        contratSignataireFonction: vide(dto.signataireFonction),
        contratSignataireCeoNom: vide(dto.signataireCeoNom),
        contratSignataireCeoFonction: vide(dto.signataireCeoFonction),
        contratSeuilSurMesureHt: dto.seuilSurMesureHt === undefined ? undefined : dto.seuilSurMesureHt,
      },
    });
    return this.getParametres(societeId);
  }

  async ajouterAnnexeGabarit(societeId: string, libelle: string) {
    const { _max } = await this.prisma.annexeContratGabarit.aggregate({
      where: { societeId },
      _max: { ordre: true },
    });
    await this.prisma.annexeContratGabarit.create({
      data: { societeId, libelle: libelle.trim(), ordre: (_max.ordre ?? -1) + 1 },
    });
    return this.getParametres(societeId);
  }

  // Retrait doux : les contrats déjà préparés gardent leurs annexes.
  async retirerAnnexeGabarit(societeId: string, id: string) {
    const a = await this.prisma.annexeContratGabarit.findFirst({ where: { id, societeId, supprimeLe: null } });
    if (!a) throw new NotFoundException('Annexe introuvable');
    if (a.automatique) throw new ConflictException('L’offre acceptée est une annexe obligatoire.');
    await this.prisma.annexeContratGabarit.update({ where: { id }, data: { supprimeLe: new Date() } });
    return this.getParametres(societeId);
  }

  // -- Internes ------------------------------------------------------------------

  private reglagesManquants(
    s: SignatairesSociete & { contratModele: string | null },
    mode: 'modele' | 'sur_mesure' | null,
    qui: Signataire,
  ): string[] {
    const manquants: string[] = [];
    const titre = qui === 'ceo' ? 'du signataire au-delà du seuil (CEO)' : 'du signataire (Architecte DPLG)';
    const [nom, fonction] =
      qui === 'ceo'
        ? [s.contratSignataireCeoNom, s.contratSignataireCeoFonction]
        : [s.contratSignataireNom, s.contratSignataireFonction];
    if (!nom) manquants.push(`nom ${titre}`);
    if (!fonction) manquants.push(`fonction ${titre}`);
    if (mode === 'modele' && !s.contratModele?.trim()) manquants.push('modèle de contrat');
    return manquants;
  }

  private generer(
    modele: string,
    x: {
      societe: string;
      dossier: { code: string; programme: string; localisation: string; client: { nom: string } };
      offre: {
        numero: number | null;
        dateEnvoi: Date | null;
        codeDossier: string | null;
        rangDossier: number | null;
        lignes: { tauxTva: Prisma.Decimal; quantite: Prisma.Decimal; prixUnitaire: Prisma.Decimal }[];
      };
      montantHt: number;
      signataire: { nom: string; fonction: string };
    },
  ): string {
    const montantTtc = montantTtcLignes(x.offre.lignes);
    return remplirModele(modele, {
      societe: x.societe,
      client: x.dossier.client.nom,
      code_dossier: x.dossier.code,
      programme: x.dossier.programme,
      localisation: x.dossier.localisation,
      reference_offre: refDevis(x.offre) ?? '',
      montant_offre_ht: formatFcfa(x.montantHt),
      montant_offre_ttc: formatFcfa(montantTtc),
      date: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
      signataire_nom: x.signataire.nom,
      signataire_fonction: x.signataire.fonction,
    });
  }

  private montants(c: ContratDetail) {
    return { montantTtc: montantTtcLignes(c.devis.lignes) };
  }

  private async charger(societeId: string, dossierId: string): Promise<ContratDetail> {
    const c = await this.prisma.contrat.findFirst({
      where: { dossierCrmId: dossierId, societeId },
      include: AVEC_DETAIL,
    });
    if (!c) throw new NotFoundException('Contrat introuvable');
    return c;
  }

  private async brouillon(societeId: string, dossierId: string) {
    const c = await this.charger(societeId, dossierId);
    if (c.statut !== 'brouillon') {
      throw new ConflictException('Contrat envoyé ou signé — retire l’envoi pour le modifier.');
    }
    return c;
  }

  private exigerPret(c: ContratDetail) {
    if (c.annexes.some((a) => a.statut === 'a_joindre') || (c.mode === 'sur_mesure' && !c.documentUrl)) {
      throw new UnprocessableEntityException(
        'Complète le contrat (annexes, document sur mesure) avant d’enregistrer sa signature.',
      );
    }
  }

  private async chargerParToken(token: string): Promise<ContratDetail> {
    const c = await this.prisma.contrat.findFirst({
      where: { tokenPublicHash: hacherJeton(token) },
      include: AVEC_DETAIL,
    });
    if (!c) throw new NotFoundException('Contrat introuvable');
    return c;
  }

  private formater(c: ContratDetail) {
    return {
      id: c.id,
      mode: c.mode,
      statut: c.statut,
      contenu: c.contenu,
      montantOffreHt: c.montantOffreHt.toNumber(),
      signataire: { nom: c.signataireNom, fonction: c.signataireFonction },
      document: c.documentNom ? { nom: c.documentNom } : null,
      dateEnvoi: c.dateEnvoi,
      signeLe: c.signeLe,
      modeSignature: c.modeSignature,
      signeParNom: c.signeParNom,
      signatureTrace: c.signatureTrace,
      scan: c.scanNom ? { nom: c.scanNom } : null,
      annexes: c.annexes.map((a) => ({
        id: a.id,
        libelle: a.libelle,
        automatique: a.automatique,
        statut: a.statut,
        fichierNom: a.fichierNom,
      })),
    };
  }
}

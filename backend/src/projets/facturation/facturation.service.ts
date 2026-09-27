import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { FactureStatut, FactureType, NatureDossier, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { chargerProjet } from '../projet-acces';
import {
  JALONS_FACTURE,
  refFacture,
  TAUX_TVA_DEFAUT,
  typeFactureDepuisNature,
} from '../domaine/config';
import {
  joursRetardFacture,
  statutFactureEffectif,
  ventilationTva,
} from '../domaine/gardes';
import { FAMILLES_MENSUELLES, planFacturationOffre } from '../domaine/facturation-offre';
import { montantRefacture, statutReglementBureau } from '../domaine/refacturation-etudes';
import {
  AjouterPaiementDto,
  CreerEcheancierDto,
  CreerFactureDto,
  PatchFactureDto,
} from './dto';
import { EmailService } from '../../email/email.service';

const jourCourant = () => new Date().toISOString().slice(0, 10);

// Facturation client — module admin-only (le contrôleur ne marque aucun
// endpoint @EcritureCollaborateur, donc AccesProjetGuard rejette toute écriture
// d'un collaborateur ; la lecture suit la règle projet habituelle, comme le
// pré-bilan). Cf. cadrage « Facturation client ».
@Injectable()
export class FacturationService {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  async get(societeId: string, projetId: string) {
    await chargerProjet(this.prisma, societeId, projetId);
    return this.formater(projetId);
  }

  async creer(societeId: string, projetId: string, dto: CreerFactureDto) {
    const projet = await chargerProjet(this.prisma, societeId, projetId);
    await this.prisma.facture.create({
      data: {
        societeId,
        projetId,
        type: typeFactureDepuisNature(projet.nature),
        montantHt: dto.montantHt ?? 0,
        tauxTva: dto.tauxTva ?? TAUX_TVA_DEFAUT,
        echeanceLe: dto.echeanceLe ?? null,
        libelle: dto.libelle?.trim() ?? '',
      },
    });
    return this.formater(projetId);
  }

  async creerEcheancier(
    societeId: string,
    projetId: string,
    dto: CreerEcheancierDto,
  ) {
    const projet = await chargerProjet(this.prisma, societeId, projetId);
    if (projet.nature !== 'mandat_client') {
      throw new UnprocessableEntityException(
        "L'échéancier par jalon ne concerne que les mandats client.",
      );
    }
    const dejaUnEcheancier = await this.prisma.facture.count({
      where: { projetId, jalon: { not: null } },
    });
    if (dejaUnEcheancier > 0) {
      throw new ConflictException('Un échéancier existe déjà pour ce projet.');
    }

    const tauxTva = dto.tauxTva ?? TAUX_TVA_DEFAUT;
    await this.prisma.facture.createMany({
      data: JALONS_FACTURE.map((j) => ({
        societeId,
        projetId,
        type: typeFactureDepuisNature(projet.nature), // = honoraires (mandat client)
        jalon: j.cle,
        montantHt: dto.montants[j.cle],
        tauxTva,
        echeanceLe: dto.echeances?.[j.cle] ?? null,
        libelle: j.libelle,
      })),
    });
    return this.formater(projetId);
  }

  async patch(
    societeId: string,
    projetId: string,
    factureId: string,
    dto: PatchFactureDto,
  ) {
    await chargerProjet(this.prisma, societeId, projetId);
    const facture = await this.brouillon(projetId, factureId);
    // Facture à lignes (refacturation d'études) : son montant EST la somme de
    // ses lignes — on ne le saisit pas (supprimer le brouillon pour refaire).
    if (dto.montantHt !== undefined && (await this.prisma.ligneFacture.count({ where: { factureId } }))) {
      throw new UnprocessableEntityException(
        'Le montant d’une facture à lignes est la somme de ses lignes — il ne se saisit pas.',
      );
    }

    const data: Prisma.FactureUpdateInput = {};
    if (dto.montantHt !== undefined) data.montantHt = dto.montantHt;
    if (dto.tauxTva !== undefined) data.tauxTva = dto.tauxTva;
    if (dto.echeanceLe !== undefined) data.echeanceLe = dto.echeanceLe;
    if (dto.libelle !== undefined) data.libelle = dto.libelle.trim();

    await this.prisma.facture.update({ where: { id: facture.id }, data });
    return this.formater(projetId);
  }

  async emettre(societeId: string, projetId: string, factureId: string) {
    await chargerProjet(this.prisma, societeId, projetId);
    const facture = await this.brouillon(projetId, factureId);
    if (facture.montantHt.lte(0)) {
      throw new UnprocessableEntityException(
        "Renseignez un montant HT avant d'émettre la facture.",
      );
    }
    // Transition conditionnée sur `statut` dans la transaction : deux émissions
    // concurrentes du même brouillon ne peuvent pas consommer deux numéros.
    await this.avecSequence(societeId, async (tx, numero) => {
      const r = await tx.facture.updateMany({
        where: { id: facture.id, statut: 'brouillon' },
        data: { numero, statut: 'emise', emiseLe: new Date() },
      });
      if (r.count === 0) throw new ConflictException('Facture déjà émise.');
    });
    return this.formater(projetId);
  }

  async supprimer(societeId: string, projetId: string, factureId: string) {
    await chargerProjet(this.prisma, societeId, projetId);
    const facture = await this.brouillon(projetId, factureId);
    await this.prisma.facture.delete({ where: { id: facture.id } });
    return this.formater(projetId);
  }

  // Correction d'une facture émise (cadrage §5) : on n'édite pas, on émet un
  // avoir qui la porte en négatif et bascule l'originale en « annulée ».
  async creerAvoir(societeId: string, projetId: string, factureId: string) {
    await chargerProjet(this.prisma, societeId, projetId);
    const facture = await this.prisma.facture.findFirst({
      where: { id: factureId, projetId, societeId },
    });
    if (!facture) throw new NotFoundException('Facture introuvable');
    if (facture.estAvoir) {
      throw new ConflictException("Un avoir ne s'annule pas par un autre avoir.");
    }
    if (facture.statut !== 'emise') {
      throw new ConflictException(
        'Seule une facture émise peut être annulée par un avoir.',
      );
    }

    await this.avecSequence(societeId, async (tx, numero) => {
      // Annulation conditionnée sur `statut` : deux avoirs concurrents sur la
      // même facture sont exclus (le 2ᵉ voit statut ≠ emise).
      const r = await tx.facture.updateMany({
        where: { id: facture.id, statut: 'emise', estAvoir: false },
        data: { statut: 'annulee', annuleeLe: new Date() },
      });
      if (r.count === 0) throw new ConflictException('Facture déjà annulée.');
      await tx.facture.create({
        data: {
          societeId,
          projetId,
          numero,
          statut: 'emise',
          estAvoir: true,
          emiseLe: new Date(),
          type: facture.type,
          jalon: facture.jalon,
          montantHt: facture.montantHt.negated(),
          tauxTva: facture.tauxTva,
          factureOrigineId: facture.id,
          libelle: `Avoir sur ${refFacture(facture.numero, facture.emiseLe, false)}`,
        },
      });
    });
    return this.formater(projetId);
  }

  async ajouterPaiement(
    societeId: string,
    projetId: string,
    factureId: string,
    dto: AjouterPaiementDto,
  ) {
    await chargerProjet(this.prisma, societeId, projetId);
    const facture = await this.prisma.facture.findFirst({
      where: { id: factureId, projetId, societeId },
      select: { id: true, statut: true, estAvoir: true },
    });
    if (!facture) throw new NotFoundException('Facture introuvable');
    if (facture.estAvoir) {
      throw new ConflictException('Un avoir ne reçoit pas de paiement.');
    }
    if (facture.statut !== 'emise') {
      throw new ConflictException('Seule une facture émise reçoit des paiements.');
    }

    await this.prisma.paiement.create({
      data: {
        factureId: facture.id,
        date: dto.date,
        montant: dto.montant,
        mode: dto.mode ?? null,
        reference: dto.reference?.trim() ?? '',
      },
    });
    return this.formater(projetId);
  }

  async supprimerPaiement(
    societeId: string,
    projetId: string,
    factureId: string,
    paiementId: string,
  ) {
    await chargerProjet(this.prisma, societeId, projetId);
    const facture = await this.prisma.facture.findFirst({
      where: { id: factureId, projetId, societeId },
      select: { id: true },
    });
    if (!facture) throw new NotFoundException('Facture introuvable');
    await this.prisma.paiement.deleteMany({
      where: { id: paiementId, factureId: facture.id },
    });
    return this.formater(projetId);
  }

  // Liste À PLAT, toutes sociétés confondues... non : toute LA société, tous
  // projets confondus — pour la page centrale Facturation (cf. cadrage
  // « Devis » §page centrale). N'existait pas avant le module Devis : les
  // requêtes historiques sont toutes scopées à un projetId (cf. formater() ci-
  // dessous, inchangé). Le client d'une facture SANS projet (convertie depuis
  // un devis « libre ») se résout via devisOrigine.client — Facture n'a pas de
  // clientId propre, jamais dupliqué depuis projet.clientId.
  async findAllPourSociete(
    societeId: string,
    filtres: { statut?: FactureStatut; projetId?: string; clientId?: string },
  ) {
    const factures = await this.prisma.facture.findMany({
      where: {
        societeId,
        statut: filtres.statut,
        projetId: filtres.projetId,
        ...(filtres.clientId
          ? {
              OR: [
                { projet: { clientId: filtres.clientId } },
                { devisOrigine: { clientId: filtres.clientId } },
              ],
            }
          : {}),
      },
      include: {
        paiements: true,
        projet: { select: { id: true, code: true, programme: true, client: true } },
        devisOrigine: { select: { numero: true, client: true } },
        lignes: { orderBy: { ordre: 'asc' } },
      },
      orderBy: [{ creeLe: 'desc' }],
    });
    const aujourdhui = jourCourant();

    return factures.map((f) => {
      const montantHt = f.montantHt.toNumber();
      const tauxTva = f.tauxTva.toNumber();
      const { montantTva, montantTtc } = ventilationTva(montantHt, tauxTva);
      const montantPaye = f.paiements.reduce((s, p) => s + p.montant.toNumber(), 0);
      const statutEffectif = statutFactureEffectif(
        { statut: f.statut, echeanceLe: f.echeanceLe, montantTtc, montantPaye },
        aujourdhui,
      );
      const client = f.projet?.client ?? f.devisOrigine?.client ?? null;
      return {
        id: f.id,
        numero: f.numero,
        reference: refFacture(f.numero, f.emiseLe, f.estAvoir),
        type: f.type,
        jalon: f.jalon,
        libelle: f.libelle,
        statut: f.statut,
        statutEffectif,
        montantHt,
        tauxTva,
        montantTva,
        montantTtc,
        echeanceLe: f.echeanceLe,
        estAvoir: f.estAvoir,
        factureOrigineId: f.factureOrigineId,
        devisOrigineId: f.devisOrigineId,
        creeLe: f.creeLe,
        emiseLe: f.emiseLe,
        annuleeLe: f.annuleeLe,
        montantPaye,
        resteAPayer: montantTtc - montantPaye,
        joursRetard:
          statutEffectif === 'en_retard' ? joursRetardFacture(f.echeanceLe, aujourdhui) : 0,
        projetId: f.projetId,
        projet: f.projet ? { id: f.projet.id, code: f.projet.code, programme: f.projet.programme } : null,
        client: client ? { id: client.id, nom: client.nom } : null,
        lignes: f.lignes.map(versLigneFacture),
      };
    });
  }

  // Relance MANUELLE d'une facture en retard — cf. cadrage « Devis »
  // §Zervant : pas de scheduler dans ce backend (statuts dérivés à la
  // lecture, jamais un job planifié), donc pas de relance automatique non
  // plus. L'admin déclenche lui-même, au moment qu'il juge utile — zéro
  // nouvelle infra, zéro champ stocké (pas d'historique de relance en v1).
  async relancer(societeId: string, factureId: string): Promise<{ envoye: boolean }> {
    const f = await this.prisma.facture.findFirst({
      where: { id: factureId, societeId },
      include: {
        paiements: true,
        projet: { select: { client: true } },
        devisOrigine: { select: { numero: true, client: true } },
        societe: { select: { nom: true } },
      },
    });
    if (!f) throw new NotFoundException('Facture introuvable');

    const montantHt = f.montantHt.toNumber();
    const tauxTva = f.tauxTva.toNumber();
    const { montantTtc } = ventilationTva(montantHt, tauxTva);
    const montantPaye = f.paiements.reduce((s, p) => s + p.montant.toNumber(), 0);
    const aujourdhui = jourCourant();
    const statutEffectif = statutFactureEffectif(
      { statut: f.statut, echeanceLe: f.echeanceLe, montantTtc, montantPaye },
      aujourdhui,
    );
    if (statutEffectif !== 'en_retard') {
      throw new ConflictException('Seule une facture en retard peut être relancée.');
    }

    const client = f.projet?.client ?? f.devisOrigine?.client ?? null;
    if (!client?.email) {
      throw new UnprocessableEntityException("Ce client n'a pas d'adresse email enregistrée.");
    }

    const { envoye } = await this.email.envoyerRelanceFacture({
      email: client.email,
      clientNom: client.nom,
      societeNom: f.societe.nom,
      reference: refFacture(f.numero, f.emiseLe, f.estAvoir),
      resteAPayer: montantTtc - montantPaye,
      echeanceLe: f.echeanceLe,
      joursRetard: joursRetardFacture(f.echeanceLe, aujourdhui),
    });
    return { envoye };
  }

  // Émission directe depuis un devis accepté (cf. DevisService.convertir,
  // module src/devis) : le client a déjà accepté, il n'y a pas de brouillon à
  // faire valider — la facture naît émise. `devisOrigineId` porte la
  // traçabilité vers le détail ligne par ligne du devis (Facture reste à
  // montant unique, cf. cadrage « Devis » — jamais de refonte de ce système
  // déjà livré et testé pour lui ajouter des lignes).
  async creerDepuisDevis(
    societeId: string,
    data: {
      projetId: string | null;
      type: FactureType;
      libelle: string;
      montantHt: number;
      tauxTva: number;
      devisOrigineId: string;
    },
  ): Promise<string> {
    let factureId = '';
    await this.avecSequence(societeId, async (tx, numero) => {
      const f = await tx.facture.create({
        data: {
          societeId,
          projetId: data.projetId,
          numero,
          type: data.type,
          statut: 'emise',
          libelle: data.libelle,
          montantHt: data.montantHt,
          tauxTva: data.tauxTva,
          emiseLe: new Date(),
          devisOrigineId: data.devisOrigineId,
        },
      });
      factureId = f.id;
    });
    return factureId;
  }

  // Étape H2 — au passage du dossier à « onboard » (appelé DANS la transaction
  // pivot de CrmService) : l'offre acceptée devient des factures BROUILLON sur
  // le nouveau projet, selon les CGV (cf. domaine/facturation-offre.ts). Rien
  // n'est émis : chaque facture part quand l'admin juge l'étape atteinte
  // (décision : pas d'accrochage automatique aux jalons, tant que l'étape D
  // n'a pas posé les données qui les marqueraient).
  async preparerDepuisOffre(
    tx: Prisma.TransactionClient,
    societeId: string,
    projet: { id: string; nature: NatureDossier },
    devisId: string,
  ): Promise<number> {
    const lignes = await tx.ligneDevis.findMany({
      where: { devisId },
      include: { produitService: { select: { code: true, famille: true } } },
      orderBy: { ordre: 'asc' },
    });
    const plan = planFacturationOffre(
      lignes.map((l) => ({
        code: l.produitService?.code ?? null,
        famille: l.produitService?.famille ?? null,
        designation: l.designation,
        montantHt: Math.round(l.quantite.toNumber() * l.prixUnitaire.toNumber()),
        tauxTva: l.tauxTva.toNumber(),
      })),
    );
    await tx.facture.createMany({
      data: plan.map((f) => ({
        societeId,
        projetId: projet.id,
        type: typeFactureDepuisNature(projet.nature),
        jalon: f.jalon,
        libelle: f.libelle,
        montantHt: f.montantHt,
        tauxTva: f.tauxTva,
        devisEcheancierId: devisId,
      })),
    });
    return plan.length;
  }

  // Facture (brouillon) de la mensualité en cours d'une ligne SU / EX de
  // l'offre — facturation mensuelle MANUELLE (pas de scheduler) : le rappel
  // « à facturer ce mois » est dérivé à la lecture (cf. formater).
  async creerMensualite(societeId: string, projetId: string, ligneDevisId: string) {
    const projet = await chargerProjet(this.prisma, societeId, projetId);
    const [ligne] = await this.lignesMensuelles(projetId, ligneDevisId);
    if (!ligne) throw new NotFoundException('Ligne mensuelle introuvable pour ce projet');
    const m = this.etatMensualite(ligne, projet.phase);
    if (m.moisFactures >= m.moisPrevus) {
      throw new ConflictException('Toutes les mensualités prévues à l’offre sont déjà facturées.');
    }
    if (m.factureCeMois) {
      throw new ConflictException('La mensualité de ce mois est déjà facturée.');
    }
    const mois = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    await this.prisma.facture.create({
      data: {
        societeId,
        projetId,
        type: typeFactureDepuisNature(projet.nature),
        libelle: `${m.nom} — mensualité ${m.moisFactures + 1}/${m.moisPrevus} (${mois})`,
        montantHt: Math.round(ligne.prixUnitaire.toNumber()),
        tauxTva: ligne.tauxTva.toNumber(),
        ligneDevisId,
      },
    });
    return this.formater(projetId);
  }

  // Étape H3 — refacturation des études techniques (option B : UNE facture,
  // une ligne par étude, CGV art. 5). Chaque étude doit avoir son bureau et le
  // montant HT de sa facture (saisis dans Études), et aucune refacturation
  // active. La facture naît brouillon, taux de TVA unique (défaut 18 %).
  async refacturerEtudes(societeId: string, projetId: string, blocIds: string[]) {
    const projet = await chargerProjet(this.prisma, societeId, projetId);
    const blocs = await this.prisma.blocEtude.findMany({
      where: { id: { in: blocIds }, projetId, supprimee: false },
      include: { lignesFacture: { include: { facture: { select: { statut: true, estAvoir: true } } } } },
    });
    if (blocs.length !== new Set(blocIds).size) {
      throw new NotFoundException('Étude introuvable pour ce projet.');
    }
    for (const b of blocs) {
      if (!b.interlocuteur.trim() || !b.factureMontant || b.factureMontant.toNumber() <= 0) {
        throw new UnprocessableEntityException(
          `« ${b.libelle} » : renseigne le bureau d’études et le montant HT de sa facture (section Études).`,
        );
      }
      if (b.lignesFacture.some((l) => l.facture.statut !== 'annulee' && !l.facture.estAvoir)) {
        throw new ConflictException(`« ${b.libelle} » est déjà refacturée.`);
      }
    }
    const ordonnes = blocIds.map((id) => blocs.find((b) => b.id === id)!);
    const lignes = ordonnes.map((b, ordre) => {
      const base = Math.round(b.factureMontant!.toNumber());
      return {
        designation: `${b.libelle} — ${b.interlocuteur.trim()}`,
        montantBase: base,
        montantHt: montantRefacture(base),
        blocEtudeId: b.id,
        ordre,
      };
    });
    await this.prisma.facture.create({
      data: {
        societeId,
        projetId,
        type: typeFactureDepuisNature(projet.nature),
        libelle: 'Refacturation des études techniques',
        montantHt: lignes.reduce((s, l) => s + l.montantHt, 0),
        tauxTva: TAUX_TVA_DEFAUT,
        lignes: { create: lignes },
      },
    });
    return this.formater(projetId);
  }

  // Le bureau a été réglé par Grey Concrete — possible seulement une fois le
  // client encaissé (« à régler »). Acte de charge : CFO (finances_charges,
  // cf. contrôleur).
  async marquerBureauRegle(societeId: string, projetId: string, blocId: string, userId: string) {
    await chargerProjet(this.prisma, societeId, projetId);
    const bloc = await this.prisma.blocEtude.findFirst({
      where: { id: blocId, projetId, supprimee: false },
      select: { id: true, bureauRegleLe: true },
    });
    if (!bloc) throw new NotFoundException('Étude introuvable pour ce projet.');
    const etat = (await this.formater(projetId)).etudes.find((e) => e.blocId === blocId);
    if (etat?.statutReglement !== 'a_regler') {
      throw new ConflictException(
        'Le bureau ne se règle qu’après l’encaissement complet de la facture client (CGV art. 5).',
      );
    }
    await this.prisma.blocEtude.update({
      where: { id: blocId },
      data: { bureauRegleLe: new Date(), bureauRegleParId: userId },
    });
    return this.formater(projetId);
  }

  // Bureaux d'études à régler, toute la société (page Facturation centrale) :
  // facture de refacturation soldée, règlement pas encore saisi.
  async bureauxARegler(societeId: string) {
    const blocs = await this.prisma.blocEtude.findMany({
      where: {
        supprimee: false,
        bureauRegleLe: null,
        etudes: { projet: { societeId } },
        lignesFacture: { some: { facture: { statut: 'emise', estAvoir: false } } },
      },
      include: {
        etudes: { select: { projet: { select: { id: true, code: true, programme: true } } } },
        lignesFacture: {
          where: { facture: { statut: 'emise', estAvoir: false } },
          include: { facture: { include: { paiements: true } } },
        },
      },
    });
    const aujourdhui = jourCourant();
    return blocs.flatMap((b) => {
      const ligne = b.lignesFacture[0];
      const f = ligne.facture;
      const { montantTtc } = ventilationTva(f.montantHt.toNumber(), f.tauxTva.toNumber());
      const montantPaye = f.paiements.reduce((s, p) => s + p.montant.toNumber(), 0);
      const statut = statutFactureEffectif(
        { statut: f.statut, echeanceLe: f.echeanceLe, montantTtc, montantPaye },
        aujourdhui,
      );
      if (statut !== 'payee') return [];
      return [
        {
          blocId: b.id,
          libelle: b.libelle,
          bureau: b.interlocuteur,
          montantBureauHt: ligne.montantBase?.toNumber() ?? null,
          factureReference: refFacture(f.numero, f.emiseLe, false),
          projet: b.etudes.projet,
        },
      ];
    });
  }

  // Référence courte des projets de la société, pour la section Facturation
  // (filtre, choix du projet d'un devis) — ses propres données, sans ouvrir
  // les routes Projets aux rôles de direction.
  async projetsPourFacturation(societeId: string) {
    const projets = await this.prisma.projet.findMany({
      where: { societeId },
      select: {
        id: true,
        code: true,
        programme: true,
        client: { select: { id: true, nom: true } },
        dossierCrm: { select: { categorieConception: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Catégorie CO (fixée à l'envoi de l'offre) : tarif des reprises majeures
    // et suivi de chantier d'un devis complémentaire (étape H4).
    return projets.map(({ dossierCrm, ...p }) => ({
      ...p,
      categorieConception: dossierCrm?.categorieConception ?? null,
    }));
  }

  // -- Internes --------------------------------------------------------------

  // Lignes SU / EX d'une offre acceptée rattachée au projet, avec leurs
  // mensualités déjà facturées.
  private lignesMensuelles(projetId: string, ligneDevisId?: string) {
    return this.prisma.ligneDevis.findMany({
      where: {
        id: ligneDevisId,
        devis: { projetId, statut: { in: ['accepte', 'transforme'] } },
        produitService: { famille: { in: FAMILLES_MENSUELLES } },
      },
      include: {
        produitService: { select: { code: true } },
        mensualites: { select: { statut: true, estAvoir: true, creeLe: true } },
      },
      orderBy: { ordre: 'asc' },
    });
  }

  // Une mensualité annulée par avoir ne compte plus (le mois peut se
  // refacturer). « À facturer ce mois » : projet en chantier (SU = suivi de
  // chantier, EX = extras de chantier), mois restants, rien ce mois-ci.
  private etatMensualite(
    l: Awaited<ReturnType<FacturationService['lignesMensuelles']>>[number],
    phase: string,
  ) {
    const valides = l.mensualites.filter((f) => f.statut !== 'annulee' && !f.estAvoir);
    const moisCourant = jourCourant().slice(0, 7);
    const moisPrevus = Math.round(l.quantite.toNumber());
    const moisFactures = valides.length;
    const factureCeMois = valides.some((f) => f.creeLe.toISOString().slice(0, 7) === moisCourant);
    return {
      nom: l.produitService?.code ? `${l.produitService.code} — ${l.designation.replace(/^\S+ — /, '')}` : l.designation,
      moisPrevus,
      moisFactures,
      factureCeMois,
      aFacturerCeMois: phase === 'chantier' && moisFactures < moisPrevus && !factureCeMois,
    };
  }

  private async brouillon(projetId: string, factureId: string) {
    const facture = await this.prisma.facture.findFirst({
      where: { id: factureId, projetId },
    });
    if (!facture) throw new NotFoundException('Facture introuvable');
    if (facture.statut !== 'brouillon') {
      throw new ConflictException(
        'Facture émise — non modifiable. Créez un avoir pour la corriger.',
      );
    }
    return facture;
  }

  // Attribue le prochain numéro séquentiel de la société (cadrage §5) et exécute
  // `action` dans la même transaction. Retry sur collision de séquence (P2002
  // sur @@unique([societeId, numero])) : la contention est quasi nulle (studio
  // de 4 personnes), mais la garantie « sans trou » repose sur cette unicité,
  // pas sur l'absence de course. Le numéro n'est attribué qu'ici — un brouillon
  // reste sans numéro, donc sa suppression ne laisse pas de trou.
  private async avecSequence(
    societeId: string,
    action: (tx: Prisma.TransactionClient, numero: number) => Promise<unknown>,
  ) {
    for (let essai = 0; ; essai++) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const max = await tx.facture.aggregate({
            where: { societeId, numero: { not: null } },
            _max: { numero: true },
          });
          await action(tx, (max._max.numero ?? 0) + 1);
        });
        return;
      } catch (e) {
        const collision =
          e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        if (collision && essai < 4) continue;
        throw e;
      }
    }
  }

  private async formater(projetId: string) {
    const [factures, versions, projet, lignesMensuelles] = await Promise.all([
      this.prisma.facture.findMany({
        where: { projetId },
        include: { paiements: true, lignes: { orderBy: { ordre: 'asc' } } },
      }),
      this.prisma.versionPreBilan.findMany({ where: { projetId } }),
      // En-tête du projet pour la page Facturation (qui n'appelle pas les
      // routes Projets, fermées aux rôles de direction) + phase (mensualités).
      this.prisma.projet.findUniqueOrThrow({
        where: { id: projetId },
        select: {
          id: true,
          code: true,
          programme: true,
          nature: true,
          categorie: true,
          localisation: true,
          type: true,
          phase: true,
          client: { select: { id: true, nom: true } },
        },
      }),
      this.lignesMensuelles(projetId),
    ]);
    // Études du projet concernées par la refacturation (montant de bureau
    // saisi, ou déjà refacturées) — état de règlement du bureau (H3).
    const blocsEtude = await this.prisma.blocEtude.findMany({
      where: {
        projetId,
        supprimee: false,
        OR: [{ factureMontant: { not: null } }, { lignesFacture: { some: {} } }],
      },
      include: { lignesFacture: { select: { factureId: true, montantHt: true } } },
      orderBy: { libelle: 'asc' },
    });
    const aujourdhui = jourCourant();

    const ordre = [...factures].sort((a, b) => {
      const na = a.numero ?? Number.MAX_SAFE_INTEGER;
      const nb = b.numero ?? Number.MAX_SAFE_INTEGER;
      if (na !== nb) return na - nb;
      return a.creeLe.getTime() - b.creeLe.getTime();
    });

    const rendues = ordre.map((f) => {
      const montantHt = f.montantHt.toNumber();
      const tauxTva = f.tauxTva.toNumber();
      const { montantTva, montantTtc } = ventilationTva(montantHt, tauxTva);
      const montantPaye = f.paiements.reduce((s, p) => s + p.montant.toNumber(), 0);
      const statutEffectif = statutFactureEffectif(
        { statut: f.statut, echeanceLe: f.echeanceLe, montantTtc, montantPaye },
        aujourdhui,
      );
      return {
        id: f.id,
        numero: f.numero,
        reference: refFacture(f.numero, f.emiseLe, f.estAvoir),
        type: f.type,
        jalon: f.jalon,
        libelle: f.libelle,
        statut: f.statut,
        statutEffectif,
        montantHt,
        tauxTva,
        montantTva,
        montantTtc,
        echeanceLe: f.echeanceLe,
        estAvoir: f.estAvoir,
        factureOrigineId: f.factureOrigineId,
        creeLe: f.creeLe,
        emiseLe: f.emiseLe,
        annuleeLe: f.annuleeLe,
        montantPaye,
        resteAPayer: montantTtc - montantPaye,
        joursRetard:
          statutEffectif === 'en_retard'
            ? joursRetardFacture(f.echeanceLe, aujourdhui)
            : 0,
        lignes: f.lignes.map(versLigneFacture),
        paiements: [...f.paiements]
          .sort((a, b) => a.creeLe.getTime() - b.creeLe.getTime())
          .map((p) => ({
            id: p.id,
            date: p.date,
            montant: p.montant.toNumber(),
            mode: p.mode,
            reference: p.reference,
          })),
      };
    });

    // Net facturé = somme des TTC hors brouillons (une facture annulée garde son
    // TTC positif, son avoir le porte en négatif → les deux s'annulent).
    const nonBrouillon = rendues.filter((f) => f.statut !== 'brouillon');
    const totalFactureTtc = nonBrouillon.reduce((s, f) => s + f.montantTtc, 0);
    const totalEncaisse = rendues.reduce((s, f) => s + f.montantPaye, 0);

    // Suggestion de montant pour une facture de vente (cadrage §9) : le prix de
    // vente de la dernière version de pré-bilan figée. L'admin ajuste librement.
    const figees = versions
      .filter((v) => v.figeeLe && v.prixVenteEstime != null)
      .sort((a, b) => a.figeeLe!.getTime() - b.figeeLe!.getTime());
    const suggestionVenteHt =
      figees.length > 0
        ? figees[figees.length - 1].prixVenteEstime!.toNumber()
        : null;

    // Refacturation des études : ligne ACTIVE = sur une facture ni annulée ni
    // avoir ; « à régler » dès que cette facture est soldée.
    const parId = new Map(rendues.map((f) => [f.id, f]));
    const etudes = blocsEtude.map((b) => {
      const active = b.lignesFacture
        .map((l) => ({ l, f: parId.get(l.factureId) }))
        .find(({ f }) => f && f.statut !== 'annulee' && !f.estAvoir);
      const statutReglement = statutReglementBureau({
        bureauRegleLe: b.bureauRegleLe,
        factureActive: active?.f?.statutEffectif ?? null,
      });
      const montantBureauHt = b.factureMontant?.toNumber() ?? null;
      return {
        blocId: b.id,
        libelle: b.libelle,
        bureau: b.interlocuteur,
        montantBureauHt,
        montantRefactureHt: active
          ? active.l.montantHt.toNumber()
          : montantBureauHt != null
            ? montantRefacture(montantBureauHt)
            : null,
        statutReglement,
        facture: active?.f ? { id: active.f.id, reference: active.f.reference } : null,
        bureauRegleLe: b.bureauRegleLe,
        refacturable:
          statutReglement === 'non_refacture' && !!b.interlocuteur.trim() && (montantBureauHt ?? 0) > 0,
      };
    });

    // Facturation mensuelle (SU / EX de l'offre acceptée) — état et rappel.
    const mensualites = lignesMensuelles.map((l) => {
      const m = this.etatMensualite(l, projet.phase);
      return {
        ligneDevisId: l.id,
        libelle: m.nom,
        prixMensuelHt: Math.round(l.prixUnitaire.toNumber()),
        tauxTva: l.tauxTva.toNumber(),
        moisPrevus: m.moisPrevus,
        moisFactures: m.moisFactures,
        aFacturerCeMois: m.aFacturerCeMois,
      };
    });

    return {
      projetId,
      projet,
      factures: rendues,
      mensualites,
      etudes,
      resume: {
        totalFactureTtc,
        totalEncaisse,
        totalDu: totalFactureTtc - totalEncaisse,
        nbEnRetard: rendues.filter((f) => f.statutEffectif === 'en_retard').length,
        suggestionVenteHt,
      },
    };
  }
}

// Ligne de facture exposée (frontend/lib/types.ts::LigneFacture).
function versLigneFacture(l: {
  id: string;
  designation: string;
  montantHt: Prisma.Decimal;
  montantBase: Prisma.Decimal | null;
  blocEtudeId: string | null;
}) {
  return {
    id: l.id,
    designation: l.designation,
    montantHt: l.montantHt.toNumber(),
    montantBase: l.montantBase?.toNumber() ?? null,
    blocEtudeId: l.blocEtudeId,
  };
}

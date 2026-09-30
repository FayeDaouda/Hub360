import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, StatutDevis } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { versClient } from '../commun/format-contrat';
import { chargerProjet } from '../projets/projet-acces';
import { typeFactureDepuisNature } from '../projets/domaine/config';
import { ventilationTva } from '../projets/domaine/gardes';
import { FacturationService } from '../projets/facturation/facturation.service';
import { EmailService } from '../email/email.service';
import { genererJeton, hacherJeton } from '../auth/jetons';
import { MOTIF_REFUS_CLIENT } from '../crm/cycle';
import { NotificationsService } from '../notifications/notifications.service';
import { ReglagesService } from '../reglages/reglages.service';
import {
  VALIDITE_OFFRE_JOURS,
  ajouterJours,
  alerteAvenant,
  refDevis,
  relanceAFaire,
  statutDevisEffectif,
} from './domaine';
import { CreerDevisDto, LigneDevisDto, PatchDevisDto } from './dto';
import { motifFicheIncomplete } from '../crm/fiche';

const jourCourant = () => new Date().toISOString().slice(0, 10);

// Ce que le devis porte, pour appliquer le catalogue (cf. contexteLignes).
type ContexteLignes = {
  planchesImposees: number | null; // offre CRM : planches du dossier
  categorieCo: string | null; // CO1 / CO2 / CO3 déjà connue (dossier / projet)
  devisProjet: boolean; // devis complémentaire d'un projet — seul lieu des TS
};

const AVEC_DETAIL = {
  client: true,
  societe: { select: { nom: true } },
  dossierCrm: { select: { id: true, statut: true, code: true, archiveLe: true } },
  // famille : repérer un avenant (lignes TS) sans relire le catalogue.
  lignes: { orderBy: { ordre: 'asc' as const }, include: { produitService: { select: { famille: true } } } },
} satisfies Prisma.DevisInclude;

type DevisAvecDetail = Prisma.DevisGetPayload<{ include: typeof AVEC_DETAIL }>;

// Mêmes champs que GET /societes/:slug (déjà public, sans authentification —
// consultés avant connexion sur l'écran de login) : aucune donnée neuve
// exposée en les reprenant ici pour l'en-tête de marque de la page publique.
const AVEC_DETAIL_PUBLIC = {
  ...AVEC_DETAIL,
  societe: {
    select: {
      nom: true,
      logoUrl: true,
      logoUrlSombre: true,
      couleurMarque: true,
      icone: true,
      mentionsLegales: true,
      coordonnees: true,
    },
  },
} satisfies Prisma.DevisInclude;

type DevisAvecDetailPublic = Prisma.DevisGetPayload<{ include: typeof AVEC_DETAIL_PUBLIC }>;

type LigneCalculee = {
  id: string;
  produitServiceId: string | null;
  designation: string;
  surfaceM2: number | null; // ligne CO : tarif × surface × planches
  planches: number | null;
  quantite: number;
  prixUnitaire: number;
  tauxTva: number;
  montantHt: number;
  montantTva: number;
  montantTtc: number;
  ordre: number;
};

// Devis (brique « gestion », 2ᵉ étage après Facturation) — module admin-only,
// centralisé (pas de :projetId dans la route : projetId est nullable, un
// devis peut précéder la création du dossier projet). Cf. cadrage « Devis ».
@Injectable()
export class DevisService {
  constructor(
    private prisma: PrismaService,
    private facturation: FacturationService,
    private email: EmailService,
    private notifications: NotificationsService,
    private reglages: ReglagesService,
  ) {}

  // Délai d'acceptation d'un avenant (Réglages · Règles et délais).
  private seuilAvenant(societeId: string) {
    return this.reglages.regle<number>(societeId, 'alerte_avenant_jours');
  }

  async findAll(
    societeId: string,
    filtres: { statut?: StatutDevis; projetId?: string; clientId?: string },
  ) {
    const devis = await this.prisma.devis.findMany({
      where: {
        societeId,
        statut: filtres.statut,
        projetId: filtres.projetId,
        clientId: filtres.clientId,
      },
      include: AVEC_DETAIL,
      orderBy: [{ creeLe: 'desc' }],
    });
    const seuil = await this.seuilAvenant(societeId);
    return devis.map((d) => this.formater(d, seuil));
  }

  async get(societeId: string, id: string) {
    return this.formater(await this.charger(societeId, id), await this.seuilAvenant(societeId));
  }

  async creer(societeId: string, dto: CreerDevisDto) {
    await this.validerReferences(societeId, dto.clientId, dto.projetId, dto.lignes);
    if (dto.dossierCrmId) await this.validerNouvelleOffre(societeId, dto);
    const lignes = await this.appliquerCatalogue(
      societeId,
      dto.lignes,
      await this.contexteLignes(societeId, dto),
    );
    const devis = await this.prisma.devis.create({
      data: {
        societeId,
        projetId: dto.projetId ?? null,
        dossierCrmId: dto.dossierCrmId ?? null,
        clientId: dto.clientId,
        objet: dto.objet?.trim() ?? '',
        // Offre CRM : validité fixée à l'envoi (validation DAF), jamais saisie.
        dateValidite: dto.dossierCrmId ? null : (dto.dateValidite ?? null),
        lignes: { create: lignes },
      },
      include: AVEC_DETAIL,
    });
    return this.formater(devis);
  }

  async patch(societeId: string, id: string, dto: PatchDevisDto) {
    const devis = await this.brouillon(societeId, id);
    if (devis.dossierCrm) {
      this.exigerOffreModifiable(devis.dossierCrm);
      // Client, projet et validité d'une offre sont fixés par le dossier et
      // par l'envoi — seuls l'objet et les lignes se retravaillent.
      if (dto.clientId || dto.projetId !== undefined || dto.dateValidite !== undefined) {
        throw new UnprocessableEntityException(
          'Offre de dossier CRM : seuls l’objet et les lignes sont modifiables.',
        );
      }
    }
    if (dto.clientId || dto.projetId !== undefined || dto.lignes) {
      await this.validerReferences(
        societeId,
        dto.clientId ?? devis.clientId,
        dto.projetId === null ? undefined : (dto.projetId ?? devis.projetId ?? undefined),
        dto.lignes ?? [],
      );
    }

    const lignes = dto.lignes
      ? await this.appliquerCatalogue(
          societeId,
          dto.lignes,
          await this.contexteLignes(societeId, {
            dossierCrmId: devis.dossierCrmId,
            projetId: dto.projetId === null ? null : (dto.projetId ?? devis.projetId),
          }),
        )
      : undefined;
    const maj = await this.prisma.devis.update({
      where: { id: devis.id },
      data: {
        clientId: dto.clientId,
        projetId: dto.projetId === null ? null : dto.projetId,
        objet: dto.objet?.trim(),
        dateValidite: dto.dateValidite,
        lignes: lignes ? { deleteMany: {}, create: lignes } : undefined,
      },
      include: AVEC_DETAIL,
    });
    return this.formater(maj);
  }

  async supprimer(societeId: string, id: string) {
    const devis = await this.brouillon(societeId, id);
    if (devis.dossierCrm) this.exigerOffreModifiable(devis.dossierCrm);
    await this.prisma.devis.delete({ where: { id: devis.id } });
  }

  // Numéro attribué à l'envoi (comme Facture.numero à l'émission) — un
  // brouillon n'a pas de numéro, sa suppression ne laisse pas de trou. Le
  // jeton public est émis dans le même mouvement (cf. cadrage : double canal
  // de réponse dès le départ) — même convention qu'Invitation (auth/jetons.ts) :
  // seul le SHA-256 est stocké, le clair n'est renvoyé QU'ICI, jamais
  // ré-exposé ensuite (un renvoi régénérerait un nouveau lien).
  async envoyer(societeId: string, id: string) {
    const devis = await this.brouillon(societeId, id);
    if (devis.dossierCrmId) {
      throw new ConflictException(
        'Cette offre de dossier CRM part uniquement par la validation de la DAF.',
      );
    }
    return this.emettre(societeId, devis, devis.dateValidite, async () => undefined);
  }

  // Envoi d'une OFFRE de dossier CRM (étape F) — appelé par le cycle du
  // dossier quand la DAF valide. Validité 7 jours à compter d'aujourd'hui ;
  // `dansTransaction` bascule le dossier dans la MÊME transaction que la
  // numérotation (tout ou rien), l'email part après validation.
  async emettreOffre(
    societeId: string,
    dossierCrmId: string,
    dansTransaction: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    const offre = await this.prisma.devis.findFirst({
      where: { societeId, dossierCrmId, statut: 'brouillon' },
      include: AVEC_DETAIL,
      orderBy: { creeLe: 'desc' },
    });
    if (!offre) throw new ConflictException('Aucune offre en brouillon à envoyer pour ce dossier.');
    // La catégorie de conception devient engageante à l'envoi : figée sur le
    // dossier (SU, et plus tard TS, en découlent).
    const ligneCo = await this.prisma.ligneDevis.findFirst({
      where: { devisId: offre.id, produitService: { famille: 'CO' } },
      select: { produitService: { select: { code: true } } },
    });
    return this.emettre(
      societeId,
      offre,
      ajouterJours(jourCourant(), VALIDITE_OFFRE_JOURS),
      async (tx) => {
        await dansTransaction(tx);
        if (ligneCo?.produitService?.code) {
          await tx.dossierCrm.update({
            where: { id: dossierCrmId },
            data: { categorieConception: ligneCo.produitService.code },
          });
        }
      },
    );
  }

  // Relance d'un devis en attente de réponse (J+3 / J+6 pour une offre CRM —
  // « à faire » dérivé à la lecture, déclenchée à la main : aucun scheduler).
  // Régénère le lien (seul le hash du jeton est stocké, le clair n'existe
  // qu'au moment de l'émettre) : l'ancien lien cesse de fonctionner. Le
  // nouveau est renvoyé à l'appelant pour le cas où l'email ne part pas.
  async relancer(societeId: string, id: string) {
    const devis = await this.charger(societeId, id);
    if (statutDevisEffectif(devis, jourCourant()) !== 'envoye') {
      throw new ConflictException('Seul un devis envoyé, non expiré et sans réponse se relance.');
    }
    const { clair, hash } = genererJeton();
    await this.prisma.devis.update({
      where: { id: devis.id },
      data: {
        tokenPublicHash: hash,
        relancesEnvoyees: { increment: 1 },
        derniereRelanceLe: new Date(),
      },
    });
    const lienPublic = this.construireLienPublic(clair);
    const misAJour = await this.get(societeId, id);
    const emailEnvoye = devis.client.email
      ? (
          await this.email.envoyerRelanceDevis({
            email: devis.client.email,
            clientNom: devis.client.nom,
            societeNom: devis.societe.nom,
            reference: misAJour.reference,
            montantTtc: misAJour.montantTtc,
            dateValidite: misAJour.dateValidite,
            lien: lienPublic,
          })
        ).envoye
      : false;
    return { ...misAJour, lienPublic, emailEnvoye };
  }

  // -- Accès public par jeton (sans compte) -----------------------------------
  // Point d'entrée du lien envoyé au client — cf. DevisPublicController /
  // DevisPublicGuard (aucun JwtAuthGuard, le jeton EST l'authentification).

  async getPublic(token: string) {
    return this.formaterPublic(await this.chargerParToken(token));
  }

  async repondrePublic(token: string, reponse: 'accepte' | 'refuse') {
    const devis = await this.chargerParToken(token);
    const aujourdhui = jourCourant();
    if (statutDevisEffectif(devis, aujourdhui) === 'expire') {
      throw new ConflictException(
        'Ce devis a expiré — contactez-nous pour en obtenir un nouveau.',
      );
    }
    if (devis.statut !== 'envoye') {
      throw new ConflictException('Ce devis a déjà reçu une réponse.');
    }
    // parId null : c'est le client lui-même qui répond (journal du dossier).
    await this.enregistrerReponse(devis.id, devis.dossierCrmId, reponse, null);
    return this.formaterPublic(await this.chargerParToken(token));
  }

  // Validation MANUELLE par l'admin — second canal, à côté du lien public à
  // usage unique (module à venir) : le client a pu répondre par téléphone ou
  // mail direct plutôt que de cliquer le lien.
  async marquerReponse(
    societeId: string,
    id: string,
    reponse: 'accepte' | 'refuse',
    parId: string,
  ) {
    const devis = await this.charger(societeId, id);
    if (devis.statut !== 'envoye') {
      throw new ConflictException('Seul un devis envoyé peut recevoir une réponse.');
    }
    await this.enregistrerReponse(devis.id, devis.dossierCrmId, reponse, parId);
    return this.get(societeId, id);
  }

  // Conversion en facture (le geste « un clic » identifié comme la vraie
  // valeur à reprendre de Zervant) — additionne les lignes en un montantHt
  // unique plutôt que de refondre Facture pour lui ajouter des lignes
  // (système déjà livré et testé, cf. cadrage « Devis »). Le détail ligne par
  // ligne reste consultable sur CE devis, retrouvable depuis la facture via
  // devisOrigineId.
  async convertir(societeId: string, id: string) {
    const devis = await this.charger(societeId, id);
    if (devis.statut !== 'accepte') {
      throw new ConflictException('Seul un devis accepté peut être converti en facture.');
    }

    const { montantHt, montantTva } = devis.lignes.reduce(
      (acc, l) => {
        const ligneHt = Math.round(l.quantite.toNumber() * l.prixUnitaire.toNumber());
        const { montantTva } = ventilationTva(ligneHt, l.tauxTva.toNumber());
        return { montantHt: acc.montantHt + ligneHt, montantTva: acc.montantTva + montantTva };
      },
      { montantHt: 0, montantTva: 0 },
    );
    // Facture.tauxTva est un taux unique (montant unique, cf. cadrage) — un
    // devis peut mélanger des taux par ligne (catalogue ≠ ligne libre) : on
    // reconstitue le taux effectif équivalent plutôt que d'en figer un
    // arbitrairement. Dans le cas courant (un seul taux sur toutes les
        // lignes), ce taux effectif EST ce taux exact.
    const tauxTvaEffectif = montantHt > 0 ? Math.round((montantTva / montantHt) * 10000) / 100 : 18;

    const projet = devis.projetId
      ? await chargerProjet(this.prisma, societeId, devis.projetId)
      : null;
    // Sans projet, pas de `nature` dont dériver le type (cadrage §2 de
    // Facturation) — un devis « libre » converti est par défaut une
    // prestation de service, jamais la vente d'un bien.
    const type = projet ? typeFactureDepuisNature(projet.nature) : 'honoraires';

    const factureId = await this.facturation.creerDepuisDevis(societeId, {
      projetId: devis.projetId,
      type,
      libelle: `${refDevis(devis.numero, devis.dateEnvoi)} converti — ${devis.lignes.length} ligne${devis.lignes.length > 1 ? 's' : ''}`,
      montantHt,
      tauxTva: tauxTvaEffectif,
      devisOrigineId: devis.id,
    });
    await this.prisma.devis.update({
      where: { id: devis.id },
      data: { statut: 'transforme' },
    });
    return { devis: await this.get(societeId, id), factureId };
  }

  // -- Internes --------------------------------------------------------------

  // Numéro + jeton + statut « envoyé » dans la transaction de numérotation
  // (avec `dansTransaction` pour l'appelant), puis email. Commun à l'envoi
  // d'un devis libre et à l'émission d'une offre CRM.
  private async emettre(
    societeId: string,
    devis: DevisAvecDetail,
    dateValidite: string | null,
    dansTransaction: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    if (devis.lignes.length === 0) {
      throw new UnprocessableEntityException(
        'Ajoutez au moins une ligne avant d’envoyer le devis.',
      );
    }
    const { clair, hash } = genererJeton();
    await this.avecSequence(societeId, async (tx, numero) => {
      const r = await tx.devis.updateMany({
        where: { id: devis.id, statut: 'brouillon' },
        data: {
          numero,
          statut: 'envoye',
          dateEnvoi: new Date(),
          dateValidite,
          tokenPublicHash: hash,
        },
      });
      if (r.count === 0) throw new ConflictException('Devis déjà envoyé.');
      await dansTransaction(tx);
    });

    const lienPublic = this.construireLienPublic(clair);
    const misAJour = await this.get(societeId, devis.id);
    // Le client CRM n'a pas forcément d'email renseigné — dans ce cas on ne
    // tente même pas l'envoi (pas un échec de transport, juste rien à
    // transmettre) : `emailEnvoye` reste false, l'appelant garde son repli
    // habituel (copier le lien).
    const emailEnvoye = devis.client.email
      ? (
          await this.email.envoyerDevis({
            email: devis.client.email,
            clientNom: devis.client.nom,
            societeNom: devis.societe.nom,
            reference: misAJour.reference,
            montantTtc: misAJour.montantTtc,
            lien: lienPublic,
          })
        ).envoye
      : false;

    return { ...misAJour, lienPublic, emailEnvoye };
  }

  // Réponse du client (lien public) ou saisie à sa place (manuel). Un REFUS
  // sur une offre de dossier CRM fait passer le dossier en « perdu »
  // automatiquement, motif posé — le client a dit non, c'est un fait
  // (décision F). Une acceptation ne bascule rien : l'Onboard reste un geste
  // humain (le contrat, étape G, pourra s'intercaler). Sur une offre de
  // dossier, propriétaire et apporteur sont prévenus dans les deux cas.
  private async enregistrerReponse(
    devisId: string,
    dossierCrmId: string | null,
    reponse: 'accepte' | 'refuse',
    parId: string | null,
  ) {
    const societeId = await this.prisma.$transaction(async (tx) => {
      const { societeId } = await tx.devis.update({
        where: { id: devisId },
        data: { statut: reponse, dateReponse: new Date() },
        select: { societeId: true },
      });
      if (reponse !== 'refuse' || !dossierCrmId) return societeId;
      const { count } = await tx.dossierCrm.updateMany({
        where: { id: dossierCrmId, statut: 'offre_envoyee' },
        data: { statut: 'perdu' },
      });
      if (count === 1) {
        await tx.dossierCrmTransition.create({
          data: {
            dossierId: dossierCrmId,
            de: 'offre_envoyee',
            vers: 'perdu',
            parId,
            commentaire: MOTIF_REFUS_CLIENT,
          },
        });
      }
      return societeId;
    });
    if (dossierCrmId) {
      await this.notifications.notifierDossierCrm({
        societeId,
        dossierId: dossierCrmId,
        evenement: reponse === 'accepte' ? 'offre_acceptee' : 'offre_refusee',
        parId,
      });
    }
  }

  // Nouvelle offre sur un dossier : même société, dossier en « Nouveau
  // projet », même client que le dossier, pas de projet (il n'existe qu'à
  // l'Onboard), et une seule offre en brouillon à la fois.
  private async validerNouvelleOffre(societeId: string, dto: CreerDevisDto) {
    const dossier = await this.prisma.dossierCrm.findFirst({
      where: { id: dto.dossierCrmId, societeId },
      select: {
        statut: true,
        archiveLe: true,
        code: true,
        categorie: true,
        localiteId: true,
        type: true,
        surfaceTerrain: true,
        nbPlanches: true,
        clientId: true,
        standing: true,
        gamme: true,
        programme: true,
      },
    });
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    this.exigerOffreModifiable(dossier);
    // « Créer une offre » reste bloqué tant que la fiche n'est pas complète
    // (maquette CRM) : le tarif CO dépend des planches et de la catégorie.
    const incomplete = motifFicheIncomplete(dossier, 'avant de créer l’offre');
    if (incomplete) throw new ConflictException(incomplete);
    if (dto.clientId !== dossier.clientId || dto.projetId) {
      throw new UnprocessableEntityException(
        'Une offre de dossier CRM porte sur le client du dossier, sans projet.',
      );
    }
    const brouillon = await this.prisma.devis.count({
      where: { dossierCrmId: dto.dossierCrmId, statut: 'brouillon' },
    });
    if (brouillon > 0) {
      throw new ConflictException('Ce dossier a déjà une offre en préparation.');
    }
  }

  // L'offre se prépare et se retravaille tant que le dossier est en
  // « Nouveau projet » — figée pendant la validation DAF et après l'envoi,
  // comme sur un lead archivé.
  private exigerOffreModifiable(dossier: { statut: string; archiveLe: Date | null }) {
    if (dossier.archiveLe) {
      throw new ConflictException('Lead archivé : aucune offre ne s’y prépare.');
    }
    if (dossier.statut !== 'nouveau_projet') {
      throw new ConflictException(
        'L’offre ne se modifie qu’en « Nouveau projet » (la DAF peut renvoyer le dossier).',
      );
    }
  }

  private async charger(societeId: string, id: string): Promise<DevisAvecDetail> {
    const devis = await this.prisma.devis.findFirst({
      where: { id, societeId },
      include: AVEC_DETAIL,
    });
    if (!devis) throw new NotFoundException('Devis introuvable');
    return devis;
  }

  private async brouillon(societeId: string, id: string) {
    const devis = await this.charger(societeId, id);
    if (devis.statut !== 'brouillon') {
      throw new ConflictException(
        'Devis déjà envoyé — non modifiable (créez-en un nouveau si besoin).',
      );
    }
    return devis;
  }

  // Contexte d'application du catalogue selon ce que le devis porte :
  //   · offre d'un dossier CRM → planches imposées par le dossier, catégorie
  //     CO déjà figée s'il y en a une ;
  //   · devis rattaché à un PROJET (complémentaire) → catégorie CO du projet
  //     (celle de son dossier d'origine) ; seul contexte où les TS passent ;
  //   · devis libre → aucune contrainte de contexte.
  private async contexteLignes(
    societeId: string,
    devis: { dossierCrmId?: string | null; projetId?: string | null },
  ): Promise<ContexteLignes> {
    if (devis.dossierCrmId) {
      const d = await this.prisma.dossierCrm.findFirst({
        where: { id: devis.dossierCrmId, societeId },
        select: { nbPlanches: true, categorieConception: true },
      });
      return {
        planchesImposees: d?.nbPlanches ?? 0,
        categorieCo: d?.categorieConception ?? null,
        devisProjet: false,
      };
    }
    if (devis.projetId) {
      const p = await this.prisma.projet.findFirst({
        where: { id: devis.projetId, societeId },
        select: { dossierCrm: { select: { categorieConception: true } } },
      });
      return {
        planchesImposees: null,
        categorieCo: p?.dossierCrm?.categorieConception ?? null,
        devisProjet: true,
      };
    }
    return { planchesImposees: null, categorieCo: null, devisProjet: false };
  }

  // Lignes prêtes à écrire, règles du catalogue réel appliquées CÔTÉ SERVEUR
  // (l'écran les montre, le serveur les garantit — cf. catalogue JSON) :
  //   · prix figé (prixModifiable = false) : le tarif du catalogue s'impose,
  //     TVA comprise, quelle que soit la valeur reçue ;
  //   · CO (surface_planches) : quantité = surface × planches (surface terrain
  //     du dossier par défaut à l'écran — décision du boss, maintenue malgré
  //     le libellé « surface à concevoir » des CGV art. 4) —
  //     planches du dossier pour une offre CRM ; une seule ligne CO par devis ;
  //   · SU : jamais choisi — doit correspondre à la catégorie CO (ligne CO du
  //     devis, sinon catégorie du dossier / du projet) ;
  //   · TS (CGV art. 8) : uniquement sur un devis complémentaire rattaché à un
  //     projet — la facturation attend son acceptation (conversion) ; TS-MAJ
  //     au tarif de la catégorie CO du projet × surface × planches concernées ;
  //   · ligne sans produit : « hors catalogue », telle quelle.
  private async appliquerCatalogue(
    societeId: string,
    lignes: LigneDevisDto[],
    ctx: ContexteLignes,
  ) {
    const ids = [...new Set(lignes.map((l) => l.produitServiceId).filter(Boolean))] as string[];
    const produits = new Map(
      (
        await this.prisma.produitService.findMany({ where: { id: { in: ids }, societeId } })
      ).map((p) => [p.id, p]),
    );
    const produitDe = (l: LigneDevisDto) =>
      l.produitServiceId ? produits.get(l.produitServiceId) : undefined;

    const lignesCo = lignes.filter((l) => produitDe(l)?.modeCalcul === 'surface_planches');
    if (lignesCo.length > 1) {
      throw new UnprocessableEntityException('Une seule ligne de conception (CO) par devis.');
    }
    const categorieCo =
      (lignesCo[0] && produitDe(lignesCo[0])?.code) ?? ctx.categorieCo ?? null;

    // Tarif CO de la catégorie (TS-MAJ) — lu au catalogue, jamais saisi.
    const tarifCo = lignes.some((l) => produitDe(l)?.modeCalcul === 'tarif_co_surface_planches')
      ? categorieCo
        ? await this.prisma.produitService.findFirst({
            where: { societeId, code: categorieCo },
            select: { prixUnitaire: true },
          })
        : null
      : null;

    return lignes.map((l, ordre) => {
      const p = produitDe(l);
      const base = {
        produitServiceId: l.produitServiceId ?? null,
        designation: l.designation.trim(),
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        tauxTva: l.tauxTva ?? 18,
        surfaceM2: null as number | null,
        planches: null as number | null,
        ordre,
      };
      if (!p) return base;

      if (p.famille === 'TS' && !ctx.devisProjet) {
        throw new UnprocessableEntityException(
          'Les travaux supplémentaires se facturent par un devis complémentaire rattaché au projet (CGV art. 8).',
        );
      }
      if (p.modeCalcul === 'tarif_co_surface_planches') {
        if (!tarifCo?.prixUnitaire) {
          throw new UnprocessableEntityException(
            'Reprise majeure : la catégorie de conception (CO) du projet est inconnue — son tarif ne peut pas s’appliquer.',
          );
        }
        if (!l.surfaceM2 || l.surfaceM2 < 1 || !l.planches || l.planches < 1) {
          throw new UnprocessableEntityException(
            'Reprise majeure : surface (m²) et nombre de planches concernées requis.',
          );
        }
        base.prixUnitaire = tarifCo.prixUnitaire.toNumber();
        base.tauxTva = p.tauxTva.toNumber();
        base.surfaceM2 = l.surfaceM2;
        base.planches = l.planches;
        base.quantite = l.surfaceM2 * l.planches;
        return base;
      }
      if (!p.prixModifiable) {
        if (p.prixUnitaire == null) {
          throw new UnprocessableEntityException(`Produit ${p.code ?? p.designation} sans tarif au catalogue.`);
        }
        base.prixUnitaire = p.prixUnitaire.toNumber();
        base.tauxTva = p.tauxTva.toNumber();
      }
      if (p.coAssocie && p.coAssocie !== categorieCo) {
        throw new UnprocessableEntityException(
          categorieCo
            ? `Suivi de chantier : ${p.code} ne correspond pas à la catégorie ${categorieCo} (il se déduit, il ne se choisit pas).`
            : 'Le suivi de chantier se déduit de la catégorie de conception : ajoute d’abord la ligne CO.',
        );
      }
      if (p.modeCalcul === 'surface_planches') {
        const planches = ctx.planchesImposees ?? l.planches;
        if (!planches || planches < 1) {
          throw new UnprocessableEntityException(
            ctx.planchesImposees !== null
              ? 'Renseigne le nombre de planches du dossier avant d’ajouter la ligne de conception.'
              : 'Ligne de conception : nombre de planches requis.',
          );
        }
        if (!l.surfaceM2 || l.surfaceM2 < 1) {
          throw new UnprocessableEntityException('Ligne de conception : surface (m²) requise.');
        }
        base.surfaceM2 = l.surfaceM2;
        base.planches = planches;
        base.quantite = l.surfaceM2 * planches;
      }
      return base;
    });
  }

  // Cloisonnement : clientId, projetId et chaque produitServiceId référencés
  // doivent appartenir à LA société du token — sinon une facture/un devis
  // pourrait pointer vers la donnée d'une autre société.
  private async validerReferences(
    societeId: string,
    clientId: string,
    projetId: string | undefined,
    lignes: LigneDevisDto[],
  ) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, societeId } });
    if (!client) throw new NotFoundException('Client introuvable');

    if (projetId) await chargerProjet(this.prisma, societeId, projetId);

    const idsProduits = [...new Set(lignes.map((l) => l.produitServiceId).filter(Boolean))] as string[];
    if (idsProduits.length > 0) {
      const trouves = await this.prisma.produitService.count({
        where: { id: { in: idsProduits }, societeId },
      });
      if (trouves !== idsProduits.length) {
        throw new UnprocessableEntityException('Produit / service introuvable dans le catalogue.');
      }
    }
  }

  // Même motif que FacturationService.avecSequence : numéro séquentiel par
  // société, attribué dans une transaction, retry sur collision (P2002 sur
  // @@unique([societeId, numero])). Réimplémenté ici plutôt que partagé —
  // même choix que les gardes par module (cf. schéma § Grey Concrete).
  private async avecSequence(
    societeId: string,
    action: (tx: Prisma.TransactionClient, numero: number) => Promise<unknown>,
  ) {
    for (let essai = 0; ; essai++) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const max = await tx.devis.aggregate({
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

  private async chargerParToken(token: string): Promise<DevisAvecDetailPublic> {
    const devis = await this.prisma.devis.findFirst({
      where: { tokenPublicHash: hacherJeton(token) },
      include: AVEC_DETAIL_PUBLIC,
    });
    // Erreur uniforme que le jeton soit absent, malformé ou sans
    // correspondance — jamais de distinction qui renseignerait un attaquant
    // (même philosophie que ComptesService.motDePasseOublie).
    if (!devis) throw new NotFoundException('Devis introuvable');
    return devis;
  }

  private construireLienPublic(clair: string): string {
    const base = process.env.FRONT_URL || 'http://localhost:3000';
    return `${base}/devis/${clair}`;
  }

  // Math partagée entre la vue admin et la vue publique — seule la
  // sélection des champs de sortie diffère (formater / formaterPublic).
  private calculerLignes(lignes: DevisAvecDetail['lignes']): {
    lignes: LigneCalculee[];
    montantHt: number;
    montantTva: number;
    montantTtc: number;
  } {
    const calculees = lignes.map((l) => {
      const quantite = l.quantite.toNumber();
      const prixUnitaire = l.prixUnitaire.toNumber();
      const tauxTva = l.tauxTva.toNumber();
      const montantHt = Math.round(quantite * prixUnitaire);
      const { montantTva, montantTtc } = ventilationTva(montantHt, tauxTva);
      return {
        id: l.id,
        produitServiceId: l.produitServiceId,
        designation: l.designation,
        surfaceM2: l.surfaceM2,
        planches: l.planches,
        quantite,
        prixUnitaire,
        tauxTva,
        montantHt,
        montantTva,
        montantTtc,
        ordre: l.ordre,
      };
    });
    const montantHt = calculees.reduce((s, l) => s + l.montantHt, 0);
    const montantTva = calculees.reduce((s, l) => s + l.montantTva, 0);
    return { lignes: calculees, montantHt, montantTva, montantTtc: montantHt + montantTva };
  }

  // `seuilAvenant` : délai réglé (jours) ; null = alerte non calculée (brouillon
  // qui vient d'être créé ou modifié — rien n'est encore envoyé).
  private formater(d: DevisAvecDetail, seuilAvenant: number | null = null) {
    const { lignes, montantHt, montantTva, montantTtc } = this.calculerLignes(d.lignes);
    return {
      id: d.id,
      numero: d.numero,
      reference: refDevis(d.numero, d.dateEnvoi),
      statut: d.statut,
      statutEffectif: statutDevisEffectif(d, jourCourant()),
      objet: d.objet,
      client: versClient(d.client),
      projetId: d.projetId,
      dossierCrm: d.dossierCrm ? { id: d.dossierCrm.id, code: d.dossierCrm.code } : null,
      dateValidite: d.dateValidite,
      dateEnvoi: d.dateEnvoi,
      dateReponse: d.dateReponse,
      relancesEnvoyees: d.relancesEnvoyees,
      derniereRelanceLe: d.derniereRelanceLe,
      relanceAFaire: relanceAFaire(d, jourCourant()),
      // Avenant (TS) envoyé et toujours pas accepté au-delà du délai réglé.
      alerteAvenant:
        seuilAvenant == null
          ? null
          : alerteAvenant({ ...d, familles: d.lignes.map((l) => l.produitService?.famille ?? null) }, jourCourant(), seuilAvenant),
      lignes,
      montantHt,
      montantTva,
      montantTtc,
      creeLe: d.creeLe,
    };
  }

  // Vue CLIENT (lien public, sans compte) — expose le strict nécessaire pour
  // décider : jamais d'id interne (devis/client), jamais les coordonnées du
  // client (déjà les siennes), jamais la référence produit du catalogue.
  private formaterPublic(d: DevisAvecDetailPublic) {
    const { lignes, montantHt, montantTva, montantTtc } = this.calculerLignes(d.lignes);
    const statutEffectif = statutDevisEffectif(d, jourCourant());
    return {
      reference: refDevis(d.numero, d.dateEnvoi),
      statutEffectif,
      peutRepondre: statutEffectif === 'envoye',
      objet: d.objet,
      societe: {
        nom: d.societe.nom,
        logoUrl: d.societe.logoUrl,
        logoUrlSombre: d.societe.logoUrlSombre,
        couleurMarque: d.societe.couleurMarque,
        icone: d.societe.icone,
        mentionsLegales: d.societe.mentionsLegales,
        coordonnees: d.societe.coordonnees,
      },
      clientNom: d.client.nom,
      dateValidite: d.dateValidite,
      dateEnvoi: d.dateEnvoi,
      dateReponse: d.dateReponse,
      lignes: lignes.map(({ id, designation, surfaceM2, planches, quantite, prixUnitaire, tauxTva, montantHt, montantTva, montantTtc }) => ({
        id,
        designation,
        // « 250 m² × 2 planches » : la quantité d'une ligne CO se lit mal seule.
        detail: surfaceM2 && planches ? `${surfaceM2} m² × ${planches} planche${planches > 1 ? 's' : ''}` : null,
        quantite,
        prixUnitaire,
        tauxTva,
        montantHt,
        montantTva,
        montantTtc,
      })),
      montantHt,
      montantTva,
      montantTtc,
    };
  }
}

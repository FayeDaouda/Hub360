import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Categorie, Client, NatureDossier, NiveauPermission, Prisma, TypeBien } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { avecDelegataire } from '../commun/delegation-ceo';
import { PHASES_PAR_CATEGORIE } from '../projets/domaine/config';
import { versDossierCrm, versProjetExecution } from '../commun/format-contrat';
import { aLaPermission } from '../commun/permission.guard';
import { DevisService } from '../devis/devis.service';
import { FacturationService } from '../projets/facturation/facturation.service';
import { statutDevisEffectif } from '../devis/domaine';
import { NotificationsService } from '../notifications/notifications.service';
import { SeuilCeoService } from '../finances/seuil-ceo.service';
import { ActionCrm, REGLES_ACTIONS, ROLE_PROPRIETAIRE_DOSSIER, ficheModifiable } from './cycle';
import { EVENEMENT_PAR_ACTION } from './notifications-crm';
import { ApporteurDto, CreerDossierDto, ModifierFicheDto } from './dto';
import { motifFicheIncomplete } from './fiche';
import { codeAvecVariante, genererCodeDossier } from './nomenclature';
import {
  ErreurFicheProgramme,
  normaliserFiche,
  planchesCalculees,
  resume,
  type FicheProgramme,
} from './fiche-programme';
import {
  formatAmount,
  formatDate,
  ROLE_CEO,
  ROLE_CIO,
  ROLE_COMPANY_ADMIN,
  ROLE_COO,
  todayIso,
  toIsoDay,
} from '@hub/domain';

// Qui agit : l'utilisateur connecté et sa carte de permissions (JWT).
export type Acteur = {
  userId: string;
  role: string;
  permissions: Record<string, NiveauPermission>;
  // Administrateur HUB (carte blanche), quel que soit le rôle endossé.
  adminHub?: boolean;
};

const PERSONNE = { select: { id: true, prenom: true, nom: true } } as const;
const INCLUDE_DOSSIER = {
  client: true,
  localite: true,
  creePar: PERSONNE,
  apporteurUtilisateur: PERSONNE,
  proprietaire: PERSONNE,
  archivePar: PERSONNE,
  // L'offre en cours = la plus récente (étape F) — résumée dans la réponse.
  offres: { orderBy: { creeLe: 'desc' }, take: 1, include: { lignes: true } },
  // Dernière transition : celle qui a mené au statut actuel — soumission au
  // CFO (délai de 48 h, tuile « En attente CFO ») ou renvoi par le CFO.
  transitions: {
    orderBy: { creeLe: 'desc' },
    take: 1,
    select: { creeLe: true, de: true, vers: true, commentaire: true },
  },
} as const;

// Seul rôle habilité à modifier la fiche apporteur après sa création — pas
// même l'administration (maquette « Nouveau projet », oct. 2026).
export const ROLE_MODIF_APPORTEUR = ROLE_COO;

@Injectable()
export class CrmService {
  constructor(
    private prisma: PrismaService,
    private devis: DevisService,
    private facturation: FacturationService,
    private notifications: NotificationsService,
    private seuilCeo: SeuilCeoService,
  ) {}

  async findAll(societeId: string, acteur: Acteur, q?: string) {
    const terme = q?.trim().toLowerCase();
    const dossiers = await this.prisma.dossierCrm.findMany({
      where: { societeId },
      include: INCLUDE_DOSSIER,
      orderBy: { createdAt: 'desc' },
    });
    const filtres = !terme
      ? dossiers
      : dossiers.filter((d) =>
          [d.code, d.localisation, d.localite?.code, d.programme, d.client.nom, d.type]
            .join(' ')
            .toLowerCase()
            .includes(terme),
        );
    const opts = this.optsFormat(acteur);
    // Revue CEO (22/10/2026) : une offre soumise au-delà du seuil attend le
    // CEO ; le demandeur le voit (« En attente du CEO depuis X j »).
    const chezCeo = new Set<string>();
    for (const d of filtres.filter((x) => x.statut === 'en_validation')) {
      if ((await this.seuilCeo.offreAuDelaDuSeuil(societeId, d.id)) !== null) chezCeo.add(d.id);
    }
    return filtres.map((d) => ({ ...versDossierCrm(d, opts), contresignatureCeo: chezCeo.has(d.id) }));
  }

  async creer(societeId: string, acteur: Acteur, dto: CreerDossierDto) {
    if (!dto.client.id && !dto.client.nouveau) {
      throw new BadRequestException('client.id ou client.nouveau est requis');
    }
    const apporteur = champsApporteur(dto.apporteur);

    return this.prisma.$transaction(async (tx) => {
      const client = await this.resoudreClient(tx, societeId, dto.client);

      const localite = await tx.localite.findUnique({
        where: { id: dto.localiteId },
        select: { id: true, code: true, nom: true },
      });
      if (!localite) throw new NotFoundException('Localité introuvable');

      const proprietaireId = await this.resoudreProprietaire(tx, societeId, dto.proprietaireId);
      const dossier = await tx.dossierCrm.create({
        data: {
          societeId,
          code: await this.resoudreCode(tx, societeId, client, localite.code),
          nature: dto.nature,
          // Lead incomplet permis : null / 0 / "" = à renseigner sur la fiche
          // (les planches, base du tarif CO, sont exigées avant l'offre).
          categorie: dto.categorie ?? null,
          localisation: localite.nom,
          localiteId: localite.id,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          type: dto.type ?? null,
          nbPlanches: dto.nbPlanches ?? 0,
          surfaceTerrain: dto.surfaceTerrain ?? 0,
          standing: dto.standing ?? null,
          gamme: dto.gamme ?? null,
          programme: dto.programme?.trim() ?? '',
          // Toujours créé au début du cycle (plus de statut choisi à la
          // création : on ne saute plus d'étape) — première ligne du journal.
          statut: 'nouveau_projet',
          // Le commentaire de la ligne de création garde la fiche apporteur
          // telle que validée (l'historique la montre même après une
          // modification du COO).
          transitions: {
            create: {
              vers: 'nouveau_projet',
              parId: acteur.userId,
              commentaire: `Fiche apporteur : ${resumeApporteur(dto.apporteur)}, validée et verrouillée`,
            },
          },
          clientId: client.id,
          creeParId: acteur.userId,
          ...apporteur,
          proprietaireId,
        },
        include: INCLUDE_DOSSIER,
      });
      return versDossierCrm(dossier, this.optsFormat(acteur));
    });
  }

  // Titulaires actifs du rôle propriétaire DANS cette société — la liste
  // proposée à la création (s'il y en a plusieurs) et à la réassignation.
  async proprietairesPossibles(societeId: string) {
    const titulaires = await this.titulairesProprietaire(this.prisma, societeId);
    return titulaires.map((u) => ({ id: u.id, nom: `${u.prenom} ${u.nom}` }));
  }

  // Réassigne le dossier à un autre titulaire du rôle. Qui peut le faire
  // (décision sept. 2026) : les titulaires Dir. GC eux-mêmes (transfert entre
  // collègues), societe_admin et le CIO en supervision — PAS n'importe quel
  // rôle ayant l'écriture sur le CRM (le COO crée des fiches mais ne
  // réassigne pas).
  async changerProprietaire(societeId: string, acteur: Acteur, id: string, proprietaireId: string) {
    const dossier = await this.prisma.dossierCrm.findFirst({
      where: { id, societeId },
      select: { archiveLe: true },
    });
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    exigerNonArchive(dossier);
    if (!(await this.peutReassigner(societeId, acteur))) {
      throw new ForbiddenException(
        `Réassigner un dossier est réservé aux titulaires ${ROLE_PROPRIETAIRE_DOSSIER}, à l’administration et au CIO.`,
      );
    }
    await this.resoudreProprietaire(this.prisma, societeId, proprietaireId);

    const maj = await this.prisma.dossierCrm.update({
      where: { id },
      data: { proprietaireId },
      include: INCLUDE_DOSSIER,
    });
    return versDossierCrm(maj, this.optsFormat(acteur));
  }

  // Modifie la fiche apporteur, verrouillée depuis la création : le COO seul
  // (pas même l'administration). Toute étape du cycle, hors lead archivé ;
  // la modification est tracée dans l'historique de la fiche.
  async modifierApporteur(societeId: string, acteur: Acteur, id: string, dto: ApporteurDto) {
    if (acteur.role !== ROLE_MODIF_APPORTEUR) {
      throw new ForbiddenException(`Après création, seul le ${ROLE_MODIF_APPORTEUR} peut modifier la fiche apporteur.`);
    }
    const dossier = await this.prisma.dossierCrm.findFirst({
      where: { id, societeId },
      select: { statut: true, archiveLe: true },
    });
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    exigerNonArchive(dossier);

    const maj = await this.prisma.dossierCrm.update({
      where: { id },
      data: {
        ...champsApporteur(dto),
        // Même statut avant et après : événement de la fiche, pas une
        // étape du cycle (cf. DossierCrmTransition).
        transitions: {
          create: {
            de: dossier.statut,
            vers: dossier.statut,
            parId: acteur.userId,
            commentaire: `Fiche apporteur modifiée : ${resumeApporteur(dto)}`,
          },
        },
      },
      include: INCLUDE_DOSSIER,
    });
    return versDossierCrm(maj, this.optsFormat(acteur));
  }

  // Rattache un dossier antérieur au référentiel (localiteId null) à une
  // localité — une seule fois : un dossier déjà rattaché ne se re-rattache pas
  // (son code a pu être généré à partir de cette localité). Le code du
  // dossier et son libellé historique `localisation` restent inchangés.
  async rattacherLocalite(societeId: string, acteur: Acteur, id: string, localiteId: string) {
    const dossier = await this.prisma.dossierCrm.findFirst({
      where: { id, societeId },
      select: { localiteId: true, archiveLe: true },
    });
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    exigerNonArchive(dossier);
    if (dossier.localiteId) {
      throw new ConflictException('Ce dossier est déjà rattaché à une localité.');
    }
    const localite = await this.prisma.localite.findUnique({
      where: { id: localiteId },
      select: { id: true },
    });
    if (!localite) throw new NotFoundException('Localité introuvable');

    const maj = await this.prisma.dossierCrm.update({
      where: { id },
      data: { localiteId },
      include: INCLUDE_DOSSIER,
    });
    return versDossierCrm(maj, this.optsFormat(acteur));
  }

  // Archive un lead (maquette CRM) : Direction GC ou CIO — mêmes titulaires
  // que la réassignation. Seul un lead en « Nouveau projet » s'archive (aucune
  // offre partie) ; jamais supprimé, il reste consultable et son code réservé
  // (la ligne demeure, cf. resoudreCode). Figé tant qu'il est archivé ; les
  // mêmes titulaires peuvent le désarchiver (décision du 29/10/2026).
  async archiver(societeId: string, acteur: Acteur, id: string) {
    const dossier = await this.prisma.dossierCrm.findFirst({
      where: { id, societeId },
      select: { statut: true, archiveLe: true },
    });
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    if (!(await this.peutReassigner(societeId, acteur))) {
      throw new ForbiddenException(
        `Archiver un lead est réservé aux titulaires ${ROLE_PROPRIETAIRE_DOSSIER}, à l’administration et au CIO.`,
      );
    }
    exigerNonArchive(dossier);
    if (dossier.statut !== 'nouveau_projet') {
      throw new ConflictException('Seul un lead en « Nouveau projet » s’archive.');
    }
    // Garde en base : deux archivages simultanés n'en enregistrent qu'un.
    const { count } = await this.prisma.dossierCrm.updateMany({
      where: { id, statut: 'nouveau_projet', archiveLe: null },
      data: { archiveLe: new Date(), archiveParId: acteur.userId },
    });
    if (count === 0) throw new ConflictException('Ce lead vient de changer : recharge la fiche.');
    const maj = await this.prisma.dossierCrm.findUniqueOrThrow({
      where: { id },
      include: INCLUDE_DOSSIER,
    });
    return versDossierCrm(maj, this.optsFormat(acteur));
  }

  // Désarchive un lead (décision du 29/10/2026) : mêmes titulaires que
  // l'archivage ; il revient en « Nouveau projet », dans tous les calculs.
  // L'archivage effacé reste dans l'historique du dossier (transition).
  async desarchiver(societeId: string, acteur: Acteur, id: string) {
    const dossier = await this.prisma.dossierCrm.findFirst({
      where: { id, societeId },
      select: { archiveLe: true, archivePar: { select: { prenom: true, nom: true } } },
    });
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    if (!(await this.peutReassigner(societeId, acteur))) {
      throw new ForbiddenException(
        `Désarchiver un lead est réservé aux titulaires ${ROLE_PROPRIETAIRE_DOSSIER}, à l’administration et au CIO.`,
      );
    }
    if (!dossier.archiveLe) throw new ConflictException('Ce lead n’est pas archivé.');
    const archivage = `archivé le ${formatDate(toIsoDay(dossier.archiveLe))}${
      dossier.archivePar ? ` par ${dossier.archivePar.prenom} ${dossier.archivePar.nom}` : ''
    }`;
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.dossierCrm.updateMany({
        where: { id, archiveLe: { not: null } },
        data: { archiveLe: null, archiveParId: null },
      });
      if (count === 0) throw new ConflictException('Ce lead vient de changer : recharge la fiche.');
      await tx.dossierCrmTransition.create({
        data: {
          dossierId: id,
          de: 'nouveau_projet',
          vers: 'nouveau_projet',
          parId: acteur.userId,
          commentaire: `Lead désarchivé (${archivage})`,
        },
      });
    });
    const maj = await this.prisma.dossierCrm.findUniqueOrThrow({ where: { id }, include: INCLUDE_DOSSIER });
    return versDossierCrm(maj, this.optsFormat(acteur));
  }

  // Complète la fiche d'un lead (« Caractéristiques du projet »), champ par
  // champ, tant qu'elle n'est pas verrouillée (« Nouveau projet »). Les
  // planches et la catégorie fixent le tarif CO : pas de changement sous une
  // offre en préparation (le brouillon se supprime d'abord).
  async modifierFiche(societeId: string, acteur: Acteur, id: string, dto: ModifierFicheDto) {
    const dossier = await this.prisma.dossierCrm.findFirst({
      where: { id, societeId },
      select: { statut: true, archiveLe: true, nbPlanches: true, categorie: true },
    });
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    exigerNonArchive(dossier);
    if (!ficheModifiable(dossier.statut)) {
      throw new ConflictException('Fiche verrouillée depuis la soumission de l’offre.');
    }
    // Fiche Programme : programme (résumé) déduit ; planches déduites dès
    // qu'elles se calculent, saisies sinon.
    let fiche: FicheProgramme | undefined;
    try {
      fiche = dto.ficheProgramme ? normaliserFiche(dto.ficheProgramme) : undefined;
    } catch (e) {
      if (e instanceof ErreurFicheProgramme) throw new BadRequestException(e.message);
      throw e;
    }
    const planches = (fiche && planchesCalculees(fiche)) ?? dto.nbPlanches;
    const tarifChange =
      (planches !== undefined && planches !== dossier.nbPlanches) ||
      (dto.categorie !== undefined && dto.categorie !== dossier.categorie);
    if (tarifChange) {
      const brouillon = await this.prisma.devis.count({
        where: { dossierCrmId: id, statut: 'brouillon' },
      });
      if (brouillon > 0) {
        throw new ConflictException(
          'Une offre est en préparation : son tarif dépend des planches et de la catégorie. Supprime le brouillon avant de les changer.',
        );
      }
    }
    const maj = await this.prisma.dossierCrm.update({
      where: { id },
      data: {
        categorie: dto.categorie,
        type: dto.type,
        surfaceTerrain: dto.surfaceTerrain,
        nbPlanches: planches,
        standing: dto.standing,
        gamme: dto.gamme,
        ...(fiche && { ficheProgramme: fiche as unknown as Prisma.InputJsonValue, programme: resume(fiche) }),
      },
      include: INCLUDE_DOSSIER,
    });
    return versDossierCrm(maj, this.optsFormat(acteur));
  }

  // Fait avancer un dossier dans le cycle commercial (cf. crm/cycle.ts) :
  // droit de l'acteur sur le module de l'action, statut de départ autorisé,
  // texte obligatoire le cas échéant — puis écriture + ligne de journal dans
  // la même transaction. Le passage à « onboard » est la transaction pivot :
  // il crée le projet d'exécution et sa coquille avant-projet (une seule fois).
  async agir(societeId: string, acteur: Acteur, id: string, action: ActionCrm, commentaireSaisi: string | undefined) {
    const regle = REGLES_ACTIONS[action];
    const dossier = await this.prisma.dossierCrm.findFirst({
      where: { id, societeId },
      include: { projet: { select: { id: true } } },
    });
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    exigerNonArchive(dossier);

    if (!aLaPermission(acteur.permissions, regle.module, regle.niveau)) {
      throw new ForbiddenException(
        `Action « ${action} » : accès insuffisant sur le module « ${regle.module} » (niveau requis : ${regle.niveau}).`,
      );
    }
    // Validation de l'offre : au-delà du seuil de contresignature, le CEO seul
    // (ou son délégataire) ; en deçà, pas le CEO.
    if (regle.module === 'finances_devis' && regle.niveau === 'validation') {
      await this.seuilCeo.verifierOffreDossier(acteur, societeId, id);
    }
    if (!regle.de.includes(dossier.statut)) {
      throw new ConflictException(`Action « ${action} » impossible depuis le statut « ${dossier.statut} ».`);
    }
    // La fiche se verrouille à la soumission : incomplète, elle le resterait.
    const incomplete = action === 'soumettre' && motifFicheIncomplete(dossier, 'avant de la soumettre au CFO');
    if (incomplete) throw new ConflictException(incomplete);
    // Étape G : l'Onboard n'est plus un clic — c'est la SIGNATURE du contrat
    // qui le déclenche (onboarderParContrat), un seul chemin vers cet état.
    if (action === 'onboarder') {
      throw new ConflictException('L’Onboard se fait à la signature du contrat (bloc « Contrat » de la fiche).');
    }
    const commentaire = commentaireSaisi?.trim() || null;
    if (regle.commentaireObligatoire && !commentaire) {
      throw new BadRequestException(
        action === 'perdre'
          ? 'Le motif est obligatoire pour déclarer un dossier perdu.'
          : 'Un commentaire est obligatoire pour renvoyer le dossier.',
      );
    }
    await this.verifierOffre(id, action);

    // Bascule du statut + ligne de journal, dans la transaction fournie.
    // Garde de concurrence : ne bascule que si le statut n'a pas changé
    // depuis la lecture (deux personnes qui agissent en même temps).
    const basculer = async (tx: Prisma.TransactionClient) => {
      const { count } = await tx.dossierCrm.updateMany({
        where: { id, statut: dossier.statut },
        data: { statut: regle.vers },
      });
      if (count === 0) {
        throw new ConflictException('Le dossier vient de changer de statut — recharge la page.');
      }
      await tx.dossierCrmTransition.create({
        data: { dossierId: id, de: dossier.statut, vers: regle.vers, parId: acteur.userId, commentaire },
      });
    };
    const opts = this.optsFormat(acteur);

    // Valider = ENVOYER l'offre (numéro, lien public, validité 7 j) : la
    // bascule du dossier se fait dans la transaction de numérotation du devis.
    if (action === 'valider') {
      const emise = await this.devis.emettreOffre(societeId, id, basculer);
      const d = await this.prisma.dossierCrm.findUniqueOrThrow({
        where: { id },
        include: INCLUDE_DOSSIER,
      });
      await this.notifications.notifierDossierCrm({
        societeId,
        dossierId: id,
        evenement: 'offre_envoyee',
        parId: acteur.userId,
      });
      return {
        projet: versDossierCrm(d, opts),
        projetCree: null,
        offreEmise: {
          reference: emise.reference,
          lienPublic: emise.lienPublic,
          emailEnvoye: emise.emailEnvoye,
        },
        facturesPreparees: 0,
      };
    }

    const dossierMaj = await this.prisma.$transaction(async (tx) => {
      await basculer(tx);
      // Soumise à la DAF : l'offre fige ses parts F1 / F2 / F3 (Réglages).
      if (action === 'soumettre') await this.facturation.figerPartsOffres(tx, societeId, id);
      return tx.dossierCrm.findUniqueOrThrow({ where: { id }, include: INCLUDE_DOSSIER });
    });
    const evenement = EVENEMENT_PAR_ACTION[action];
    if (evenement) {
      await this.notifications.notifierDossierCrm({
        societeId,
        dossierId: id,
        evenement,
        parId: acteur.userId,
        commentaire,
      });
    }
    // Offre au-delà du seuil de contresignature : la validation revient au
    // CEO — il est prévenu en plus de la CFO (14/10/2026).
    if (action === 'soumettre') {
      const montant = await this.seuilCeo.offreAuDelaDuSeuil(societeId, id);
      if (montant !== null) {
        await this.notifications.envoyer({
          societeId,
          type: 'dossier_soumis',
          titre: `${dossierMaj.code} · ${dossierMaj.programme} — offre de ${formatAmount(montant)} TTC à contresigner (au-delà du seuil)`,
          // Le délégataire du CEO en fonction aussi (revue CEO).
          destinataireIds: await avecDelegataire(
            this.prisma,
            societeId,
            await this.notifications.titulairesRole(societeId, ROLE_CEO),
            acteur.userId,
          ),
          parId: acteur.userId,
          dossierCrmId: id,
        });
      }
    }

    return {
      projet: versDossierCrm(dossierMaj, opts),
      projetCree: null,
      offreEmise: null,
      facturesPreparees: 0,
    };
  }

  // Étape G — la signature du contrat fait passer le dossier en « onboard »
  // (seul chemin vers cet état) : bascule + journal + `dansTransaction`
  // (le contrat marqué signé) + transaction pivot, TOUT OU RIEN. Pas de
  // contrôle de droit ici : la signature du client (ou le scan déposé par
  // un rôle ayant le droit, cf. ContratsService) fait autorité.
  async onboarderParContrat(
    societeId: string,
    dossierId: string,
    parId: string | null,
    dansTransaction: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    const dossier = await this.prisma.dossierCrm.findFirst({
      where: { id: dossierId, societeId },
      include: { projet: { select: { id: true } } },
    });
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    if (dossier.statut !== 'offre_envoyee' || dossier.projet) {
      throw new ConflictException('Ce dossier n’attend plus de signature de contrat.');
    }
    const offreAcceptee = await this.verifierOffre(dossierId, 'onboarder');

    const onboard = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.dossierCrm.updateMany({
        where: { id: dossierId, statut: 'offre_envoyee' },
        data: { statut: 'onboard' },
      });
      if (count === 0) throw new ConflictException('Le dossier vient de changer de statut.');
      await tx.dossierCrmTransition.create({
        data: {
          dossierId,
          de: 'offre_envoyee',
          vers: 'onboard',
          parId,
          commentaire: 'Contrat signé.',
        },
      });
      await dansTransaction(tx);
      const d = await tx.dossierCrm.findUniqueOrThrow({ where: { id: dossierId } });
      return this.creerProjetOnboard(tx, societeId, d, offreAcceptee);
    });
    await this.notifications.notifierDossierCrm({
      societeId,
      dossierId,
      evenement: 'contrat_signe',
      parId,
      projetId: onboard.projet.id,
      facturesPreparees: onboard.facturesPreparees,
    });
    return onboard;
  }

  // Transaction pivot : le projet d'exécution et sa coquille avant-projet,
  // puis l'offre acceptée rattachée au projet et transformée en factures
  // brouillon (échéanciers CGV, étape H2) — « transformée » : plus de
  // conversion « 1 devis → 1 facture » possible sur elle.
  private async creerProjetOnboard(
    tx: Prisma.TransactionClient,
    societeId: string,
    d: {
      id: string;
      code: string;
      nature: NatureDossier;
      categorie: Categorie | null;
      programme: string;
      localisation: string;
      latitude: number | null;
      longitude: number | null;
      type: TypeBien | null;
      clientId: string;
    },
    offreAcceptee: string | null,
  ) {
    // Soumis complet (crm/fiche.ts), un dossier a sa catégorie et son type ;
    // garde pour un dossier antérieur resté incomplet (annule la transaction).
    const { categorie, type } = d;
    if (!categorie || !type) {
      throw new ConflictException('Fiche incomplète : catégorie et type de projet requis pour ouvrir le projet.');
    }
    const p = await tx.projet.create({
      data: {
        societeId,
        dossierCrmId: d.id,
        code: d.code,
        nature: d.nature,
        categorie,
        programme: d.programme,
        localisation: d.localisation,
        latitude: d.latitude,
        longitude: d.longitude,
        type,
        clientId: d.clientId,
        phase: PHASES_PAR_CATEGORIE[categorie][0],
      },
      include: { client: true, cellules: true },
    });
    // Factures directes du lead (sans offre) : rattachées au projet ouvert.
    await tx.facture.updateMany({ where: { dossierCrmId: d.id, projetId: null }, data: { projetId: p.id } });
    let facturesPreparees = 0;
    if (offreAcceptee) {
      await tx.devis.update({
        where: { id: offreAcceptee },
        data: { projetId: p.id, statut: 'transforme' },
      });
      facturesPreparees = await this.facturation.preparerDepuisOffre(
        tx,
        societeId,
        { id: p.id, nature: d.nature },
        offreAcceptee,
      );
    }
    return { projet: versProjetExecution(p), facturesPreparees };
  }

  // Conditions posées par l'offre du dossier (étape F). Renvoie l'id de
  // l'offre acceptée pour « onboarder » (rattachement au projet), null sinon.
  private async verifierOffre(dossierId: string, action: ActionCrm): Promise<string | null> {
    if (action === 'soumettre') {
      // Le brouillon tolère des lignes pas encore chiffrées (maquette
      // Finances) ; le CFO ne reçoit qu'une offre entièrement chiffrée.
      const offre = await this.prisma.devis.findFirst({
        where: { dossierCrmId: dossierId, statut: 'brouillon' },
        select: { lignes: { select: { quantite: true, prixUnitaire: true } } },
      });
      const lignes = offre?.lignes ?? [];
      if (!lignes.some((l) => l.quantite.toNumber() > 0 && l.prixUnitaire.toNumber() > 0)) {
        throw new ConflictException('Ajoute au moins une prestation chiffrée à l’offre avant de la soumettre au CFO.');
      }
      if (lignes.some((l) => l.quantite.toNumber() <= 0)) {
        throw new ConflictException(
          'Offre : une ligne n’est pas chiffrée (quantité, surface ou planches manquantes) — complète-la ou retire-la avant de la soumettre au CFO.',
        );
      }
    }
    if (action === 'onboarder' || action === 'refaire') {
      const offres = await this.prisma.devis.findMany({
        where: { dossierCrmId: dossierId, statut: { in: ['envoye', 'accepte'] } },
        select: { id: true, statut: true, dateValidite: true },
      });
      const aujourdhui = todayIso();
      const acceptee = offres.find((o) => o.statut === 'accepte');
      const enAttente = offres.find((o) => statutDevisEffectif(o, aujourdhui) === 'envoye');
      if (action === 'onboarder') {
        if (!acceptee) {
          throw new ConflictException(
            'L’Onboard exige une offre acceptée par le client (via son lien, ou réponse saisie).',
          );
        }
        return acceptee.id;
      }
      if (acceptee) {
        throw new ConflictException(
          'L’offre a été acceptée : prépare le contrat — sa signature fera passer le dossier en Onboard.',
        );
      }
      if (enAttente) {
        throw new ConflictException(
          `L’offre en cours attend encore la réponse du client (valable jusqu’au ${enAttente.dateValidite}) — attends son expiration, ou déclare le dossier perdu.`,
        );
      }
    }
    return null;
  }

  // Journal du cycle, du plus ancien au plus récent.
  async historique(societeId: string, id: string) {
    const dossier = await this.prisma.dossierCrm.findFirst({
      where: { id, societeId },
      select: { id: true },
    });
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    const lignes = await this.prisma.dossierCrmTransition.findMany({
      where: { dossierId: id },
      include: { par: PERSONNE },
      orderBy: { creeLe: 'asc' },
    });
    return lignes.map((t) => ({
      id: t.id,
      de: t.de,
      vers: t.vers,
      par: t.par ? { id: t.par.id, nom: `${t.par.prenom} ${t.par.nom}` } : null,
      commentaire: t.commentaire,
      le: t.creeLe,
    }));
  }

  async peutReassigner(societeId: string, acteur: Acteur): Promise<boolean> {
    if (acteur.adminHub || acteur.role === ROLE_COMPANY_ADMIN || acteur.role === ROLE_CIO) return true;
    const titulaires = await this.titulairesProprietaire(this.prisma, societeId);
    return titulaires.some((u) => u.id === acteur.userId);
  }

  private optsFormat(acteur: Acteur) {
    return {
      // Montant de l'offre = donnée devis : absente pour qui n'a pas
      // finances_devis en lecture (le COO voit le cycle, pas le chiffrage).
      voitOffre: aLaPermission(acteur.permissions, 'finances_devis', 'lecture'),
    };
  }

  private titulairesProprietaire(tx: Prisma.TransactionClient, societeId: string) {
    return tx.utilisateur.findMany({
      where: {
        actif: true,
        roles: {
          some: {
            societeId,
            role: { societeId, nom: ROLE_PROPRIETAIRE_DOSSIER, supprimeLe: null },
          },
        },
      },
      select: { id: true, prenom: true, nom: true },
      orderBy: [{ prenom: 'asc' }, { nom: 'asc' }],
    });
  }

  // Propriétaire à enregistrer. Choisi explicitement → doit être titulaire du
  // rôle. Sinon : un seul titulaire → lui ; aucun ou plusieurs → null (« à
  // assigner », jamais bloquant : la modale ne propose plus de choix, la
  // fiche se réassigne ensuite).
  private async resoudreProprietaire(
    tx: Prisma.TransactionClient,
    societeId: string,
    choisi: string | undefined,
  ): Promise<string | null> {
    const titulaires = await this.titulairesProprietaire(tx, societeId);
    if (choisi) {
      if (!titulaires.some((u) => u.id === choisi)) {
        throw new BadRequestException(`Le propriétaire doit être titulaire du rôle ${ROLE_PROPRIETAIRE_DOSSIER}.`);
      }
      return choisi;
    }
    return titulaires.length === 1 ? titulaires[0].id : null;
  }

  // Client du dossier : existant (sa fiche ne change pas) ou créé au passage.
  private async resoudreClient(
    tx: Prisma.TransactionClient,
    societeId: string,
    ref: CreerDossierDto['client'],
  ): Promise<Client> {
    if (ref.nouveau) {
      // Référence CL-NNNN : rang suivant de la société (collision concurrente →
      // contrainte unique, la création échoue plutôt que de doublonner).
      const dernier = await tx.client.aggregate({ where: { societeId }, _max: { numero: true } });
      return tx.client.create({ data: { societeId, numero: (dernier._max.numero ?? 0) + 1, ...ref.nouveau } });
    }
    const client = await tx.client.findFirst({ where: { id: ref.id, societeId } });
    if (!client) throw new NotFoundException('Client introuvable');
    return client;
  }

  // Code du dossier, toujours généré (jamais saisi) selon la nomenclature
  // Grey Concrete CLIENT_LOC.AA, suffixe -2/-3… en cas de doublon dans la
  // société.
  private async resoudreCode(
    tx: Prisma.TransactionClient,
    societeId: string,
    client: { nom: string; type: string; sigle: string | null },
    codeLocalite: string,
  ): Promise<string> {
    const base = genererCodeDossier(client, codeLocalite);
    if (!base) {
      throw new BadRequestException('Impossible de générer le code : nom du client manquant.');
    }
    const pris = new Set(
      (
        await tx.dossierCrm.findMany({
          where: { societeId },
          select: { code: true },
        })
      ).map((d) => d.code),
    );
    return codeAvecVariante(base, pris);
  }
}

// Un lead archivé est figé : plus aucune action, réassignation ni rattachement.
function exigerNonArchive(dossier: { archiveLe: Date | null }) {
  if (dossier.archiveLe) {
    throw new ConflictException('Lead archivé : consultable seulement.');
  }
}

// Colonnes de la fiche apporteur. « Aucun » = affaire directe : tout à null
// (comme un dossier antérieur à la fiche). Un apporteur interne n'est plus
// saisi : apporteurUtilisateurId repasse à null à toute modification.
function champsApporteur(a: ApporteurDto) {
  const externe = a.type === 'externe';
  return {
    apporteurType: externe ? ('externe' as const) : null,
    apporteurUtilisateurId: null,
    apporteurNom: externe ? a.nom!.trim() : null,
    apporteurStructure: externe ? a.structure?.trim() || null : null,
    apporteurTelephone: externe ? a.telephone?.trim() || null : null,
    apporteurEmail: externe ? a.email?.trim() || null : null,
    commissionApporteur: externe ? a.commission! : null,
  };
}

// Libellé de l'historique : « affaire directe » ou « Aïssatou Ba (Notaire) ».
function resumeApporteur(a: ApporteurDto): string {
  if (a.type !== 'externe') return 'affaire directe';
  const structure = a.structure?.trim();
  return structure ? `${a.nom!.trim()} (${structure})` : a.nom!.trim();
}

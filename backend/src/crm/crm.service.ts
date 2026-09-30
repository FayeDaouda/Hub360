import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Categorie,
  Client,
  NatureDossier,
  NiveauPermission,
  Prisma,
  TypeBien,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PHASES_PAR_CATEGORIE } from '../projets/domaine/config';
import { versDossierCrm, versProjetExecution } from '../commun/format-contrat';
import { aLaPermission } from '../commun/permission.guard';
import { ROLE_CIO } from '../commun/societe-admin-ou-cio.guard';
import { DevisService } from '../devis/devis.service';
import { FacturationService } from '../projets/facturation/facturation.service';
import { statutDevisEffectif } from '../devis/domaine';
import { NotificationsService } from '../notifications/notifications.service';
import { ActionCrm, REGLES_ACTIONS, ROLE_PROPRIETAIRE_DOSSIER } from './cycle';
import { EVENEMENT_PAR_ACTION } from './notifications-crm';
import { CreerDossierDto } from './dto';
import {
  codeAvecVariante,
  estPersonneMorale,
  genererCodeDossier,
  normaliserSigle,
} from './nomenclature';

// Qui agit : l'utilisateur connecté et sa carte de permissions (JWT).
export type Acteur = {
  userId: string;
  role: string;
  permissions: Record<string, NiveauPermission>;
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
} as const;

// Commission d'apporteur = sortie d'argent vers un tiers → module
// finances_charges (décision sept. 2026), pas finances_marges.
const MODULE_COMMISSION = 'finances_charges';

@Injectable()
export class CrmService {
  constructor(
    private prisma: PrismaService,
    private devis: DevisService,
    private facturation: FacturationService,
    private notifications: NotificationsService,
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
          [
            d.code,
            d.localisation,
            d.localite?.code,
            d.programme,
            d.client.nom,
            d.type,
          ]
            .join(' ')
            .toLowerCase()
            .includes(terme),
        );
    const opts = this.optsFormat(acteur);
    return filtres.map((d) => versDossierCrm(d, opts));
  }

  async creer(societeId: string, acteur: Acteur, dto: CreerDossierDto) {
    if (!dto.client.id && !dto.client.nouveau) {
      throw new BadRequestException('client.id ou client.nouveau est requis');
    }
    // Catalogue réel : les planches sont un « champ obligatoire sur la fiche
    // projet » (tout tarif CO en dépend) — pour un dossier de conception.
    if (dto.categorie === 'conception' && dto.nbPlanches < 1) {
      throw new BadRequestException('Nombre de planches requis pour un dossier de conception.');
    }
    const commission = dto.commissionApporteur ?? null;
    if (
      commission !== null &&
      !aLaPermission(acteur.permissions, MODULE_COMMISSION, 'ecriture')
    ) {
      throw new ForbiddenException(
        'Renseigner la commission d’un apporteur demande l’accès en écriture aux charges.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const client = await this.resoudreClient(tx, societeId, dto.client);

      const localite = await tx.localite.findUnique({
        where: { id: dto.localiteId },
        select: { id: true, code: true, nom: true },
      });
      if (!localite) throw new NotFoundException('Localité introuvable');

      const proprietaireId = await this.resoudreProprietaire(
        tx,
        societeId,
        dto.proprietaireId,
      );
      const externe = dto.apporteur.type === 'externe';

      const dossier = await tx.dossierCrm.create({
        data: {
          societeId,
          code: await this.resoudreCode(tx, societeId, client, localite.code),
          nature: dto.nature,
          categorie: dto.categorie,
          localisation: localite.nom,
          localiteId: localite.id,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          type: dto.type,
          nbPlanches: dto.nbPlanches,
          surfaceTerrain: dto.surfaceTerrain,
          standing: dto.standing,
          gamme: dto.gamme,
          programme: dto.programme,
          // Toujours créé au début du cycle (plus de statut choisi à la
          // création : on ne saute plus d'étape) — première ligne du journal.
          statut: 'nouveau_projet',
          transitions: { create: { vers: 'nouveau_projet', parId: acteur.userId } },
          clientId: client.id,
          creeParId: acteur.userId,
          apporteurType: dto.apporteur.type,
          // Interne : toujours le créateur — jamais choisi dans le formulaire.
          apporteurUtilisateurId: externe ? null : acteur.userId,
          apporteurNom: externe ? dto.apporteur.nom!.trim() : null,
          apporteurTelephone: externe ? dto.apporteur.telephone?.trim() || null : null,
          apporteurEmail: externe ? dto.apporteur.email?.trim() || null : null,
          commissionApporteur: commission,
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
  async changerProprietaire(
    societeId: string,
    acteur: Acteur,
    id: string,
    proprietaireId: string,
  ) {
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

  // Rattache un dossier antérieur au référentiel (localiteId null) à une
  // localité — une seule fois : un dossier déjà rattaché ne se re-rattache pas
  // (son code a pu être généré à partir de cette localité). Le code du
  // dossier et son libellé historique `localisation` restent inchangés.
  async rattacherLocalite(
    societeId: string,
    acteur: Acteur,
    id: string,
    localiteId: string,
  ) {
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
  // (la ligne demeure, cf. resoudreCode). Définitif : aucune action ensuite.
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

  // Fait avancer un dossier dans le cycle commercial (cf. crm/cycle.ts) :
  // droit de l'acteur sur le module de l'action, statut de départ autorisé,
  // texte obligatoire le cas échéant — puis écriture + ligne de journal dans
  // la même transaction. Le passage à « onboard » est la transaction pivot :
  // il crée le projet d'exécution et sa coquille avant-projet (une seule fois).
  async agir(
    societeId: string,
    acteur: Acteur,
    id: string,
    action: ActionCrm,
    commentaireSaisi: string | undefined,
  ) {
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
    if (!regle.de.includes(dossier.statut)) {
      throw new ConflictException(
        `Action « ${action} » impossible depuis le statut « ${dossier.statut} ».`,
      );
    }
    // Étape G : l'Onboard n'est plus un clic — c'est la SIGNATURE du contrat
    // qui le déclenche (onboarderParContrat), un seul chemin vers cet état.
    if (action === 'onboarder') {
      throw new ConflictException(
        'L’Onboard se fait à la signature du contrat (bloc « Contrat » de la fiche).',
      );
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
      categorie: Categorie;
      programme: string;
      localisation: string;
      latitude: number | null;
      longitude: number | null;
      type: TypeBien;
      clientId: string;
    },
    offreAcceptee: string | null,
  ) {
    const p = await tx.projet.create({
      data: {
        societeId,
        dossierCrmId: d.id,
        code: d.code,
        nature: d.nature,
        categorie: d.categorie,
        programme: d.programme,
        localisation: d.localisation,
        latitude: d.latitude,
        longitude: d.longitude,
        type: d.type,
        clientId: d.clientId,
        phase: PHASES_PAR_CATEGORIE[d.categorie][0],
        avantProjet: { create: {} },
      },
      include: { client: true, cellules: true },
    });
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
      const prete = await this.prisma.devis.count({
        where: { dossierCrmId: dossierId, statut: 'brouillon', lignes: { some: {} } },
      });
      if (prete === 0) {
        throw new ConflictException(
          'Prépare l’offre (au moins une ligne) avant de soumettre le dossier à la DAF.',
        );
      }
    }
    if (action === 'onboarder' || action === 'refaire') {
      const offres = await this.prisma.devis.findMany({
        where: { dossierCrmId: dossierId, statut: { in: ['envoye', 'accepte'] } },
        select: { id: true, statut: true, dateValidite: true },
      });
      const aujourdhui = new Date().toISOString().slice(0, 10);
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
    if (acteur.role === 'societe_admin' || acteur.role === ROLE_CIO) return true;
    const titulaires = await this.titulairesProprietaire(this.prisma, societeId);
    return titulaires.some((u) => u.id === acteur.userId);
  }

  private optsFormat(acteur: Acteur) {
    return {
      voitCommission: aLaPermission(acteur.permissions, MODULE_COMMISSION, 'lecture'),
      // Montant de l'offre = donnée devis : absente pour qui n'a pas
      // finances_devis en lecture (le COO voit le cycle, pas le chiffrage).
      voitOffre: aLaPermission(acteur.permissions, 'finances_devis', 'lecture'),
    };
  }

  private titulairesProprietaire(
    tx: Prisma.TransactionClient,
    societeId: string,
  ) {
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
  // rôle. Sinon : un seul titulaire → lui ; aucun → null (« à assigner »,
  // jamais bloquant) ; plusieurs → pas de choix arbitraire, 400.
  private async resoudreProprietaire(
    tx: Prisma.TransactionClient,
    societeId: string,
    choisi: string | undefined,
  ): Promise<string | null> {
    const titulaires = await this.titulairesProprietaire(tx, societeId);
    if (choisi) {
      if (!titulaires.some((u) => u.id === choisi)) {
        throw new BadRequestException(
          `Le propriétaire doit être titulaire du rôle ${ROLE_PROPRIETAIRE_DOSSIER}.`,
        );
      }
      return choisi;
    }
    if (titulaires.length === 0) return null;
    if (titulaires.length === 1) return titulaires[0].id;
    throw new BadRequestException(
      `Plusieurs titulaires du rôle ${ROLE_PROPRIETAIRE_DOSSIER} : choisis le propriétaire du dossier.`,
    );
  }

  // Client du dossier : existant ou créé au passage. Une personne morale doit
  // avoir un sigle (segment CLIENT du code) — celui de la fiche, ou celui
  // fourni ici pour compléter une fiche qui n'en a pas encore (il est alors
  // enregistré sur le client, pas seulement utilisé pour ce code).
  private async resoudreClient(
    tx: Prisma.TransactionClient,
    societeId: string,
    ref: CreerDossierDto['client'],
  ): Promise<Client> {
    if (ref.nouveau) {
      const { sigle, ...champs } = ref.nouveau;
      return tx.client.create({
        data: {
          societeId,
          ...champs,
          sigle: estPersonneMorale(champs.type) ? this.exigerSigle(sigle) : null,
        },
      });
    }

    const client = await tx.client.findFirst({ where: { id: ref.id, societeId } });
    if (!client) throw new NotFoundException('Client introuvable');
    if (!estPersonneMorale(client.type) || client.sigle) return client;
    return tx.client.update({
      where: { id: client.id },
      data: { sigle: this.exigerSigle(ref.sigle) },
    });
  }

  private exigerSigle(saisi: string | undefined): string {
    const sigle = normaliserSigle(saisi ?? '');
    if (!sigle) {
      throw new BadRequestException(
        'Le sigle est obligatoire pour une société, une SCI ou une institution.',
      );
    }
    return sigle;
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
      throw new BadRequestException(
        'Impossible de générer le code : nom ou sigle du client manquant.',
      );
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

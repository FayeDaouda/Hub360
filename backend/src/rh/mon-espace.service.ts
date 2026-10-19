import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ModePaiementSalaire, Prisma, SituationFamiliale, TypePieceDossier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ouDossierDuCompte } from './mon-compte';
import { TachesService } from './taches.service';

type Acteur = { userId: string; societeId?: string };

// Pièces du dossier que le salarié retrouve dans « Mon espace » (maquette RH :
// « visible dans Mon espace »). Les autres pièces restent côté RH.
export const DOCUMENTS_SALARIE: TypePieceDossier[] = ['contrat_signe', 'fiche_poste'];

const INCLURE = {
  societe: { select: { nom: true } },
  collaborateur: { select: { photoCle: true, cellule: { select: { nom: true } } } },
  pieces: { where: { type: { in: DOCUMENTS_SALARIE } }, select: { type: true, nom: true, createdAt: true } },
  bulletins: { select: { mois: true, nom: true, updatedAt: true }, orderBy: { mois: 'desc' } },
  attestations: { select: { id: true, demandeLe: true, delivreeLe: true, nom: true }, orderBy: { demandeLe: 'desc' } },
} satisfies Prisma.DossierPersonnelInclude;
type DossierProfil = Prisma.DossierPersonnelGetPayload<{ include: typeof INCLURE }>;

// « Mon espace » (lot 5) : le salarié consulte son dossier, modifie ses seules
// coordonnées (téléphone, contact d'urgence) et télécharge ses documents.
// Le salaire n'y figure pas (réservé RH, CFO, CEO).
@Injectable()
export class MonEspaceService {
  constructor(
    private prisma: PrismaService,
    private taches: TachesService,
  ) {}

  // `dossier: null` plutôt qu'une erreur : les autres onglets (tâches, temps,
  // validations du N+1) restent utilisables sans dossier ouvert par la RH.
  async profil(a: Acteur) {
    const d = await this.prisma.dossierPersonnel.findFirst({ where: ouDossierDuCompte(a.userId), include: INCLURE });
    return { dossier: d ? versProfil(d) : null };
  }

  async majCoordonnees(
    a: Acteur,
    corps: {
      telephone?: string;
      emailPerso?: string;
      situationFamiliale?: SituationFamiliale | null;
      enfantsACharge?: number;
      adresse?: string;
      contactUrgence?: string;
      telephoneUrgence?: string;
    },
  ) {
    const id = await this.idDossier(a);
    const texte = (v?: string) => (v === undefined ? undefined : v.trim());
    await this.prisma.dossierPersonnel.update({
      where: { id },
      data: {
        telephone: texte(corps.telephone),
        emailPerso: texte(corps.emailPerso),
        situationFamiliale: corps.situationFamiliale,
        enfantsACharge: corps.enfantsACharge,
        adresse: texte(corps.adresse),
        contactUrgence: texte(corps.contactUrgence),
        telephoneUrgence: texte(corps.telephoneUrgence),
      },
    });
    return this.profil(a);
  }

  // « Demander une attestation de travail » : une seule demande en attente à
  // la fois ; la RH la délivre (onglet RH › Demandes).
  async demanderAttestation(a: Acteur) {
    const id = await this.idDossier(a);
    const enAttente = await this.prisma.demandeAttestation.count({ where: { dossierId: id, delivreeLe: null } });
    if (enAttente) throw new ConflictException('Une attestation est déjà demandée : la RH la prépare.');
    await this.prisma.demandeAttestation.create({ data: { dossierId: id } });
    return this.profil(a);
  }

  async attestation(a: Acteur, attestationId: string) {
    const id = await this.idDossier(a);
    const at = await this.prisma.demandeAttestation.findFirst({ where: { id: attestationId, dossierId: id }, select: { nom: true, cle: true } });
    if (!at?.cle) throw new NotFoundException('Attestation pas encore délivrée par la RH.');
    return { nom: at.nom ?? 'attestation-de-travail', url: at.cle };
  }

  // « Soumettre à la RH » : le nouveau moyen de paiement attend la validation
  // de la RH (appliqué à la paie ensuite) ; une nouvelle demande remplace la
  // précédente. Identique à celui en service : rien à valider.
  async demanderPaiement(a: Acteur, corps: { modePaiement: ModePaiementSalaire; coordonneesPaiement: string }) {
    const id = await this.idDossier(a);
    const d = await this.prisma.dossierPersonnel.findUniqueOrThrow({ where: { id }, select: { modePaiement: true, coordonneesPaiement: true } });
    const coordonnees = corps.coordonneesPaiement.trim();
    if (!coordonnees) throw new BadRequestException('Indiquez la banque et le RIB, ou le numéro.');
    if (d.modePaiement === corps.modePaiement && d.coordonneesPaiement === coordonnees) {
      throw new ConflictException('C’est déjà le moyen de paiement en service.');
    }
    await this.prisma.dossierPersonnel.update({
      where: { id },
      data: { paiementDemandeMode: corps.modePaiement, paiementDemandeCoordonnees: coordonnees, paiementDemandeLe: new Date() },
    });
    return this.profil(a);
  }


  async document(a: Acteur, type: string) {
    if (!(DOCUMENTS_SALARIE as string[]).includes(type)) throw new NotFoundException('Document inconnu.');
    const p = await this.prisma.pieceDossierPersonnel.findUnique({
      where: { dossierId_type: { dossierId: await this.idDossier(a), type: type as TypePieceDossier } },
      select: { nom: true, cle: true },
    });
    if (!p) throw new NotFoundException('Document pas encore déposé par la RH.');
    return { nom: p.nom, url: p.cle };
  }

  async bulletin(a: Acteur, mois: string) {
    const b = await this.prisma.bulletinPaie.findUnique({
      where: { dossierId_mois: { dossierId: await this.idDossier(a), mois } },
      select: { nom: true, cle: true },
    });
    if (!b) throw new NotFoundException('Bulletin pas encore déposé par la RH.');
    return { nom: b.nom, url: b.cle };
  }

  // Ma cellule (lot 5d, maquette « Mon espace » du boss) : l'équipe, son
  // pilote (chef de team), ses projets et ses tâches (en cours, en retard,
  // remises à temps). Aucun montant. Sans cellule : tout à zéro.
  async maCellule(a: Acteur) {
    const dossier = await this.prisma.dossierPersonnel.findFirst({
      where: ouDossierDuCompte(a.userId),
      select: { collaborateur: { select: { id: true, celluleId: true } } },
    });
    const fiche =
      dossier?.collaborateur ??
      (await this.prisma.collaborateur.findFirst({
        where: { utilisateurId: a.userId, ...(a.societeId && { societeId: a.societeId }) },
        select: { id: true, celluleId: true },
      }));
    if (!fiche?.celluleId) return { cellule: null, stats: await this.taches.statsEquipe([]) };

    const c = await this.prisma.cellule.findUniqueOrThrow({
      where: { id: fiche.celluleId },
      select: {
        nom: true,
        dispatcherId: true,
        membres: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            role: true,
            niveau: true,
            photoCle: true,
            utilisateurId: true,
            dossierPersonnel: { select: { utilisateurId: true } },
          },
          orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
        },
        dispatcher: { select: { prenom: true, nom: true } },
        projets: {
          select: { projet: { select: { id: true, code: true, programme: true, phase: true } } },
          orderBy: { projet: { code: 'asc' } },
        },
      },
    });
    return {
      stats: await this.taches.statsEquipe(c.membres.map((m) => m.id)),
      cellule: {
        nom: c.nom,
        pilote: c.dispatcher ? `${c.dispatcher.prenom} ${c.dispatcher.nom}`.trim() : null,
        membres: c.membres.map((m) => ({
          id: m.id,
          nom: `${m.prenom} ${m.nom}`.trim(),
          role: m.role,
          niveau: m.niveau,
          estChef: m.id === c.dispatcherId,
          estMoi: m.id === fiche.id,
          photo: m.photoCle,
          // Compte HUB du membre (fiche contact) ; null s'il n'en a pas.
          utilisateurId: m.utilisateurId ?? m.dossierPersonnel?.utilisateurId ?? null,
        })),
        projets: c.projets.map((p) => p.projet),
      },
    };
  }

  private async idDossier(a: Acteur): Promise<string> {
    const d = await this.prisma.dossierPersonnel.findFirst({ where: ouDossierDuCompte(a.userId), select: { id: true } });
    if (!d) throw new NotFoundException('Aucun dossier du personnel pour ce compte — voir avec la RH.');
    return d.id;
  }
}

function versProfil(d: DossierProfil) {
  const mission = {
    resultat: d.missionResultat,
    livrables: d.missionLivrables,
    kpi: d.missionKpi,
    signalAlerte: d.missionSignalAlerte,
  };
  return {
    id: d.id,
    matricule: d.matricule,
    prenom: d.prenom,
    nom: d.nom,
    poste: d.poste,
    societe: d.societe.nom,
    cellule: d.collaborateur?.cellule?.nom ?? null,
    // Photo de la fiche d'équipe (Équipes) : en-tête de Mon espace.
    photo: d.collaborateur?.photoCle ?? null,
    typeContrat: d.typeContrat,
    dateEntree: d.dateEntree,
    dateFin: d.dateFin,
    dateNaissance: d.dateNaissance,
    lieuNaissance: d.lieuNaissance,
    nationalite: d.nationalite,
    numeroPiece: d.numeroPiece,
    telephone: d.telephone,
    emailPro: d.emailPro,
    contactUrgence: d.contactUrgence,
    telephoneUrgence: d.telephoneUrgence,
    emailPerso: d.emailPerso,
    situationFamiliale: d.situationFamiliale,
    enfantsACharge: d.enfantsACharge,
    adresse: d.adresse,
    modePaiement: d.modePaiement,
    coordonneesPaiement: d.coordonneesPaiement,
    // null = rien en attente de la RH.
    paiementDemande: d.paiementDemandeMode
      ? { mode: d.paiementDemandeMode, coordonnees: d.paiementDemandeCoordonnees ?? '', le: d.paiementDemandeLe }
      : null,
    numeroIpm: d.numeroIpm,
    mission: Object.values(mission).some((v) => v.trim()) ? mission : null,
    documents: DOCUMENTS_SALARIE.map((type) => {
      const p = d.pieces.find((x) => x.type === type);
      return { type, nom: p?.nom ?? null, ajouteLe: p?.createdAt ?? null };
    }),
    bulletins: d.bulletins.map((b) => ({ mois: b.mois, nom: b.nom, deposeLe: b.updatedAt })),
    attestations: d.attestations,
  };
}

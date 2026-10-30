import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ModePaiementSalaire, Prisma, SituationFamiliale, TypePieceDossier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ouDossierDuCompte } from '../rh/mon-compte';
import { TasksService } from '../tasks/tasks.service';
import { cheminPhoto, photoMembre } from '../auth/profil';
import type { DownloadDto, MyCellViewDto, MyFileDto, MySpaceViewDto } from './my-space-view.dto';

type Actor = { userId: string; societeId?: string };

// Pièces du dossier que le salarié retrouve dans « Mon espace » (maquette RH :
// « visible dans Mon espace »). Les autres pièces restent côté RH.
export const EMPLOYEE_DOCUMENTS: TypePieceDossier[] = ['contrat_signe', 'fiche_poste'];

const PROFILE_INCLUDE = {
  societe: { select: { nom: true } },
  collaborateur: { select: { photoCle: true, cellule: { select: { nom: true } } } },
  // Photo choisie par la personne (menu du compte) : prime sur la fiche d'équipe.
  utilisateur: { select: { photoCle: true } },
  pieces: { where: { type: { in: EMPLOYEE_DOCUMENTS } }, select: { type: true, nom: true, createdAt: true } },
  bulletins: { select: { mois: true, nom: true, updatedAt: true }, orderBy: { mois: 'desc' } },
  attestations: { select: { id: true, demandeLe: true, delivreeLe: true, nom: true }, orderBy: { demandeLe: 'desc' } },
} satisfies Prisma.DossierPersonnelInclude;
type ProfileFile = Prisma.DossierPersonnelGetPayload<{ include: typeof PROFILE_INCLUDE }>;

// « Mon espace » (lot 5) : le salarié consulte son dossier, modifie ses seules
// coordonnées (téléphone, contact d'urgence) et télécharge ses documents.
// Le salaire n'y figure pas (réservé RH, CFO, CEO).
@Injectable()
export class MySpaceService {
  constructor(
    private prisma: PrismaService,
    private tasks: TasksService,
  ) {}

  // `dossier: null` plutôt qu'une erreur : les autres onglets (tâches, temps,
  // validations du N+1) restent utilisables sans dossier ouvert par la RH.
  async profile(a: Actor): Promise<MySpaceViewDto> {
    const d = await this.prisma.dossierPersonnel.findFirst({
      where: ouDossierDuCompte(a.userId),
      include: PROFILE_INCLUDE,
    });
    return { dossier: d ? toProfile(d) : null };
  }

  async updateContactDetails(
    a: Actor,
    body: {
      telephone?: string;
      emailPerso?: string;
      situationFamiliale?: SituationFamiliale | null;
      enfantsACharge?: number;
      adresse?: string;
      contactUrgence?: string;
      telephoneUrgence?: string;
    },
  ) {
    const id = await this.fileId(a);
    const text = (v?: string) => (v === undefined ? undefined : v.trim());
    await this.prisma.dossierPersonnel.update({
      where: { id },
      data: {
        telephone: text(body.telephone),
        emailPerso: text(body.emailPerso),
        situationFamiliale: body.situationFamiliale,
        enfantsACharge: body.enfantsACharge,
        adresse: text(body.adresse),
        contactUrgence: text(body.contactUrgence),
        telephoneUrgence: text(body.telephoneUrgence),
      },
    });
    return this.profile(a);
  }

  // « Demander une attestation de travail » : une seule demande en attente à
  // la fois ; la RH la délivre (onglet RH › Demandes).
  async requestCertificate(a: Actor) {
    const id = await this.fileId(a);
    const pending = await this.prisma.demandeAttestation.count({ where: { dossierId: id, delivreeLe: null } });
    if (pending) throw new ConflictException('Une attestation est déjà demandée : la RH la prépare.');
    await this.prisma.demandeAttestation.create({ data: { dossierId: id } });
    return this.profile(a);
  }

  async certificate(a: Actor, certificateId: string): Promise<DownloadDto> {
    const id = await this.fileId(a);
    const c = await this.prisma.demandeAttestation.findFirst({
      where: { id: certificateId, dossierId: id },
      select: { nom: true, cle: true },
    });
    if (!c?.cle) throw new NotFoundException('Attestation pas encore délivrée par la RH.');
    return { nom: c.nom ?? 'attestation-de-travail', url: c.cle };
  }

  // « Soumettre à la RH » : le nouveau moyen de paiement attend la validation
  // de la RH (appliqué à la paie ensuite) ; une nouvelle demande remplace la
  // précédente. Identique à celui en service : rien à valider.
  async requestPaymentChange(a: Actor, body: { modePaiement: ModePaiementSalaire; coordonneesPaiement: string }) {
    const id = await this.fileId(a);
    const d = await this.prisma.dossierPersonnel.findUniqueOrThrow({
      where: { id },
      select: { modePaiement: true, coordonneesPaiement: true },
    });
    const details = body.coordonneesPaiement.trim();
    if (!details) throw new BadRequestException('Indiquez la banque et le RIB, ou le numéro.');
    if (d.modePaiement === body.modePaiement && d.coordonneesPaiement === details) {
      throw new ConflictException('C’est déjà le moyen de paiement en service.');
    }
    await this.prisma.dossierPersonnel.update({
      where: { id },
      data: {
        paiementDemandeMode: body.modePaiement,
        paiementDemandeCoordonnees: details,
        paiementDemandeLe: new Date(),
      },
    });
    return this.profile(a);
  }

  async document(a: Actor, type: string): Promise<DownloadDto> {
    if (!(EMPLOYEE_DOCUMENTS as string[]).includes(type)) throw new NotFoundException('Document inconnu.');
    const p = await this.prisma.pieceDossierPersonnel.findUnique({
      where: { dossierId_type: { dossierId: await this.fileId(a), type: type as TypePieceDossier } },
      select: { nom: true, cle: true },
    });
    if (!p) throw new NotFoundException('Document pas encore déposé par la RH.');
    return { nom: p.nom, url: p.cle };
  }

  async payslip(a: Actor, month: string): Promise<DownloadDto> {
    const p = await this.prisma.bulletinPaie.findUnique({
      where: { dossierId_mois: { dossierId: await this.fileId(a), mois: month } },
      select: { nom: true, cle: true },
    });
    if (!p) throw new NotFoundException('Bulletin pas encore déposé par la RH.');
    return { nom: p.nom, url: p.cle };
  }

  // Ma cellule (lot 5d, maquette « Mon espace » du boss) : l'équipe, son
  // pilote (chef d’équipe), ses projets et ses tâches (en cours, en retard,
  // remises à temps). Aucun montant. Sans cellule : tout à zéro.
  async myCell(a: Actor): Promise<MyCellViewDto> {
    const file = await this.prisma.dossierPersonnel.findFirst({
      where: ouDossierDuCompte(a.userId),
      select: { collaborateur: { select: { id: true, celluleId: true } } },
    });
    const member =
      file?.collaborateur ??
      (await this.prisma.collaborateur.findFirst({
        where: { utilisateurId: a.userId, ...(a.societeId && { societeId: a.societeId }) },
        select: { id: true, celluleId: true },
      }));
    if (!member?.celluleId) return { cellule: null, stats: await this.tasks.teamStats([]) };

    const c = await this.prisma.cellule.findUniqueOrThrow({
      where: { id: member.celluleId },
      select: {
        nom: true,
        societeId: true,
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
            utilisateur: { select: { photoCle: true } },
            dossierPersonnel: { select: { utilisateurId: true, utilisateur: { select: { photoCle: true } } } },
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
      stats: await this.tasks.teamStats(
        c.membres.map((m) => m.id),
        c.societeId,
      ),
      cellule: {
        nom: c.nom,
        pilote: c.dispatcher ? `${c.dispatcher.prenom} ${c.dispatcher.nom}`.trim() : null,
        membres: c.membres.map((m) => ({
          id: m.id,
          nom: `${m.prenom} ${m.nom}`.trim(),
          role: m.role,
          niveau: m.niveau,
          estChef: m.id === c.dispatcherId,
          estMoi: m.id === member.id,
          photo: photoMembre(m),
          // Compte HUB du membre (fiche contact) ; null s'il n'en a pas.
          utilisateurId: m.utilisateurId ?? m.dossierPersonnel?.utilisateurId ?? null,
        })),
        projets: c.projets.map((p) => p.projet),
      },
    };
  }

  private async fileId(a: Actor): Promise<string> {
    const d = await this.prisma.dossierPersonnel.findFirst({
      where: ouDossierDuCompte(a.userId),
      select: { id: true },
    });
    if (!d) throw new NotFoundException('Aucun dossier du personnel pour ce compte — voir avec la RH.');
    return d.id;
  }
}

function toProfile(d: ProfileFile): MyFileDto {
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
    photo: cheminPhoto(d.utilisateur?.photoCle) ?? d.collaborateur?.photoCle ?? null,
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
    documents: EMPLOYEE_DOCUMENTS.map((type) => {
      const p = d.pieces.find((x) => x.type === type);
      return { type, nom: p?.nom ?? null, ajouteLe: p?.createdAt ?? null };
    }),
    bulletins: d.bulletins.map((b) => ({ mois: b.mois, nom: b.nom, deposeLe: b.updatedAt })),
    attestations: d.attestations,
  };
}

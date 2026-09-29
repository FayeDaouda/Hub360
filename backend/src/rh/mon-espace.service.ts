import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TypePieceDossier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ouDossierDuCompte } from './mon-compte';

type Acteur = { userId: string };

// Pièces du dossier que le salarié retrouve dans « Mon espace » (maquette RH :
// « visible dans Mon espace »). Les autres pièces restent côté RH.
export const DOCUMENTS_SALARIE: TypePieceDossier[] = ['contrat_signe', 'fiche_poste'];

const INCLURE = {
  societe: { select: { nom: true } },
  collaborateur: { select: { cellule: { select: { nom: true } } } },
  pieces: { where: { type: { in: DOCUMENTS_SALARIE } }, select: { type: true, nom: true, createdAt: true } },
  bulletins: { select: { mois: true, nom: true, updatedAt: true }, orderBy: { mois: 'desc' } },
} satisfies Prisma.DossierPersonnelInclude;
type DossierProfil = Prisma.DossierPersonnelGetPayload<{ include: typeof INCLURE }>;

// « Mon espace » (lot 5) : le salarié consulte son dossier, modifie ses seules
// coordonnées (téléphone, contact d'urgence) et télécharge ses documents.
// Le salaire n'y figure pas (réservé RH, CFO, CEO).
@Injectable()
export class MonEspaceService {
  constructor(private prisma: PrismaService) {}

  // `dossier: null` plutôt qu'une erreur : les autres onglets (tâches, temps,
  // validations du N+1) restent utilisables sans dossier ouvert par la RH.
  async profil(a: Acteur) {
    const d = await this.prisma.dossierPersonnel.findFirst({ where: ouDossierDuCompte(a.userId), include: INCLURE });
    return { dossier: d ? versProfil(d) : null };
  }

  async majCoordonnees(a: Acteur, corps: { telephone?: string; contactUrgence?: string }) {
    const id = await this.idDossier(a);
    await this.prisma.dossierPersonnel.update({
      where: { id },
      data: {
        ...(corps.telephone !== undefined && { telephone: corps.telephone.trim() }),
        ...(corps.contactUrgence !== undefined && { contactUrgence: corps.contactUrgence.trim() }),
      },
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
    modePaiement: d.modePaiement,
    coordonneesPaiement: d.coordonneesPaiement,
    numeroIpm: d.numeroIpm,
    mission: Object.values(mission).some((v) => v.trim()) ? mission : null,
    documents: DOCUMENTS_SALARIE.map((type) => {
      const p = d.pieces.find((x) => x.type === type);
      return { type, nom: p?.nom ?? null, ajouteLe: p?.createdAt ?? null };
    }),
    bulletins: d.bulletins.map((b) => ({ mois: b.mois, nom: b.nom, deposeLe: b.updatedAt })),
  };
}

import {
  ModePaiementSalaire,
  NiveauCollaborateur,
  Phase,
  SituationFamiliale,
  TypeContrat,
  TypePieceDossier,
} from '@prisma/client';
import { PerformanceStatsDto } from '../tasks/my-tasks-view.dto';

// Réponses de « Mon espace » (dossier du compte connecté, Ma cellule,
// téléchargements), décrites par des classes : le plugin @nestjs/swagger en
// tire la description OpenAPI, d'où les types du front (ADR 0005). Noms des
// champs : ceux de l'API, inchangés.

// Carte de mission du nouvel arrivant, rédigée par la RH.
export class MissionCardDto {
  resultat!: string;
  livrables!: string;
  kpi!: string;
  signalAlerte!: string;
}

// Changement de moyen de paiement soumis à la RH, pas encore appliqué.
export class PendingPaymentChangeDto {
  mode!: ModePaiementSalaire;
  coordonnees!: string;
  le!: Date | null;
}

export class EmployeeDocumentDto {
  type!: TypePieceDossier;
  nom!: string | null;
  ajouteLe!: Date | null;
}

export class PayslipDto {
  mois!: string;
  nom!: string;
  deposeLe!: Date;
}

// Attestation de travail sur demande : délivrée par la RH (delivreeLe non null).
export class CertificateDto {
  id!: string;
  demandeLe!: Date;
  delivreeLe!: Date | null;
  nom!: string | null;
}

export class MyFileDto {
  id!: string;
  matricule!: string;
  prenom!: string;
  nom!: string;
  poste!: string;
  societe!: string;
  cellule!: string | null;
  photo!: string | null;
  typeContrat!: TypeContrat;
  dateEntree!: string | null;
  dateFin!: string | null;
  dateNaissance!: string | null;
  lieuNaissance!: string;
  nationalite!: string;
  numeroPiece!: string;
  telephone!: string;
  emailPro!: string;
  contactUrgence!: string;
  telephoneUrgence!: string;
  emailPerso!: string;
  situationFamiliale!: SituationFamiliale | null;
  enfantsACharge!: number;
  adresse!: string;
  modePaiement!: ModePaiementSalaire;
  coordonneesPaiement!: string;
  // null = rien en attente de la RH.
  paiementDemande!: PendingPaymentChangeDto | null;
  numeroIpm!: string;
  // null tant que la RH n'a rien rédigé.
  mission!: MissionCardDto | null;
  documents!: EmployeeDocumentDto[];
  bulletins!: PayslipDto[];
  attestations!: CertificateDto[]; // la plus récente d'abord
}

// `dossier: null` : aucun dossier du personnel relié au compte.
export class MySpaceViewDto {
  dossier!: MyFileDto | null;
}

export class CellMateDto {
  id!: string;
  nom!: string;
  role!: string;
  niveau!: NiveauCollaborateur;
  estChef!: boolean;
  estMoi!: boolean;
  photo!: string | null;
  // Compte HUB du membre (fiche contact) ; null s'il n'en a pas.
  utilisateurId!: string | null;
}

export class CellProjectDto {
  id!: string;
  code!: string;
  programme!: string;
  phase!: Phase;
}

export class MyCellDto {
  nom!: string;
  pilote!: string | null; // chef d’équipe ; null = « Pilote à désigner »
  membres!: CellMateDto[];
  projets!: CellProjectDto[];
}

// Sans cellule : `cellule: null`, statistiques à zéro.
export class MyCellViewDto {
  cellule!: MyCellDto | null;
  stats!: PerformanceStatsDto;
}

// Fichier à télécharger : nom et contenu (data URI).
export class DownloadDto {
  nom!: string;
  url!: string;
}

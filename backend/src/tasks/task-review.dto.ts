// Réponses des routes du valideur (N+1) : remises qui attendent sa décision
// (GET …/taches/a-valider, et après une décision) et fichier d'une remise.
// Noms des champs : ceux de l'API, inchangés.

export class SubmissionFileRefDto {
  id!: string;
  nom!: string;
}

export class TaskToReviewDto {
  id!: string;
  etape!: string; // « 02 · Avant-projet »
  libelle!: string;
  version!: number;
  projetId!: string;
  projetCode!: string;
  projetProgramme!: string;
  responsable!: string;
  debut!: string | null;
  echeance!: string | null;
  remisLe!: Date | null;
  // Remise jugée à temps (task-rules.ts, onTime) ; null : rien à juger.
  aTemps!: boolean | null;
  // Fichiers de la remise à valider (vide = « sans fichier joint »).
  pieces!: SubmissionFileRefDto[];
}

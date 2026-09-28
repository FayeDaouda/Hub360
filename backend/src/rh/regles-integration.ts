// RH · Intégration des nouveaux arrivants (lot 3). Règles pures, testées.
//
// Tirées de la maquette RH (« cap des 90 jours », manuel §9.3 non reçu) :
//  - trois points à J+30, J+60, J+90, en jours CALENDAIRES depuis l'entrée
//    (les dates de la maquette le confirment : entrée 15/09 → 15/10, 14/11, 14/12) ;
//  - suivi « jusqu'à la confirmation ».
// HYPOTHÈSES DE TRAVAIL (à valider avec une RH en poste) :
//  - est « nouvel arrivant » un dossier créé dans le HUB avant la fin de ses
//    90 jours (entrée + 90 ≥ date de création) : l'existant repris au
//    lancement n'entre pas dans le suivi, sans fabriquer de date de confirmation ;
//  - la confirmation n'est possible qu'une fois le point J90 enregistré.

export const JALONS = [30, 60, 90] as const;
export type Jalon = (typeof JALONS)[number];
export type StatutPoint = 'fait' | 'a_faire' | 'a_venir';

export function ajouterJours(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function enSuivi(dossier: {
  dateEntree: string | null;
  createdAt: Date;
  confirmeLe: string | null;
  archiveLe: Date | null;
}): boolean {
  if (!dossier.dateEntree || dossier.confirmeLe || dossier.archiveLe) return false;
  return ajouterJours(dossier.dateEntree, 90) >= dossier.createdAt.toISOString().slice(0, 10);
}

export function statutPoint(datePrevue: string, fait: boolean, aujourdhui: string): StatutPoint {
  if (fait) return 'fait';
  return datePrevue <= aujourdhui ? 'a_faire' : 'a_venir';
}

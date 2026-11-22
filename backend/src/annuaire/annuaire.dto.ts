import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

// Annuaire (22/11/2026). Le périmètre, réglé société par société par le CIO
// et l'Administrateur HUB : la société de la session ; plus la direction des
// autres sociétés du groupe ; ou tout le groupe.
export const PERIMETRES_ANNUAIRE = ['societe', 'societe_direction', 'groupe'] as const;
export type PerimetreAnnuaire = (typeof PERIMETRES_ANNUAIRE)[number];

export class SocieteAnnuaireDto {
  slug: string;
  nom: string;
}

// Une personne de l'annuaire : seulement les champs d'annuaire (jamais le
// reste du dossier RH), et son absence du jour sans son motif.
export class MembreAnnuaireDto {
  utilisateurId: string;
  prenom: string;
  nom: string;
  nomAffiche: string | null;
  photoUrl: string | null;
  poste: string | null;
  cellule: string | null;
  chef: string | null; // chef d'équipe de sa cellule (null s'il l'est lui-même, ou sans cellule)
  estChef: boolean;
  telephone: string | null;
  email: string;
  societe: SocieteAnnuaireDto;
  // De la société de la session : on peut lui écrire (la messagerie est
  // propre à chaque société) et, avec le droit, voir son agenda.
  memeSociete: boolean;
  absentJusquau: string | null; // AAAA-MM-JJ : absence validée qui couvre aujourd'hui
}

export class AnnuaireDto {
  perimetre: PerimetreAnnuaire;
  societes: SocieteAnnuaireDto[]; // celles de l'annuaire, la sienne d'abord
  membres: MembreAnnuaireDto[];
  peutVoirAgendas: boolean; // Lecture de « Agenda des autres »
}

export class PerimetreAnnuaireDto {
  perimetre: PerimetreAnnuaire;
}

export class ReglerPerimetreDto {
  @IsIn(PERIMETRES_ANNUAIRE) perimetre!: PerimetreAnnuaire;
  // Comme les interrupteurs : chaque changement est motivé et entre au journal.
  @IsString() @MinLength(3) @MaxLength(500) motif!: string;
}

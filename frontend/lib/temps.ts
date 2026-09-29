import type {
  DureesStandardSection,
  FeuillesTemps,
  ManqueTache,
  MonTemps,
  SectionTache,
  StatutFeuilleTemps,
} from './types';
import { apiSociete } from './client-api';

// RH · Temps de travail (lot 4) — API NestJS :
//   GET …/rh/feuilles-temps?mois=AAAA-MM            feuilles du groupe (module « rh »)
//   POST …/rh/feuilles-temps/:dossierId/:mois/controle   contrôle RH d'un mois clos
//   GET …/mon-espace/temps?mois=AAAA-MM             le salarié connecté
//   GET/PUT …/durees-standard[/:section/:groupe]    référentiel (admin ou CIO)

// Miroir de backend/src/rh/regles-temps.ts (8 h par jour ouvré, lundi → vendredi).
export const HEURES_PAR_JOUR = 8;

const avecMois = (chemin: string, mois?: string) => (mois ? `${chemin}?mois=${mois}` : chemin);

export const getFeuillesTemps = (slug: string, mois?: string) =>
  apiSociete<FeuillesTemps>(slug, avecMois('/rh/feuilles-temps', mois));
export const controlerFeuilleTemps = (slug: string, dossierId: string, mois: string) =>
  apiSociete<{ dossierId: string; mois: string }>(slug, `/rh/feuilles-temps/${dossierId}/${mois}/controle`, {
    method: 'POST',
    body: {},
  });
export const getMonTemps = (slug: string, mois?: string) => apiSociete<MonTemps>(slug, avecMois('/mon-espace/temps', mois));
export const getDureesStandard = (slug: string) => apiSociete<DureesStandardSection[]>(slug, '/durees-standard');
export const definirDureeStandard = (slug: string, section: SectionTache, groupe: string, heures: number | null) =>
  apiSociete<DureesStandardSection[]>(slug, `/durees-standard/${section}/${groupe}`, { method: 'PUT', body: { heures } });

export const LIBELLE_SECTION: Record<SectionTache, string> = {
  avant_projet: 'Avant-projet',
  permis: 'Permis',
  execution: 'Exécution',
};

export const LIBELLE_MANQUE: Record<ManqueTache, string> = {
  duree: 'durée standard non définie',
  debut: 'début non renseigné',
  echeance: 'échéance non renseignée',
  fenetre: 'début postérieur à l’échéance',
  absence: 'fenêtre couverte par des absences',
};

export const STATUT_FEUILLE: Record<StatutFeuilleTemps, { libelle: string; pill: string }> = {
  en_cours: { libelle: 'Mois en cours', pill: 'pill--info' },
  a_controler: { libelle: 'À contrôler', pill: 'pill--attention' },
  sans_heures: { libelle: 'Sans heures', pill: 'pill--neutre' },
  controlee: { libelle: 'Contrôlée', pill: 'pill--succes' },
};

// « septembre 2026 »
export function libelleMois(mois: string): string {
  const [a, m] = mois.split('-').map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

export function formatHeures(n: number): string {
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h`;
}

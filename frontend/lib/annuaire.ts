import { apiSociete } from './client-api';

// Annuaire (22/11/2026) — API NestJS :
//   GET /societes/:slug/annuaire/collegues   les collègues du périmètre réglé
//   GET /societes/:slug/annuaire/perimetre   le périmètre (CIO, Administrateur HUB)
//   PUT /societes/:slug/annuaire/perimetre   { perimetre, motif } — tracé au journal

export type PerimetreAnnuaire = 'societe' | 'societe_direction' | 'groupe';

export const PERIMETRES: { cle: PerimetreAnnuaire; titre: string; description: string }[] = [
  {
    cle: 'societe',
    titre: 'La société seulement',
    description: 'Chacun voit les collègues de sa société (et la direction transverse).',
  },
  {
    cle: 'societe_direction',
    titre: 'La société et la direction du groupe',
    description: 'En plus : la direction des autres sociétés du groupe (CEO, CTO, CIO, CFO, COO, Dir. GC).',
  },
  {
    cle: 'groupe',
    titre: 'Tout le groupe',
    description: 'Les collègues de toutes les sociétés ouvertes du groupe, avec un filtre par société.',
  },
];

export type SocieteAnnuaire = { slug: string; nom: string };

export type CollegueAnnuaire = {
  utilisateurId: string;
  prenom: string;
  nom: string;
  nomAffiche: string | null;
  photoUrl: string | null;
  poste: string | null;
  cellule: string | null;
  chef: string | null;
  estChef: boolean;
  telephone: string | null;
  email: string;
  societe: SocieteAnnuaire;
  memeSociete: boolean; // on peut lui écrire, voir son agenda (avec le droit)
  absentJusquau: string | null; // AAAA-MM-JJ, sans motif
};

export type Annuaire = {
  perimetre: PerimetreAnnuaire;
  societes: SocieteAnnuaire[];
  membres: CollegueAnnuaire[];
  peutVoirAgendas: boolean;
};

export const getAnnuaire = (slug: string) => apiSociete<Annuaire>(slug, '/annuaire/collegues');
export const getPerimetreAnnuaire = (slug: string) =>
  apiSociete<{ perimetre: PerimetreAnnuaire }>(slug, '/annuaire/perimetre');
export const reglerPerimetreAnnuaire = (slug: string, perimetre: PerimetreAnnuaire, motif: string) =>
  apiSociete<{ perimetre: PerimetreAnnuaire }>(slug, '/annuaire/perimetre', {
    method: 'PUT',
    body: { perimetre, motif },
  });

// Liens d'appel et d'e-mail (audit 22/11/2026) : seulement pour une valeur
// qui a la forme attendue — un champ libre ne glisse jamais de copie cachée
// (« ?bcc=… ») ni rien d'autre dans le lien.
export const lienTelephone = (t: string | null | undefined) =>
  t && /^\+?[\d\s().-]{6,25}$/.test(t) ? `tel:${t.replace(/[^\d+]/g, '')}` : null;
export const lienEmail = (e: string | null | undefined) =>
  e && /^[^\s@?&#<>"'/\\]+@[^\s@?&#<>"'/\\]+\.[^\s@?&#<>"'/\\]+$/.test(e) ? `mailto:${e}` : null;

// Le nom choisi par la personne, sinon son nom officiel.
export const nomDe = (c: Pick<CollegueAnnuaire, 'prenom' | 'nom' | 'nomAffiche'>) =>
  c.nomAffiche?.trim() || `${c.prenom} ${c.nom}`.trim();

// Sans accents ni casse : « Léa » se trouve en tapant « lea ».
const plat = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export type FiltresAnnuaire = {
  q: string;
  cellule: string; // '' : toutes ; '—' : sans cellule
  societe: string; // '' : toutes (slug sinon)
  absents: boolean; // seulement les absents du jour
};
export const SANS_CELLULE = '—';

// Recherche (chaque mot, dans le nom, le poste, la cellule, la société,
// l'e-mail ou le téléphone) et filtres.
export function filtrer(membres: CollegueAnnuaire[], f: FiltresAnnuaire): CollegueAnnuaire[] {
  const mots = plat(f.q).split(/\s+/).filter(Boolean);
  return membres.filter((m) => {
    if (f.cellule && (m.cellule ?? SANS_CELLULE) !== f.cellule) return false;
    if (f.societe && m.societe.slug !== f.societe) return false;
    if (f.absents && !m.absentJusquau) return false;
    if (!mots.length) return true;
    const texte = plat(
      [nomDe(m), m.prenom, m.nom, m.poste, m.cellule, m.societe.nom, m.email, m.telephone?.replace(/\s+/g, '')]
        .filter(Boolean)
        .join(' '),
    );
    return mots.every((mot) => texte.includes(mot));
  });
}

// Regroupés par cellule (chef d'équipe en tête de sa cellule), « Sans
// cellule » en dernier.
export function parCellule(membres: CollegueAnnuaire[]): { cellule: string; membres: CollegueAnnuaire[] }[] {
  const groupes = new Map<string, CollegueAnnuaire[]>();
  for (const m of membres) {
    const c = m.cellule ?? SANS_CELLULE;
    groupes.set(c, [...(groupes.get(c) ?? []), m]);
  }
  return [...groupes.entries()]
    .sort(([a], [b]) => (a === SANS_CELLULE ? 1 : b === SANS_CELLULE ? -1 : a.localeCompare(b, 'fr')))
    .map(([cellule, l]) => ({ cellule, membres: [...l].sort((x, y) => Number(y.estChef) - Number(x.estChef)) }));
}

// Les autres membres de sa cellule (même société), pour la fiche.
export const membresDeSaCellule = (membres: CollegueAnnuaire[], c: CollegueAnnuaire) =>
  c.cellule
    ? membres.filter(
        (m) => m.cellule === c.cellule && m.societe.slug === c.societe.slug && m.utilisateurId !== c.utilisateurId,
      )
    : [];

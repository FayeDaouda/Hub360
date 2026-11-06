// Gabarit de projet versionné (Réglages CIO). Types, validation et
// application des modifications — fonctions pures, testées.
//
// Structure (maquette du boss) : étapes → cartes → tâches. Une fenêtre est
// exprimée en jours ouvrés depuis J1 (ouverture du projet), sur la carte et
// parfois sur la tâche. Le temps standard est porté par la tâche, ou par la
// carte quand il dépend d'une quantité (« 8 h par pièce ») ou d'un total.

export type Fenetre = { debut: number; fin: number };

export type Temps =
  | { type: 'heures'; heures: number } // « 40 h »
  | { type: 'par_unite'; heures: number; unite: 'pièce' | 'vue' } // « 8 h par pièce »
  | { type: 'total'; heures: number } // « 24 h au total »
  | { type: 'partage'; libelle: string; heures?: number } // « commandes ETB, ETL et BC : 8 h partagées »
  | { type: 'charge_gc'; charge: 'notice' | 'cachet' | 'timbre' } // durée dans Règles et délais
  | { type: 'part_carte' } // part égale du temps « au total » de la carte
  | { type: 'sans' }; // « sans temps atelier »

export type TacheGabarit = {
  cle: string;
  libelle: string;
  fenetre?: Fenetre;
  temps: Temps;
  descriptif?: string; // panneau de la tâche (maquette Projets)
  sourceNative?: boolean; // « source native exigée »
  // Visa DPLG (revue Dir. GC, 21/10/2026) : validée par le chef d’équipe, la
  // tâche n'est faite qu'une fois visée par l'architecte DPLG (Dir. GC).
  visaDplg?: boolean;
  // Fichier au dépôt : obligatoire par défaut (lot F, 23/10/2026) ; true =
  // dépôt possible sans fichier (visite, réunion, timbre…).
  fichierFacultatif?: boolean;
};

export type CarteGabarit = {
  cle: string;
  libelle: string;
  note?: string; // précision affichée sous le libellé
  fenetre?: Fenetre;
  temps?: Temps; // temps porté par la carte (par unité ou au total)
  client?: boolean; // étiquette CLIENT · hors budget atelier
  desactivee?: boolean; // carte vide, désactivée
  motifDesactivation?: string; // affiché « Désactivée · … » dans le projet
  fichiers?: boolean; // rubriques de fichiers (pas de tâche)
  descriptif?: string; // texte de la carte dans le projet (maquette Projets)
  etiquette?: string; // « Inclus au CO », « IM par pièce », « Par vue »
  // La carte reste verrouillée tant que ces tâches (« carte.tâche ») ne sont
  // pas validées : « S'ouvre quand ces tâches sont validées ».
  ouvreApres?: string[];
  taches: TacheGabarit[];
};

export type EtapeGabarit = { numero: number; cle: string; libelle: string; cartes: CarteGabarit[] };

export type ContenuGabarit = { etapes: EtapeGabarit[] };

// Une modification = un champ numérique d'une carte ou d'une tâche ; « visa »
// (tâche seulement) : 1 = visa DPLG exigé, 0 = non ; « fichier » (tâche
// seulement) : 1 = fichier obligatoire au dépôt, 0 = facultatif.
export type Changement = {
  carte: string; // clé de la carte
  tache?: string; // clé de la tâche (absente : la carte elle-même)
  champ: 'debut' | 'fin' | 'heures' | 'visa' | 'fichier';
  valeur: number;
};

export type ChangementApplique = Changement & { libelle: string; avant: number };

export const libelleVersion = (numero: number) => `bêta 1.${numero}`;

export class ErreurGabarit extends Error {}

const aDesHeures = (t?: Temps): t is Extract<Temps, { heures: number }> =>
  !!t && (t.type === 'heures' || t.type === 'par_unite' || t.type === 'total');

// Applique les modifications sur une copie ; lève ErreurGabarit si un champ
// n'existe pas ou si une valeur est invalide. Ne renvoie que les changements
// effectifs (valeur différente de l'actuelle).
export function appliquer(
  contenu: ContenuGabarit,
  changements: Changement[],
): { contenu: ContenuGabarit; appliques: ChangementApplique[] } {
  const copie: ContenuGabarit = structuredClone(contenu);
  const cartes = new Map(copie.etapes.flatMap((e) => e.cartes.map((c) => [c.cle, c] as const)));
  const appliques: ChangementApplique[] = [];

  for (const ch of changements) {
    const carte = cartes.get(ch.carte);
    if (!carte) throw new ErreurGabarit(`Carte inconnue : ${ch.carte}.`);
    const tache = ch.tache ? carte.taches.find((t) => t.cle === ch.tache) : undefined;
    if (ch.tache && !tache) throw new ErreurGabarit(`Tâche inconnue : ${ch.tache}.`);
    const cible = tache ?? carte;
    const libelle = tache ? `${carte.libelle} · ${tache.libelle}` : carte.libelle;

    if (ch.champ === 'visa') {
      if (!tache) throw new ErreurGabarit(`${libelle} : le visa DPLG se règle sur une tâche.`);
      if (ch.valeur !== 0 && ch.valeur !== 1) throw new ErreurGabarit(`${libelle} : visa DPLG oui (1) ou non (0).`);
      const avant = tache.visaDplg ? 1 : 0;
      if (avant !== ch.valeur) {
        appliques.push({ ...ch, libelle, avant });
        tache.visaDplg = ch.valeur === 1;
      }
      continue;
    }

    if (ch.champ === 'fichier') {
      if (!tache) throw new ErreurGabarit(`${libelle} : le fichier obligatoire se règle sur une tâche.`);
      if (ch.valeur !== 0 && ch.valeur !== 1)
        throw new ErreurGabarit(`${libelle} : fichier obligatoire oui (1) ou non (0).`);
      const avant = tache.fichierFacultatif ? 0 : 1;
      if (avant !== ch.valeur) {
        appliques.push({ ...ch, libelle, avant });
        tache.fichierFacultatif = ch.valeur === 0;
      }
      continue;
    }

    if (ch.champ === 'heures') {
      if (!aDesHeures(cible.temps)) throw new ErreurGabarit(`${libelle} : pas de temps standard modifiable.`);
      if (!(ch.valeur > 0 && ch.valeur <= 999) || Math.abs(Math.round(ch.valeur * 10) - ch.valeur * 10) > 1e-9) {
        throw new ErreurGabarit(`${libelle} : temps invalide (heures positives, une décimale au plus).`);
      }
      if (cible.temps.heures !== ch.valeur) {
        appliques.push({ ...ch, libelle, avant: cible.temps.heures });
        cible.temps.heures = ch.valeur;
      }
      continue;
    }

    if (!cible.fenetre) throw new ErreurGabarit(`${libelle} : pas de fenêtre modifiable.`);
    if (!Number.isInteger(ch.valeur) || ch.valeur < 1 || ch.valeur > 999) {
      throw new ErreurGabarit(`${libelle} : jour invalide (entier à partir de J1).`);
    }
    const avant = cible.fenetre[ch.champ];
    if (avant !== ch.valeur) {
      appliques.push({ ...ch, libelle, avant });
      cible.fenetre[ch.champ] = ch.valeur;
    }
  }

  // Fenêtres cohérentes après l'ensemble des modifications.
  for (const carte of cartes.values()) {
    for (const cible of [carte, ...carte.taches]) {
      if (cible.fenetre && cible.fenetre.debut > cible.fenetre.fin) {
        throw new ErreurGabarit(
          `${cible.libelle} : la fenêtre commence après sa fin (J${cible.fenetre.debut} → J${cible.fenetre.fin}).`,
        );
      }
    }
  }
  return { contenu: copie, appliques };
}

export function decrire(ch: ChangementApplique): string {
  if (ch.champ === 'visa')
    return `${ch.libelle} — visa DPLG : ${ch.avant ? 'oui' : 'non'} → ${ch.valeur ? 'oui' : 'non'}`;
  if (ch.champ === 'fichier')
    return `${ch.libelle} — fichier obligatoire : ${ch.avant ? 'oui' : 'non'} → ${ch.valeur ? 'oui' : 'non'}`;
  if (ch.champ === 'heures') return `${ch.libelle} — temps : ${ch.avant} h → ${ch.valeur} h`;
  return `${ch.libelle} — ${ch.champ === 'debut' ? 'début' : 'fin'} : J${ch.avant} → J${ch.valeur}`;
}

// --- Lignes ajoutées ou retirées (Réglages CIO, 01/11/2026) ------------------
// Une ligne = une tâche d'une carte. Ajoutée en fin de carte, avec sa fenêtre
// (facultative), son temps (heures, sans temps atelier, ou part du temps de la
// carte quand la carte porte un temps par unité ou au total), visa DPLG et
// fichier obligatoire. Retirée : jamais la dernière ligne d'une carte, ni une
// ligne qui conditionne l'ouverture d'une autre carte (« ouvreApres »). Les
// projets déjà ouverts gardent leur version.

export type AjoutLigne = {
  carte: string;
  libelle: string;
  debut?: number;
  fin?: number;
  heures?: number | null; // null ou absent : sans temps atelier
  visaDplg?: boolean;
  fichierObligatoire?: boolean;
  descriptif?: string;
};
export type RetraitLigne = { carte: string; tache: string };
export type LigneAppliquee = { cle: string; libelle: string; avant: string | null; apres: string | null };

const MAX_LIGNES_CARTE = 60;

const versCle = (libelle: string) =>
  libelle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'ligne';

const jourValide = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 999;

function resumeTache(t: TacheGabarit): string {
  const parts = [t.fenetre ? `J${t.fenetre.debut} → J${t.fenetre.fin}` : null];
  if (t.temps.type === 'heures') parts.push(`${t.temps.heures} h`);
  else if (t.temps.type === 'part_carte') parts.push('part du temps de la carte');
  else if (t.temps.type === 'sans') parts.push('sans temps atelier');
  if (t.visaDplg) parts.push('visa DPLG');
  if (t.fichierFacultatif) parts.push('fichier facultatif');
  return parts.filter(Boolean).join(', ');
}

export function appliquerLignes(
  contenu: ContenuGabarit,
  ajouts: AjoutLigne[],
  retraits: RetraitLigne[],
): { contenu: ContenuGabarit; appliques: LigneAppliquee[] } {
  const copie: ContenuGabarit = structuredClone(contenu);
  const cartes = new Map(copie.etapes.flatMap((e) => e.cartes.map((c) => [c.cle, c] as const)));
  const appliques: LigneAppliquee[] = [];

  for (const r of retraits) {
    const carte = cartes.get(r.carte);
    if (!carte) throw new ErreurGabarit(`Carte inconnue : ${r.carte}.`);
    const tache = carte.taches.find((t) => t.cle === r.tache);
    if (!tache) throw new ErreurGabarit(`Ligne inconnue dans ${carte.libelle} : ${r.tache}.`);
    const libelle = `${carte.libelle} · ${tache.libelle}`;
    const condition = [...cartes.values()].find((c) => c.ouvreApres?.includes(`${carte.cle}.${tache.cle}`));
    if (condition) {
      throw new ErreurGabarit(`${libelle} : elle conditionne l’ouverture de la carte « ${condition.libelle} ».`);
    }
    if (carte.taches.length === 1) throw new ErreurGabarit(`${libelle} : une carte garde au moins une ligne.`);
    carte.taches = carte.taches.filter((t) => t !== tache);
    appliques.push({
      cle: `${carte.cle}:${tache.cle}:retrait`,
      libelle: `${libelle} — ligne retirée`,
      avant: tache.libelle,
      apres: null,
    });
  }

  for (const a of ajouts) {
    const carte = cartes.get(a.carte);
    if (!carte) throw new ErreurGabarit(`Carte inconnue : ${a.carte}.`);
    if (carte.fichiers || carte.desactivee) {
      throw new ErreurGabarit(`${carte.libelle} : cette carte ne porte pas de lignes.`);
    }
    const libelle = a.libelle?.trim() ?? '';
    if (libelle.length < 2 || libelle.length > 160) {
      throw new ErreurGabarit(`${carte.libelle} : intitulé de ligne de 2 à 160 caractères.`);
    }
    if (carte.taches.some((t) => t.libelle.toLowerCase() === libelle.toLowerCase())) {
      throw new ErreurGabarit(`${carte.libelle} : la ligne « ${libelle} » existe déjà.`);
    }
    if (carte.taches.length >= MAX_LIGNES_CARTE) {
      throw new ErreurGabarit(`${carte.libelle} : ${MAX_LIGNES_CARTE} lignes au plus.`);
    }
    const aFenetre = a.debut !== undefined || a.fin !== undefined;
    if (aFenetre && !(jourValide(a.debut) && jourValide(a.fin) && a.debut <= a.fin)) {
      throw new ErreurGabarit(`${carte.libelle} · ${libelle} : fenêtre invalide (J début ≤ J fin, à partir de J1).`);
    }
    // Carte au temps par unité ou au total : la ligne en prend sa part.
    let temps: Temps;
    if (carte.temps && (carte.temps.type === 'par_unite' || carte.temps.type === 'total'))
      temps = { type: 'part_carte' };
    else if (a.heures === null || a.heures === undefined) temps = { type: 'sans' };
    else if (a.heures > 0 && a.heures <= 999 && Math.abs(Math.round(a.heures * 10) - a.heures * 10) < 1e-9) {
      temps = { type: 'heures', heures: a.heures };
    } else
      throw new ErreurGabarit(
        `${carte.libelle} · ${libelle} : temps invalide (heures positives, une décimale au plus).`,
      );

    const base = `l_${versCle(libelle)}`;
    let cle = base;
    for (let i = 2; carte.taches.some((t) => t.cle === cle); i++) cle = `${base}_${i}`;
    const tache: TacheGabarit = {
      cle,
      libelle,
      ...(aFenetre && { fenetre: { debut: a.debut!, fin: a.fin! } }),
      temps,
      ...(a.descriptif?.trim() && { descriptif: a.descriptif.trim().slice(0, 1000) }),
      ...(a.visaDplg && { visaDplg: true }),
      ...(a.fichierObligatoire === false && { fichierFacultatif: true }),
    };
    carte.taches.push(tache);
    const resume = resumeTache(tache);
    appliques.push({
      cle: `${carte.cle}:${cle}:ajout`,
      libelle: `${carte.libelle} · ${libelle} — ligne ajoutée${resume ? ` (${resume})` : ''}`,
      avant: null,
      apres: libelle,
    });
  }
  return { contenu: copie, appliques };
}

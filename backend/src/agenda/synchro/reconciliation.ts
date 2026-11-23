import { createHash } from 'crypto';
import type { ElementAgendaDto } from '../agenda.dto';
import { TITRE_ENTRETIEN } from '../liens';
import type { EcritureGoogle, EvenementGoogle } from './google.client';

// Réconciliation entre le HUB et l'agenda externe d'une personne
// (16/11/2026). Pur, testé : le service de synchronisation ne fait que lire,
// appeler ces fonctions, puis écrire.

// La clé d'une réunion du HUB chez Google : l'identifiant de l'élément de
// l'Agenda (« rendez-vous », ou « série:début d'origine » pour une occurrence).
export const CLE_HUB = 'hubCle';
// Une date d'une série qu'un invité a effacée de son agenda : on ne la
// réécrit plus (la réponse vaut pour toute la série, on ne la décline pas).
export const MASQUE = 'masque';

// Ce qui compte pour voir qu'un événement a changé, d'un côté ou de l'autre :
// titre, lieu, début, fin (pas la description, que le HUB complète d'un lien).
export function empreinte(e: { titre: string; lieu: string | null; debut: string; fin: string }): string {
  const normal = [
    e.titre.trim(),
    (e.lieu ?? '').trim(),
    new Date(e.debut).toISOString(),
    new Date(e.fin).toISOString(),
  ];
  return createHash('sha256').update(JSON.stringify(normal)).digest('hex').slice(0, 32);
}

export function empreinteGoogle(g: EvenementGoogle): string | null {
  const debut = g.start?.dateTime ?? (g.start?.date ? `${g.start.date}T00:00:00.000Z` : null);
  const fin = g.end?.dateTime ?? (g.end?.date ? `${g.end.date}T00:00:00.000Z` : null);
  if (!debut || !fin) return null;
  return empreinte({ titre: g.summary ?? '', lieu: g.location ?? null, debut, fin });
}

export type Voulu = {
  cle: string;
  element: ElementAgendaDto; // la réunion telle que le HUB la voit (organisateur, invités…)
  ecriture: EcritureGoogle;
  empreinte: string;
};

// Les réunions du HUB à écrire dans l'agenda externe de la personne : les
// rendez-vous de son agenda (les siens et ceux où elle est invitée), sauf
// ceux qu'elle a déclinés.
export function voulus(elements: ElementAgendaDto[], lienHub: string): Map<string, Voulu> {
  const m = new Map<string, Voulu>();
  for (const e of elements) {
    if (e.type !== 'rendez_vous' || !e.debut || !e.fin || e.maReponse === 'non') continue;
    const lieu = e.lieu ?? e.lienVisio;
    // Un entretien sort sans le nom du candidat (décision du 12/11/2026).
    const titre = e.entretien ? TITRE_ENTRETIEN : e.titre;
    const description = [
      e.lienVisio ? `Visio : ${e.lienVisio}` : null,
      e.entretien ? null : e.detail,
      `Dans le HUB : ${lienHub}`,
    ]
      .filter(Boolean)
      .join('\n');
    m.set(e.id, {
      cle: e.id,
      element: e,
      ecriture: {
        summary: titre,
        location: lieu,
        description,
        start: { dateTime: e.debut },
        end: { dateTime: e.fin },
        extendedProperties: { private: { [CLE_HUB]: e.id } },
      },
      empreinte: empreinte({ titre, lieu, debut: e.debut, fin: e.fin }),
    });
  }
  return m;
}

export type Lien = { cle: string; idExterne: string; empreinte: string };

export type Action =
  | { type: 'creer'; voulu: Voulu }
  | { type: 'adopter'; voulu: Voulu; google: EvenementGoogle } // déjà chez Google sans lien (tournée interrompue)
  | { type: 'recreer'; lien: Lien; voulu: Voulu } // supprimée chez Google sans droit de l'annuler : elle revient
  | { type: 'masquer'; lien: Lien } // une date d'une série effacée par un invité
  | { type: 'mettre_a_jour'; lien: Lien; voulu: Voulu } // le HUB a changé : Google suit
  | { type: 'reprendre'; lien: Lien; voulu: Voulu; google: EvenementGoogle } // l'organisateur a changé dans Google : le HUB suit
  | { type: 'retablir'; lien: Lien; voulu: Voulu } // un invité a changé dans Google : on remet la version du HUB
  | { type: 'supprimer_google'; lien: Lien } // plus dans le HUB (annulée, déclinée, retirée)
  | { type: 'annuler_hub'; lien: Lien; voulu: Voulu } // l'organisateur l'a supprimée dans Google
  | { type: 'decliner_hub'; lien: Lien; voulu: Voulu } // un invité l'a supprimée dans Google
  | { type: 'oublier'; lien: Lien }; // passée ou sortie de la période : on cesse de la suivre

// Que faire de chaque réunion ? `actuels` : les événements écrits par le HUB
// et encore présents chez Google, par clé. `maintenant` : seules les réunions
// à venir se reprennent, s'annulent ou se déclinent depuis Google (une
// réunion passée n'est jamais touchée).
export function decider(
  liens: Lien[],
  voulusHub: Map<string, Voulu>,
  actuels: Map<string, EvenementGoogle>,
  maintenant: Date,
): Action[] {
  const actions: Action[] = [];
  const vus = new Set<string>();
  for (const lien of liens) {
    vus.add(lien.cle);
    const v = voulusHub.get(lien.cle);
    const g = actuels.get(lien.cle);
    if (!v) {
      // Plus dans le HUB : retirée de Google si elle est à venir ; passée (elle
      // a seulement quitté la période suivie), on la laisse et on l'oublie.
      const debutGoogle = g?.start?.dateTime ?? g?.start?.date;
      const gAVenir = !!debutGoogle && Date.parse(debutGoogle) > +maintenant;
      const present = g && g.status !== 'cancelled' && lien.empreinte !== MASQUE;
      actions.push(present && gAVenir ? { type: 'supprimer_google', lien } : { type: 'oublier', lien });
      continue;
    }
    if (lien.empreinte === MASQUE) continue; // effacée par l'invité : on la laisse
    const aVenir = Date.parse(v.element.debut!) > +maintenant;
    if (!g || g.status === 'cancelled') {
      if (!aVenir) actions.push({ type: 'oublier', lien });
      else if (v.element.jeSuisOrganisateur) {
        // L'organisateur l'a supprimée : annulée s'il en a le droit, sinon
        // (entretien, droit de suppression absent) elle revient chez Google.
        actions.push(
          v.element.annulable ? { type: 'annuler_hub', lien, voulu: v } : { type: 'recreer', lien, voulu: v },
        );
      } else if (v.element.serieId) actions.push({ type: 'masquer', lien });
      else actions.push({ type: 'decliner_hub', lien, voulu: v });
      continue;
    }
    const cote = empreinteGoogle(g);
    const cotHub = v.empreinte !== lien.empreinte;
    if (cote && cote !== lien.empreinte) {
      // Changé dans Google : par l'organisateur (qui peut la modifier, sur une
      // réunion à venir, en horaire, et sans changement du HUB entre-temps)
      // → le HUB suit ; sinon la version du HUB revient.
      const journee = !g.start?.dateTime;
      if (aVenir && !journee && !cotHub && v.element.jeSuisOrganisateur && v.element.modifiable) {
        actions.push({ type: 'reprendre', lien, voulu: v, google: g });
      } else actions.push({ type: 'retablir', lien, voulu: v });
      continue;
    }
    if (cotHub) actions.push({ type: 'mettre_a_jour', lien, voulu: v });
  }
  for (const [cle, v] of voulusHub) {
    if (vus.has(cle)) continue;
    const orphelin = actuels.get(cle);
    actions.push(
      orphelin && orphelin.status !== 'cancelled'
        ? { type: 'adopter', voulu: v, google: orphelin }
        : { type: 'creer', voulu: v },
    );
  }
  return actions;
}

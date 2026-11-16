import { createHash } from 'crypto';
import type { ElementAgendaDto } from '../agenda.dto';
import type { EcritureGoogle, EvenementGoogle } from './google.client';

// Réconciliation entre le HUB et l'agenda externe d'une personne
// (16/11/2026). Pur, testé : le service de synchronisation ne fait que lire,
// appeler ces fonctions, puis écrire.

// La clé d'une réunion du HUB chez Google : l'identifiant de l'élément de
// l'Agenda (« rendez-vous », ou « série:début d'origine » pour une occurrence).
export const CLE_HUB = 'hubCle';

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
        summary: e.titre,
        location: lieu,
        description,
        start: { dateTime: e.debut },
        end: { dateTime: e.fin },
        extendedProperties: { private: { [CLE_HUB]: e.id } },
      },
      empreinte: empreinte({ titre: e.titre, lieu, debut: e.debut, fin: e.fin }),
    });
  }
  return m;
}

export type Lien = { cle: string; idExterne: string; empreinte: string };

export type Action =
  | { type: 'creer'; voulu: Voulu }
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
      actions.push(
        g && g.status !== 'cancelled' && gAVenir ? { type: 'supprimer_google', lien } : { type: 'oublier', lien },
      );
      continue;
    }
    const aVenir = Date.parse(v.element.debut!) > +maintenant;
    if (!g || g.status === 'cancelled') {
      if (!aVenir) actions.push({ type: 'oublier', lien });
      else actions.push({ type: v.element.jeSuisOrganisateur ? 'annuler_hub' : 'decliner_hub', lien, voulu: v });
      continue;
    }
    const cote = empreinteGoogle(g);
    if (cote && cote !== lien.empreinte) {
      // Changé dans Google : par l'organisateur (et qu'il peut modifier) → le
      // HUB suit ; sinon la version du HUB revient.
      if (aVenir && v.element.jeSuisOrganisateur && v.element.modifiable) {
        actions.push({ type: 'reprendre', lien, voulu: v, google: g });
      } else actions.push({ type: 'retablir', lien, voulu: v });
      continue;
    }
    if (v.empreinte !== lien.empreinte) actions.push({ type: 'mettre_a_jour', lien, voulu: v });
  }
  for (const [cle, v] of voulusHub) if (!vus.has(cle)) actions.push({ type: 'creer', voulu: v });
  return actions;
}

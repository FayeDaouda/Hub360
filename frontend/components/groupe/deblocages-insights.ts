import type { LigneAudit } from '@/lib/pilotage';
import { splitMotif } from '@/components/pilotage/journal-filters';

// Déblocages (refonte du 08/11/2026, lot 5) : les dernières interventions sur
// un dossier ou un projet, lues dans le journal d'audit — l'écran n'est pas
// vide avant une recherche, et un clic rouvre le code concerné.

// Libellés du journal (backend/src/audit/journal-audit.service.ts,
// ACTIONS_INTERVENTION) des interventions sur un code ; les bascules de
// modules et la maintenance sont ailleurs (section Modules).
const UNBLOCK_ACTIONS: Record<string, UnblockKind> = {
  'Onboard sans signature du client': 'onboard',
  'Projet ouvert sans F1': 'ouverture',
  'Cellules du projet modifiées': 'cellules',
  'Dossier perdu rouvert': 'reouverture',
  'Dossier / projet supprimé définitivement': 'suppression',
};

export type UnblockKind = 'onboard' | 'ouverture' | 'cellules' | 'reouverture' | 'suppression';

export type RecentUnblock = {
  id: string;
  kind: UnblockKind;
  action: string;
  code: string;
  motif: string | null;
  le: string;
  par: string | null;
};

/**
 * Les `limit` dernières interventions de déblocage (lignes du plus récent au
 * plus ancien). Le détail commence par le code visé (« GB_TBD.26 · … »).
 */
export function recentUnblocks(lines: LigneAudit[], limit = 5): RecentUnblock[] {
  const recent: RecentUnblock[] = [];
  for (const l of lines) {
    if (recent.length >= limit) break;
    const kind =
      l.categorie === 'administration' && Object.hasOwn(UNBLOCK_ACTIONS, l.action)
        ? UNBLOCK_ACTIONS[l.action]
        : undefined;
    if (!kind) continue;
    const { detail, motif } = splitMotif(l.detail);
    const code = detail.split(' · ')[0]?.trim();
    if (!code) continue;
    recent.push({ id: l.id, kind, action: l.action, code, motif, le: l.le, par: l.par });
  }
  return recent;
}

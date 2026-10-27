import { stripAccents } from '@hub/domain';
import { versionLabel } from './project-query';
// Nom d'un fichier déposé sur une tâche (lot F de Mes tâches, format validé
// le 23/10/2026) : CODE_ÉTAPE_TÂCHE_vNN.ext — ex. FS_POI.26_04_TIMBRE-FISCAL_v01.pdf.
// Plusieurs fichiers dans le même dépôt : _v01-1, _v01-2… L'application
// renomme : la personne n'a pas à retenir la règle.
//
// Le front n'en garde pas de copie : il reçoit la base du prochain dépôt
// (submissionBaseName, champ `nomDepot` des tâches) et n'y ajoute, pour
// l'aperçu, que le rang et l'extension des fichiers choisis.

const TASK_SEGMENT_LENGTH = 40;

// « Plans · Coupes · Façades » → « PLANS-COUPES-FACADES »
export function taskSegment(label: string): string {
  const s = stripAccents(label)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.slice(0, TASK_SEGMENT_LENGTH).replace(/-+$/, '') || 'TACHE';
}

function extensionOf(fileName: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(fileName.trim());
  return m ? `.${m[1].toLowerCase()}` : '';
}

type Naming = { code: string; etapeNumero: number; task: string; version: number };

// Base du nom, sans rang ni extension : FS_POI.26_04_TIMBRE-FISCAL_v01.
export function submissionBaseName(p: Naming): string {
  const step = String(p.etapeNumero).padStart(2, '0');
  return `${p.code}_${step}_${taskSegment(p.task)}_${versionLabel(p.version)}`;
}

export function submissionFileName(
  p: Naming & {
    originalName: string;
    rank: number; // 0 pour le premier fichier du dépôt
    total: number; // nombre de fichiers du dépôt
  },
): string {
  const suffix = p.total > 1 ? `-${p.rank + 1}` : '';
  return `${submissionBaseName(p)}${suffix}${extensionOf(p.originalName)}`;
}

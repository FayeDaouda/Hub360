import { stripAccents } from '@hub/domain';
// Nom d'un fichier déposé sur une tâche (lot F de Mes tâches, format validé
// le 23/10/2026) : CODE_ÉTAPE_TÂCHE_vNN.ext — ex. FS_POI.26_04_TIMBRE-FISCAL_v01.pdf.
// Plusieurs fichiers dans le même dépôt : _v01-1, _v01-2… L'application
// renomme : la personne n'a pas à retenir la règle.
//
// MIROIR de backend/src/projects/submission-file-name.ts (submissionFileName :
// le serveur renomme ; ici, l’aperçu avant le dépôt) — même règle, jusqu’à ce
// que le back envoie le nom (passe front de S3).

const LONGUEUR_TACHE = 40;

// « Plans · Coupes · Façades » → « PLANS-COUPES-FACADES »
export function segmentTache(libelle: string): string {
  const s = stripAccents(libelle)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.slice(0, LONGUEUR_TACHE).replace(/-+$/, '') || 'TACHE';
}

function extension(nom: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(nom.trim());
  return m ? `.${m[1].toLowerCase()}` : '';
}

export function nomFichierDepot(p: {
  code: string;
  etapeNumero: number;
  tache: string;
  version: number;
  nomOrigine: string;
  rang: number; // 0 pour le premier fichier du dépôt
  total: number; // nombre de fichiers du dépôt
}): string {
  const etape = String(p.etapeNumero).padStart(2, '0');
  const v = `v${String(p.version).padStart(2, '0')}`;
  const suffixe = p.total > 1 ? `-${p.rang + 1}` : '';
  return `${p.code}_${etape}_${segmentTache(p.tache)}_${v}${suffixe}${extension(p.nomOrigine)}`;
}

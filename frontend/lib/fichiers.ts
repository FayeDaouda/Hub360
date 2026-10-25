// Lecture d'un fichier local avant envoi (pièces RH, contrats, factures de
// bureau d'études…). Fichiers en data URI tant que le stockage objet n'est
// pas branché (phase 2).

// Lit un fichier local en data URI (aucun redimensionnement — PDF, DWG…).
// Rejette au-delà de ~15 Mo réels (le data URI base64 gonfle d'environ 1/3, et
// le plafond de corps de requête serveur est à 30 Mo).
const MAX_OCTETS = 15 * 1024 * 1024;

// Types acceptés par usage (décision du 25/10/2026), pour l'attribut `accept`
// des champs de fichier. Le serveur fait foi : il reconnaît le type au contenu
// du fichier (backend/src/commun/fichier-joint.ts, TYPES_PAR_USAGE).
export const FICHIERS_ACCEPTES = {
  rh: '.pdf,.jpg,.jpeg,.png,.heic',
  projet: '.pdf,.jpg,.jpeg,.png,.heic,.webp,.dwg,.dxf,.docx,.xlsx,.pptx',
} as const;

export function lireFichier(
  file: File,
): Promise<{ nom: string; url: string; taille: number }> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_OCTETS) {
      reject(new Error(`« ${file.name} » dépasse 15 Mo.`));
      return;
    }
    const lecteur = new FileReader();
    lecteur.onerror = () => reject(new Error(`Lecture de « ${file.name} » impossible.`));
    lecteur.onload = () =>
      resolve({ nom: file.name, url: lecteur.result as string, taille: file.size });
    lecteur.readAsDataURL(file);
  });
}

// Télécharge un fichier reçu de l'API. Seules les data URI base64 sont
// suivies : un lien d'un autre schéma (`javascript:…`) exécuterait du code
// dans la session courante (audit du 24/10/2026, C1). Même règle que
// backend/src/commun/fichier-joint.ts.
export function telechargerFichier(f: { nom: string; url: string }): void {
  if (!/^data:[^,]*;base64,/.test(f.url)) throw new Error('Fichier invalide.');
  const a = document.createElement('a');
  a.href = f.url;
  a.download = f.nom;
  a.click();
}

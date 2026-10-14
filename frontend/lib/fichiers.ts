// Lecture d'un fichier local avant envoi (pièces RH, contrats, factures de
// bureau d'études…). Fichiers en data URI tant que le stockage objet n'est
// pas branché (phase 2).

// Lit un fichier local en data URI (aucun redimensionnement — PDF, DWG…).
// Rejette au-delà de ~15 Mo réels (le data URI base64 gonfle d'environ 1/3, et
// le plafond de corps de requête serveur est à 30 Mo).
const MAX_OCTETS = 15 * 1024 * 1024;

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

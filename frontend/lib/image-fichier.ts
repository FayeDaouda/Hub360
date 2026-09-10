// Lit un fichier image et le redimensionne (côté navigateur) à une taille
// « web » avant de le garder en data URI. En mock, ça évite que quelques
// photos haute résolution fassent gonfler la mémoire ; côté vrai stockage,
// la même logique produira la version affichable à l'upload.

const MAX_DIM = 1600;
const QUALITE = 0.82;

export function estImage(file: File): boolean {
  return file.type.startsWith('image/');
}

export function lireImageRedimensionnee(
  file: File,
): Promise<{ nom: string; url: string }> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onerror = () => reject(new Error('Lecture impossible'));
    lecteur.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image illisible'));
      img.onload = () => {
        const ratio = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas indisponible'));
        ctx.drawImage(img, 0, 0, w, h);
        // Les images sans alpha -> JPEG (léger) ; sinon on garde le PNG source.
        const sortie =
          file.type === 'image/png'
            ? canvas.toDataURL('image/png')
            : canvas.toDataURL('image/jpeg', QUALITE);
        resolve({ nom: file.name, url: sortie });
      };
      img.src = lecteur.result as string;
    };
    lecteur.readAsDataURL(file);
  });
}

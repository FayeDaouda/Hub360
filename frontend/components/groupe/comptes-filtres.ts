import { libelleRole } from '@/lib/groupe';
import type { CompteGroupe } from '@/lib/types';

// Filtres de « Comptes & rôles » (lot 1 de la refonte, 07/11/2026) : tout se
// fait sur la liste déjà chargée, rien n'est redemandé au serveur.

export type FiltreStatut = 'tous' | 'actif' | 'en_attente' | 'verrouille' | 'desactive';

export type CriteresComptes = { statut: FiltreStatut; role: string; recherche: string };

export const CRITERES_PAR_DEFAUT: CriteresComptes = { statut: 'tous', role: '', recherche: '' };

/** Verrouillé après trop d'essais de connexion, et pas encore libéré. */
export function estVerrouille(
  compte: CompteGroupe,
  maintenant: Date = new Date(),
): compte is CompteGroupe & { verrouilleJusquau: string } {
  return !!compte.verrouilleJusquau && new Date(compte.verrouilleJusquau) > maintenant;
}

function correspondStatut(compte: CompteGroupe, statut: FiltreStatut, maintenant: Date): boolean {
  if (statut === 'tous') return true;
  if (statut === 'verrouille') return estVerrouille(compte, maintenant);
  return compte.statut === statut;
}

/** Nombre de comptes par filtre de statut (tuiles d'en-tête). */
export function compterComptes(comptes: CompteGroupe[], maintenant: Date = new Date()): Record<FiltreStatut, number> {
  const filtres: FiltreStatut[] = ['tous', 'actif', 'en_attente', 'verrouille', 'desactive'];
  return Object.fromEntries(
    filtres.map((f) => [f, comptes.filter((c) => correspondStatut(c, f, maintenant)).length]),
  ) as Record<FiltreStatut, number>;
}

/** Comptes qui répondent aux trois critères (statut, rôle, texte libre). */
export function filtrerComptes(
  comptes: CompteGroupe[],
  { statut, role, recherche }: CriteresComptes,
  maintenant: Date = new Date(),
): CompteGroupe[] {
  const terme = recherche.trim().toLowerCase();
  return comptes.filter(
    (c) =>
      correspondStatut(c, statut, maintenant) &&
      (!role || c.role.nom === role) &&
      (!terme || `${c.prenom} ${c.nom} ${c.email} ${libelleRole(c.role.nom)}`.toLowerCase().includes(terme)),
  );
}

/** Un critère au moins s'écarte du réglage par défaut. */
export const filtresActifs = (c: CriteresComptes): boolean =>
  c.statut !== 'tous' || c.role !== '' || c.recherche.trim() !== '';

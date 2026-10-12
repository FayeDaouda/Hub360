import { premiereSectionAccessible } from './acces-back-office';
import { Session } from './types';

// Où envoyer un utilisateur une fois connecté, selon son rôle — un seul
// endroit à modifier si un rôle change de destination ou qu'un nouveau
// rôle apparaît.
export function destinationForSession(session: Session): string {
  switch (session.role) {
    case 'holding_admin': // compte technique : administration du HUB
      return '/groupe';
    case 'societe_admin':
      return `/admin/${session.societe.slug}`;
    case 'collaborateur':
      return `/collab/${session.societe.slug}`;
    default: {
      // Rôle de la matrice (Dir. GC, COO, CFO, CEO, CIO…) : première section
      // du back-office qu'il peut lire — Pilotage dès qu'il y a accès (le CIO
      // aussi, depuis le 12/10/2026 ; son administration du HUB reste dans le
      // menu) ; aucune → écran générique.
      const section = premiereSectionAccessible(session);
      if (section === null) return `/espace/${session.societe.slug}`;
      return section
        ? `/admin/${session.societe.slug}/${section}`
        : `/admin/${session.societe.slug}`;
    }
  }
}

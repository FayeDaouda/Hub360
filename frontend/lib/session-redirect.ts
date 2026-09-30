import { premiereSectionAccessible, ROLE_CIO } from './acces-back-office';
import { Session } from './types';

// Où envoyer un utilisateur une fois connecté, selon son rôle — un seul
// endroit à modifier si un rôle change de destination ou qu'un nouveau
// rôle apparaît.
export function destinationForSession(session: Session): string {
  switch (session.role) {
    case 'holding_admin': // compte technique : administration du HUB
      return '/groupe';
    // Le CIO arrive sur le registre du CRM (maquette du boss) ; son
    // administration du HUB reste dans le menu du back-office.
    case ROLE_CIO:
      return `/admin/${session.societe.slug}/crm`;
    case 'societe_admin':
      return `/admin/${session.societe.slug}`;
    case 'collaborateur':
      return `/collab/${session.societe.slug}`;
    default: {
      // Rôle de la matrice (Dir. GC, COO, CFO…) : première section du
      // back-office qu'il peut lire ; aucune → écran générique.
      const section = premiereSectionAccessible(session);
      if (section === null) return `/espace/${session.societe.slug}`;
      return section
        ? `/admin/${session.societe.slug}/${section}`
        : `/admin/${session.societe.slug}`;
    }
  }
}

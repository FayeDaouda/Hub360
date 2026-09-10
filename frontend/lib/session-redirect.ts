import { Session } from './types';

// Où envoyer un utilisateur une fois connecté, selon son rôle — un seul
// endroit à modifier si un rôle change de destination ou qu'un nouveau
// rôle apparaît.
export function destinationForSession(session: Session): string {
  switch (session.role) {
    case 'holding_admin':
      return '/groupe';
    case 'societe_admin':
      return `/admin/${session.societe.slug}`;
    case 'collaborateur':
      return `/collab/${session.societe.slug}`;
    default:
      return `/espace/${session.societe.slug}`;
  }
}

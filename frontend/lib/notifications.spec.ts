import { describe, expect, it } from 'vitest';
import { cibleNotification, lienNotificationAdmin } from './notifications';
import type { NotificationItem } from './types';

const n = (type: NotificationItem['type'], extra: Partial<NotificationItem> = {}) => ({
  type,
  projetId: null,
  dossierCrmId: null,
  factureId: null,
  canalId: null,
  ...extra,
});

// Chaque notification mène quelque part (01/11/2026) : sa page, ou la conversation.
describe('cible d’une notification', () => {
  it('Agenda, Annonces, Recrutement, RH : leur page', () => {
    expect(lienNotificationAdmin('gc', n('rdv_invitation'), null)).toBe('/admin/gc/agenda');
    expect(lienNotificationAdmin('gc', n('entretien_planifie'), null)).toBe('/admin/gc/agenda');
    expect(lienNotificationAdmin('gc', n('annonce_importante'), null)).toBe('/admin/gc/annonces');
    expect(lienNotificationAdmin('gc', n('candidature_recue'), null)).toBe('/admin/gc/recrutement');
    expect(lienNotificationAdmin('gc', n('embauche_decidee'), null)).toBe('/admin/gc/rh?onglet=personnel');
  });

  it('sans écran propre : l’accueil, jamais un clic mort', () => {
    expect(lienNotificationAdmin('gc', n('own_rights_changed'), null)).toBe('/admin/gc');
  });

  it('mention ou groupe : la conversation s’ouvre', () => {
    expect(cibleNotification('gc', n('mention_chat', { canalId: 'C1' }), null)).toEqual({ conversation: 'C1' });
    expect(cibleNotification('gc', n('ts_decide', { projetId: 'P1' }), null)).toEqual({
      href: '/admin/gc/projets?projet=P1',
    });
  });
});

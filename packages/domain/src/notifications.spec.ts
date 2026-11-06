import { describe, expect, it } from 'vitest';
import { categorieNotification, enHeuresCalmes, normaliserPreferences, PREFERENCES_PAR_DEFAUT } from './notifications';

describe('catégorie d’une notification', () => {
  it('mention, messagerie, décision, information', () => {
    expect(categorieNotification('mention_chat')).toBe('mentions');
    expect(categorieNotification('groupe_chat')).toBe('messagerie');
    expect(categorieNotification('absence_a_decider')).toBe('decisions');
    expect(categorieNotification('fiche_a_completer', true)).toBe('decisions');
    expect(categorieNotification('facture_payee')).toBe('informations');
  });
});

describe('préférences', () => {
  it('complète les valeurs absentes ou invalides', () => {
    const p = normaliserPreferences({
      categories: { mentions: { son: false } },
      calme: { actif: true, debut: '25:00', fin: '06:30' },
    });
    expect(p.categories.mentions).toEqual({ popup: true, son: false, systeme: true });
    expect(p.categories.decisions).toEqual(PREFERENCES_PAR_DEFAUT.categories.decisions);
    expect(p.calme).toEqual({ actif: true, debut: '20:00', fin: '06:30' });
  });

  it('heures calmes, y compris à cheval sur minuit (heure de Dakar)', () => {
    const p = normaliserPreferences({ calme: { actif: true, debut: '20:00', fin: '07:00' } });
    expect(enHeuresCalmes(p, new Date('2026-11-02T21:30:00Z'))).toBe(true);
    expect(enHeuresCalmes(p, new Date('2026-11-02T06:59:00Z'))).toBe(true);
    expect(enHeuresCalmes(p, new Date('2026-11-02T07:00:00Z'))).toBe(false);
    expect(enHeuresCalmes(normaliserPreferences(null), new Date('2026-11-02T22:00:00Z'))).toBe(false);
  });
});

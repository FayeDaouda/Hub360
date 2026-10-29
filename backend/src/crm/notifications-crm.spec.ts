import {
  CIBLES_EVENEMENT,
  planNotificationsCrm,
  relanceFicheIncomplete,
  titreNotificationCrm,
} from './notifications-crm';

// Le tableau validé (2026-09-27) verrouillé tel quel, puis les deux règles de
// fan-out : une notification par personne, jamais l'auteur de l'action.

const CTX = { code: 'TCP_ALM.26', programme: 'Villa Almadies' };
const aucun = { daf: [], proprietaire: [], apporteur: [], createur: [] };

describe('CIBLES_EVENEMENT — tableau validé', () => {
  it('qui est prévenu à chaque étape', () => {
    expect(CIBLES_EVENEMENT).toEqual({
      dossier_soumis: ['daf'],
      dossier_renvoye: ['proprietaire'],
      offre_envoyee: ['proprietaire'],
      offre_acceptee: ['proprietaire', 'daf', 'apporteur', 'createur'],
      offre_refusee: ['proprietaire', 'apporteur', 'createur'],
      contrat_signe: ['proprietaire', 'daf', 'createur'],
      dossier_perdu: ['proprietaire', 'createur', 'apporteur'],
      offre_expiree: ['proprietaire', 'createur', 'apporteur'],
    });
  });

  // Revue COO (22/10/2026) : le créateur du lead suit l'issue de son dossier.
  it('créateur du lead (COO) : informé de l’issue, jamais de la soumission DAF', () => {
    const comptes = { daf: ['CFO'], proprietaire: ['DG'], apporteur: [], createur: ['COO'] };
    expect(planNotificationsCrm('dossier_soumis', CTX, comptes, 'DG').map((p) => p.destinataireId)).toEqual(['CFO']);
    expect(planNotificationsCrm('contrat_signe', CTX, comptes, null).map((p) => p.destinataireId)).toEqual([
      'DG',
      'CFO',
      'COO',
    ]);
    const [perdu] = planNotificationsCrm(
      'dossier_perdu',
      { ...CTX, commentaire: 'Client parti chez un concurrent' },
      comptes,
      'DG',
    );
    expect(perdu).toEqual({
      destinataireId: 'COO',
      titre: 'TCP_ALM.26 · Villa Almadies — dossier déclaré perdu : « Client parti chez un concurrent »',
    });
  });
});

describe('planNotificationsCrm', () => {
  it('soumission : la DAF seule, même si propriétaire et apporteur sont connus', () => {
    const plan = planNotificationsCrm(
      'dossier_soumis',
      CTX,
      { daf: ['CFO'], proprietaire: ['DG'], apporteur: ['AP'], createur: [] },
      'COO',
    );
    expect(plan).toEqual([{ destinataireId: 'CFO', titre: 'TCP_ALM.26 · Villa Almadies — offre à valider' }]);
  });

  it('l’auteur de l’action n’est jamais notifié', () => {
    const plan = planNotificationsCrm(
      'offre_acceptee',
      CTX,
      { ...aucun, proprietaire: ['DG'], apporteur: ['AP'] },
      'DG', // réponse saisie à la main par le Dir. GC lui-même
    );
    expect(plan.map((p) => p.destinataireId)).toEqual(['AP']);
  });

  it('propriétaire ET apporteur : une seule notification, le titre « action requise »', () => {
    const plan = planNotificationsCrm(
      'offre_acceptee',
      CTX,
      { ...aucun, proprietaire: ['DG'], apporteur: ['DG'] },
      null,
    );
    expect(plan).toEqual([
      {
        destinataireId: 'DG',
        titre: 'TCP_ALM.26 · Villa Almadies — offre acceptée par le client, projet lancé (contrat à régulariser)',
      },
    ]);
  });

  it('apporteur seul (simple information) : pas de « contrat à régulariser »', () => {
    const [ap] = planNotificationsCrm('offre_acceptee', CTX, { ...aucun, apporteur: ['AP'] }, null);
    expect(ap.titre).toBe('TCP_ALM.26 · Villa Almadies — offre acceptée par le client, projet lancé');
  });

  it('personne à prévenir (apporteur externe, aucun titulaire) → plan vide', () => {
    expect(planNotificationsCrm('offre_refusee', CTX, aucun, null)).toEqual([]);
  });
});

describe('titreNotificationCrm', () => {
  it('renvoi DAF : le commentaire est repris, compacté et tronqué', () => {
    expect(
      titreNotificationCrm('dossier_renvoye', 'proprietaire', { ...CTX, commentaire: ' Prix  DPC\nà fixer ' }),
    ).toBe('TCP_ALM.26 · Villa Almadies — renvoyé par la DAF : « Prix DPC à fixer »');
    const long = titreNotificationCrm('dossier_renvoye', 'proprietaire', { ...CTX, commentaire: 'x'.repeat(500) });
    expect(long).toContain('…');
    expect(long.length).toBeLessThan(220);
  });

  it('offre acceptée (Onboard) : la DAF voit les factures brouillon, le propriétaire le projet lancé', () => {
    const ctx = { ...CTX, facturesPreparees: 6 };
    expect(titreNotificationCrm('offre_acceptee', 'daf', ctx)).toBe(
      'TCP_ALM.26 · Villa Almadies — offre acceptée, 6 factures brouillon à émettre',
    );
    expect(titreNotificationCrm('offre_acceptee', 'proprietaire', ctx)).toBe(
      'TCP_ALM.26 · Villa Almadies — offre acceptée par le client, projet lancé (contrat à régulariser)',
    );
    expect(titreNotificationCrm('offre_acceptee', 'daf', { ...CTX, facturesPreparees: 1 })).toContain(
      '1 facture brouillon à émettre',
    );
    expect(titreNotificationCrm('offre_acceptee', 'daf', { ...CTX, facturesPreparees: 0 })).toContain('projet lancé');
  });

  it('contrat signé : simple régularisation', () => {
    expect(titreNotificationCrm('contrat_signe', 'daf', CTX)).toBe(
      'TCP_ALM.26 · Villa Almadies — contrat signé, dossier régularisé',
    );
  });
});

// Relance « sous 72 h » de la maquette « Nouveau projet » : dérivée, jamais
// stockée — s'éteint quand la fiche est complète.
describe('relanceFicheIncomplete', () => {
  const CREE = new Date('2026-10-01T10:00:00Z');
  const LEAD = {
    code: 'FIL_ALM.26',
    categorie: null,
    localiteId: 'L1',
    type: null,
    surfaceTerrain: 0,
    nbPlanches: 0,
    clientId: 'C1',
    standing: null,
    gamme: null,
    programme: '',
    createdAt: CREE,
  };
  const apres = (heures: number) => new Date(CREE.getTime() + heures * 3600 * 1000);

  it('avant 72 h → pas de relance', () => {
    expect(relanceFicheIncomplete(LEAD, apres(71.9))).toBeNull();
  });

  it('72 h passées, fiche incomplète → relance datée de l’échéance', () => {
    expect(relanceFicheIncomplete(LEAD, apres(80))).toEqual({
      titre: 'FIL_ALM.26 — fiche 3/10 depuis plus de 72 h : à compléter avant l’offre',
      date: apres(72),
    });
  });

  it('fiche complète → plus de relance', () => {
    const complete = {
      ...LEAD,
      categorie: 'conception',
      type: 'villa',
      surfaceTerrain: 300,
      nbPlanches: 2,
      standing: 'moyen',
      gamme: 'milieu',
      programme: 'Villa Filaos',
    };
    expect(relanceFicheIncomplete(complete, apres(200))).toBeNull();
  });
});

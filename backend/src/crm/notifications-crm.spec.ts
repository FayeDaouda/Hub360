import {
  CIBLES_EVENEMENT,
  ciblesEvenement,
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
      dossier_cree: ['proprietaire'],
      dossier_modifie: ['proprietaire', 'createur', 'daf'],
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

// Création d'un lead (09/11/2026) : le directeur qui portera le dossier est
// prévenu tout de suite — activé pour le Dir. GC (propriétaire).
describe('dossier créé', () => {
  const comptes = { daf: ['CFO'], proprietaire: ['DG'], apporteur: ['APP'], createur: ['COO'] };

  it('le Dir. GC (propriétaire) seul : ni DAF, ni apporteur, ni créateur', () => {
    expect(planNotificationsCrm('dossier_cree', { ...CTX, programme: '', auteur: 'Awa Diop' }, comptes, 'COO')).toEqual(
      [{ destinataireId: 'DG', titre: 'TCP_ALM.26 — nouveau projet créé par Awa Diop, à prendre en charge' }],
    );
  });

  it('« à assigner » : tous les titulaires Dir. GC', () => {
    const plan = planNotificationsCrm('dossier_cree', CTX, { ...aucun, proprietaire: ['DG1', 'DG2'] }, 'COO');
    expect(plan.map((p) => p.destinataireId)).toEqual(['DG1', 'DG2']);
  });

  it('créé par le Dir. GC lui-même → personne à prévenir', () => {
    expect(planNotificationsCrm('dossier_cree', CTX, comptes, 'DG')).toEqual([]);
  });

  it('auteur inconnu (compte supprimé) → titre sans nom', () => {
    expect(titreNotificationCrm('dossier_cree', 'proprietaire', { ...CTX, auteur: null })).toBe(
      'TCP_ALM.26 — nouveau projet créé, à prendre en charge',
    );
  });
});

// Fiche figée modifiée (09/11/2026) : propriétaire et créateur ; la DAF
// seulement tant que l'offre est chez elle (en validation).
describe('dossier modifié', () => {
  const comptes = { daf: ['CFO'], proprietaire: ['DG'], apporteur: ['APP'], createur: ['COO'] };

  it('en validation : propriétaire, créateur et DAF', () => {
    expect(ciblesEvenement('dossier_modifie', 'en_validation')).toEqual(['proprietaire', 'createur', 'daf']);
  });

  it.each(['offre_envoyee', 'onboard', 'perdu', 'nouveau_projet'] as const)(
    'statut %s : la DAF n’est pas prévenue',
    (statut) => {
      expect(ciblesEvenement('dossier_modifie', statut)).toEqual(['proprietaire', 'createur']);
    },
  );

  it('statut inconnu (non transmis) : la DAF n’est pas prévenue', () => {
    expect(ciblesEvenement('dossier_modifie')).toEqual(['proprietaire', 'createur']);
  });

  it('autres événements : le tableau tel quel, quel que soit le statut', () => {
    expect(ciblesEvenement('dossier_soumis', 'offre_envoyee')).toEqual(['daf']);
    expect(ciblesEvenement('contrat_signe')).toEqual(['proprietaire', 'daf', 'createur']);
  });

  it('plan en validation : DG, COO et CFO, jamais l’apporteur, titre au nom de l’auteur', () => {
    const plan = planNotificationsCrm(
      'dossier_modifie',
      { ...CTX, auteur: 'Awa Diop', statut: 'en_validation' },
      comptes,
      'U9',
    );
    const titre =
      'TCP_ALM.26 · Villa Almadies — fiche modifiée par Awa Diop après soumission (détail dans l’historique)';
    expect(plan).toEqual([
      { destinataireId: 'DG', titre },
      { destinataireId: 'COO', titre },
      { destinataireId: 'CFO', titre },
    ]);
  });

  it('plan après l’envoi de l’offre : sans la DAF', () => {
    const plan = planNotificationsCrm('dossier_modifie', { ...CTX, statut: 'offre_envoyee' }, comptes, null);
    expect(plan.map((p) => p.destinataireId)).toEqual(['DG', 'COO']);
  });

  it('modifié par le propriétaire lui-même : il n’est pas prévenu', () => {
    const plan = planNotificationsCrm('dossier_modifie', { ...CTX, statut: 'en_validation' }, comptes, 'DG');
    expect(plan.map((p) => p.destinataireId)).toEqual(['COO', 'CFO']);
  });

  it('propriétaire aussi créateur : une seule notification', () => {
    const plan = planNotificationsCrm(
      'dossier_modifie',
      { ...CTX, statut: 'onboard' },
      { ...comptes, createur: ['DG'] },
      'U9',
    );
    expect(plan.map((p) => p.destinataireId)).toEqual(['DG']);
  });

  it('auteur inconnu (compte supprimé) → titre sans nom', () => {
    expect(titreNotificationCrm('dossier_modifie', 'proprietaire', { ...CTX, auteur: null })).toBe(
      'TCP_ALM.26 · Villa Almadies — fiche modifiée après soumission (détail dans l’historique)',
    );
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
        titre: 'TCP_ALM.26 · Villa Almadies — offre acceptée, projet lancé : équipe à affecter, contrat à régulariser',
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
      'TCP_ALM.26 · Villa Almadies — offre acceptée, projet lancé : équipe à affecter, contrat à régulariser',
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
      titre: 'FIL_ALM.26 — fiche 3/9 depuis plus de 72 h : à compléter avant l’offre',
      date: apres(72),
    });
  });

  it('fiche complète → plus de relance', () => {
    const complete = {
      ...LEAD,
      categorie: 'conception',
      surfaceTerrain: 300,
      nbPlanches: 2,
      standing: 'moyen',
      gamme: 'milieu',
      programme: 'Villa Filaos',
    };
    expect(relanceFicheIncomplete(complete, apres(200))).toBeNull();
  });
});

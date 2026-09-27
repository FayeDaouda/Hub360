import {
  avancementChecklistAvp,
  avancementChecklistFichiers,
  avertissementChangementPhase,
  dossierPermisComplet,
  etudesCompletes,
  joursRetardFacture,
  peutAvancerPhase,
  phasesAdjacentes,
  preBilanComplet,
  statsTaches,
  statutFactureEffectif,
  ventilationTva,
} from './gardes';

// Règles métier pures (aucune I/O). Ces fonctions sont le miroir serveur des
// gardes du front — une régression ici casse les deux côtés en silence.

describe('avancementChecklistAvp', () => {
  it('compte faits / total sur toutes les lignes', () => {
    const r = avancementChecklistAvp([
      { fait: true },
      { fait: false },
      { fait: true },
    ]);
    expect(r).toEqual({ faits: 2, total: 3, pct: 67, complete: false });
  });

  it('complete uniquement si au moins une ligne et toutes faites', () => {
    expect(avancementChecklistAvp([]).complete).toBe(false);
    expect(avancementChecklistAvp([{ fait: true }]).complete).toBe(true);
    expect(avancementChecklistAvp([{ fait: false }])).toEqual({
      faits: 0,
      total: 1,
      pct: 0,
      complete: false,
    });
  });

  it('un item non requis compte comme réglé, au même titre qu\'un item fait', () => {
    expect(
      avancementChecklistAvp([
        { fait: true },
        { fait: false, nonRequise: true },
        { fait: false },
      ]),
    ).toEqual({ faits: 2, total: 3, pct: 67, complete: false });
    expect(
      avancementChecklistAvp([{ fait: false, nonRequise: true }]).complete,
    ).toBe(true);
  });
});

describe('statsTaches', () => {
  it('compte faites / total et calcule le pct, null si aucune tâche', () => {
    expect(statsTaches([])).toEqual({
      total: 0,
      faites: 0,
      pct: null,
      enRetard: 0,
      respectDelais: { aTemps: 0, total: 0 },
    });
    const r = statsTaches([
      { fait: true, echeance: null, faitLe: null },
      { fait: false, echeance: null, faitLe: null },
    ]);
    expect(r.total).toBe(2);
    expect(r.faites).toBe(1);
    expect(r.pct).toBe(50);
  });

  it('en retard = non faite ET échéance dépassée, jamais une tâche déjà faite', () => {
    const r = statsTaches([
      { fait: false, echeance: '2020-01-01', faitLe: null }, // en retard
      { fait: false, echeance: '2099-01-01', faitLe: null }, // pas encore
      { fait: false, echeance: null, faitLe: null }, // pas d'échéance
      { fait: true, echeance: '2020-01-01', faitLe: new Date('2019-06-01') }, // faite, jamais « en retard »
    ]);
    expect(r.enRetard).toBe(1);
  });

  it('respectDelais : uniquement les tâches faites AVEC échéance connue', () => {
    const r = statsTaches([
      { fait: true, echeance: '2024-06-15', faitLe: new Date('2024-06-10') }, // à temps
      { fait: true, echeance: '2024-06-15', faitLe: new Date('2024-06-20') }, // en retard
      { fait: true, echeance: null, faitLe: new Date('2024-06-10') }, // pas d'échéance -> exclue
      { fait: false, echeance: '2020-01-01', faitLe: null }, // pas faite -> exclue
    ]);
    expect(r.respectDelais).toEqual({ aTemps: 1, total: 2 });
  });

  it('respectDelais : à la date échéance exacte compte comme à temps', () => {
    const r = statsTaches([
      { fait: true, echeance: '2024-06-15', faitLe: new Date('2024-06-15T23:00:00Z') },
    ]);
    expect(r.respectDelais).toEqual({ aTemps: 1, total: 1 });
  });
});

describe('avancementChecklistFichiers', () => {
  it('compte non-en_attente / total (non_necessaire compte comme réglé)', () => {
    const r = avancementChecklistFichiers([
      { statut: 'fait' },
      { statut: 'en_attente' },
      { statut: 'non_necessaire' },
    ]);
    expect(r).toEqual({ faits: 2, total: 3, pct: 67, complete: false });
  });

  it('complete uniquement si au moins un item et tous réglés', () => {
    expect(avancementChecklistFichiers([]).complete).toBe(false);
    expect(avancementChecklistFichiers([{ statut: 'fait' }]).complete).toBe(true);
    expect(avancementChecklistFichiers([{ statut: 'non_necessaire' }]).complete).toBe(true);
    expect(avancementChecklistFichiers([{ statut: 'en_attente' }]).complete).toBe(false);
  });
});

describe('peutAvancerPhase', () => {
  // Les phases peuvent se chevaucher (décision boss, sept. 2026) : plus de
  // verrou dur sur l'avant-projet non validé ni le permis non obtenu — voir
  // avertissementChangementPhase pour le rappel doux correspondant. Le verrou
  // de validation avant-projet lui-même a été retiré (sept. 2026, cf.
  // schema.prisma::AvantProjet) : seul permisObtenu reste en paramètre.
  it('laisse sortir d’avant-projet', () => {
    expect(
      peutAvancerPhase(
        { categorie: 'conception', phase: 'avant_projet' },
        { permisObtenu: false },
      ).ok,
    ).toBe(true);
  });

  it('laisse sortir de permis même sans permis obtenu', () => {
    expect(
      peutAvancerPhase(
        { categorie: 'conception', phase: 'permis' },
        { permisObtenu: false },
      ).ok,
    ).toBe(true);
  });

  it('refuse d’avancer depuis la dernière phase', () => {
    expect(
      peutAvancerPhase(
        { categorie: 'amenagement', phase: 'livre' },
        { permisObtenu: true },
      ).ok,
    ).toBe(false);
  });
});

describe('avertissementChangementPhase', () => {
  it('rappelle un permis non obtenu', () => {
    expect(
      avertissementChangementPhase({ phase: 'permis' }, { permisObtenu: false }),
    ).toMatch(/obtenu/);
  });

  it('ne dit rien si tout est en ordre ou hors de cette phase', () => {
    expect(
      avertissementChangementPhase({ phase: 'permis' }, { permisObtenu: true }),
    ).toBeNull();
    expect(
      avertissementChangementPhase({ phase: 'avant_projet' }, { permisObtenu: false }),
    ).toBeNull();
  });
});

describe('phasesAdjacentes', () => {
  it('vrai seulement pour un pas de ±1 dans la séquence de la catégorie', () => {
    expect(phasesAdjacentes('conception', 'avant_projet', 'permis')).toBe(true);
    expect(phasesAdjacentes('conception', 'avant_projet', 'etudes')).toBe(false);
    // « permis » n’existe pas dans la séquence aménagement
    expect(phasesAdjacentes('amenagement', 'avant_projet', 'permis')).toBe(false);
  });
});

describe('preBilanComplet', () => {
  it('faux tant que toutes les versions attendues ne sont pas là', () => {
    expect(
      preBilanComplet('conception', [
        { etape: 'esq', couts: { travaux: 1 } },
        { etape: 'aps', couts: { travaux: 1 } },
      ]),
    ).toBe(false);
  });

  it('vrai quand le compte y est et que le dernier total est non nul', () => {
    expect(
      preBilanComplet('amenagement', [
        { etape: 'estimation', couts: { travaux: 0 } },
        { etape: 'definitif', couts: { travaux: 5, honoraires: 2 } },
      ]),
    ).toBe(true);
  });

  it('faux si le dernier total est nul', () => {
    expect(
      preBilanComplet('amenagement', [
        { etape: 'estimation', couts: { travaux: 1 } },
        { etape: 'definitif', couts: { travaux: 0 } },
      ]),
    ).toBe(false);
  });
});

describe('dossierPermisComplet', () => {
  const ok = {
    titrePropriete: true,
    planCadastralVise: true,
    plansApd: true,
    devis: true,
    timbreFiscal: true,
  };
  it('exige les 5 pièces', () => {
    expect(dossierPermisComplet(ok)).toBe(true);
    expect(dossierPermisComplet({ ...ok, devis: false })).toBe(false);
  });
});

describe('etudesCompletes', () => {
  it('« remise » ne suffit pas — il faut « validee » ou « non_requise »', () => {
    expect(
      etudesCompletes([{ statut: 'validee' }, { statut: 'non_requise' }]),
    ).toBe(true);
    expect(
      etudesCompletes([{ statut: 'validee' }, { statut: 'remise' }]),
    ).toBe(false);
  });
});

describe('ventilationTva', () => {
  it('arrondit la TVA au franc et en déduit le TTC', () => {
    expect(ventilationTva(1_000_000, 18)).toEqual({
      montantTva: 180_000,
      montantTtc: 1_180_000,
    });
    // 333 333 * 18 % = 59 999,94 -> 60 000
    expect(ventilationTva(333_333, 18)).toEqual({
      montantTva: 60_000,
      montantTtc: 393_333,
    });
  });
});

describe('statutFactureEffectif', () => {
  const f = (over: Partial<Parameters<typeof statutFactureEffectif>[0]>) =>
    statutFactureEffectif(
      {
        statut: 'emise',
        echeanceLe: '2026-01-31',
        montantTtc: 1000,
        montantPaye: 0,
        ...over,
      },
      '2026-02-15',
    );

  it('renvoie le statut stocké tel quel hors « emise »', () => {
    expect(f({ statut: 'brouillon' })).toBe('brouillon');
    expect(f({ statut: 'annulee' })).toBe('annulee');
  });

  it('soldée l’emporte, même payée en retard', () => {
    expect(f({ montantPaye: 1000 })).toBe('payee');
    expect(f({ montantPaye: 1200 })).toBe('payee');
  });

  it('en retard avant partiellement payée', () => {
    expect(f({ montantPaye: 400 })).toBe('en_retard');
    expect(f({ montantPaye: 400, echeanceLe: '2026-03-01' })).toBe(
      'partiellement_payee',
    );
  });

  it('émise sans paiement ni retard', () => {
    expect(f({ echeanceLe: '2026-03-01' })).toBe('emise');
  });
});

describe('joursRetardFacture', () => {
  it('0 si pas d’échéance ou pas encore échue', () => {
    expect(joursRetardFacture(null, '2026-02-15')).toBe(0);
    expect(joursRetardFacture('2026-02-20', '2026-02-15')).toBe(0);
  });
  it('compte les jours pleins de dépassement (UTC)', () => {
    expect(joursRetardFacture('2026-02-05', '2026-02-15')).toBe(10);
  });
});

import {
  avancementChecklistAvp,
  avertissementChangementPhase,
  checklistComplete,
  dossierPermisComplet,
  etudesCompletes,
  joursRetardFacture,
  peutAvancerPhase,
  phasesAdjacentes,
  preBilanComplet,
  statutFactureEffectif,
  ventilationTva,
} from './gardes';

// Règles métier pures (aucune I/O). Ces fonctions sont le miroir serveur des
// gardes du front — une régression ici casse les deux côtés en silence.

describe('avancementChecklistAvp', () => {
  it('exclut les lignes « non requis » du dénominateur', () => {
    const r = avancementChecklistAvp([
      { fait: true, nonRequis: false },
      { fait: false, nonRequis: false },
      { fait: false, nonRequis: true },
    ]);
    expect(r).toEqual({ faits: 1, total: 2, pct: 50, complete: false });
  });

  it('complete uniquement si au moins une ligne applicable et toutes faites', () => {
    expect(avancementChecklistAvp([]).complete).toBe(false);
    expect(
      avancementChecklistAvp([{ fait: true, nonRequis: false }]).complete,
    ).toBe(true);
    expect(
      avancementChecklistAvp([{ fait: false, nonRequis: true }]),
    ).toEqual({ faits: 0, total: 0, pct: 0, complete: false });
  });
});

describe('checklistComplete', () => {
  const base = {
    programmeValide: true,
    budgetValide: true,
    esquisseValidee: true,
    engagementValide: true,
  };
  it('exige les 4 points', () => {
    expect(checklistComplete(base)).toBe(true);
    expect(checklistComplete({ ...base, budgetValide: false })).toBe(false);
  });
});

describe('peutAvancerPhase', () => {
  // Les phases peuvent se chevaucher (décision boss, sept. 2026) : plus de
  // verrou dur sur l'avant-projet non validé ni le permis non obtenu — voir
  // avertissementChangementPhase pour le rappel doux correspondant.
  it('laisse sortir d’avant-projet même non validé', () => {
    expect(
      peutAvancerPhase(
        { categorie: 'conception', phase: 'avant_projet' },
        { avantProjetValide: false, permisObtenu: false },
      ).ok,
    ).toBe(true);
  });

  it('laisse sortir de permis même sans permis obtenu', () => {
    expect(
      peutAvancerPhase(
        { categorie: 'conception', phase: 'permis' },
        { avantProjetValide: true, permisObtenu: false },
      ).ok,
    ).toBe(true);
  });

  it('refuse d’avancer depuis la dernière phase', () => {
    expect(
      peutAvancerPhase(
        { categorie: 'amenagement', phase: 'livre' },
        { avantProjetValide: true, permisObtenu: true },
      ).ok,
    ).toBe(false);
  });
});

describe('avertissementChangementPhase', () => {
  it('rappelle un avant-projet non validé, sans bloquer', () => {
    expect(
      avertissementChangementPhase(
        { phase: 'avant_projet' },
        { avantProjetValide: false, permisObtenu: false },
      ),
    ).toMatch(/validé/);
  });

  it('rappelle un permis non obtenu', () => {
    expect(
      avertissementChangementPhase(
        { phase: 'permis' },
        { avantProjetValide: true, permisObtenu: false },
      ),
    ).toMatch(/obtenu/);
  });

  it('ne dit rien si tout est en ordre ou hors de ces deux phases', () => {
    expect(
      avertissementChangementPhase(
        { phase: 'avant_projet' },
        { avantProjetValide: true, permisObtenu: false },
      ),
    ).toBeNull();
    expect(
      avertissementChangementPhase(
        { phase: 'etudes' },
        { avantProjetValide: false, permisObtenu: false },
      ),
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

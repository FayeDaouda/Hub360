import {
  bornesMois,
  etatTache,
  feuilleDuMois,
  heuresTache,
  joursAbsents,
  joursOuvres,
  manqueTache,
  moisEntre,
  periodeComptee,
  type Salarie,
  type Tache,
} from './regles-temps';

const present: Salarie = { dateEntree: '2024-01-03', dateSortie: null, absences: [] };
const tache = (id: string, debut: string | null, echeance: string | null, heures: number | null): Tache => ({
  id,
  debut,
  echeance,
  heures,
});

describe('regles-temps', () => {
  it('compte les jours ouvrés du lundi au vendredi', () => {
    expect(joursOuvres(bornesMois('2026-08'))).toHaveLength(21);
    expect(joursOuvres({ debut: '2026-09-11', fin: '2026-09-28' })).toHaveLength(12);
  });

  it('borne les mois, y compris février et le passage d’année', () => {
    expect(bornesMois('2028-02')).toEqual({ debut: '2028-02-01', fin: '2028-02-29' });
    expect(moisEntre('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('retrouve les chiffres de la maquette (août 2026 clos)', () => {
    const f = feuilleDuMois('2026-08', present, [], '2026-09-23');
    expect(f.heuresDisponibles).toBe(168);
    const absente = { ...present, absences: [{ debut: '2026-08-03', fin: '2026-08-14' }] };
    const g = feuilleDuMois('2026-08', absente, [], '2026-09-23');
    expect(g.joursAbsence).toBe(10);
    expect(g.heuresDisponibles).toBe(88);
  });

  it('répartit la durée sur la fenêtre et arrête le mois en cours à aujourd’hui', () => {
    const t = [tache('facade', '2026-09-11', '2026-09-28', 16), tache('escaliers', '2026-09-11', '2026-09-30', 8)];
    const f = feuilleDuMois('2026-09', present, t, '2026-09-23');
    expect(f.lignes.map((l) => l.heures)).toEqual([12, 5.1]);
    expect(f.heuresDisponibles).toBe(17 * 8);
    expect(f.heuresImputees).toBe(17.1);
    expect(f.occupation).toBe(13);
  });

  it('reporte la charge d’un jour d’absence sur les jours présents', () => {
    const t = tache('t', '2026-09-14', '2026-09-18', 10);
    const absents = joursAbsents([{ debut: '2026-09-18', fin: '2026-09-18' }]);
    expect(heuresTache(t, absents, { debut: '2026-09-14', fin: '2026-09-17' })).toBe(10);
    expect(heuresTache(t, absents, { debut: '2026-09-18', fin: '2026-09-18' })).toBe(0);
  });

  it('partage une fenêtre à cheval sur deux mois', () => {
    const t = [tache('t', '2026-09-28', '2026-10-02', 10)];
    expect(feuilleDuMois('2026-09', present, t, '2026-10-20').heuresImputees).toBe(6);
    expect(feuilleDuMois('2026-10', present, t, '2026-10-20').heuresImputees).toBe(4);
  });

  it('dit pourquoi une tâche ne produit aucune heure', () => {
    const aucun = new Set<string>();
    expect(manqueTache(tache('t', '2026-09-01', '2026-09-02', null), aucun)).toBe('duree');
    expect(manqueTache(tache('t', null, '2026-09-02', 4), aucun)).toBe('debut');
    expect(manqueTache(tache('t', null, null, null), aucun)).toBe('debut'); // à planifier d'abord
    expect(manqueTache(tache('t', '2026-09-01', null, 4), aucun)).toBe('echeance');
    expect(manqueTache(tache('t', '2026-09-03', '2026-09-02', 4), aucun)).toBe('fenetre');
    expect(manqueTache(tache('t', '2026-09-05', '2026-09-06', 4), aucun)).toBe('absence'); // week-end
    expect(manqueTache(tache('t', '2026-09-01', '2026-09-02', 4), aucun)).toBeNull();
  });

  it('borne la période par l’entrée, la sortie et le mois en cours', () => {
    expect(periodeComptee('2026-09', { ...present, dateEntree: '2026-09-15' }, '2026-10-01')).toEqual({
      debut: '2026-09-15',
      fin: '2026-09-30',
    });
    expect(periodeComptee('2026-09', { ...present, dateSortie: '2026-09-10' }, '2026-10-01')?.fin).toBe('2026-09-10');
    expect(periodeComptee('2026-10', present, '2026-09-29')).toBeNull();
    const f = feuilleDuMois('2026-10', present, [tache('t', '2026-10-01', '2026-10-02', 8)], '2026-09-29');
    expect(f).toMatchObject({ heuresImputees: 0, heuresDisponibles: 0, occupation: null });
  });

  it('situe la fenêtre d’une tâche par rapport à aujourd’hui', () => {
    const t = tache('t', '2026-09-28', '2026-09-30', 8);
    expect(etatTache(t, '2026-09-23')).toBe('a_venir');
    expect(etatTache(t, '2026-09-30')).toBe('en_cours');
    expect(etatTache(t, '2026-10-01')).toBe('terminee');
    expect(etatTache(tache('t', null, null, 8), '2026-10-01')).toBeNull();
  });
});

import {
  attendVisa,
  attentesFactures,
  etatCarte,
  etatTache,
  indexTaches,
  resumeEtape,
  type CarteSource,
  type TacheSource,
} from './etats';

// Scénario de la maquette « Projets » : DFS_ALM.26, J1 10/09, consulté le 23/09.
const AUJ = '2026-09-23';
const F = new Set<string>();
const tache = (cle: string, o: Partial<TacheSource> = {}): TacheSource => ({
  cle,
  libelle: cle,
  statut: 'a_faire',
  debutLe: '2026-09-10',
  finLe: '2026-09-16',
  version: 0,
  valideeLe: null,
  ...o,
});
const carte = (cle: string, taches: TacheSource[], o: Partial<CarteSource> = {}): CarteSource => ({
  cle,
  etapeNumero: 1,
  etapeCle: 'onboard',
  fichiers: false,
  desactivation: null,
  ouvreApres: [],
  taches,
  ...o,
});

describe('états dérivés (maquette Projets)', () => {
  const documents = carte('documents_client', [
    tache('piece_identite', { statut: 'validee', valideeLe: '2026-09-10' }),
    tache('ninea', { statut: 'non_necessaire' }),
    tache('plan_cadastral'),
  ]);
  const toutes = indexTaches([documents]);
  const ouverte = etatCarte(documents, toutes);

  it('validée le 10/09 pour le 16/09 → avance 32 h ; non remise au 23/09 → retard 7 j', () => {
    expect(etatTache(documents.taches[0], ouverte, AUJ, F)).toEqual({ code: 'validee', ecart: 32 });
    expect(etatTache(documents.taches[2], ouverte, AUJ, F)).toEqual({ code: 'en_retard', jours: 7 });
  });

  it('fenêtre commencée → en cours ; pas commencée → à venir ; reprise → version suivante', () => {
    expect(etatTache(tache('coupes', { debutLe: '2026-09-11', finLe: '2026-09-30' }), ouverte, AUJ, F)).toEqual({
      code: 'en_cours',
    });
    expect(etatTache(tache('pe', { debutLe: '2026-10-09', finLe: '2026-10-22' }), ouverte, AUJ, F)).toEqual({
      code: 'a_venir',
    });
    expect(etatTache(tache('sdb', { statut: 'reprise', version: 1 }), ouverte, AUJ, F)).toEqual({
      code: 'reprise',
      version: 2,
    });
  });

  it('carte verrouillée tant que ses tâches d’ouverture ne sont pas validées', () => {
    const livrables = carte('livrables', [tache('details_facade', { finLe: '2026-09-28' })], { etapeNumero: 2 });
    const facades = carte('facades', [tache('facade_principale')], {
      etapeNumero: 3,
      ouvreApres: ['livrables.details_facade'],
    });
    const idx = indexTaches([livrables, facades]);
    const e = etatCarte(facades, idx);
    expect(e).toEqual({ code: 'verrouillee', attend: ['details_facade'] });
    expect(etatTache(facades.taches[0], e, AUJ, F)).toEqual({ code: 'verrouillee' });
    livrables.taches[0].statut = 'validee';
    expect(etatCarte(facades, indexTaches([livrables, facades]))).toEqual({ code: 'ouverte' });
  });

  it('close quand toutes les tâches utiles sont validées (date de la dernière) ; sans tâche → close', () => {
    const c = carte('programme', [tache('analyse', { statut: 'validee', valideeLe: '2026-09-10' })]);
    expect(etatCarte(c, indexTaches([c]))).toEqual({ code: 'close', le: '2026-09-10' });
    expect(etatCarte(carte('vues', []), new Map())).toEqual({ code: 'close', le: null });
  });

  it('compteurs d’étape : x/y hors non nécessaires et cartes désactivées, retards remontés', () => {
    const etats = documents.taches.map((t) => ({ tache: t, etat: etatTache(t, ouverte, AUJ, F) }));
    expect(resumeEtape(1, etats)).toEqual({ numero: 1, faites: 1, total: 2, enRetard: 1, etat: 'en_retard' });
  });

  it('F2 attend 02, 03 et le récépissé 04 ; F3 attend 06 et les visas des études actives', () => {
    const permis = carte('permis_construire', [tache('depot')], { etapeNumero: 4, etapeCle: 'autorisations' });
    const ets = carte('ets', [tache('visa', { libelle: "Visa BC et validation de l'étude" })], {
      etapeNumero: 5,
      etapeCle: 'etudes',
    });
    const etb = carte('etb', [tache('visa', { libelle: "Visa BC et validation de l'étude" })], {
      etapeNumero: 5,
      etapeCle: 'etudes',
      desactivation: 'Étude non commandée au devis',
    });
    const etapes = [2, 3, 6].map((n) => ({ numero: n, faites: 0, total: 1, enRetard: 0, etat: 'en_cours' as const }));
    expect(attentesFactures(etapes, [permis, ets, etb])).toEqual({
      F2: ['02', '03', 'récépissé 04'],
      F3: ['06', "1 visa(s) d'étude"],
    });
  });
});

// Visa DPLG (revue Dir. GC, 21/10/2026) : validée par le chef de team, la
// tâche n'est faite qu'une fois visée par l'architecte DPLG.
describe('visa DPLG', () => {
  const plans = (o: Partial<TacheSource> = {}) =>
    tache('plans_autorisation', { statut: 'validee', valideeLe: '2026-09-15', visaRequis: true, ...o });
  const permis = (p: TacheSource) =>
    carte('permis_construire', [p, tache('depot')], { etapeNumero: 4, etapeCle: 'autorisations' });

  it('validée sans visa : « visa à apposer », la carte n’est pas close', () => {
    const c = permis(plans());
    const etat = etatCarte(c, indexTaches([c]));
    expect(etatTache(c.taches[0], etat, AUJ, F)).toEqual({ code: 'a_viser' });
    expect(etat.code).toBe('ouverte');
  });

  it('le dépôt attend les plans visés', () => {
    expect(attendVisa(tache('depot'), permis(plans()))).toBe(true);
    expect(attendVisa(tache('depot'), permis(plans({ viseeLe: '2026-09-16' })))).toBe(false);
    const c = permis(plans());
    expect(etatTache(c.taches[1], etatCarte(c, indexTaches([c])), AUJ, F, attendVisa(c.taches[1], c))).toEqual({
      code: 'verrouillee',
    });
  });

  it('une étape n’est terminée qu’une fois les visas apposés ; F3 attend les visas DPLG', () => {
    const pe = (o: Partial<TacheSource>) =>
      carte(
        'pe_architecture',
        [tache('pe_architecture', { statut: 'validee', valideeLe: '2026-09-20', visaRequis: true, ...o })],
        { etapeNumero: 6, etapeCle: 'plans_execution' },
      );
    const sansVisa = pe({});
    const r = resumeEtape(
      6,
      sansVisa.taches.map((t) => ({
        tache: t,
        etat: etatTache(t, etatCarte(sansVisa, indexTaches([sansVisa])), AUJ, F),
      })),
    );
    expect(r).toMatchObject({ faites: 0, total: 1, etat: 'en_cours' });
    expect(attentesFactures([r], [sansVisa]).F3).toEqual(['06', '1 visa(s) DPLG']);
    const vise = pe({ viseeLe: '2026-09-21' });
    const r2 = resumeEtape(
      6,
      vise.taches.map((t) => ({ tache: t, etat: etatTache(t, etatCarte(vise, indexTaches([vise])), AUJ, F) })),
    );
    expect(r2.etat).toBe('terminee');
    expect(attentesFactures([r2], [vise]).F3).toEqual([]);
  });
});

describe('visa non tracé (tâches validées avant la règle)', () => {
  it('ni « à viser », ni bloquant : la carte se clôt, le dépôt est libre', () => {
    const c = carte('permis_construire', [
      tache('plans_autorisation', { statut: 'validee', valideeLe: '2026-09-15', visaRequis: true, visaNonTrace: true }),
      tache('depot'),
    ]);
    const etat = etatCarte(c, indexTaches([c]));
    expect(etatTache(c.taches[0], etat, AUJ, F).code).toBe('validee');
    expect(attendVisa(c.taches[1], c)).toBe(false);
  });
});

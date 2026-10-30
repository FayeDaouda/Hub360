import { INestApplication } from '@nestjs/common';
import { api, COMPTES, connecter, demarrer } from './app';

type Tache = { id: string; statut: string; heures: number | null; version: number };
type Carte = { etat: { code: string }; taches: Tache[] };
type Fiche = { id: string; cartes: Carte[] };

// Parcours 3 — le cœur du travail : une tâche assignée, remise avec son
// fichier, renvoyée en reprise, remise à nouveau (v02), validée.
describe('Remise → reprise → validation d’une tâche', () => {
  let app: INestApplication;
  let dirgc: ReturnType<typeof api>; // Architecte DPLG : assigne et valide
  let salarie: ReturnType<typeof api>;
  let projetId: string;
  let tache: Tache;

  beforeAll(async () => {
    app = await demarrer();
    dirgc = api(app, await connecter(app, COMPTES.dirgc));
    salarie = api(app, await connecter(app, COMPTES.salarie));

    // Un projet de conception s'ouvre (gabarit instancié) à l'émission de F1.
    // La démo n'en a aucun d'ouvert : l'offre de NF_OUA.26 (envoyée,
    // conception) est acceptée — Onboard — et on émet sa F1.
    const cfo = api(app, await connecter(app, COMPTES.cfo));
    const dossier = ((await cfo.get('/dossiers').expect(200)).body as { id: string; code: string }[]).find(
      (d) => d.code === 'NF_OUA.26',
    )!;
    const offre = (
      (await cfo.get('/devis').expect(200)).body as { id: string; statut: string; dossierCrm: { id: string } | null }[]
    ).find((d) => d.dossierCrm?.id === dossier.id && d.statut === 'envoye')!;
    await cfo.post(`/devis/${offre.id}/reponse`, { reponse: 'accepte' }).expect(201);
    const f1 = (
      (await cfo.get('/factures').expect(200)).body as {
        id: string;
        statut: string;
        jalon: string | null;
        projet: { code: string } | null;
      }[]
    ).find((f) => f.statut === 'brouillon' && f.jalon === 'signature' && f.projet?.code === 'NF_OUA.26')!;
    await cfo.post(`/factures/${f1.id}/emission`).expect(201);
    const { projets } = (await dirgc.get('/projets-ouverts').expect(200)).body as { projets: { id: string }[] };

    // Une tâche à faire, avec un temps atelier (sinon le dépôt vaut validation),
    // sur une carte ouverte d'un projet ouvert.
    for (const p of projets) {
      const fiche: Fiche = (await dirgc.get(`/projets-ouverts/${p.id}`).expect(200)).body;
      const t = fiche.cartes
        .filter((c) => c.etat.code === 'ouverte')
        .flatMap((c) => c.taches)
        .find((x) => x.statut === 'a_faire' && x.heures);
      if (t) {
        projetId = p.id;
        tache = t;
        break;
      }
    }
    expect(tache).toBeDefined();
  });
  afterAll(() => app.close());

  it('le DPLG assigne la tâche au salarié', async () => {
    const assignables: { id: string; nom: string }[] = (
      await dirgc.get(`/projets-ouverts/${projetId}/assignables`).expect(200)
    ).body;
    const rokhaya = assignables.find((a) => a.nom === 'Rokhaya Ndoye')!;
    await dirgc
      .patch(`/projets-ouverts/${projetId}/taches/${tache.id}/assignation`, { collaborateurId: rokhaya.id })
      .expect(200);
    // La charge prévisionnelle est servie pour la fenêtre de la tâche.
    const charges = (await dirgc.get(`/projets-ouverts/${projetId}/taches/${tache.id}/charges`).expect(200)).body;
    expect(charges.charges.find((c: { collaborateurId: string }) => c.collaborateurId === rokhaya.id)).toBeDefined();
  });

  it('le salarié remet v01 avec son fichier ; le valideur la voit, fichier compris', async () => {
    await salarie
      .post(`/mon-espace/taches/${projetId}/${tache.id}/remise`, {
        pieces: [{ nom: 'plan-masse.pdf', url: 'data:application/pdf;base64,JVBERi0xLjQ=' }],
        commentaire: 'Première version',
      })
      .expect(201);
    const aValider: { id: string; version: number; pieces: { nom: string }[] }[] = (
      await dirgc.get('/taches/a-valider').expect(200)
    ).body;
    const remise = aValider.find((t) => t.id === tache.id)!;
    // Le serveur renomme le fichier selon la nomenclature (…_vNN.ext).
    expect(remise.version).toBe(1);
    expect(remise.pieces).toHaveLength(1);
    expect(remise.pieces[0].nom).toMatch(/_v01\.pdf$/);
  });

  it('renvoyée en reprise avec un motif, puis remise v02 avec son fichier (obligatoire)', async () => {
    await dirgc
      .post(`/taches/${projetId}/${tache.id}/decision`, { decision: 'renvoyer', motif: 'Cotes manquantes' })
      .expect(201);
    await salarie.post(`/mon-espace/taches/${projetId}/${tache.id}/remise`, {}).expect(400);
    await salarie
      .post(`/mon-espace/taches/${projetId}/${tache.id}/remise`, {
        pieces: [{ nom: 'plan-masse-cote.pdf', url: 'data:application/pdf;base64,JVBERi0xLjQ=' }],
      })
      .expect(201);
    const aValider: { id: string; version: number; pieces: { nom: string }[] }[] = (
      await dirgc.get('/taches/a-valider').expect(200)
    ).body;
    const remise = aValider.find((t) => t.id === tache.id)!;
    expect(remise.version).toBe(2);
    expect(remise.pieces.map((p) => p.nom)).toEqual([expect.stringMatching(/_v02\.pdf$/)]);
  });

  it('validée : la tâche est close et l’historique garde chaque étape', async () => {
    await dirgc.post(`/taches/${projetId}/${tache.id}/decision`, { decision: 'valider' }).expect(201);
    const fiche: Fiche = (await dirgc.get(`/projets-ouverts/${projetId}`).expect(200)).body;
    expect(fiche.cartes.flatMap((c) => c.taches).find((t) => t.id === tache.id)!.statut).toBe('validee');
    const historique: { detail: string }[] = (
      await dirgc.get(`/projets-ouverts/${projetId}/taches/${tache.id}/historique`).expect(200)
    ).body;
    const textes = historique.map((e) => e.detail).join(' | ');
    expect(textes).toContain('Remise v01 · 1 fichier · « Première version »');
    expect(textes).toContain('Remise v02 · 1 fichier');
  });

  // Équipes du projet (29/10/2026) : le Dir. GC affecte l'équipe et nomme son
  // chef ; le chef assigne le travail aux seuls membres de son équipe.
  it('équipe affectée par le Dir. GC : son chef assigne à ses membres, pas aux autres', async () => {
    const cellules: { id: string; nom: string }[] = (await dirgc.get('/cellules').expect(200)).body;
    const etudes = cellules.find((c) => c.nom.includes('Études'))!;
    const personnes: { id: string; nom: string }[] = (
      await dirgc.get(`/projets-ouverts/${projetId}/assignables`).expect(200)
    ).body;
    const id = (nom: string) => personnes.find((p) => p.nom === nom)!.id;
    // Avant : Rokhaya n'est chef d'aucune équipe du projet.
    await salarie.get(`/projets-ouverts/${projetId}/assignables`).expect(403);

    await dirgc.patch(`/cellules/${etudes.id}/dispatcher`, { dispatcherId: id('Rokhaya Ndoye') }).expect(200);
    const equipes = (await dirgc.put(`/projets/${projetId}/equipes`, { celluleIds: [etudes.id] }).expect(200)).body;
    expect(equipes.equipes.map((e: { id: string }) => e.id)).toEqual([etudes.id]);

    const siens: { nom: string }[] = (await salarie.get(`/projets-ouverts/${projetId}/assignables`).expect(200)).body;
    expect(siens.map((p) => p.nom)).toEqual(expect.arrayContaining(['Souleymane Fall', 'Malick Sy']));
    expect(siens.map((p) => p.nom)).not.toContain('Cheikh Sarr');

    const fiche: Fiche = (await salarie.get(`/projets-ouverts/${projetId}`).expect(200)).body;
    const autre = fiche.cartes
      .filter((c) => c.etat.code === 'ouverte')
      .flatMap((c) => c.taches)
      .find((t) => t.statut === 'a_faire' && t.id !== tache.id)!;
    const assigner = (nom: string) =>
      salarie.patch(`/projets-ouverts/${projetId}/taches/${autre.id}/assignation`, { collaborateurId: id(nom) });
    await assigner('Souleymane Fall').expect(200);
    await assigner('Cheikh Sarr').expect(403);

    // Remise en état pour les autres parcours (base partagée).
    await dirgc.put(`/projets/${projetId}/equipes`, { celluleIds: [] }).expect(200);
    await dirgc.patch(`/cellules/${etudes.id}/dispatcher`, { dispatcherId: null }).expect(200);
  });
});

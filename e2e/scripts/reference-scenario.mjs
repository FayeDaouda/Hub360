// Brings the freshly seeded reference database to a state where every screen
// has something to show, through the real API only (no direct SQL):
//   - an opened project (gabarit instantiated at F1) with tasks assigned to
//     the Salarié account, for Mes tâches and the deposit / delay smoke tests;
//   - a contract sent to the client (public signature page, unsigned);
//   - a free devis sent to the client (public acceptance page).
// It also writes the browser sessions of the captured roles, so the tests
// never spend the 5-logins-per-minute budget of the login route.
//
//   node reference-scenario.mjs <api-url> <front-url> <state-dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [apiUrl, frontUrl, stateDir] = process.argv.slice(2);
if (!apiUrl || !frontUrl || !stateDir)
  throw new Error('usage: reference-scenario.mjs <api-url> <front-url> <state-dir>');

const SLUG = 'grey-concrete';
const DEMO_PASSWORD = 'changeme123';
const ACCOUNTS = {
  ceo: 'ceo.greyconcrete@hub.group',
  cio: 'cio.greyconcrete@hub.group',
  cfo: 'cfo.greyconcrete@hub.group',
  dirgc: 'dirgc.greyconcrete@hub.group',
  salarie: 'rokhaya.ndoye@greyconcrete.hub', // Salarié with a team record
};
const OPENED_DOSSIER = 'NF_OUA.26'; // demo: offer sent, conception category (has a gabarit)
const CONTRACT_DOSSIER = 'FS_NGO.26'; // demo: offer awaiting CFO validation
const TASKS_FOR_SALARIE = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function login(email) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, motDePasse: DEMO_PASSWORD, societeSlug: SLUG }),
    });
    if (response.status === 429) {
      await sleep(61_000);
      continue;
    }
    if (!response.ok) throw new Error(`login ${email}: ${response.status} ${await response.text()}`);
    return response.json();
  }
  throw new Error(`login ${email}: still rate-limited`);
}

function client(session) {
  return async (method, path, body) => {
    const response = await fetch(`${apiUrl}/societes/${SLUG}${path}`, {
      method,
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };
}

const tokenOf = (publicLink) => publicLink.split('/').pop();

async function signContract(cfo, dossierId) {
  const { contrat } = await cfo('POST', `/dossiers/${dossierId}/contrat`);
  for (const annex of contrat.annexes.filter((a) => a.statut === 'a_joindre')) {
    await cfo('PATCH', `/dossiers/${dossierId}/contrat/annexes/${annex.id}`, { statut: 'non_necessaire' });
  }
  return contrat;
}

async function main() {
  const sessions = {};
  for (const [role, email] of Object.entries(ACCOUNTS)) sessions[role] = await login(email);
  const cio = client(sessions.cio);
  const cfo = client(sessions.cfo);
  const dirgc = client(sessions.dirgc);

  // Fictitious template and signatories, reference database only: the real
  // configuration waits for the company's contract model.
  await cio('PATCH', '/parametres-contrat', {
    modele: 'Contrat de référence — {{client}}',
    signataireNom: 'Signataire Référence',
    signataireFonction: 'Architecte DPLG',
    signataireCeoNom: 'CEO Référence',
    signataireCeoFonction: 'Directeur général',
  });

  const dossiers = await cfo('GET', '/dossiers');
  const dossierByCode = (code) => dossiers.find((d) => d.code === code);
  const offerOf = async (dossierId, statut) =>
    (await cfo('GET', '/devis')).find((d) => d.dossierCrm?.id === dossierId && d.statut === statut);

  // Opened project: offer accepted (Onboard), paper-signed contract, F1 issued.
  const opened = dossierByCode(OPENED_DOSSIER);
  await cfo('POST', `/devis/${(await offerOf(opened.id, 'envoye')).id}/reponse`, { reponse: 'accepte' });
  await signContract(cfo, opened.id);
  await cfo('POST', `/dossiers/${opened.id}/contrat/signature-papier`, {
    nom: 'contrat-signe.pdf',
    url: 'data:application/pdf;base64,JVBERi0xLjQ=',
  });
  const firstInvoice = (await cfo('GET', '/factures')).find(
    (f) => f.statut === 'brouillon' && f.jalon === 'signature' && f.projet?.code === OPENED_DOSSIER,
  );
  await cfo('POST', `/factures/${firstInvoice.id}/emission`);

  const { projets } = await dirgc('GET', '/projets-ouverts');
  const project = projets[0];
  const sheet = await dirgc('GET', `/projets-ouverts/${project.id}`);
  const assignable = (await dirgc('GET', `/projets-ouverts/${project.id}/assignables`)).find(
    (a) => a.nom === 'Rokhaya Ndoye',
  );
  const tasks = sheet.cartes
    .filter((c) => c.etat.code === 'ouverte')
    .flatMap((c) => c.taches)
    .filter((t) => t.statut === 'a_faire' && t.heures)
    .slice(0, TASKS_FOR_SALARIE);
  for (const task of tasks) {
    await dirgc('PATCH', `/projets-ouverts/${project.id}/taches/${task.id}/assignation`, {
      collaborateurId: assignable.id,
    });
  }

  // Offer accepted (Onboard), contract sent to the client and left unsigned.
  const contractDossier = dossierByCode(CONTRACT_DOSSIER);
  await cfo('POST', `/dossiers/${contractDossier.id}/actions`, { action: 'valider' });
  await cfo('POST', `/devis/${(await offerOf(contractDossier.id, 'envoye')).id}/reponse`, { reponse: 'accepte' });
  await signContract(cfo, contractDossier.id);
  const sentContract = await cfo('POST', `/dossiers/${contractDossier.id}/contrat/envoi`);

  // Free devis sent to the client, awaiting an answer.
  const [firstClient] = await cfo('GET', '/clients');
  const devis = await cfo('POST', '/devis', {
    clientId: firstClient.id,
    objet: 'Mission de référence',
    lignes: [{ designation: 'Esquisse de référence', quantite: 1, prixUnitaire: 1_500_000 }],
  });
  const sentDevis = await cfo('POST', `/devis/${devis.id}/envoi`);

  const invoicedProject = (await cfo('GET', '/factures')).find((f) => f.projet)?.projet ?? null;

  const fixtures = {
    devisToken: tokenOf(sentDevis.lienPublic),
    contratToken: tokenOf(sentContract.lienPublic),
    openedProjectId: project.id,
    assignedTaskIds: tasks.map((t) => t.id),
    invoicedProjectId: invoicedProject?.id ?? null,
  };
  writeFileSync(join(stateDir, 'fixtures.json'), JSON.stringify(fixtures, null, 2));

  const authDir = join(stateDir, 'auth');
  mkdirSync(authDir, { recursive: true });
  for (const role of ['ceo', 'cio', 'cfo', 'salarie']) {
    const storageState = {
      cookies: [],
      origins: [{ origin: frontUrl, localStorage: [{ name: 'hub_session', value: JSON.stringify(sessions[role]) }] }],
    };
    writeFileSync(join(authDir, `${role}.json`), JSON.stringify(storageState, null, 2));
  }
  console.log('fixtures:', JSON.stringify(fixtures));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

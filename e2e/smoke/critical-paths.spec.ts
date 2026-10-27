import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  ADMIN_PATH,
  COMPANY_SLUG,
  DEMO_PASSWORD,
  readFixtures,
  storageStateOf,
  waitForContent,
} from '../support/reference';

// Smoke tests of the critical paths, through the UI, on the reference data
// prepared by scripts/reference-scenario.mjs. They change that data (deposit,
// delay request, new invoice): run them after the visual captures, or on a
// fresh `npm run env:up`.

const fixtures = readFixtures();

// Le scénario de référence vient d'ouvrir plusieurs sessions : la connexion
// est limitée par minute (429 « Trop de tentatives »). On attend que la
// fenêtre soit écoulée depuis la fin du scénario (scripts/reference-env.sh).
test.beforeAll(async () => {
  const done = Number(readFileSync(join(__dirname, '..', '.state', 'scenario-done'), 'utf8'));
  const wait = done * 1000 + 61_000 - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
});

test.describe('sign-in', () => {
  test('a CEO picks the company on the portal, signs in and lands on Pilotage', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Grey Concrete/ }).click();
    await expect(page).toHaveURL(`/login/${COMPANY_SLUG}`);

    await page.getByLabel(/e-?mail/i).fill('ceo.greyconcrete@hub.group');
    await page.getByRole('textbox', { name: 'Mot de passe' }).fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page).toHaveURL(ADMIN_PATH);
    await waitForContent(page);
    await expect(page.locator('main#contenu')).toBeVisible();
  });

  test('a wrong password is refused with a message', async ({ page }) => {
    await page.goto(`/login/${COMPANY_SLUG}`);
    await page.getByLabel(/e-?mail/i).fill('ceo.greyconcrete@hub.group');
    await page.getByRole('textbox', { name: 'Mot de passe' }).fill('not-the-password');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(`/login/${COMPANY_SLUG}`);
  });
});

test.describe('Salarié tasks', () => {
  test.use({ storageState: storageStateOf('salarie') });

  async function openMyTasks(page: Page) {
    await page.goto(`${ADMIN_PATH}/mes-taches`);
    await waitForContent(page);
    // Tasks due later sit in the folded « Plus tard » group.
    const later = page.locator('details.mt-plus-tard');
    if ((await later.count()) > 0 && !(await later.evaluate((el) => (el as HTMLDetailsElement).open))) {
      await later.locator('summary').click();
    }
  }

  test('the assigned tasks are listed', async ({ page }) => {
    await openMyTasks(page);
    await expect(page.locator('.mt-liste [data-tache]')).toHaveCount(fixtures.assignedTaskIds.length);
  });

  test('a task is deposited with its file and goes to the N+1', async ({ page }) => {
    await openMyTasks(page);
    const row = page.locator(`.mt-liste [data-tache="${fixtures.assignedTaskIds[0]}"]`);
    const label = (await row.locator('.mt-titre-bouton').innerText()).trim();
    await row.getByRole('button', { name: 'Déposer', exact: true }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Déposer la tâche');
    await dialog.locator('input[type="file"][multiple]').setInputFiles({
      name: 'plan-masse.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%reference smoke test\n'),
    });
    await dialog.getByRole('button', { name: 'Déposer', exact: true }).click();

    // Five seconds to cancel, then the deposit is sent.
    await expect(page.getByRole('status')).toContainText('Annuler');
    await expect(page.locator('aside.mt-cote')).toContainText(label, { timeout: 15_000 });
  });

  test('a delay is requested from the task panel', async ({ page }) => {
    await openMyTasks(page);
    const row = page.locator(`.mt-liste [data-tache="${fixtures.assignedTaskIds[1]}"]`);
    await row.locator('.mt-titre-bouton').click();

    const actions = page.getByRole('group', { name: 'Actions sur la tâche' });
    await actions.getByRole('button', { name: 'Demander un délai' }).click();
    const newDate = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    await page.locator('#po-jusquau').fill(newDate);
    await page.locator('#po-motif-prolongation').fill('Relevés complémentaires attendus');
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();

    await expect(page.getByText('Délai demandé')).toBeVisible();
    await expect(page.getByText('Relevés complémentaires attendus')).toBeVisible();
  });
});

test.describe('invoices', () => {
  test.use({ storageState: storageStateOf('cfo') });

  test('the CFO prepares a direct invoice, then finds it in the list', async ({ page }) => {
    await page.goto(`${ADMIN_PATH}/facturation?onglet=factures`);
    await waitForContent(page);
    await page.getByRole('button', { name: 'Nouvelle facture' }).click();

    const form = page.getByRole('dialog', { name: /./ }).filter({ hasText: 'Nouvelle facture' });
    await form.locator('#nfd-lead').selectOption({ index: 1 });
    const leadCode = (await form.locator('#nfd-lead option:checked').innerText()).split(' · ')[0].trim();
    await form.getByLabel('Désignation, ligne 1').fill('CO0 · Diagnostic de référence');
    await form.getByLabel('Montant HT, ligne 1').fill('250000');
    // La création doit aboutir avant de quitter la page : une navigation
    // immédiate interrompait la requête sur une machine chargée (27/10/2026).
    const created = page.waitForResponse(
      (r) => r.url().endsWith('/factures/directes') && r.request().method() === 'POST',
    );
    await form.getByRole('button', { name: /Préparer la facture/ }).click();
    expect((await created).ok()).toBe(true);

    // A direct invoice waits for the CFO's validation; its number comes at issue.
    await page.goto(`${ADMIN_PATH}/facturation?onglet=factures`);
    await waitForContent(page);
    const row = page.getByRole('row').filter({ hasText: leadCode }).filter({ hasText: 'À valider CFO' });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(/295\s000/);
  });
});

test.describe('public devis', () => {
  test('a client opens the devis link and sees the amounts and the answer buttons', async ({ page }) => {
    await page.goto(`/devis/${fixtures.devisToken}`);
    await waitForContent(page);
    await expect(page.getByText('Mission de référence')).toBeVisible();
    await expect(page.getByText(/Total TTC/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accepter le devis' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refuser' })).toBeVisible();
  });

  test('an unknown devis link shows no devis', async ({ page }) => {
    await page.goto('/devis/unknown-token');
    await waitForContent(page);
    await expect(page.getByRole('button', { name: 'Accepter le devis' })).toHaveCount(0);
  });
});

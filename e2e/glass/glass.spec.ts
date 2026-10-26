import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  ADMIN_PATH,
  expectStableApi,
  installCaptureGuards,
  installSeedNoiseFilter,
  readFixtures,
  storageStateOf,
  THEMES,
  useTheme,
  waitForContent,
} from '../support/reference';

// Verre : le flou d'arrière-plan est la signature de l'application. Les
// captures principales le retirent (son lissage varie d'un lancement à
// l'autre) ; ces quelques captures le gardent, avec une tolérance d'environ
// 1 % de pixels différents au lieu d'une égalité stricte.
const TOLERANCE = { maxDiffPixelRatio: 0.01, timeout: 60_000 };
const fixtures = readFixtures();

async function open(page: Page, theme: (typeof THEMES)[number], path: string) {
  await useTheme(page, theme);
  await installSeedNoiseFilter(page);
  await installCaptureGuards(page, { blur: true });
  await page.goto(path);
  await waitForContent(page);
}

async function capture(target: Page | Locator, name: string) {
  await expect(target).toHaveScreenshot(name, TOLERANCE);
}

for (const theme of THEMES) {
  test.describe(`verre (${theme})`, () => {
    test.use({ storageState: storageStateOf('ceo') });

    test('barre latérale et en-tête', async ({ page }) => {
      await open(page, theme, ADMIN_PATH);
      await capture(page.locator('.admin-sidebar'), `barre-laterale--${theme}.png`);
      await capture(page.locator('.admin-topbar'), `en-tete--${theme}.png`);
      expectStableApi(page);
    });

    test('modale', async ({ page }) => {
      await open(page, theme, ADMIN_PATH);
      await page.getByRole('button', { name: 'Rechercher' }).click();
      await expect(page.getByRole('dialog', { name: 'Recherche' })).toBeVisible();
      await capture(page, `modale--${theme}.png`);
      expectStableApi(page);
    });

    test('portail', async ({ page }) => {
      await open(page, theme, '/');
      await capture(page, `portail--${theme}.png`);
      expectStableApi(page);
    });

    test('dossier projet', async ({ page }) => {
      await open(page, theme, `${ADMIN_PATH}/projets?projet=${fixtures.openedProjectId}`);
      await capture(page.getByRole('region', { name: 'Dossier projet' }), `dossier-projet--${theme}.png`);
      expectStableApi(page);
    });
  });
}

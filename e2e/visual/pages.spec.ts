import { expect, test, type Page } from '@playwright/test';
import {
  ADMIN_PATH,
  COMPANY_SLUG,
  cspViolations,
  installCaptureGuards,
  expectStableApi,
  installSeedNoiseFilter,
  readFixtures,
  resetHorizontalScroll,
  storageStateOf,
  THEMES,
  useTheme,
  waitForContent,
  type Role,
} from '../support/reference';

// Visual reference of every screen, per role, theme and viewport (the two
// viewports are two Playwright projects). Each top-level tab of a page is
// captured too. Run `npm run visual:baseline` on the reference revision, then
// `npm run visual` on the changed code: any pixel difference fails and the
// HTML report shows the diff.

// `tabs`: the page has a top-level tab list, rendered once its data has
// loaded; the capture waits for it instead of guessing.
type Screen = { name: string; path: string; tabs?: boolean };

const fixtures = readFixtures();

const PUBLIC_SCREENS: Screen[] = [
  { name: 'portal', path: '/' },
  { name: 'login', path: `/login/${COMPANY_SLUG}` },
  { name: 'login-unknown-company', path: '/login/societe-inconnue' },
  { name: 'forgotten-password', path: '/mot-de-passe-oublie' },
  { name: 'activate-without-token', path: '/activer' },
  { name: 'reset-without-token', path: '/reinitialiser' },
  { name: 'public-devis', path: `/devis/${fixtures.devisToken}` },
  { name: 'public-contrat', path: `/contrat/${fixtures.contratToken}` },
];

const SCREENS_BY_ROLE: Record<Exclude<Role, 'cfo'>, Screen[]> = {
  ceo: [
    { name: 'pilotage', path: ADMIN_PATH, tabs: true },
    { name: 'crm', path: `${ADMIN_PATH}/crm`, tabs: true },
    { name: 'projets', path: `${ADMIN_PATH}/projets`, tabs: true },
    { name: 'projets-production', path: `${ADMIN_PATH}/projets?vue=production`, tabs: true },
    { name: 'projet-ouvert', path: `${ADMIN_PATH}/projets?projet=${fixtures.openedProjectId}`, tabs: true },
    { name: 'finances', path: `${ADMIN_PATH}/facturation`, tabs: true },
    ...(fixtures.invoicedProjectId
      ? [{ name: 'finances-projet', path: `${ADMIN_PATH}/facturation/projets/${fixtures.invoicedProjectId}` }]
      : []),
    { name: 'rh', path: `${ADMIN_PATH}/rh`, tabs: true },
    { name: 'equipe', path: `${ADMIN_PATH}/equipe`, tabs: true },
    { name: 'mon-espace', path: `${ADMIN_PATH}/mon-espace`, tabs: true },
    { name: 'mes-reglages', path: `${ADMIN_PATH}/mes-reglages` },
  ],
  salarie: [
    { name: 'mes-taches', path: `${ADMIN_PATH}/mes-taches` },
    { name: 'projets', path: `${ADMIN_PATH}/projets`, tabs: true },
    { name: 'mon-espace', path: `${ADMIN_PATH}/mon-espace`, tabs: true },
    { name: 'mes-reglages', path: `${ADMIN_PATH}/mes-reglages` },
  ],
  // Screens only the HUB administrator reaches.
  cio: [
    { name: 'reglages', path: `${ADMIN_PATH}/reglages`, tabs: true },
    { name: 'groupe', path: '/groupe' },
  ],
};

// Tab labels carry counters and status lines that change with the data: the
// file name keeps the first words of the label only (the index keeps it unique).
function slugOf(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
    .slice(0, 3)
    .join('-');
}

// Full-page mode resizes the viewport while capturing, which re-lays out the
// vh-based workspaces and the sticky headers measured by ResizeObserver: the
// page height then flips between two values. The viewport is sized to the
// document once it is settled, and a plain capture is taken.
async function expectFullPageScreenshot(page: Page, name: string) {
  const viewport = page.viewportSize()!;
  for (let attempt = 0; attempt < 3; attempt++) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    if (height === page.viewportSize()!.height) break;
    await page.setViewportSize({ width: viewport.width, height });
    await page.waitForTimeout(300);
  }
  // Two consecutive captures of a very tall viewport (Réglages: ~14 000 px
  // on a phone) take longer than the default 15 s.
  await expect(page).toHaveScreenshot(name, { timeout: 60_000 });
  // Aucune violation de la politique de contenu sur l'écran capturé.
  expect(await cspViolations(page), `violations CSP sur ${name}`).toEqual([]);
  await page.setViewportSize(viewport);
}

async function captureScreenAndTabs(page: Page, baseName: string, hasTabs = false) {
  await waitForContent(page);
  if (hasTabs) await page.locator('main [role="tablist"]').first().waitFor();
  await resetHorizontalScroll(page);
  await expectFullPageScreenshot(page, `${baseName}.png`);

  const tabs = page.locator('main [role="tablist"]').first().locator('[role="tab"]');
  const count = await tabs.count();
  for (let index = 0; index < count; index++) {
    const tab = tabs.nth(index);
    if (!(await tab.isVisible()) || (await tab.getAttribute('aria-selected')) === 'true') continue;
    const label = slugOf((await tab.innerText()).trim());
    await tab.click();
    // La vue de l'onglet doit être montée avant d'attendre son contenu.
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    // The pointer would stay on the clicked tab: its hover and press
    // transitions would then be captured at a random point.
    await page.mouse.move(0, 0);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await waitForContent(page);
    await resetHorizontalScroll(page);
    const [name, theme] = splitTheme(baseName);
    await expectFullPageScreenshot(page, `${name}--tab${index}-${label}--${theme}.png`);
  }
  expectStableApi(page);
}

const splitTheme = (baseName: string): [string, string] => {
  const separator = baseName.lastIndexOf('--');
  return [baseName.slice(0, separator), baseName.slice(separator + 2)];
};

test.describe('public', () => {
  for (const screen of PUBLIC_SCREENS) {
    for (const theme of THEMES) {
      test(`${screen.name} (${theme})`, async ({ page }) => {
        await useTheme(page, theme);
        await installSeedNoiseFilter(page);
        await installCaptureGuards(page);
        await page.goto(screen.path);
        await captureScreenAndTabs(page, `public--${screen.name}--${theme}`, screen.tabs);
      });
    }
  }
});

for (const [role, screens] of Object.entries(SCREENS_BY_ROLE) as [Role, Screen[]][]) {
  test.describe(role, () => {
    test.use({ storageState: storageStateOf(role) });
    for (const screen of screens) {
      for (const theme of THEMES) {
        test(`${screen.name} (${theme})`, async ({ page }) => {
          await useTheme(page, theme);
          await installSeedNoiseFilter(page);
          await installCaptureGuards(page);
          await page.goto(screen.path);
          await captureScreenAndTabs(page, `${role}--${screen.name}--${theme}`, screen.tabs);
        });
      }
    }
  });
}

import { expect, test as base, type Locator, type Page } from '@playwright/test';
import type { CaptureOptions } from '../playwright.config';
import {
  ADMIN_PATH,
  cspViolations,
  expectStableApi,
  installCaptureGuards,
  installSeedNoiseFilter,
  readFixtures,
  resetHorizontalScroll,
  storageStateOf,
  THEMES,
  useTheme,
  waitForContent,
  type Role,
  type Theme,
} from '../support/reference';
import { GLASS_KEYS, keyTag, SCREENS } from '../support/screens';

// Référence visuelle de chaque écran, par rôle, thème et format (bureau,
// mobile), onglets de premier niveau compris ; plus les captures du verre.
// `npm run visual:baseline` sur la révision de référence, puis `npm run
// visual` sur le code modifié : tout pixel différent échoue, le rapport HTML
// montre l'écart. Chaque projet « captures-i » ne garde que les écrans de son
// environnement (playwright.config.ts).
//
// Série réduite pendant le travail (jamais pour une fusion) :
// `npm run visual:quick -- <filtre>` = écrans dont la clé contient le filtre,
// thème clair seulement, sans le verre.
// `role` : session utilisée (aucune pour les écrans publics), chargée pour
// l'environnement du projet.
const test = base.extend<CaptureOptions & { role: Role | null }>({
  envIndex: [0, { option: true }],
  role: [null, { option: true }],
  storageState: async ({ role, envIndex }, use) => use(role ? storageStateOf(role, envIndex) : undefined),
});

const QUICK = process.env.HUB_CAPTURE_QUICK;
const themes: Theme[] = QUICK !== undefined ? ['light'] : THEMES;
const retenu = (key: string) => QUICK === undefined || key.includes(QUICK);

const VIEWPORTS = {
  'visual-desktop': { viewport: { width: 1440, height: 900 } },
  'visual-mobile': { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
} as const;
type Folder = keyof typeof VIEWPORTS | 'visual-glass';

const fixtures = readFixtures();

// Les libellés d'onglets portent des compteurs qui changent avec les données :
// le nom de fichier n'en garde que les premiers mots (l'index le rend unique).
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

// Le mode pleine page redimensionne la fenêtre pendant la capture, ce qui
// recalcule les espaces en vh et les en-têtes collants mesurés par
// ResizeObserver : la hauteur bascule alors entre deux valeurs. La fenêtre est
// dimensionnée au document une fois stable, puis capturée simplement.
async function expectFullPageScreenshot(page: Page, folder: Folder, name: string) {
  const viewport = page.viewportSize()!;
  for (let attempt = 0; attempt < 3; attempt++) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    if (height === page.viewportSize()!.height) break;
    await page.setViewportSize({ width: viewport.width, height });
    await page.waitForTimeout(300);
  }
  // Deux captures successives d'une fenêtre très haute (Réglages : ~14 000 px
  // sur téléphone) prennent plus que les 15 s par défaut.
  await expect(page).toHaveScreenshot([folder, name], { timeout: 60_000 });
  // Aucune violation de la politique de contenu sur l'écran capturé.
  expect(await cspViolations(page), `violations CSP sur ${name}`).toEqual([]);
  await page.setViewportSize(viewport);
}

async function captureScreenAndTabs(page: Page, folder: Folder, baseName: string, theme: Theme, hasTabs: boolean) {
  await waitForContent(page);
  if (hasTabs) await page.locator('main [role="tablist"]').first().waitFor();
  await resetHorizontalScroll(page);
  await expectFullPageScreenshot(page, folder, `${baseName}--${theme}.png`);

  const tabs = page.locator('main [role="tablist"]').first().locator('[role="tab"]');
  const count = await tabs.count();
  for (let index = 0; index < count; index++) {
    const tab = tabs.nth(index);
    if (!(await tab.isVisible()) || (await tab.getAttribute('aria-selected')) === 'true') continue;
    const label = slugOf((await tab.innerText()).trim());
    await tab.click();
    // La vue de l'onglet doit être montée avant d'attendre son contenu.
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    // Le pointeur resterait sur l'onglet cliqué : ses transitions de survol et
    // d'appui seraient capturées à un instant quelconque.
    await page.mouse.move(0, 0);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await waitForContent(page);
    await resetHorizontalScroll(page);
    await expectFullPageScreenshot(page, folder, `${baseName}--tab${index}-${label}--${theme}.png`);
  }
  expectStableApi(page);
}

for (const screen of SCREENS.filter((s) => retenu(s.key))) {
  test.describe(keyTag(screen.key), () => {
    test.use({ role: screen.role === 'public' ? null : screen.role });
    for (const [folder, options] of Object.entries(VIEWPORTS) as [keyof typeof VIEWPORTS, object][]) {
      test.describe(folder, () => {
        test.use(options);
        for (const theme of themes) {
          test(theme, async ({ page, envIndex }) => {
            test.skip(screen.name === 'finances-projet' && !fixtures.invoicedProjectId, 'aucun projet facturé');
            await useTheme(page, theme);
            await installSeedNoiseFilter(page, envIndex);
            await installCaptureGuards(page);
            await page.goto(screen.path(fixtures));
            const prefix = screen.role === 'public' ? 'public' : screen.role;
            await captureScreenAndTabs(page, folder, `${prefix}--${screen.name}`, theme, !!screen.tabs);
          });
        }
      });
    }
  });
}

// Verre : le flou d'arrière-plan est la signature de l'application. Les
// captures ci-dessus le retirent (son lissage varie d'un lancement à
// l'autre) ; celles-ci le gardent, avec une tolérance d'environ 1 % de pixels
// différents au lieu d'une égalité stricte. Bureau, compte CEO.
const GLASS_TOLERANCE = { maxDiffPixelRatio: 0.01, timeout: 60_000 };

async function openGlass(page: Page, envIndex: number, theme: Theme, path: string) {
  await useTheme(page, theme);
  await installSeedNoiseFilter(page, envIndex);
  await installCaptureGuards(page, { blur: true });
  await page.goto(path);
  await waitForContent(page);
}

const glass = (target: Page | Locator, name: string) =>
  expect(target).toHaveScreenshot(['visual-glass', name], GLASS_TOLERANCE);

const GLASS: { key: string; run: (page: Page, envIndex: number, theme: Theme) => Promise<void> }[] = [
  {
    key: 'glass/barre-laterale-entete',
    run: async (page, envIndex, theme) => {
      await openGlass(page, envIndex, theme, ADMIN_PATH);
      await glass(page.locator('.admin-sidebar'), `barre-laterale--${theme}.png`);
      await glass(page.locator('.admin-topbar'), `en-tete--${theme}.png`);
    },
  },
  {
    key: 'glass/modale',
    run: async (page, envIndex, theme) => {
      await openGlass(page, envIndex, theme, ADMIN_PATH);
      await page.getByRole('button', { name: 'Rechercher' }).click();
      await expect(page.getByRole('dialog', { name: 'Recherche' })).toBeVisible();
      await glass(page, `modale--${theme}.png`);
    },
  },
  {
    key: 'glass/portail',
    run: async (page, envIndex, theme) => {
      await openGlass(page, envIndex, theme, '/');
      await glass(page, `portail--${theme}.png`);
    },
  },
  {
    key: 'glass/dossier-projet',
    run: async (page, envIndex, theme) => {
      await openGlass(page, envIndex, theme, `${ADMIN_PATH}/projets?projet=${fixtures.openedProjectId}`);
      await glass(page.getByRole('region', { name: 'Dossier projet' }), `dossier-projet--${theme}.png`);
    },
  },
];

// La répartition entre environnements lit GLASS_KEYS : les deux listes vont ensemble.
if (GLASS.map((g) => g.key).join() !== GLASS_KEYS.join()) throw new Error('GLASS et GLASS_KEYS divergent');

if (QUICK === undefined) {
  for (const { key, run } of GLASS) {
    test.describe(keyTag(key), () => {
      test.use({ role: 'ceo', ...VIEWPORTS['visual-desktop'] });
      for (const theme of THEMES) {
        test(theme, async ({ page, envIndex }) => {
          await run(page, envIndex, theme);
          expectStableApi(page);
        });
      }
    });
  }
}

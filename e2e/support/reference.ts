import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type APIResponse, type Page, type Request, type Route } from '@playwright/test';

export const COMPANY_SLUG = 'grey-concrete';
export const DEMO_PASSWORD = 'changeme123';
export const ADMIN_PATH = `/admin/${COMPANY_SLUG}`;

export type Role = 'ceo' | 'cio' | 'cfo' | 'salarie';
export type Theme = 'dark' | 'light';
export const THEMES: Theme[] = ['dark', 'light'];

export type Fixtures = {
  devisToken: string;
  contratToken: string;
  openedProjectId: string;
  assignedTaskIds: string[];
  invoicedProjectId: string | null;
};

const STATE_DIR = join(__dirname, '..', '.state');

// Written by scripts/reference-scenario.mjs when the environment comes up.
export function readFixtures(): Fixtures {
  return JSON.parse(readFileSync(join(STATE_DIR, 'fixtures.json'), 'utf8')) as Fixtures;
}

export const storageStateOf = (role: Role): string => join(STATE_DIR, 'auth', `${role}.json`);

// Same key as frontend/lib/theme.ts, set before any script of the page runs.
export async function useTheme(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem('hub_theme', value);
    } catch {
      // Storage blocked: the page falls back to its default theme.
    }
  }, theme);
}

const LOADING_MARKERS = '.skeleton, .admin-skeleton, .auth-squelette, .auth-carte--squelette';

// Pages fetch on the client: wait for the loading placeholders to go away and
// for the network to settle (bounded: the notification poll never stops).
export async function waitForContent(page: Page): Promise<void> {
  await page.waitForLoadState('load');
  await page.waitForFunction((selector) => document.querySelectorAll(selector).length === 0, LOADING_MARKERS, {
    timeout: 30_000,
  });
  // KPI tiles show « … » while their figure loads.
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('main *')].some(
        (element) => element.childElementCount === 0 && element.textContent?.trim() === '…',
      ),
    undefined,
    { timeout: 30_000 },
  );
  if (pendingByPage.has(page)) await waitForApiIdle(page);
  else await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
}

// Requêtes de l'API en cours, par page (filtre de installSeedNoiseFilter).
// Une section sans indicateur de chargement (cartes d'un projet) se capturait
// parfois avant sa réponse : on attend qu'il n'en reste aucune, deux relevés
// de suite. Le flux du chat (SSE) reste ouvert en permanence : non compté.
const pendingByPage = new WeakMap<Page, Set<string>>();
const STREAMING = /\/chat\/flux\b/;

async function waitForApiIdle(page: Page): Promise<void> {
  const pending = pendingByPage.get(page)!;
  const deadline = Date.now() + 30_000;
  let quiet = 0;
  while (quiet < 2) {
    if (Date.now() > deadline) throw new Error(`requêtes de l'API toujours en cours :\n${[...pending].join('\n')}`);
    quiet = pending.size === 0 ? quiet + 1 : 0;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

// Normalises what legitimately differs between two runs of the same revision,
// so that only code changes show up as diffs:
//   - the time of day the seed wrote its rows ("calculé le … 03:32", journal):
//     API timestamps are moved to midnight UTC (Dakar time) of the same day,
//     in the JSON itself, before the page renders anything, and the browser
//     clock is fixed at noon of the run day so relative labels stay equal;
//   - avatar colours, derived from ids the seed generates at random.
const API_ORIGIN = process.env.HUB_E2E_API_URL ?? 'http://localhost:3101';
const ISO_TIMESTAMP = /"(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z"/g;

// Violations de la politique de contenu (CSP) relevées par le navigateur,
// et feuille de style des captures : sans transition ni animation, un état
// intermédiaire ne peut plus être capturé (pastilles, survol, défilement).
// `blur` : garde le flou d'arrière-plan (captures du verre, projet
// visual-glass) ; ailleurs il est retiré, voir plus bas.
export async function installCaptureGuards(page: Page, { blur = false }: { blur?: boolean } = {}): Promise<void> {
  await page.addInitScript((garderFlou) => {
    const violations: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = violations;
    document.addEventListener('securitypolicyviolation', (e) =>
      violations.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
    const figer = () => {
      const style = document.createElement('style');
      style.textContent =
        '*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }' +
        // Texte posé sur un calque flouté (verre), à une position fractionnaire :
        // son lissage bascule entre deux rendus d'un lancement du navigateur à
        // l'autre (pastille active des sélecteurs de vue, dossier d'un projet
        // ouvert). Le flou d'arrière-plan est donc retiré des captures : mise en
        // page, textes et couleurs restent comparés. Le flou lui-même a ses
        // propres captures, avec une tolérance (projet visual-glass).
        (garderFlou
          ? ''
          : '*, *::before, *::after { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }');
      document.head.append(style);
    };
    if (document.head) figer();
    else document.addEventListener('DOMContentLoaded', figer);
  }, blur);
}

export async function cspViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? []);
}

// Nouvelles tentatives des requêtes de l'API. Elles stabilisent les captures,
// mais un échec qui se répète peut révéler un défaut du back : chacune est
// consignée dans le rapport (annotation « nouvelle tentative »), et le test
// échoue au-delà de MAX_RETRIES_PER_TEST, ou si une requête échoue encore
// après sa dernière tentative (expectStableApi).
const MAX_ATTEMPTS = 3;
const MAX_RETRIES_PER_TEST = 2;
type Retry = { request: string; error: string; final: boolean };
const retriesByPage = new WeakMap<Page, Retry[]>();

function recordRetry(page: Page, request: Request, error: string, final: boolean) {
  const retry = { request: `${request.method()} ${request.url()}`, error, final };
  retriesByPage.set(page, [...(retriesByPage.get(page) ?? []), retry]);
  try {
    test.info().annotations.push({
      type: final ? 'requête en échec' : 'nouvelle tentative',
      description: `${retry.request} — ${error}`,
    });
  } catch {
    // Hors d'un test (page encore ouverte après sa fin) : rien à consigner.
  }
}

export function expectStableApi(page: Page): void {
  const retries = retriesByPage.get(page) ?? [];
  const lines = retries.map((r) => `${r.final ? 'ÉCHEC' : 'nouvelle tentative'} : ${r.request} — ${r.error}`);
  expect(
    retries.filter((r) => r.final),
    `requêtes en échec malgré les nouvelles tentatives\n${lines.join('\n')}`,
  ).toEqual([]);
  expect(retries.length, `trop de nouvelles tentatives\n${lines.join('\n')}`).toBeLessThanOrEqual(MAX_RETRIES_PER_TEST);
}

export async function installSeedNoiseFilter(page: Page): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await page.clock.setFixedTime(new Date(`${today}T12:00:00Z`));
  const pending = new Set<string>();
  pendingByPage.set(page, pending);
  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const key = `${route.request().method()} ${route.request().url()} #${Math.random()}`;
    if (!STREAMING.test(route.request().url())) pending.add(key);
    try {
      await serve(route);
    } finally {
      pending.delete(key);
    }
  });
  async function serve(route: Route) {
    // A failed fetch is retried (and recorded, see expectStableApi): aborting
    // it would leave the screen loading until the capture times out. Requests
    // still in flight when the test ends (polling) are dropped once the page
    // is closed.
    let response: APIResponse | null = null;
    let error = '';
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !response && !page.isClosed(); attempt++) {
      if (attempt) {
        recordRetry(page, route.request(), error, false);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      response = await route.fetch().catch((e: unknown) => {
        error = (e instanceof Error ? e.message : String(e)).split('\n')[0];
        return null;
      });
    }
    if (!response) {
      if (!page.isClosed()) recordRetry(page, route.request(), error, true);
      return route.abort().catch(() => undefined);
    }
    const isJson = (response.headers()['content-type'] ?? '').includes('application/json');
    if (!isJson) return route.fulfill({ response }).catch(() => undefined);
    const body = (await response.text()).replace(ISO_TIMESTAMP, '"$1T00:00:00.000Z"');
    await route.fulfill({ response, body }).catch(() => undefined);
  }
  await page.addInitScript(() => {
    const neutraliseAvatars = (root: ParentNode) => {
      for (const avatar of root.querySelectorAll<HTMLElement>('.av, .eq-avatar')) {
        // Guarded: re-setting the same style would notify the observer again.
        if (avatar.style.backgroundColor && avatar.style.backgroundColor !== 'rgb(128, 128, 128)')
          avatar.style.background = '#808080';
      }
    };
    const start = () => {
      neutraliseAvatars(document);
      new MutationObserver(() => neutraliseAvatars(document)).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['style'],
      });
    };
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
  });
}

// Horizontal scroll positions of tab bars and chip rows depend on focus timing
// after a tab click, and smooth scrolling can still be running when the
// capture starts: scrolling is made instant, then reset to the start.
export async function resetHorizontalScroll(page: Page): Promise<void> {
  const reset = () =>
    page.evaluate(() => {
      if (!document.getElementById('capture-instant-scroll')) {
        const style = document.createElement('style');
        style.id = 'capture-instant-scroll';
        style.textContent = '* { scroll-behavior: auto !important; }';
        document.head.append(style);
      }
      for (const element of document.querySelectorAll<HTMLElement>('*')) {
        if (element.scrollLeft !== 0) element.scrollLeft = 0;
      }
    });
  await reset();
  await page.waitForTimeout(300);
  await reset();
}

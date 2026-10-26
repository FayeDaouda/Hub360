import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

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
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
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
export async function installCaptureGuards(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const violations: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = violations;
    document.addEventListener('securitypolicyviolation', (e) =>
      violations.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
    const figer = () => {
      const style = document.createElement('style');
      style.textContent =
        '*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }';
      document.head.append(style);
    };
    if (document.head) figer();
    else document.addEventListener('DOMContentLoaded', figer);
  });
}

export async function cspViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? []);
}

export async function installSeedNoiseFilter(page: Page): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await page.clock.setFixedTime(new Date(`${today}T12:00:00Z`));
  await page.route(`${API_ORIGIN}/**`, async (route) => {
    // Polling requests still in flight when a test ends are simply dropped.
    const response = await route.fetch().catch(() => null);
    if (!response) return route.abort().catch(() => undefined);
    const isJson = (response.headers()['content-type'] ?? '').includes('application/json');
    if (!isJson) return route.fulfill({ response }).catch(() => undefined);
    const body = (await response.text()).replace(ISO_TIMESTAMP, '"$1T00:00:00.000Z"');
    await route.fulfill({ response, body }).catch(() => undefined);
  });
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

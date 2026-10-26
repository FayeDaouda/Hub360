import { ADMIN_PATH, COMPANY_SLUG, type Fixtures, type Role } from './reference';

// Écrans capturés, par rôle. Chaque écran a une clé stable (« rôle/nom ») qui
// décide de l'environnement où il est capturé (envOf) : ajouter un écran ne
// déplace pas les autres d'un environnement à l'autre.

// `tabs` : la page a une liste d'onglets de premier niveau, rendue une fois ses
// données chargées ; la capture l'attend au lieu de deviner.
export type Screen = {
  key: string;
  role: Role | 'public';
  name: string;
  path: (f: Fixtures) => string;
  tabs?: boolean;
};

const screen = (role: Screen['role'], name: string, path: Screen['path'], tabs = false): Screen => ({
  key: `${role}/${name}`,
  role,
  name,
  path,
  tabs,
});

export const SCREENS: Screen[] = [
  screen('public', 'portal', () => '/'),
  screen('public', 'login', () => `/login/${COMPANY_SLUG}`),
  screen('public', 'login-unknown-company', () => '/login/societe-inconnue'),
  screen('public', 'forgotten-password', () => '/mot-de-passe-oublie'),
  screen('public', 'activate-without-token', () => '/activer'),
  screen('public', 'reset-without-token', () => '/reinitialiser'),
  screen('public', 'public-devis', (f) => `/devis/${f.devisToken}`),
  screen('public', 'public-contrat', (f) => `/contrat/${f.contratToken}`),

  screen('ceo', 'pilotage', () => ADMIN_PATH, true),
  screen('ceo', 'crm', () => `${ADMIN_PATH}/crm`, true),
  screen('ceo', 'projets', () => `${ADMIN_PATH}/projets`, true),
  screen('ceo', 'projets-production', () => `${ADMIN_PATH}/projets?vue=production`, true),
  screen('ceo', 'projet-ouvert', (f) => `${ADMIN_PATH}/projets?projet=${f.openedProjectId}`, true),
  screen('ceo', 'finances', () => `${ADMIN_PATH}/facturation`, true),
  // Capturé seulement si le scénario a facturé un projet (sinon ignoré).
  screen('ceo', 'finances-projet', (f) => `${ADMIN_PATH}/facturation/projets/${f.invoicedProjectId}`),
  screen('ceo', 'rh', () => `${ADMIN_PATH}/rh`, true),
  screen('ceo', 'equipe', () => `${ADMIN_PATH}/equipe`, true),
  screen('ceo', 'mon-espace', () => `${ADMIN_PATH}/mon-espace`, true),
  screen('ceo', 'mes-reglages', () => `${ADMIN_PATH}/mes-reglages`),

  screen('salarie', 'mes-taches', () => `${ADMIN_PATH}/mes-taches`),
  screen('salarie', 'projets', () => `${ADMIN_PATH}/projets`, true),
  screen('salarie', 'mon-espace', () => `${ADMIN_PATH}/mon-espace`, true),
  screen('salarie', 'mes-reglages', () => `${ADMIN_PATH}/mes-reglages`),

  // Écrans que seul l'administrateur du HUB atteint.
  screen('cio', 'reglages', () => `${ADMIN_PATH}/reglages`, true),
  screen('cio', 'groupe', () => '/groupe'),
];

// Captures du verre (flou d'arrière-plan gardé, tolérance), en bureau.
export const GLASS_KEYS = ['glass/barre-laterale-entete', 'glass/modale', 'glass/portail', 'glass/dossier-projet'];

export const ALL_KEYS = [...SCREENS.map((s) => s.key), ...GLASS_KEYS];

// Environnement d'une clé : hachage FNV-1a du nom, modulo le nombre
// d'environnements. Ne dépend que de la clé, jamais de la position.
export function envOf(key: string, count: number): number {
  let hash = 0x811c9dc5;
  for (const char of key) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % count;
}

// Titre de test qui porte la clé : la répartition se fait par `grep`.
export const keyTag = (key: string) => `[${key}]`;

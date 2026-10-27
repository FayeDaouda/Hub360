// Le projet dans la vue Projets : back-office (?projet=) ou espace collaborateur.
export const projectHref = (base: string, projectId: string) =>
  base.startsWith('/admin') ? `${base}/projets?projet=${projectId}` : `${base}/projets/${projectId}`;

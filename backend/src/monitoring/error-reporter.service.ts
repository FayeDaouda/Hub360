import { Injectable } from '@nestjs/common';
import { formatDateTime, plural } from '@hub/domain';
import { EmailService } from '../email/email.service';

// Une erreur à suivre : une réponse 5xx de l'API, une erreur du serveur hors
// requête (tâche planifiée, envoi d'e-mail…), ou une erreur remontée par le
// navigateur d'un utilisateur connecté.
export type ErrorEvent = {
  source: 'api' | 'serveur' | 'navigateur';
  // Modèle de route (« /api/devis-public/:token »), jamais l'adresse réelle :
  // les liens publics portent leur jeton dans l'adresse. Hors requête : le
  // contexte du journal (« RappelsService »…).
  route: string;
  method?: string;
  status?: number;
  userId?: string;
  companyId?: string;
  message: string;
  stack?: string;
};

type Recorded = ErrorEvent & { at: Date };

// Fenêtre de regroupement des alertes : au plus un e-mail par période.
const ALERT_WINDOW_MS = 15 * 60_000;
// Erreurs détaillées dans un e-mail (les suivantes sont seulement comptées).
const ALERT_DETAILS = 20;

// Suivi des erreurs en production, sans service extérieur (piste
// Exploitation) : chaque erreur est écrite sur une ligne JSON dans les
// journaux du conteneur (`"suivi":"erreur"`), et, si ALERTES_EMAIL est
// renseignée, un e-mail résume les erreurs, au plus une fois par quart
// d'heure : la première part tout de suite, les suivantes sont regroupées.
@Injectable()
export class ErrorReporter {
  private pending: Recorded[] = [];
  private pendingCount = 0;
  private lastSentAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly email: EmailService) {}

  report(event: ErrorEvent): void {
    const at = new Date();
    process.stderr.write(
      `${JSON.stringify({
        suivi: 'erreur',
        date: at.toISOString(),
        source: event.source,
        methode: event.method,
        route: event.route,
        statut: event.status,
        utilisateur: event.userId,
        societe: event.companyId,
        message: event.message,
        pile: event.stack,
      })}\n`,
    );
    if (!process.env.ALERTES_EMAIL) return;
    this.pendingCount += 1;
    if (this.pending.length < ALERT_DETAILS) this.pending.push({ ...event, at });
    if (this.timer) return;
    const wait = Math.max(0, this.lastSentAt + ALERT_WINDOW_MS - Date.now());
    this.timer = setTimeout(() => void this.flush(), wait);
    this.timer.unref();
  }

  // Envoie le résumé des erreurs en attente (aussi appelé par les tests).
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const destinataire = process.env.ALERTES_EMAIL;
    if (!destinataire || this.pendingCount === 0) return;
    const [events, count] = [this.pending, this.pendingCount];
    this.pending = [];
    this.pendingCount = 0;
    this.lastSentAt = Date.now();
    await this.email.envoyerAlerte({ email: destinataire, ...alertContent(events, count) });
  }
}

const SOURCES: Record<ErrorEvent['source'], string> = { api: 'API', serveur: 'serveur', navigateur: 'navigateur' };

export function alertContent(events: Recorded[], count: number): { sujet: string; texte: string } {
  const lignes = events.map((e) =>
    [
      `${formatDateTime(e.at.toISOString())} · ${SOURCES[e.source]}`,
      [e.method, e.route, e.status].filter(Boolean).join(' '),
      e.message.slice(0, 300),
      e.userId ? `utilisateur ${e.userId}` : '',
    ]
      .filter(Boolean)
      .join('\n  '),
  );
  const autres = count - events.length;
  return {
    sujet: `[HUB] ${plural(count, 'erreur')} en production`,
    texte: [
      `${plural(count, 'erreur')} depuis la dernière alerte (heure de Dakar) :`,
      '',
      ...lignes.map((l) => `- ${l}`),
      ...(autres > 0 ? ['', `… et ${autres} de plus, dans les journaux du serveur.`] : []),
      '',
      'Détail complet (pile d’appels) : docker compose logs backend | grep \'"suivi":"erreur"\'',
    ].join('\n'),
  };
}

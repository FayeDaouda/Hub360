import { Injectable } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { interval, merge, Observable, Subject, timer } from 'rxjs';
import { filter, map, takeUntil } from 'rxjs/operators';

// Signal « tes notifications ont changé » (09/11/2026) : nouvelle, remise à
// jour ou lue sur un autre appareil. Il ne porte AUCUN contenu — l'écran
// relit son flux (GET …/notifications), seule source de vérité, avec ses
// droits. Mémoire du processus : suffisant pour un nœud unique (même limite
// que les tickets et le flux de la messagerie).
// `kind` : 'new' (créée ou remise à jour) déclenche aussi les notifications
// système ; 'read' (lue) ne fait que remettre les compteurs à jour.
export type SignalKind = 'new' | 'read';
export type NotificationSignal = { societeId: string; destinataireIds: string[]; kind: SignalKind };

const HEARTBEAT_MS = 25_000;
// Durée de vie d'une connexion : l'écran se reconnecte avec un ticket frais,
// donc avec les droits et le compte du moment (compte désactivé, déconnexion
// partout : plus de signaux au-delà).
export const STREAM_LIFETIME_MS = 15 * 60_000;

@Injectable()
export class NotificationsBus {
  private readonly stream$ = new Subject<NotificationSignal>();

  // Appelé APRÈS l'écriture (validée) des notifications.
  signal(societeId: string, destinataireIds: Iterable<string>, kind: SignalKind = 'new') {
    const ids = [...new Set(destinataireIds)];
    if (ids.length) this.stream$.next({ societeId, destinataireIds: ids, kind });
  }

  // Tous les signaux (notifications système : envoi sans attendre la tournée).
  all(): Observable<NotificationSignal> {
    return this.stream$.asObservable();
  }

  // Flux SSE d'une personne dans une société : ses signaux, plus un battement
  // qui tient la connexion à travers les proxys.
  forUser(userId: string, societeId: string): Observable<MessageEvent> {
    const signals$ = this.stream$.pipe(
      filter((s) => s.societeId === societeId && s.destinataireIds.includes(userId)),
      map((): MessageEvent => ({ type: 'notification', data: {} })),
    );
    const heartbeat$ = interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ type: 'ping', data: {} })));
    return merge(signals$, heartbeat$).pipe(takeUntil(timer(STREAM_LIFETIME_MS)));
  }
}

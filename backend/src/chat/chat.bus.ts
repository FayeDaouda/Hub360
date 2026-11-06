import { Injectable } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { TypeCanal } from '@prisma/client';
import { interval, merge, Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { ROLE_COMPANY_ADMIN } from '@hub/domain';

// Audience d'un événement de conversation : mêmes règles qu'AccesCanalGuard.
export type AudienceCanal = {
  societeId: string;
  canalId: string;
  canalType: TypeCanal;
  celluleId: string | null;
  participant1Id: string | null;
  participant2Id: string | null;
  // Groupe, projet : ses membres (seuls destinataires).
  membreIds: string[];
};

// Événements d'une conversation (02/11/2026) : message, message modifié ou
// supprimé, réactions, « en train d'écrire », lecture (« vu par »).
type EvtCanal = AudienceCanal & {
  kind: 'message' | 'message_modifie' | 'reactions' | 'frappe' | 'lecture';
  // Qui l'a provoqué : « frappe » ne revient pas à son auteur.
  parId?: string;
  data: Record<string, unknown>;
};

type EvtNonLus = {
  kind: 'non_lus';
  societeId: string;
  destinataireId: string; // notifie les AUTRES connexions du lecteur
  canalId: string;
  nonLus: number;
};

export type ChatEvt = EvtCanal | EvtNonLus;

export type Abonne = {
  userId: string;
  societeId: string;
  role: string;
  celluleId: string | null;
};

const BATTEMENT_MS = 25_000;

// Émetteur interne du chat. `ChatService` publie ici ; chaque connexion SSE
// s'abonne via `pour()` avec son contexte résolu une fois, et filtre en
// mémoire — mêmes règles qu'AccesCanalGuard, sans requête par événement.
@Injectable()
export class ChatBus {
  private readonly flux$ = new Subject<ChatEvt>();

  publier(evt: ChatEvt) {
    this.flux$.next(evt);
  }

  pour(abonne: Abonne): Observable<MessageEvent> {
    const evenements$ = this.flux$.pipe(
      filter((e) => e.societeId === abonne.societeId && this.visible(e, abonne)),
      map((e): MessageEvent => this.versSse(e)),
    );
    // Battement : tient la connexion ouverte à travers les proxys / timeouts.
    const battement$ = interval(BATTEMENT_MS).pipe(map((): MessageEvent => ({ type: 'ping', data: {} })));
    return merge(evenements$, battement$);
  }

  private visible(e: ChatEvt, a: Abonne): boolean {
    if (e.kind === 'non_lus') return e.destinataireId === a.userId;
    if (e.kind === 'frappe' && e.parId === a.userId) return false;
    if (e.canalType === TypeCanal.general) return true;
    if (e.canalType === TypeCanal.direct) {
      return a.userId === e.participant1Id || a.userId === e.participant2Id;
    }
    if (e.canalType === TypeCanal.groupe || e.canalType === TypeCanal.projet) return e.membreIds.includes(a.userId);
    // cellule
    return a.role === ROLE_COMPANY_ADMIN || a.celluleId === e.celluleId;
  }

  private versSse(e: ChatEvt): MessageEvent {
    if (e.kind === 'non_lus') return { type: 'non_lus', data: { canalId: e.canalId, nonLus: e.nonLus } };
    return { type: e.kind, data: { canalId: e.canalId, ...e.data } };
  }
}

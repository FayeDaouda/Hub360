import { Injectable } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { TypeCanal } from '@prisma/client';
import { interval, merge, Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import type { MessageRendu } from './chat.service';

type EvtMessage = {
  kind: 'message';
  societeId: string;
  canalId: string;
  canalType: TypeCanal;
  celluleId: string | null;
  participant1Id: string | null;
  participant2Id: string | null;
  message: MessageRendu;
};

type EvtNonLus = {
  kind: 'non_lus';
  societeId: string;
  destinataireId: string; // notifie les AUTRES connexions du lecteur
  canalId: string;
  nonLus: number;
};

export type ChatEvt = EvtMessage | EvtNonLus;

export type Abonne = {
  userId: string;
  societeId: string;
  role: string;
  celluleId: string | null;
};

const BATTEMENT_MS = 25_000;

// Émetteur interne du chat. `ChatService` publie ici au moment de l'envoi / de
// la lecture ; chaque connexion SSE s'abonne via `pour()` avec son contexte
// résolu une fois, et filtre en mémoire — mêmes règles qu'AccesCanalGuard,
// sans requête par événement.
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
    const battement$ = interval(BATTEMENT_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: {} })),
    );
    return merge(evenements$, battement$);
  }

  private visible(e: ChatEvt, a: Abonne): boolean {
    if (e.kind === 'non_lus') return e.destinataireId === a.userId;
    if (e.canalType === TypeCanal.general) return true;
    if (e.canalType === TypeCanal.direct) {
      return a.userId === e.participant1Id || a.userId === e.participant2Id;
    }
    // cellule
    return a.role === 'societe_admin' || a.celluleId === e.celluleId;
  }

  private versSse(e: ChatEvt): MessageEvent {
    return e.kind === 'message'
      ? { type: 'message', data: { canalId: e.canalId, message: e.message } }
      : { type: 'non_lus', data: { canalId: e.canalId, nonLus: e.nonLus } };
  }
}

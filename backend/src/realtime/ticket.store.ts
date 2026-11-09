import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomBytes } from 'crypto';

// Flux que le ticket ouvre (09/11/2026) : un ticket « notifications » (tout
// membre) n'ouvre JAMAIS le flux de la messagerie (droit « communication »).
export type TicketStream = 'chat' | 'notifications';

export type TicketPayload = {
  stream: TicketStream;
  userId: string;
  societeId: string;
  societeSlug: string;
  role: string;
};

const TTL_MS = 60_000;

// Jetons d'accès au flux SSE : courts (60 s), usage unique. `EventSource` ne
// peut pas poser d'en-tête Authorization → le front récupère un jeton via
// POST …/chat/ticket ou …/notifications/ticket (Bearer normal), puis l'ajoute
// en ?token= de l'URL du flux correspondant (le seul qu'il ouvre).
// Store en mémoire — suffisant pour un nœud unique ; bus partagé le jour où le
// flux passe multi-nœuds (cf. artifact « Chat multi-canaux » §7).
@Injectable()
export class TicketStore implements OnModuleDestroy {
  private readonly tickets = new Map<string, { payload: TicketPayload; expire: number }>();
  private readonly balayage: NodeJS.Timeout;

  constructor() {
    this.balayage = setInterval(() => this.purger(), TTL_MS);
    this.balayage.unref?.();
  }

  onModuleDestroy() {
    clearInterval(this.balayage);
  }

  emettre(payload: TicketPayload): string {
    const token = randomBytes(24).toString('base64url');
    this.tickets.set(token, { payload, expire: Date.now() + TTL_MS });
    return token;
  }

  // Retire le jeton (usage unique) et renvoie le payload s'il est encore
  // valide, sinon null.
  consommer(token: string): TicketPayload | null {
    const entree = this.tickets.get(token);
    if (!entree) return null;
    this.tickets.delete(token);
    return Date.now() > entree.expire ? null : entree.payload;
  }

  private purger() {
    const maintenant = Date.now();
    for (const [token, { expire }] of this.tickets) {
      if (maintenant > expire) this.tickets.delete(token);
    }
  }
}

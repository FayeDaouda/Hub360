import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Limite de débit comptée par compte connecté (09/11/2026), pas par adresse
// IP : au bureau, derrière une même box, chacun garde sa propre limite. À
// poser APRÈS JwtAuthGuard (req.user connu) ; sans compte, l'IP sert.
@Injectable()
export class ThrottleParCompteGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { userId?: string } | undefined;
    return user?.userId ? `compte:${user.userId}` : String(req.ip);
  }
}

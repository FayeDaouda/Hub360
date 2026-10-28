import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { verifierMotDePasse } from './mot-de-passe';
import { dechiffrerSecret, hacherCodeSecours, verifierCode } from './totp';
import { doubleFacteurSuspendue } from './auth.service';

export type ModeConfirmation = 'code' | 'mot_de_passe';

// Confirmation d'identité avant une action sensible (revue CFO, 21/10/2026 :
// changer les coordonnées de paiement des factures). Une session volée ne
// suffit pas : il faut le code de l'application de double authentification
// si elle est active sur le compte (et pas suspendue), sinon le mot de passe.
@Injectable()
export class ConfirmationIdentiteService {
  constructor(private prisma: PrismaService) {}

  async mode(utilisateurId: string): Promise<ModeConfirmation> {
    const u = await this.prisma.utilisateur.findUnique({ where: { id: utilisateurId }, select: { totpActifLe: true } });
    return u?.totpActifLe && !doubleFacteurSuspendue() ? 'code' : 'mot_de_passe';
  }

  // Lève 403 si la preuve manque ou est fausse ; renvoie le mode vérifié.
  async verifier(utilisateurId: string, preuve: string | undefined | null): Promise<ModeConfirmation> {
    const u = await this.prisma.utilisateur.findUnique({ where: { id: utilisateurId } });
    if (!u?.actif) throw new ForbiddenException('Compte inactif.');
    const saisie = (preuve ?? '').trim();
    if (u.totpActifLe && !doubleFacteurSuspendue()) {
      if (!saisie) throw new ForbiddenException('Saisissez le code de votre application de double authentification.');
      const secret = u.totpSecret ? dechiffrerSecret(u.totpSecret) : null;
      if (!secret) throw new ForbiddenException('Double authentification indisponible : contactez le CIO.');
      if (/^\d{6}$/.test(saisie)) {
        const pas = verifierCode(secret, saisie, u.totpDernierPas);
        // Conditionnel : un même code ne sert qu'une fois.
        const ok =
          pas !== null &&
          (
            await this.prisma.utilisateur.updateMany({
              where: { id: u.id, OR: [{ totpDernierPas: null }, { totpDernierPas: { lt: pas } }] },
              data: { totpDernierPas: pas },
            })
          ).count > 0;
        if (!ok) throw new ForbiddenException('Code incorrect.');
      } else {
        const h = hacherCodeSecours(saisie);
        if (!u.totpCodesSecours.includes(h)) throw new ForbiddenException('Code incorrect.');
        await this.prisma.utilisateur.update({
          where: { id: u.id },
          data: { totpCodesSecours: u.totpCodesSecours.filter((x) => x !== h) },
        });
      }
      return 'code';
    }
    if (!saisie) throw new ForbiddenException('Saisissez votre mot de passe pour confirmer.');
    if (!u.motDePasseHash || !(await verifierMotDePasse(saisie, u.motDePasseHash)))
      throw new ForbiddenException('Mot de passe incorrect.');
    return 'mot_de_passe';
  }
}

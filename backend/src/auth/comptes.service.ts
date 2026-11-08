import { BadRequestException, Injectable } from '@nestjs/common';
import { EvenementCompteType, InvitationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService, type AvisSecurite } from '../email/email.service';
import { genererJeton, hacherJeton } from './jetons';
import { hacherMotDePasse } from './mot-de-passe';

const DUREE_MS: Record<InvitationType, number> = {
  invitation: 72 * 60 * 60 * 1000, // 72 h
  reset: 60 * 60 * 1000, //             1 h
};

@Injectable()
export class ComptesService {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  // Jeton d'invitation (72 h) + e-mail + journal. Utilisé par
  // l'Administration du HUB (création depuis un dossier RH, renvoi).
  async envoyerInvitation(
    utilisateurId: string,
    email: string,
    prenom: string,
    parId: string,
  ): Promise<{ lien: string; emailEnvoye: boolean }> {
    const clair = await this.emettreJeton('invitation', utilisateurId, email);
    await this.journal(utilisateurId, 'invitation_envoyee', parId, email);

    const lien = this.construireLien('invitation', clair);
    const { envoye } = await this.email.envoyerLienCompte({ type: 'invitation', email, lien, prenom });
    // `lien` reste renvoyé même si l'email est parti : repli si le transport
    // échoue plus tard / si l'admin doit le transmettre autrement.
    return { lien, emailEnvoye: envoye };
  }

  // -- « Mot de passe oublié » : réponse constante, quoi qu'il arrive ------
  async motDePasseOublie(email: string): Promise<void> {
    const u = await this.prisma.utilisateur.findUnique({ where: { email } });
    if (u && u.actif && u.motDePasseHash) {
      const clair = await this.emettreJeton('reset', u.id, email);
      await this.email.envoyerLienCompte({
        type: 'reset',
        email,
        lien: this.construireLien('reset', clair),
        prenom: u.prenom,
      });
    }
    // Aucune information renvoyée : l'appelant ne peut pas distinguer un email
    // connu d'un email inconnu (anti-énumération).
  }

  // -- Définir le mot de passe (activation OU reset) ---------------------
  async definirMotDePasse(token: string, motDePasse: string, contexte: InvitationType): Promise<void> {
    const inv = await this.lireJeton(token, contexte);
    const hash = await hacherMotDePasse(motDePasse);
    const maintenant = new Date();
    // Un lien ne rallume jamais un compte coupé (départ, désactivation), même
    // si la coupure tombe au même instant : dans une seule transaction, le
    // lien n'est pris qu'une fois (usedAt encore vide), puis le compte n'est
    // écrit que s'il est toujours dans l'état attendu :
    // - invitation : pas désactivé depuis l'envoi du lien ;
    // - nouveau mot de passe : actif, et il le reste (actif n'est pas écrit).
    // Refusé : le lien est brûlé quand même, et la réponse est celle d'un
    // lien expiré — rien n'est révélé sur le compte.
    const accepte = await this.prisma.$transaction(async (tx) => {
      const pris = await tx.invitation.updateMany({
        where: { id: inv.id, usedAt: null },
        data: { usedAt: maintenant },
      });
      if (pris.count !== 1) return false;
      const maj = await tx.utilisateur.updateMany({
        where:
          contexte === 'invitation'
            ? { id: inv.utilisateurId, OR: [{ desactiveLe: null }, { desactiveLe: { lt: inv.createdAt } }] }
            : { id: inv.utilisateurId, actif: true },
        data: {
          motDePasseHash: hash,
          // Activation : un état net (plus aucune trace d'une coupure passée).
          ...(contexte === 'invitation' ? { actif: true, desactiveLe: null, desactiveParId: null } : {}),
          // invalide toute session émise avant maintenant (reset surtout)
          sessionsValidesDepuis: maintenant,
        },
      });
      return maj.count === 1;
    });
    if (!accepte) throw new BadRequestException('Lien invalide ou expiré');
    await this.journal(inv.utilisateurId, contexte === 'invitation' ? 'compte_active' : 'mdp_reinitialise', null, '');
    if (contexte === 'reset') {
      const u = await this.prisma.utilisateur.findUnique({
        where: { id: inv.utilisateurId },
        select: { email: true, prenom: true },
      });
      if (u) this.avertirSecurite(u, 'mot_de_passe_reinitialise');
    }
  }

  // Avis de sécurité à la personne (lot A) : envoyé sans retarder la réponse ;
  // un échec d'envoi est journalisé par le transport, jamais bloquant.
  avertirSecurite(u: { email: string; prenom: string }, evenement: AvisSecurite['evenement']): void {
    void this.email.envoyerAvisSecurite({ email: u.email, prenom: u.prenom, evenement, le: new Date() });
  }

  // -- Internes --------------------------------------------------------

  private async emettreJeton(type: InvitationType, utilisateurId: string, email: string): Promise<string> {
    // Un nouveau jeton invalide les précédents non consommés du même (email, type).
    await this.prisma.invitation.updateMany({
      where: { email, type, usedAt: null },
      data: { usedAt: new Date() },
    });
    const { clair, hash } = genererJeton();
    await this.prisma.invitation.create({
      data: {
        tokenHash: hash,
        type,
        email,
        utilisateurId,
        expiresAt: new Date(Date.now() + DUREE_MS[type]),
      },
    });
    return clair;
  }

  // Lien reconnu, du bon type, ni utilisé ni expiré. Il n'est pris (usedAt)
  // que dans la transaction de definirMotDePasse.
  private async lireJeton(token: string, type: InvitationType) {
    const inv = await this.prisma.invitation.findUnique({
      where: { tokenHash: hacherJeton(token) },
    });
    if (
      !inv ||
      inv.type !== type ||
      inv.usedAt !== null ||
      inv.expiresAt.getTime() < Date.now() ||
      !inv.utilisateurId
    ) {
      throw new BadRequestException('Lien invalide ou expiré');
    }
    return { ...inv, utilisateurId: inv.utilisateurId };
  }

  private construireLien(type: InvitationType, clair: string): string {
    const base = process.env.FRONT_URL || 'http://localhost:3000';
    const chemin = type === 'invitation' ? '/activer' : '/reinitialiser';
    return `${base}${chemin}?token=${clair}`;
  }

  private journal(utilisateurId: string, type: EvenementCompteType, parId: string | null, detail: string) {
    return this.prisma.evenementCompte.create({
      data: { utilisateurId, type, parId, detail },
    });
  }
}

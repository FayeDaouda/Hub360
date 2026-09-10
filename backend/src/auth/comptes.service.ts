import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EvenementCompteType, InvitationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
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

  // -- Admin : invite un collaborateur ------------------------------------
  // Crée / réutilise le compte Utilisateur, le lie au Collaborateur, pose le
  // rôle `collaborateur` sur la société, émet un jeton d'invitation.
  async inviter(
    societeId: string,
    collaborateurId: string,
    email: string,
    parId: string,
  ): Promise<{ lien: string; emailEnvoye: boolean }> {
    const collab = await this.prisma.collaborateur.findFirst({
      where: { id: collaborateurId, societeId },
    });
    if (!collab) throw new NotFoundException('Collaborateur introuvable');

    let utilisateur = await this.prisma.utilisateur.findUnique({ where: { email } });
    if (!utilisateur) {
      utilisateur = await this.prisma.utilisateur.create({
        data: {
          email,
          prenom: collab.prenom,
          nom: collab.nom,
          motDePasseHash: null,
          actif: false,
        },
      });
    }

    const role = await this.prisma.role.findUniqueOrThrow({
      where: { nom: 'collaborateur' },
    });
    await this.prisma.utilisateurSocieteRole.upsert({
      where: {
        utilisateurId_societeId_roleId: {
          utilisateurId: utilisateur.id,
          societeId,
          roleId: role.id,
        },
      },
      update: {},
      create: { utilisateurId: utilisateur.id, societeId, roleId: role.id },
    });

    if (collab.utilisateurId !== utilisateur.id) {
      await this.prisma.collaborateur.update({
        where: { id: collab.id },
        data: { utilisateurId: utilisateur.id },
      });
    }

    const clair = await this.emettreJeton('invitation', utilisateur.id, email);
    await this.journal(utilisateur.id, 'invitation_envoyee', parId, email);

    const lien = this.construireLien('invitation', clair);
    const { envoye } = await this.email.envoyerLienCompte({
      type: 'invitation',
      email,
      lien,
      prenom: collab.prenom,
    });
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
  async definirMotDePasse(
    token: string,
    motDePasse: string,
    contexte: InvitationType,
  ): Promise<void> {
    const inv = await this.consommer(token, contexte);
    const hash = await hacherMotDePasse(motDePasse);
    await this.prisma.utilisateur.update({
      where: { id: inv.utilisateurId! },
      data: {
        motDePasseHash: hash,
        actif: true,
        // invalide toute session émise avant maintenant (reset surtout)
        sessionsValidesDepuis: new Date(),
      },
    });
    await this.journal(
      inv.utilisateurId!,
      contexte === 'invitation' ? 'compte_active' : 'mdp_reinitialise',
      null,
      '',
    );
  }

  // -- Internes --------------------------------------------------------

  private async emettreJeton(
    type: InvitationType,
    utilisateurId: string,
    email: string,
  ): Promise<string> {
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

  private async consommer(token: string, type: InvitationType) {
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
    await this.prisma.invitation.update({
      where: { id: inv.id },
      data: { usedAt: new Date() },
    });
    return inv;
  }

  private construireLien(type: InvitationType, clair: string): string {
    const base = process.env.FRONT_URL || 'http://localhost:3000';
    const chemin = type === 'invitation' ? '/activer' : '/reinitialiser';
    return `${base}${chemin}?token=${clair}`;
  }

  private journal(
    utilisateurId: string,
    type: EvenementCompteType,
    parId: string | null,
    detail: string,
  ) {
    return this.prisma.evenementCompte.create({
      data: { utilisateurId, type, parId, detail },
    });
  }
}

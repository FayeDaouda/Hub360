import { BadRequestException } from '@nestjs/common';
import { ComptesService } from './comptes.service';
import { genererJeton } from './jetons';
import type { PrismaService } from '../prisma/prisma.service';
import type { EmailService } from '../email/email.service';

// Un lien (invitation, nouveau mot de passe) ne rallume jamais un compte coupé
// par un départ ou une désactivation (08/11/2026), même au même instant : le
// lien est pris et le compte écrit dans une seule transaction, sous
// condition. Refusé : même réponse qu'un lien expiré.

const EMIS_LE = new Date('2026-11-08T08:00:00Z');

function service(o: {
  type: 'invitation' | 'reset';
  lienLibre?: boolean; // le lien n'a pas été pris entre-temps
  compteConforme?: boolean; // le compte est encore dans l'état attendu
}) {
  const { clair, hash } = genererJeton();
  const prendreLien = jest.fn().mockResolvedValue({ count: o.lienLibre === false ? 0 : 1 });
  const ecrireCompte = jest.fn().mockResolvedValue({ count: o.compteConforme === false ? 0 : 1 });
  const journal = jest.fn().mockResolvedValue({});
  const prisma = {
    invitation: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'I1',
        tokenHash: hash,
        type: o.type,
        email: 'awa@x.sn',
        utilisateurId: 'U1',
        usedAt: null,
        createdAt: EMIS_LE,
        expiresAt: new Date(Date.now() + 3_600_000),
      }),
    },
    utilisateur: { findUnique: jest.fn().mockResolvedValue({ email: 'awa@x.sn', prenom: 'Awa' }) },
    evenementCompte: { create: journal },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
      fn({ invitation: { updateMany: prendreLien }, utilisateur: { updateMany: ecrireCompte } }),
    ),
  };
  const email = { envoyerAvisSecurite: jest.fn().mockResolvedValue(undefined) };
  const svc = new ComptesService(prisma as unknown as PrismaService, email as unknown as EmailService);
  return { svc, clair, prendreLien, ecrireCompte, journal, email };
}

const MDP = 'un-mot-de-passe-solide';

describe('ComptesService.definirMotDePasse — un lien ne rallume pas un compte coupé', () => {
  it('invitation : prend le lien une seule fois et active le compte s’il n’a pas été coupé depuis l’envoi', async () => {
    const { svc, clair, prendreLien, ecrireCompte, journal } = service({ type: 'invitation' });
    await svc.definirMotDePasse(clair, MDP, 'invitation');
    expect(prendreLien).toHaveBeenCalledWith({ where: { id: 'I1', usedAt: null }, data: { usedAt: expect.any(Date) } });
    expect(ecrireCompte).toHaveBeenCalledWith({
      where: { id: 'U1', OR: [{ desactiveLe: null }, { desactiveLe: { lt: EMIS_LE } }] },
      data: expect.objectContaining({ actif: true, desactiveLe: null, motDePasseHash: expect.any(String) }),
    });
    expect(journal.mock.calls[0][0].data).toMatchObject({ type: 'compte_active' });
  });

  it('nouveau mot de passe : seulement sur un compte actif, sans écrire son état', async () => {
    const { svc, clair, ecrireCompte, email } = service({ type: 'reset' });
    await svc.definirMotDePasse(clair, MDP, 'reset');
    const appel = ecrireCompte.mock.calls[0][0];
    expect(appel.where).toEqual({ id: 'U1', actif: true });
    expect(appel.data).not.toHaveProperty('actif');
    expect(email.envoyerAvisSecurite).toHaveBeenCalled();
  });

  it.each(['invitation', 'reset'] as const)(
    '%s : compte coupé entre-temps → « Lien invalide ou expiré », rien n’est journalisé',
    async (type) => {
      const { svc, clair, journal } = service({ type, compteConforme: false });
      await expect(svc.definirMotDePasse(clair, MDP, type)).rejects.toThrow(
        new BadRequestException('Lien invalide ou expiré'),
      );
      expect(journal).not.toHaveBeenCalled();
    },
  );

  it('lien déjà pris par une autre requête (ou annulé par un départ) : refusé, le compte n’est pas écrit', async () => {
    const { svc, clair, ecrireCompte } = service({ type: 'invitation', lienLibre: false });
    await expect(svc.definirMotDePasse(clair, MDP, 'invitation')).rejects.toThrow('Lien invalide ou expiré');
    expect(ecrireCompte).not.toHaveBeenCalled();
  });
});

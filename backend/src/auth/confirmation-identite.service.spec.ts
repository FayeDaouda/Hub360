import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfirmationIdentiteService } from './confirmation-identite.service';
import { hacherMotDePasse } from './mot-de-passe';
import { base32, chiffrerSecret, codeAuPas, hacherCodeSecours, pasCourant } from './totp';

const SECRET = base32(Buffer.from('12345678901234567890'));

describe('ConfirmationIdentiteService (coordonnées de paiement, revue CFO)', () => {
  async function svc(totp: boolean) {
    const u = {
      id: 'U1',
      actif: true,
      motDePasseHash: await hacherMotDePasse('bon-mot-de-passe'),
      totpActifLe: totp ? new Date() : null,
      totpSecret: totp ? chiffrerSecret(SECRET) : null,
      totpDernierPas: null,
      totpCodesSecours: [hacherCodeSecours('ABCD-EFGH')],
    };
    const prisma = {
      utilisateur: {
        findUnique: jest.fn().mockResolvedValue(u),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
    } as unknown as PrismaService;
    return { s: new ConfirmationIdentiteService(prisma), prisma };
  }

  it('sans double authentification : le mot de passe, rien d’autre', async () => {
    const { s } = await svc(false);
    expect(await s.mode('U1')).toBe('mot_de_passe');
    expect(await s.verifier('U1', 'bon-mot-de-passe')).toBe('mot_de_passe');
    await expect(s.verifier('U1', 'mauvais')).rejects.toThrow(ForbiddenException);
    await expect(s.verifier('U1', '')).rejects.toThrow(/mot de passe/);
  });

  it('double authentification active : le code (ou un code de secours), pas le mot de passe', async () => {
    const { s, prisma } = await svc(true);
    expect(await s.mode('U1')).toBe('code');
    expect(await s.verifier('U1', codeAuPas(SECRET, pasCourant()))).toBe('code');
    await expect(s.verifier('U1', 'bon-mot-de-passe')).rejects.toThrow('Code incorrect.');
    await expect(s.verifier('U1', '000000')).rejects.toThrow(ForbiddenException);
    expect(await s.verifier('U1', 'abcd efgh')).toBe('code');
    expect(prisma.utilisateur.update).toHaveBeenCalledWith({ where: { id: 'U1' }, data: { totpCodesSecours: [] } });
  });

  it('double authentification suspendue (pilote) : le mot de passe, même pour un compte inscrit', async () => {
    const avant = process.env.HUB_DOUBLE_FACTEUR;
    process.env.HUB_DOUBLE_FACTEUR = 'desactive';
    try {
      const { s } = await svc(true);
      expect(await s.mode('U1')).toBe('mot_de_passe');
      expect(await s.verifier('U1', 'bon-mot-de-passe')).toBe('mot_de_passe');
      await expect(s.verifier('U1', codeAuPas(SECRET, pasCourant()))).rejects.toThrow('Mot de passe incorrect.');
    } finally {
      if (avant === undefined) delete process.env.HUB_DOUBLE_FACTEUR;
      else process.env.HUB_DOUBLE_FACTEUR = avant;
    }
  });

  it('code déjà utilisé : refusé (rejeu)', async () => {
    const { s, prisma } = await svc(true);
    (prisma.utilisateur.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    await expect(s.verifier('U1', codeAuPas(SECRET, pasCourant()))).rejects.toThrow('Code incorrect.');
  });
});

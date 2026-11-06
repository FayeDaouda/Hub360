import type { PrismaService } from '../prisma/prisma.service';

// Titulaires actifs, dans la société, d'un rôle qui a ce droit sur l'étape
// (destinataires des notifications du recrutement).
export async function titulaires(
  prisma: PrismaService,
  societeId: string,
  etape: string,
  droit: 'validation' | 'ecriture' = 'validation',
): Promise<string[]> {
  const roles = await prisma.roleRight.findMany({
    where: { [droit]: true, etape: { cle: etape } },
    select: { roleId: true },
  });
  const l = await prisma.utilisateurSocieteRole.findMany({
    where: { societeId, roleId: { in: roles.map((r) => r.roleId) }, utilisateur: { actif: true } },
    select: { utilisateurId: true },
  });
  return [...new Set(l.map((x) => x.utilisateurId))];
}

// Référence donnée au candidat (e-mails, écran de confirmation).
export const referenceCandidature = (id: string) => `C-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;

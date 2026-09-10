import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CrmService } from './crm.service';

// resoudreCode (privé) : le code du dossier vient soit de la saisie admin
// (strictement unique, 409 sinon), soit de la nomenclature avec suffixe
// V2/V3… en cas de collision. On appelle la méthode via son nom — c'est le
// point de décision qu'on veut verrouiller.

function svcAvecCodes(codesExistants: string[]) {
  const prisma = {
    dossierCrm: {
      findMany: jest
        .fn()
        .mockResolvedValue(codesExistants.map((code) => ({ code }))),
    },
  } as unknown as PrismaService;
  const svc = new CrmService(prisma);
  return (dto: { code?: string; localisation: string }, client = CLIENT) =>
    (svc as unknown as {
      resoudreCode: (
        tx: unknown,
        societeId: string,
        dto: unknown,
        client: unknown,
      ) => Promise<string>;
    }).resoudreCode(prisma, 'S1', dto, client);
}

const CLIENT = { nom: 'Daouda Faye', type: 'particulier' };

describe('CrmService.resoudreCode', () => {
  it('code saisi libre → renvoyé (trim)', async () => {
    const resoudre = svcAvecCodes(['AB_CD.26']);
    await expect(resoudre({ code: '  ZZ_TOP.26 ', localisation: 'Yoff' })).resolves.toBe(
      'ZZ_TOP.26',
    );
  });

  it('code saisi déjà pris → 409, aucune génération de repli', async () => {
    const resoudre = svcAvecCodes(['DF_PE.26']);
    await expect(
      resoudre({ code: 'DF_PE.26', localisation: 'Point E' }),
    ).rejects.toThrow(ConflictException);
  });

  it('pas de code saisi → généré selon la nomenclature', async () => {
    const resoudre = svcAvecCodes([]);
    await expect(resoudre({ localisation: 'Point E, Dakar' })).resolves.toMatch(
      /^DF_PE\.\d{2}$/,
    );
  });

  it('pas de code saisi + base déjà prise → suffixe V2', async () => {
    const annee = String(new Date().getFullYear()).slice(-2);
    const resoudre = svcAvecCodes([`DF_PE.${annee}`]);
    await expect(resoudre({ localisation: 'Point E, Dakar' })).resolves.toBe(
      `DF_PE.${annee} V2`,
    );
  });

  it('code saisi vide → traité comme absent (génération)', async () => {
    const resoudre = svcAvecCodes([]);
    await expect(
      resoudre({ code: '   ', localisation: 'Point E, Dakar' }),
    ).resolves.toMatch(/^DF_PE\.\d{2}$/);
  });
});

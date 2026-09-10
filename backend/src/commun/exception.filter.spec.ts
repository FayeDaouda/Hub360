import {
  ArgumentsHost,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FiltreExceptionsGlobal } from './exception.filter';

// Le filtre doit : conserver les HttpException métier (statut + message tels
// quels, y compris message[] de validation) ; traduire les codes Prisma sans
// jamais relayer e.meta (noms de tables / colonnes) ; masquer toute erreur
// inattendue derrière un 500 générique tout en la loggant côté serveur.

function faireHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const req = { method: 'POST', url: '/api/test' };
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }), getRequest: () => req }),
  } as unknown as ArgumentsHost;
  return { host, status, json, corps: () => json.mock.calls[0][0] };
}

describe('FiltreExceptionsGlobal', () => {
  const filtre = new FiltreExceptionsGlobal();

  it('HttpException métier : statut et message conservés', () => {
    const { host, status, corps } = faireHost();
    filtre.catch(new NotFoundException('Projet introuvable'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(corps()).toMatchObject({
      statusCode: 404,
      message: 'Projet introuvable',
      path: '/api/test',
    });
    expect(corps().timestamp).toEqual(expect.any(String));
  });

  it('erreurs de validation : message[] préservé tel quel', () => {
    const { host, corps } = faireHost();
    filtre.catch(
      new BadRequestException({
        statusCode: 400,
        message: ['email invalide', 'nom requis'],
        error: 'Bad Request',
      }),
      host,
    );
    expect(corps().message).toEqual(['email invalide', 'nom requis']);
  });

  it('Prisma P2002 → 409 générique, aucun nom de colonne relayé', () => {
    const { host, status, json } = faireHost();
    const e = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`)',
      { code: 'P2002', clientVersion: '5.22.0', meta: { target: ['email'] } },
    );
    filtre.catch(e, host);

    expect(status).toHaveBeenCalledWith(409);
    const brut = JSON.stringify(json.mock.calls[0][0]);
    expect(brut).toContain('Cette ressource existe déjà.');
    expect(brut).not.toContain('email');
    expect(brut).not.toContain('constraint');
  });

  it('Prisma P2025 → 404 générique', () => {
    const { host, status, corps } = faireHost();
    filtre.catch(
      new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
        code: 'P2025',
        clientVersion: '5.22.0',
      }),
      host,
    );
    expect(status).toHaveBeenCalledWith(404);
    expect(corps().message).toBe('Ressource introuvable.');
  });

  it('erreur inattendue → 500 générique, détail loggé côté serveur seulement', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, status, corps } = faireHost();

    filtre.catch(new Error('échec connexion table utilisateurs colonne motDePasseHash'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(corps().message).toBe('Une erreur interne est survenue.');
    expect(JSON.stringify(corps())).not.toContain('motDePasseHash');
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

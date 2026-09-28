import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DefinirSalaireDto, SALAIRE_MAX_FCFA } from './dto';

async function erreurs(corps: object) {
  return validate(plainToInstance(DefinirSalaireDto, corps));
}

describe('DefinirSalaireDto', () => {
  it.each([[0], [450000], [SALAIRE_MAX_FCFA], [null]])('accepte %p', async (v) => {
    expect(await erreurs({ salaireBrutMensuel: v })).toHaveLength(0);
  });

  it.each([[-1], [1500.5], [SALAIRE_MAX_FCFA + 1], ['450000']])('refuse %p', async (v) => {
    expect(await erreurs({ salaireBrutMensuel: v })).not.toHaveLength(0);
  });

  it('refuse un corps sans montant (null doit être explicite)', async () => {
    expect(await erreurs({})).not.toHaveLength(0);
  });
});

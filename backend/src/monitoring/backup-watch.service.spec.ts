import { mkdtemp, rm, utimes, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { backupProblems } from './backup-watch.service';

// Surveillance des sauvegardes : ancienneté de la dernière sauvegarde, et
// résultat du test de restauration hebdomadaire.
describe('backupProblems', () => {
  const maintenant = new Date('2026-10-27T09:00:00Z');
  let dossier: string;
  beforeEach(async () => {
    dossier = await mkdtemp(join(tmpdir(), 'sauvegardes-'));
  });
  afterEach(() => rm(dossier, { recursive: true, force: true }));

  async function sauvegarde(nom: string, le: string) {
    await writeFile(join(dossier, nom), 'x');
    await utimes(join(dossier, nom), new Date(le), new Date(le));
  }
  const verification = (ligne: string) => writeFile(join(dossier, 'derniere-verification.txt'), `${ligne}\n`);

  it('tout va bien : sauvegarde de la nuit, test réussi dimanche', async () => {
    await sauvegarde('hub-20261027-0230.dump', '2026-10-27T02:30:00Z');
    await sauvegarde('hub-20261001-0230.dump', '2026-10-01T02:30:00Z');
    await verification('2026-10-25T03:31:00Z ok hub-20261025-0330.dump restauration identique : 77 tables');
    expect(await backupProblems(dossier, maintenant)).toEqual([]);
  });

  it('aucune sauvegarde', async () => {
    expect(await backupProblems(dossier, maintenant)).toEqual([`Aucune sauvegarde dans ${dossier}.`]);
  });

  it('sauvegarde de la nuit manquante', async () => {
    await sauvegarde('hub-20261025-0230.dump', '2026-10-25T02:30:00Z');
    await verification('2026-10-25T03:31:00Z ok hub-20261025-0330.dump identique');
    expect(await backupProblems(dossier, maintenant)).toEqual([
      'Dernière sauvegarde le 25/10/2026 02:30 : celle de la nuit a manqué.',
    ]);
  });

  it('test de restauration en échec, ou trop ancien', async () => {
    await sauvegarde('hub-20261027-0230.dump', '2026-10-27T02:30:00Z');
    await verification('2026-10-25T03:31:00Z echec hub-20261025-0330.dump la restauration a échoué');
    expect(await backupProblems(dossier, maintenant)).toEqual([
      'Test de restauration en échec le 25/10/2026 03:31 : la restauration a échoué',
    ]);
    await verification('2026-10-11T03:31:00Z ok hub-20261011-0330.dump identique');
    expect(await backupProblems(dossier, maintenant)).toEqual(['Restauration non testée depuis le 11/10/2026 03:31.']);
  });

  it('aucun test enregistré : alerte seulement après huit jours de sauvegardes', async () => {
    await sauvegarde('hub-20261027-0230.dump', '2026-10-27T02:30:00Z');
    await sauvegarde('hub-20261022-0230.dump', '2026-10-22T02:30:00Z');
    expect(await backupProblems(dossier, maintenant)).toEqual([]);
    await sauvegarde('hub-20261015-0230.dump', '2026-10-15T02:30:00Z');
    expect(await backupProblems(dossier, maintenant)).toEqual(['Aucun test de restauration enregistré.']);
  });
});

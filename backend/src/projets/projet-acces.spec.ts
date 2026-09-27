import { estProjetDuCollaborateur, ouProjetsDuCollaborateur } from './projet-acces';

// Prédicat de périmètre projet — pur. Miroir exact du `where` Prisma qui filtre
// la liste : un projet est « à » un collaborateur via l'une des cellules qui le
// suivent (plusieurs possibles depuis sept. 2026), ou parce qu'il en est
// nommément dessinateur / responsable 3D sur l'avant-projet.

const ap = (dessinateurId: string | null, responsable3dId: string | null) => ({
  dessinateurId,
  responsable3dId,
});
const cellules = (...ids: string[]) => ids.map((celluleId) => ({ celluleId }));

describe('estProjetDuCollaborateur', () => {
  const collab = { id: 'C1', celluleId: 'CEL1' };

  it('vrai si le projet est suivi par la cellule du collaborateur', () => {
    expect(
      estProjetDuCollaborateur({ cellules: cellules('CEL1'), avantProjet: null }, collab),
    ).toBe(true);
  });

  it('vrai si le projet a plusieurs cellules et que la sienne en fait partie', () => {
    expect(
      estProjetDuCollaborateur(
        { cellules: cellules('CEL2', 'CEL1', 'CEL3'), avantProjet: null },
        collab,
      ),
    ).toBe(true);
  });

  it('faux si aucune cellule du projet ne correspond, et ni dessinateur ni responsable 3D', () => {
    expect(
      estProjetDuCollaborateur(
        { cellules: cellules('CEL2'), avantProjet: ap('CX', 'CY') },
        collab,
      ),
    ).toBe(false);
  });

  it('vrai si dessinateur, même sur un projet dont aucune cellule n’est la sienne', () => {
    expect(
      estProjetDuCollaborateur(
        { cellules: cellules('CEL2'), avantProjet: ap('C1', null) },
        collab,
      ),
    ).toBe(true);
  });

  it('vrai si responsable 3D', () => {
    expect(
      estProjetDuCollaborateur(
        { cellules: cellules('CEL2'), avantProjet: ap(null, 'C1') },
        collab,
      ),
    ).toBe(true);
  });

  it('collaborateur sans cellule : jamais rattaché même si le projet n’a aucune cellule non plus', () => {
    expect(
      estProjetDuCollaborateur(
        { cellules: [], avantProjet: null },
        { id: 'C1', celluleId: null },
      ),
    ).toBe(false);
  });

  it('collaborateur sans cellule mais dessinateur : rattaché quand même', () => {
    expect(
      estProjetDuCollaborateur(
        { cellules: [], avantProjet: ap('C1', null) },
        { id: 'C1', celluleId: null },
      ),
    ).toBe(true);
  });
});

describe('ouProjetsDuCollaborateur', () => {
  it('inclut la cellule (via `some`) seulement si le collaborateur en a une', () => {
    expect(ouProjetsDuCollaborateur({ id: 'C1', celluleId: 'CEL1' })).toEqual([
      { avantProjet: { dessinateurId: 'C1' } },
      { avantProjet: { responsable3dId: 'C1' } },
      { cellules: { some: { celluleId: 'CEL1' } } },
    ]);
    expect(ouProjetsDuCollaborateur({ id: 'C1', celluleId: null })).toEqual([
      { avantProjet: { dessinateurId: 'C1' } },
      { avantProjet: { responsable3dId: 'C1' } },
    ]);
  });
});

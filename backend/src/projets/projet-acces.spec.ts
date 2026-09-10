import { estProjetDuCollaborateur, ouProjetsDuCollaborateur } from './projet-acces';

// Prédicat de périmètre projet — pur. Miroir exact du `where` Prisma qui filtre
// la liste : un projet est « à » un collaborateur via sa cellule, ou parce
// qu'il en est nommément dessinateur / responsable 3D sur l'avant-projet.

const ap = (dessinateurId: string | null, responsable3dId: string | null) => ({
  dessinateurId,
  responsable3dId,
});

describe('estProjetDuCollaborateur', () => {
  const collab = { id: 'C1', celluleId: 'CEL1' };

  it('vrai si le projet est suivi par la cellule du collaborateur', () => {
    expect(
      estProjetDuCollaborateur({ celluleId: 'CEL1', avantProjet: null }, collab),
    ).toBe(true);
  });

  it('faux si autre cellule et ni dessinateur ni responsable 3D', () => {
    expect(
      estProjetDuCollaborateur(
        { celluleId: 'CEL2', avantProjet: ap('CX', 'CY') },
        collab,
      ),
    ).toBe(false);
  });

  it('vrai si dessinateur, même sur un projet d’une autre cellule', () => {
    expect(
      estProjetDuCollaborateur(
        { celluleId: 'CEL2', avantProjet: ap('C1', null) },
        collab,
      ),
    ).toBe(true);
  });

  it('vrai si responsable 3D', () => {
    expect(
      estProjetDuCollaborateur(
        { celluleId: 'CEL2', avantProjet: ap(null, 'C1') },
        collab,
      ),
    ).toBe(true);
  });

  it('collaborateur sans cellule : jamais rattaché par un celluleId null=null', () => {
    expect(
      estProjetDuCollaborateur(
        { celluleId: null, avantProjet: null },
        { id: 'C1', celluleId: null },
      ),
    ).toBe(false);
  });

  it('collaborateur sans cellule mais dessinateur : rattaché quand même', () => {
    expect(
      estProjetDuCollaborateur(
        { celluleId: null, avantProjet: ap('C1', null) },
        { id: 'C1', celluleId: null },
      ),
    ).toBe(true);
  });
});

describe('ouProjetsDuCollaborateur', () => {
  it('inclut la cellule seulement si le collaborateur en a une', () => {
    expect(ouProjetsDuCollaborateur({ id: 'C1', celluleId: 'CEL1' })).toEqual([
      { avantProjet: { dessinateurId: 'C1' } },
      { avantProjet: { responsable3dId: 'C1' } },
      { celluleId: 'CEL1' },
    ]);
    expect(ouProjetsDuCollaborateur({ id: 'C1', celluleId: null })).toEqual([
      { avantProjet: { dessinateurId: 'C1' } },
      { avantProjet: { responsable3dId: 'C1' } },
    ]);
  });
});

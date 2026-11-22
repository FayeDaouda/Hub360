import { ROLES_DIRECTION_GROUPE } from '@hub/domain';
import { AnnuaireService } from './annuaire.service';

// Annuaire (22/11/2026) : périmètre réglable, champs d'annuaire seulement,
// absence du jour sans motif.
const GC = { id: 'S1', slug: 'grey-concrete', nom: 'Grey Concrete' };
const CODED = { id: 'S2', slug: 'coded', nom: "CODE'D" };

const ligne = (id: string, prenom: string, nom: string, x: Record<string, unknown> = {}) => ({
  id,
  prenom,
  nom,
  email: `${prenom.toLowerCase()}@hub.group`,
  nomAffiche: null,
  photoCle: null,
  roles: [{ role: { nom: 'Salarié' } }],
  dossierPersonnel: { poste: 'Architecte', telephone: '+221 77 000 00 00', emailPro: `${prenom.toLowerCase()}@gc.sn` },
  collaborations: [],
  ...x,
});

const monter = (perimetre: unknown = undefined) => {
  const prisma = {
    reglageSociete: {
      findUnique: jest.fn().mockResolvedValue(perimetre === undefined ? null : { valeur: perimetre }),
      upsert: jest.fn(),
    },
    societe: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(GC),
      findMany: jest.fn().mockResolvedValue([CODED]),
    },
    utilisateur: {
      findMany: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        const json = JSON.stringify(where);
        if (json.includes('"S1"')) {
          return Promise.resolve([ligne('U1', 'Awa', 'Diop'), ligne('U9', 'Cio', 'Transverse')]);
        }
        // CODE'D : un CFO, un salarié, et le même transverse.
        const tous = [
          ligne('U2', 'Moussa', 'Sow', { roles: [{ role: { nom: 'CFO' } }] }),
          ligne('U3', 'Fatou', 'Ba'),
          ligne('U9', 'Cio', 'Transverse'),
        ];
        return Promise.resolve(json.includes('"in"') ? tous.filter((u) => u.id !== 'U3') : tous);
      }),
    },
    demandeAbsence: {
      findMany: jest.fn().mockResolvedValue([
        { dateFin: '2026-11-25', dossier: { utilisateurId: 'U1', collaborateur: null } },
        { dateFin: '2026-11-28', dossier: { utilisateurId: null, collaborateur: { utilisateurId: 'U1' } } },
      ]),
    },
    interventionHub: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  return { s: new AnnuaireService(prisma as never), prisma };
};
const moi = (permissions: Record<string, string> = {}) => ({ userId: 'U1', societeId: 'S1', permissions });

describe('AnnuaireService', () => {
  it('périmètre : la société seulement par défaut, et pour une valeur inconnue', async () => {
    expect(await monter().s.perimetre('S1')).toBe('societe');
    expect(await monter('n_importe_quoi').s.perimetre('S1')).toBe('societe');
    expect(await monter('groupe').s.perimetre('S1')).toBe('groupe');
  });

  it('société seulement : ses collègues, les champs d’annuaire, l’absence du jour sans motif', async () => {
    const { s, prisma } = monter();
    const a = await s.lister(moi());
    expect(prisma.societe.findMany).not.toHaveBeenCalled(); // aucune autre société lue
    expect(a.perimetre).toBe('societe');
    expect(a.societes).toEqual([{ slug: 'grey-concrete', nom: 'Grey Concrete' }]);
    expect(a.membres.map((m) => m.utilisateurId)).toEqual(['U1', 'U9']);
    const awa = a.membres[0];
    expect(Object.keys(awa).sort()).toEqual(
      [
        'absentJusquau',
        'cellule',
        'chef',
        'email',
        'estChef',
        'memeSociete',
        'nom',
        'nomAffiche',
        'photoUrl',
        'poste',
        'prenom',
        'societe',
        'telephone',
        'utilisateurId',
      ].sort(),
    );
    expect(awa).toMatchObject({ poste: 'Architecte', email: 'awa@gc.sn', memeSociete: true });
    // La plus longue des absences qui couvrent aujourd'hui, jamais le motif.
    expect(awa.absentJusquau).toBe('2026-11-28');
    expect(prisma.demandeAbsence.findMany.mock.calls[0][0].select).not.toHaveProperty('type');
  });

  it('société + direction : seulement la direction des autres sociétés ; une personne de plusieurs sociétés une seule fois', async () => {
    const { s, prisma } = monter('societe_direction');
    const a = await s.lister(moi());
    expect(a.societes.map((x) => x.slug)).toEqual(['grey-concrete', 'coded']);
    expect(a.membres.map((m) => m.utilisateurId).sort()).toEqual(['U1', 'U2', 'U9']);
    // Filtré par les rôles de direction dans CODE'D.
    const where = JSON.stringify(prisma.utilisateur.findMany.mock.calls[1][0].where);
    expect(where).toContain(JSON.stringify(ROLES_DIRECTION_GROUPE));
    const moussa = a.membres.find((m) => m.utilisateurId === 'U2')!;
    expect(moussa).toMatchObject({ societe: { slug: 'coded' }, memeSociete: false });
    // Le transverse reste rattaché à la société de la session.
    expect(a.membres.find((m) => m.utilisateurId === 'U9')).toMatchObject({ memeSociete: true });
  });

  it('tout le groupe : tous les membres des sociétés ouvertes', async () => {
    const { s, prisma } = monter('groupe');
    const a = await s.lister(moi());
    expect(a.membres.map((m) => m.utilisateurId).sort()).toEqual(['U1', 'U2', 'U3', 'U9']);
    expect(prisma.societe.findMany.mock.calls[0][0].where).toEqual({
      id: { not: 'S1' },
      actif: true,
      accesOuvert: true,
    });
  });

  it('voir les agendas : seulement avec la Lecture de « Agenda des autres »', async () => {
    expect((await monter().s.lister(moi())).peutVoirAgendas).toBe(false);
    expect((await monter().s.lister(moi({ 'agenda.autres': 'L' }))).peutVoirAgendas).toBe(true);
  });

  it('régler : la valeur et une intervention au journal (de quoi à quoi, motif) ; rien si inchangé', async () => {
    const { s, prisma } = monter();
    // Transaction interactive sérialisable : la valeur d'avant y est relue.
    prisma.$transaction.mockImplementation((f: (tx: unknown) => unknown) => f(prisma));
    expect(await s.regler('S1', 'groupe', 'Ouverture au groupe', 'U9')).toEqual({ perimetre: 'groupe' });
    expect(prisma.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable' });
    expect(prisma.reglageSociete.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ valeur: 'groupe', majParId: 'U9' }) }),
    );
    expect(prisma.interventionHub.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'annuaire_perimetre',
        detail: 'Annuaire : la société seulement → tout le groupe',
        motif: 'Ouverture au groupe',
        parId: 'U9',
      }),
    });
    prisma.interventionHub.create.mockClear();
    await s.regler('S1', 'societe', 'rien', 'U9');
    expect(prisma.interventionHub.create).not.toHaveBeenCalled();
  });
});

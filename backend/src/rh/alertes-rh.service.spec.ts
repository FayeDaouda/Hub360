import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { AlertesRhService } from './alertes-rh.service';

const DOSSIER = {
  id: 'D',
  societeId: 'S',
  prenom: 'Awa',
  nom: 'Diouf',
  poste: 'Designer',
  typeContrat: 'cdd',
  dateFin: null,
  finEssai: null,
  visiteMedicale: null,
  expirationPiece: null,
};
const SEUILS: Record<string, number> = {
  alerte_fin_cdd_jours: 30,
  alerte_fin_essai_jours: 15,
  alerte_echeance_rh_jours: 30,
};

function svc(dossiers: object[]) {
  const prisma = { dossierPersonnel: { findMany: jest.fn().mockResolvedValue(dossiers) } } as unknown as PrismaService;
  const reglages = {
    regle: jest.fn().mockImplementation((_s: string, cle: string) => Promise.resolve(SEUILS[cle])),
  } as unknown as ReglagesService;
  return new AlertesRhService(prisma, reglages);
}

describe('AlertesRhService (échéances légales, revue RH 20/10/2026)', () => {
  it('chaque échéance dans son délai ; pièce et visite dépassées restent signalées', async () => {
    const a = await svc([
      { ...DOSSIER, id: 'CDD', dateFin: '2026-11-14' }, // J+25 ≤ 30
      { ...DOSSIER, id: 'LOIN', dateFin: '2027-01-30' }, // trop loin
      { ...DOSSIER, id: 'ESSAI', typeContrat: 'cdi', finEssai: '2026-10-30' }, // J+10 ≤ 15
      { ...DOSSIER, id: 'PIECE', typeContrat: 'cdi', expirationPiece: '2026-09-01' }, // expirée
      { ...DOSSIER, id: 'VISITE', typeContrat: 'cdi', visiteMedicale: '2026-12-31' }, // trop loin
    ]).alertes('2026-10-20');
    expect(a.map((x) => [x.dossierId, x.type, x.jours])).toEqual([
      ['PIECE', 'piece_identite', -49],
      ['ESSAI', 'fin_essai', 10],
      ['CDD', 'fin_contrat', 25],
    ]);
  });

  it('pas de fin de contrat pour un CDI ; essai passé de plus de 7 jours oublié', async () => {
    const a = await svc([
      { ...DOSSIER, typeContrat: 'cdi', dateFin: '2026-10-25' },
      { ...DOSSIER, id: 'VIEUX', finEssai: '2026-10-01' },
    ]).alertes('2026-10-20');
    expect(a).toEqual([]);
  });
});

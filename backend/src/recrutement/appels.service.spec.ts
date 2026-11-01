import { BadRequestException, ConflictException } from '@nestjs/common';
import { AppelsService, appelOuvert, piecesDemandees, versSlug } from './appels.service';
import type { CandidaterDto } from './recrutement.dto';

const PDF = 'data:application/pdf;base64,JVBERi0xLjQK';

describe('Appels à candidatures · règles', () => {
  it('adresse lisible du lien', () => {
    expect(versSlug('Architecte junior (H/F) — Dakar')).toBe('architecte-junior-h-f-dakar');
  });

  it('le CV toujours demandé, en tête et obligatoire ; « autre » nommée par la RH', () => {
    expect(
      piecesDemandees([
        { cle: 'lettre', obligatoire: false },
        { cle: 'cv', obligatoire: false },
        { cle: 'autre', libelle: 'Permis de conduire', obligatoire: true },
      ]),
    ).toEqual([
      { cle: 'cv', libelle: 'CV', obligatoire: true },
      { cle: 'lettre', libelle: 'Lettre de motivation', obligatoire: false },
      { cle: 'autre', libelle: 'Permis de conduire', obligatoire: true },
    ]);
  });

  it('ouvert : appel ouvert, poste ouvert, date limite incluse', () => {
    expect(appelOuvert({ ouvert: true, dateLimite: '2026-11-10' }, 'ouvert', '2026-11-10')).toBe(true);
    expect(appelOuvert({ ouvert: true, dateLimite: '2026-11-10' }, 'ouvert', '2026-11-11')).toBe(false);
    expect(appelOuvert({ ouvert: true, dateLimite: null }, 'pourvu', '2026-11-01')).toBe(false);
    expect(appelOuvert({ ouvert: false, dateLimite: null }, 'ouvert', '2026-11-01')).toBe(false);
  });
});

describe('AppelsService · dépôt public', () => {
  const appel = (surcharge: object = {}) => ({
    id: 'A1',
    societeId: 'S1',
    ouvert: true,
    dateLimite: null,
    pieces: [
      { cle: 'cv', libelle: 'CV', obligatoire: true },
      { cle: 'lettre', libelle: 'Lettre de motivation', obligatoire: false },
    ],
    questions: [{ id: 'q1', libelle: 'Disponibilité ?', obligatoire: true }],
    poste: { id: 'P1', intitule: 'Architecte', statut: 'ouvert', demandeParId: 'DG' },
    societe: { nom: 'Grey Concrete' },
    ...surcharge,
  });
  const monter = (a = appel(), deja: object | null = null) => {
    const prisma = {
      appelCandidature: { findUnique: jest.fn().mockResolvedValue(a) },
      candidature: {
        findFirst: jest.fn().mockResolvedValue(deja),
        create: jest.fn().mockResolvedValue({ id: 'a1b2c3d4-0000-0000-0000-000000000000' }),
      },
      roleRight: { findMany: jest.fn().mockResolvedValue([{ roleId: 'R' }]) },
      utilisateurSocieteRole: { findMany: jest.fn().mockResolvedValue([{ utilisateurId: 'RH1' }]) },
    };
    const notifications = { envoyer: jest.fn() };
    const email = { envoyerCandidat: jest.fn().mockResolvedValue({ envoye: true }) };
    return {
      s: new AppelsService(prisma as never, notifications as never, email as never),
      prisma,
      notifications,
      email,
    };
  };
  const dto = (surcharge: Partial<CandidaterDto> = {}): CandidaterDto => ({
    prenom: 'Awa',
    nom: 'Diop',
    email: 'Awa@Example.sn',
    telephone: '+221 77 000 00 00',
    reponses: { q1: 'Immédiate' },
    pieces: [{ cle: 'cv', nom: 'cv.pdf', url: PDF }],
    consentement: true,
    ...surcharge,
  });

  it('dépôt réussi : candidature « lien », RH et demandeur prévenus, accusé de réception', async () => {
    const { s, prisma, notifications, email } = monter();
    expect(await s.candidater('architecte-1', dto())).toEqual({ reference: 'C-A1B2C3' });
    const data = prisma.candidature.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ email: 'awa@example.sn', source: 'lien', reponses: { q1: 'Immédiate' } });
    expect(data.pieces.create).toEqual([expect.objectContaining({ cle: 'cv', libelle: 'CV', nom: 'cv.pdf' })]);
    expect(notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'candidature_recue', destinataireIds: ['RH1', 'DG'] }),
    );
    expect(email.envoyerCandidat).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'accuse', reference: 'C-A1B2C3' }),
    );
  });

  it('robot (champ caché rempli) : réponse de succès, rien n’est gardé', async () => {
    const { s, prisma } = monter();
    await s.candidater('architecte-1', dto({ siteWeb: 'http://spam' }));
    expect(prisma.candidature.create).not.toHaveBeenCalled();
  });

  it('appel clos, CV manquant, question obligatoire vide, pièce non demandée : refusés', async () => {
    await expect(monter(appel({ ouvert: false })).s.candidater('x', dto())).rejects.toThrow(ConflictException);
    await expect(monter().s.candidater('x', dto({ pieces: [] }))).rejects.toThrow('Pièce obligatoire manquante : CV.');
    await expect(monter().s.candidater('x', dto({ reponses: {} }))).rejects.toThrow(BadRequestException);
    await expect(
      monter().s.candidater('x', dto({ pieces: [...dto().pieces, { cle: 'portfolio', nom: 'p.pdf', url: PDF }] })),
    ).rejects.toThrow('Pièce non demandée par cet appel.');
  });

  it('une seule candidature par adresse e-mail et par poste', async () => {
    await expect(monter(appel(), { id: 'C0' }).s.candidater('x', dto())).rejects.toThrow(
      'Vous avez déjà postulé à ce poste avec cette adresse e-mail.',
    );
  });
});

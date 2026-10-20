import { PrismaService } from '../prisma/prisma.service';
import { ReportingRhService } from './reporting-rh.service';

// Salaire validé en vigueur depuis toujours (reprise) ; `salaires: []` = non renseigné.
const salaire = (montant: number, dateEffet: string | null = null) => ({ montant, dateEffet, statut: 'valide', decideLe: new Date('2026-01-01') });
const dossier = (id: string, o: Record<string, unknown> = {}) => ({
  id, prenom: id, nom: 'Test', typeContrat: 'cdi', salaires: [salaire(500_000)], dateEntree: null, archiveLe: null, ...o,
});

function svc(o: { dossiers: unknown[]; absences?: unknown[]; bulletins?: unknown[]; feuilles?: unknown[]; rappels?: unknown[]; attestations?: unknown[]; precedent?: unknown }) {
  const prisma = {
    dossierPersonnel: { findMany: jest.fn().mockResolvedValue(o.dossiers) },
    demandeAbsence: {
      findMany: jest.fn(({ where }: { where: { statut?: string } }) => Promise.resolve(where.statut === 'validee' ? (o.absences ?? []) : [])),
      count: jest.fn().mockResolvedValue(1),
    },
    demandeRemboursement: { findMany: jest.fn().mockResolvedValue([]) },
    demandeAttestation: {
      findMany: jest.fn(({ where }: { where: { id?: unknown } }) => Promise.resolve(where.id ? [{ id: 'T1' }] : (o.attestations ?? []))),
    },
    bulletinPaie: { findMany: jest.fn().mockResolvedValue(o.bulletins ?? []) },
    rappelEnvoye: { findMany: jest.fn().mockResolvedValue(o.rappels ?? []) },
    reportingMensuel: { findUnique: jest.fn().mockResolvedValue(o.precedent ?? null) },
  } as unknown as PrismaService;
  const reglages = { joursFeries: jest.fn().mockResolvedValue(new Map([['S1', new Set<string>()]])) };
  const temps = { feuilles: jest.fn().mockResolvedValue({ feuilles: o.feuilles ?? [] }) };
  const alertes = { alertes: jest.fn().mockResolvedValue([{ type: 'piece_identite', prenom: 'Lamine', nom: 'Diallo', date: '2026-09-20', jours: -10 }]) };
  return new ReportingRhService(prisma, reglages as never, temps as never, alertes as never);
}

const valeur = (rubriques: { libelle: string; valeur: string }[], libelle: string) => rubriques.find((r) => r.libelle === libelle)?.valeur;

describe('ReportingRhService (reporting RH prérempli, revue RH 20/10/2026)', () => {
  it('effectif, masse salariale, absences, temps, demandes, échéances et paie du mois', async () => {
    const r = await svc({
      dossiers: [
        dossier('Awa', { dateEntree: '2026-09-28', typeContrat: 'cdd', salaires: [] }),
        dossier('Malick'),
        dossier('Ousmane', { archiveLe: new Date('2026-09-15T10:00:00Z') }),
      ],
      // Congé du 28/09 au 03/10 : seuls 28, 29, 30/09 comptent en septembre.
      absences: [{ type: 'conge_paye', dateDebut: '2026-09-28', dateFin: '2026-10-03' }],
      bulletins: [{ dossierId: 'Malick' }],
      feuilles: [{ statut: 'controlee', ecart: null }, { statut: 'a_controler', ecart: { traiteLe: null } }, { statut: 'sans_heures', ecart: null }],
      attestations: [{ demandeLe: new Date('2026-09-10T08:00:00Z'), delivreeLe: new Date('2026-09-12T08:00:00Z') }],
      rappels: [{ cle: 'demande:attestation:T1:1' }, { cle: 'demande:absence:AUTRE:n1:1' }],
    }).contenu('S1', '2026-09');

    expect(valeur(r, 'Effectif')).toBe('2 salariés au 30/09 · 1 CDI, 1 CDD · entrées : 1 (Awa Test) · sorties : 1 (Ousmane Test)');
    // Septembre : Malick seul (Awa sans salaire, Ousmane sorti) ; août non déposé.
    expect(valeur(r, 'Masse salariale brute')).toMatch(/^500\s000 FCFA \/ mois · pas de reporting RH déposé pour août : pas de comparaison · 1 salaire non renseigné$/);
    expect(r.find((x) => x.libelle === 'Masse salariale brute')?.montant).toBe(500_000);
    expect(valeur(r, 'Absences')).toBe('Congés payés 3 j · 1 demande refusée');
    expect(valeur(r, 'Temps')).toBe('1 / 2 feuille(s) contrôlée(s) · 1 sans heures · 1 écart ouvert');
    // L'absence relancée n'est pas de la société : une seule relance comptée.
    expect(valeur(r, 'Demandes')).toBe('1 traitée(s) en 2 j en moyenne · 1 relance envoyée');
    expect(valeur(r, 'Échéances légales')).toBe("Lamine Diallo · pièce d'identité expirée le 20/09");
    // Ousmane, sorti le 15, a été payé en septembre.
    expect(valeur(r, 'Paie')).toBe('1 / 3 bulletin(s) déposé(s) · manquants : Awa Test, Ousmane Test');
  });

  it('masse salariale : comparée au chiffre figé du reporting précédent (montant, ou texte d’un ancien dépôt)', async () => {
    const masse = async (precedent: unknown) =>
      valeur(await svc({ dossiers: [dossier('Malick')], precedent }).contenu('S1', '2026-10'), 'Masse salariale brute');
    expect(await masse({ contenu: [{ libelle: 'Masse salariale brute', valeur: '…', montant: 450_000 }] })).toMatch(/\+50\s000 FCFA par rapport au reporting de septembre$/);
    expect(await masse({ contenu: [{ libelle: 'Masse salariale brute', valeur: '600\u202f000 FCFA / mois · stable' }] })).toMatch(/−100\s000 FCFA par rapport au reporting de septembre$/);
    expect(await masse({ contenu: [{ libelle: 'Masse salariale brute', valeur: '500 000 FCFA / mois' }] })).toBe('500\u202f000 FCFA / mois · stable par rapport au reporting de septembre');
  });

  it('masse salariale : salaire en vigueur au dernier jour du mois (date d’effet)', async () => {
    const r = await svc({
      dossiers: [dossier('Malick', { salaires: [salaire(500_000), salaire(600_000, '2026-09-15'), salaire(700_000, '2026-10-01')] })],
    }).contenu('S1', '2026-09');
    expect(r.find((x) => x.libelle === 'Masse salariale brute')?.montant).toBe(600_000);
  });
});

import { RelancesCeoService } from './relances-ceo.service';

// Revue CEO (22/10/2026) : facture à contresigner relancée 24 h après être
// devenue prête — jamais une tranche préparée mais pas encore due.
describe('RelancesCeoService.factures', () => {
  function svc(o: { vueIlYa: number }) {
    const cles = new Map<string, Date>();
    const prisma = {
      facture: {
        findMany: jest.fn(({ where }: { where: { id?: unknown } }) =>
          Promise.resolve(where.id ? [{ id: 'F1', montantHt: 1, tauxTva: 18, devisEcheancierId: 'D', devisOrigineId: null, dossierCrmId: null, projetId: 'P' }] : []),
        ),
      },
      delegationCeo: { findFirst: jest.fn().mockResolvedValue(null) },
      rappelEnvoye: {
        createMany: jest.fn(({ data }: { data: { cle: string }[] }) => {
          const neuf = !cles.has(data[0].cle);
          if (neuf) cles.set(data[0].cle, data[0].cle.includes('prete') ? new Date(Date.now() - o.vueIlYa * 3_600_000) : new Date());
          return Promise.resolve({ count: neuf ? 1 : 0 });
        }),
        findUnique: jest.fn(({ where }: { where: { cle: string } }) => Promise.resolve({ cle: where.cle, createdAt: cles.get(where.cle) })),
        deleteMany: jest.fn(),
      },
    };
    const notifications = { titulairesRole: jest.fn().mockResolvedValue(['CEO1']), envoyer: jest.fn().mockResolvedValue(1) };
    // Seule F1 est une tranche prête (alertes) ; F2, préparée mais pas due, n'y figure pas.
    const projetsOuverts = { alertes: jest.fn().mockResolvedValue({ tranches: [{ factureId: 'F1', tranche: 'F3', code: 'CM_SAC.26', client: 'Cheikh Mbaye' }] }) };
    const seuilCeo = { montantsAffaire: jest.fn().mockResolvedValue(new Map([['F1', 62_186_000]])), seuil: jest.fn().mockResolvedValue(50_000_000) };
    return { s: new RelancesCeoService(prisma as never, notifications as never, projetsOuverts as never, seuilCeo as never), notifications, prisma };
  }

  it('prête depuis moins de 24 h : rien ; depuis plus : une relance par jour', async () => {
    const recente = svc({ vueIlYa: 2 });
    expect(await recente.s.factures('S1', '2026-10-22')).toBe(0);
    expect(recente.notifications.envoyer).not.toHaveBeenCalled();
    const ancienne = svc({ vueIlYa: 30 });
    expect(await ancienne.s.factures('S1', '2026-10-22')).toBe(1);
    expect(ancienne.notifications.envoyer).toHaveBeenCalledWith(expect.objectContaining({ type: 'attente_ceo', factureId: 'F1', titre: expect.stringContaining('F3 · CM_SAC.26') }));
    expect(await ancienne.s.factures('S1', '2026-10-22')).toBe(0); // même jour : pas deux fois
    // Seules les tranches prêtes (et les factures directes) sont interrogées.
    expect(ancienne.prisma.facture.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['F1'] }, statut: 'brouillon' } }));
  });
});

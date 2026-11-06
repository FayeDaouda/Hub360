import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { runAsSystem, runInCompany } from '../../tenancy/tenant-context';
import { FacturationService } from './facturation.service';

// Finances au niveau du groupe (décision du 31/10/2026, lot 4) : une vue
// consolidée de toutes les sociétés ouvertes. Chaque facture reste celle de
// sa société (son nom, sa numérotation) : on lit chaque société dans son
// propre périmètre d'isolation (ADR 0001), puis on additionne. Lecture seule :
// les actions se font dans l'espace de la société.
@Injectable()
export class FinancesGroupeService {
  constructor(
    private prisma: PrismaService,
    private facturation: FacturationService,
  ) {}

  async consolide() {
    const societes = await runAsSystem('finances du groupe : sociétés ouvertes', () =>
      this.prisma.societe.findMany({
        where: { actif: true, accesOuvert: true },
        select: { id: true, nom: true, slug: true },
        orderBy: { nom: 'asc' },
      }),
    );
    const parSociete = await Promise.all(
      societes.map((s) =>
        runInCompany(s.id, async () => {
          const factures = (await this.facturation.findAllPourSociete(s.id, {})).filter(
            (f) => f.statut === 'emise' && !f.estAvoir,
          );
          const offresEnCours = await this.prisma.devis.count({ where: { societeId: s.id, statut: 'envoye' } });
          const enRetard = factures.filter((f) => f.statutEffectif === 'en_retard');
          return {
            societe: s,
            offresEnCours,
            facture: somme(factures.map((f) => f.montantTtc)),
            encaisse: somme(factures.map((f) => f.montantPaye)),
            resteAEncaisser: somme(factures.map((f) => f.resteAPayer)),
            enRetard: { nombre: enRetard.length, montant: somme(enRetard.map((f) => f.resteAPayer)) },
            // Les plus anciennes d'abord : ce qui attend le plus.
            aEncaisser: factures
              .filter((f) => f.resteAPayer > 0)
              .sort((a, b) => (a.echeanceLe ?? '').localeCompare(b.echeanceLe ?? ''))
              .slice(0, 50)
              .map((f) => ({
                id: f.id,
                reference: f.reference,
                libelle: f.libelle,
                client: f.client?.nom ?? null,
                montantTtc: f.montantTtc,
                resteAPayer: f.resteAPayer,
                echeanceLe: f.echeanceLe,
                joursRetard: f.joursRetard,
              })),
          };
        }),
      ),
    );
    return {
      societes: parSociete,
      total: {
        offresEnCours: somme(parSociete.map((s) => s.offresEnCours)),
        facture: somme(parSociete.map((s) => s.facture)),
        encaisse: somme(parSociete.map((s) => s.encaisse)),
        resteAEncaisser: somme(parSociete.map((s) => s.resteAEncaisser)),
        enRetard: {
          nombre: somme(parSociete.map((s) => s.enRetard.nombre)),
          montant: somme(parSociete.map((s) => s.enRetard.montant)),
        },
      },
    };
  }
}

const somme = (valeurs: number[]) => Math.round(valeurs.reduce((t, v) => t + v, 0));

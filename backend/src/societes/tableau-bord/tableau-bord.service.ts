import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { avancementChecklistAvp, ventilationTva } from '../../projets/domaine/gardes';
import { DELAI_INSTRUCTION_JOURS } from '../../projets/domaine/config';
import {
  bucketsHistogramme,
  isoJour,
  libellePeriode,
  moyennePct,
  Periode,
  statutJalon,
  uniteHistogramme,
} from './periodes';

// Libellés de sous-types pour les jalons pré-rendus (contrat : le backend rend
// le texte, comme pour les notifications). Miroir de frontend/lib/types.ts
// (STATUTS_LOT / TYPES_ETUDE) — à garder synchro si ces enums bougent.
const LIB_LOT: Record<string, string> = {
  gros_oeuvre: 'Gros œuvre',
  second_oeuvre: 'Second œuvre',
  lots_techniques: 'Lots techniques',
  vrd: 'VRD',
  fournitures_mobilier: 'Fournitures & mobilier',
  travaux_amenagement: 'Travaux d’aménagement',
};
const LIB_ETUDE: Record<string, string> = {
  geotechnique: 'Géotechnique',
  topographie: 'Topographie',
  structure: 'Structure',
  fluides: 'Fluides',
  electricite: 'Électricité',
  vrd: 'VRD',
};

const MAX_JALONS = 6;
const num = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);

const PROJET_SELECT = {
  id: true,
  programme: true,
  categorie: true,
  nature: true,
  phase: true,
  statut: true,
  createdAt: true,
  client: { select: { nom: true } },
  avantProjet: {
    select: {
      valideLe: true,
      dateFin: true,
      besoinSurface: true,
      lignesChecklist: { select: { fait: true, nonRequis: true } },
    },
  },
  permis: { select: { dateDepot: true, dateObtention: true, dateRefus: true } },
  etudes: {
    select: { lignes: { select: { type: true, statut: true, dateRemisePrevue: true } } },
  },
  execution: {
    select: { lots: { select: { type: true, statut: true, dateFinPrevue: true } } },
  },
} satisfies Prisma.ProjetSelect;

type ProjetLite = Prisma.ProjetGetPayload<{ select: typeof PROJET_SELECT }>;
type FactureLite = { montantHt: Prisma.Decimal; tauxTva: Prisma.Decimal; paiements: { montant: Prisma.Decimal }[] };

export interface TableauBord {
  periode: Periode;
  libellePeriode: string;
  kpis: {
    cle: string;
    libelle: string;
    valeur: number;
    format: 'nombre' | 'surface' | 'montant_compact';
    // Ces KPI sont des photos à l'instant T (le schéma ne garde pas d'historique
    // de phase / de trésorerie) : pas de « variation vs période précédente »,
    // un `detail` factuel à la place.
    detail?: string;
  }[];
  projetsSignesParPeriode: {
    titre: string;
    unite: string;
    points: { libelle: string; valeur: number; actif?: boolean }[];
  };
  avancementMoyen: { pourcentage: number };
  jalons: {
    id: string;
    date: string;
    projet: string;
    type: string;
    statut: 'a_faire' | 'a_risque';
  }[];
  projets: {
    id: string;
    nom: string;
    categorie: string;
    promotionInterne: boolean;
    client: string;
    avancement: number;
    statut: string;
  }[];
}

function pctChecklist(p: ProjetLite): number {
  const lignes = p.avantProjet?.lignesChecklist ?? [];
  return lignes.length ? avancementChecklistAvp(lignes).pct : 0;
}

@Injectable()
export class TableauBordService {
  constructor(private prisma: PrismaService) {}

  async pour(
    societeId: string,
    periode: Periode,
    maintenant: Date = new Date(),
  ): Promise<TableauBord> {
    // perf : un seul chargement de tous les projets de la société. À l'échelle
    // Grey Concrete (poignée de projets) c'est trivial ; pour une grosse
    // société, passer l'histogramme et les compteurs en agrégats SQL.
    const [projets, factures] = await Promise.all([
      this.prisma.projet.findMany({
        where: { societeId },
        orderBy: { createdAt: 'desc' },
        select: PROJET_SELECT,
      }),
      this.prisma.facture.findMany({
        where: { societeId, statut: 'emise' },
        select: {
          montantHt: true,
          tauxTva: true,
          paiements: { select: { montant: true } },
        },
      }),
    ]);

    const actifs = projets.filter((p) => p.phase !== 'livre');
    const livres = projets.filter((p) => p.phase === 'livre');
    const aujourdhui = isoJour(maintenant);

    return {
      periode,
      libellePeriode: libellePeriode(periode, maintenant),
      kpis: this.kpis(projets, actifs, livres, factures),
      projetsSignesParPeriode: this.histogramme(projets, periode, maintenant),
      avancementMoyen: { pourcentage: this.avancementMoyen(actifs) },
      jalons: this.jalons(actifs, aujourdhui),
      projets: actifs.map((p) => ({
        id: p.id,
        nom: p.programme,
        categorie: p.categorie,
        promotionInterne: p.nature === 'promotion_interne',
        client: p.client.nom,
        avancement: pctChecklist(p),
        statut: p.statut,
      })),
    };
  }

  // -- KPI : 4 photos à l'instant T -----------------------------------------
  private kpis(
    tous: ProjetLite[],
    actifs: ProjetLite[],
    livres: ProjetLite[],
    factures: FactureLite[],
  ): TableauBord['kpis'] {
    const nConception = actifs.filter((p) => p.categorie === 'conception').length;
    const nAmenagement = actifs.length - nConception;

    const surfaceConcue = livres.reduce(
      (s, p) => s + (p.avantProjet?.besoinSurface ?? 0),
      0,
    );

    const resteAEncaisser = factures.reduce((s, f) => {
      const { montantTtc } = ventilationTva(num(f.montantHt), num(f.tauxTva));
      const paye = f.paiements.reduce((p, x) => p + num(x.montant), 0);
      return s + Math.max(0, montantTtc - paye);
    }, 0);

    return [
      {
        cle: 'projets-actifs',
        libelle: 'Projets actifs',
        valeur: actifs.length,
        format: 'nombre',
        detail: actifs.length
          ? `${nConception} conception · ${nAmenagement} aménagement`
          : undefined,
      },
      {
        cle: 'projets-livres',
        libelle: 'Projets livrés',
        valeur: livres.length,
        format: 'nombre',
        detail: tous.length ? `sur ${tous.length} projets au total` : undefined,
      },
      {
        cle: 'surface-concue',
        libelle: 'Surface conçue & livrée',
        valeur: surfaceConcue,
        format: 'surface',
        detail: livres.length
          ? `sur ${livres.length} projet${livres.length > 1 ? 's' : ''} livré${
              livres.length > 1 ? 's' : ''
            }`
          : undefined,
      },
      {
        cle: 'reste-a-encaisser',
        libelle: 'Reste à encaisser',
        valeur: resteAEncaisser,
        format: 'montant_compact',
        detail: 'à encaisser à ce jour',
      },
    ];
  }

  // -- Histogramme « nouveaux projets signés » ----------------------------
  private histogramme(
    projets: ProjetLite[],
    periode: Periode,
    maintenant: Date,
  ): TableauBord['projetsSignesParPeriode'] {
    const buckets = bucketsHistogramme(periode, maintenant);
    return {
      titre: 'Nouveaux projets signés',
      unite: uniteHistogramme(periode),
      points: buckets.map((b) => ({
        libelle: b.libelle,
        valeur: projets.filter(
          (p) => p.createdAt >= b.fenetre.debut && p.createdAt < b.fenetre.fin,
        ).length,
        ...(b.actif ? { actif: true } : {}),
      })),
    };
  }

  private avancementMoyen(actifs: ProjetLite[]): number {
    const pcts = actifs
      .filter((p) => (p.avantProjet?.lignesChecklist.length ?? 0) > 0)
      .map((p) => pctChecklist(p));
    return moyennePct(pcts);
  }

  // -- Jalons : 4 sources de production, dates ≥ aujourd'hui -------------
  private jalons(actifs: ProjetLite[], aujourdhui: string): TableauBord['jalons'] {
    const out: TableauBord['jalons'] = [];
    const ajouter = (
      src: string,
      cle: string,
      date: string,
      projet: string,
      type: string,
    ) => {
      if (date >= aujourdhui) {
        out.push({
          id: `${src}:${cle}`,
          date,
          projet,
          type,
          statut: statutJalon(date, aujourdhui),
        });
      }
    };

    for (const p of actifs) {
      const ap = p.avantProjet;
      if (ap && !ap.valideLe && ap.dateFin) {
        ajouter('ap', p.id, ap.dateFin, p.programme, 'Échéance avant-projet');
      }

      const permis = p.permis;
      if (permis?.dateDepot && !permis.dateObtention && !permis.dateRefus) {
        const echeance = isoJour(
          new Date(
            permis.dateDepot.getTime() + DELAI_INSTRUCTION_JOURS * 86_400_000,
          ),
        );
        ajouter('permis', p.id, echeance, p.programme, "Fin d'instruction du permis");
      }

      for (const lot of p.execution?.lots ?? []) {
        if (lot.dateFinPrevue && lot.statut !== 'termine') {
          ajouter(
            'lot',
            `${p.id}-${lot.type}`,
            lot.dateFinPrevue,
            p.programme,
            `Fin de lot — ${LIB_LOT[lot.type] ?? lot.type}`,
          );
        }
      }

      for (const l of p.etudes?.lignes ?? []) {
        if (
          l.dateRemisePrevue &&
          l.statut !== 'validee' &&
          l.statut !== 'non_requise'
        ) {
          ajouter(
            'etude',
            `${p.id}-${l.type}`,
            l.dateRemisePrevue,
            p.programme,
            `Remise étude — ${LIB_ETUDE[l.type] ?? l.type}`,
          );
        }
      }
    }

    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, MAX_JALONS);
  }
}

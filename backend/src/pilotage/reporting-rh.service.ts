import { Injectable } from '@nestjs/common';
import type { TypeAbsence } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { AlertesRhService, type TypeAlerteRh } from '../rh/alertes-rh.service';
import { joursOuvrables } from '../rh/regles-conges';
import { salaireAu, type ChangementSource } from '../rh/regles-salaire';
import { bornesMois, moisDe } from '../rh/regles-temps';
import { TempsService } from '../rh/temps.service';

// `montant` : chiffre brut figé avec le reporting (masse salariale), relu le
// mois suivant pour la comparaison.
export type Rubrique = { libelle: string; valeur: string; montant?: number };

const MASSE = 'Masse salariale brute';

const JOUR = 86_400_000;
const jourIso = (d: Date) => d.toISOString().slice(0, 10);
const dateFr = (iso: string) => iso.slice(5).split('-').reverse().join('/');
const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
const moisPrecedent = (mois: string) => {
  const [a, m] = mois.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
};
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const nomDe = (d: { prenom: string; nom: string }) => `${d.prenom} ${d.nom}`;
// Cinq noms au plus : le reporting se lit d'un coup d'œil.
const noms = (ds: { prenom: string; nom: string }[]) =>
  ds.length > 5 ? `${ds.slice(0, 4).map(nomDe).join(', ')} et ${ds.length - 4} autres` : ds.map(nomDe).join(', ');
const moisCourt = (mois: string) =>
  new Date(`${mois}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', timeZone: 'UTC' });

const LIBELLE_ABSENCE: Record<TypeAbsence, string> = {
  conge_paye: 'Congés payés',
  maladie: 'Maladie',
  permission_exceptionnelle: 'Permissions',
  autre: 'Autres',
};

const LIBELLE_ALERTE: Record<TypeAlerteRh, [avant: string, apres: string]> = {
  fin_contrat: ['fin de contrat le', 'contrat terminé le'],
  fin_essai: ["fin d'essai le", "fin d'essai le"],
  visite_medicale: ['visite médicale le', 'visite médicale dépassée depuis le'],
  piece_identite: ["pièce d'identité expire le", "pièce d'identité expirée le"],
};

// Masse figée d'un reporting déposé : le montant brut, sinon (reporting
// antérieur à ce champ) le nombre en tête du texte « 650 000 FCFA / mois ».
function masseDuReporting(contenu: unknown): number | null {
  const r = Array.isArray(contenu) ? (contenu as Rubrique[]).find((x) => x.libelle === MASSE) : undefined;
  if (!r) return null;
  if (typeof r.montant === 'number') return r.montant;
  const m = /^([\d\s\u00a0\u202f]+) FCFA/.exec(r.valeur);
  return m ? Number(m[1].replace(/\D/g, '')) : null;
}

type Dossier = {
  id: string;
  prenom: string;
  nom: string;
  typeContrat: string;
  salaires: ChangementSource[];
  entree: string;
  sortie: string | null;
};

// Reporting RH → CFO prérempli depuis le HUB (revue RH 20/10/2026, rubriques
// D18 validées par le user) : effectif, masse salariale, absences, temps,
// demandes, échéances légales, paie. Le commentaire de la RH est l'analyse
// obligatoire au dépôt. Aucune donnée individuelle de paie : des totaux.
@Injectable()
export class ReportingRhService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
    private temps: TempsService,
    private alertes: AlertesRhService,
  ) {}

  async contenu(societeId: string, mois: string): Promise<Rubrique[]> {
    const { debut, fin } = bornesMois(mois);
    const dossiers: Dossier[] = (
      await this.prisma.dossierPersonnel.findMany({
        where: { societeId },
        select: {
          id: true,
          prenom: true,
          nom: true,
          typeContrat: true,
          dateEntree: true,
          archiveLe: true,
          salaires: {
            where: { statut: 'valide' },
            select: { montant: true, dateEffet: true, statut: true, decideLe: true },
          },
        },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      })
    ).map((d) => ({ ...d, entree: d.dateEntree ?? '', sortie: d.archiveLe ? jourIso(d.archiveLe) : null }));
    // Présent au soir du dernier jour / à un moment du mois. Sans date
    // d'entrée : présent depuis toujours (comme les feuilles de temps).
    const presentLe = (d: Dossier, jour: string) => d.entree <= jour && (!d.sortie || d.sortie > jour);
    const presentDans = (d: Dossier, m: { debut: string; fin: string }) =>
      d.entree <= m.fin && (!d.sortie || d.sortie >= m.debut);
    const effectif = dossiers.filter((d) => presentLe(d, fin));

    const precedent = moisPrecedent(mois);
    const [absences, demandes, feuilles, echeances, bulletins, reportingPrecedent] = await Promise.all([
      this.absences(societeId, mois),
      this.demandes(societeId, debut, fin),
      this.temps.feuilles(mois, societeId),
      this.alertes.alertes(fin, societeId),
      this.prisma.bulletinPaie.findMany({ where: { mois, dossier: { societeId } }, select: { dossierId: true } }),
      this.prisma.reportingMensuel.findUnique({
        where: { societeId_type_mois: { societeId, type: 'rh', mois: precedent } },
        select: { contenu: true },
      }),
    ]);

    // 1. Effectif
    const parContrat = (['cdi', 'cdd', 'stage'] as const)
      .map((t) => [t, effectif.filter((d) => d.typeContrat === t).length] as const)
      .filter(([, n]) => n > 0)
      .map(([t, n]) => `${n} ${t === 'stage' ? 'stage' : t.toUpperCase()}`);
    const entrees = dossiers.filter((d) => d.entree && moisDe(d.entree) === mois);
    const sorties = dossiers.filter((d) => d.sortie && moisDe(d.sortie) === mois);
    const liste = (ds: Dossier[]) => (ds.length ? `${ds.length} (${noms(ds)})` : '0');

    // 2. Masse salariale : salaires EN VIGUEUR au dernier jour du mois
    // (historique, date d'effet), comparée au chiffre FIGÉ du reporting RH
    // déposé le mois précédent — pas à un recalcul (revue RH validée, 20/10/2026).
    const salaires = effectif.map((d) => salaireAu(d.salaires, fin));
    const masse = salaires.reduce<number>((t, s) => t + (s ?? 0), 0);
    const masseFigee = masseDuReporting(reportingPrecedent?.contenu);
    const manquants = salaires.filter((s) => s === null).length;
    const comparaison = !reportingPrecedent
      ? `pas de reporting RH déposé pour ${moisCourt(precedent)} : pas de comparaison`
      : masseFigee == null
        ? `chiffre de ${moisCourt(precedent)} illisible : pas de comparaison`
        : masse === masseFigee
          ? `stable par rapport au reporting de ${moisCourt(precedent)}`
          : `${masse > masseFigee ? '+' : '−'}${fcfa(Math.abs(masse - masseFigee))} par rapport au reporting de ${moisCourt(precedent)}`;

    // 4. Temps
    const aControler = feuilles.feuilles.filter((f) => f.statut === 'a_controler' || f.statut === 'controlee');
    const sansHeures = feuilles.feuilles.filter((f) => f.statut === 'sans_heures').length;
    const ecarts = feuilles.feuilles.filter((f) => f.ecart && !f.ecart.traiteLe).length;

    // 7. Paie
    const payes = dossiers.filter((d) => presentDans(d, { debut, fin }));
    const deposes = new Set(bulletins.map((b) => b.dossierId));
    const sansBulletin = payes.filter((d) => !deposes.has(d.id));

    return [
      {
        libelle: 'Effectif',
        valeur: `${pluriel(effectif.length, 'salarié')} au ${dateFr(fin)}${parContrat.length ? ` · ${parContrat.join(', ')}` : ''} · entrées : ${liste(entrees)} · sorties : ${liste(sorties)}`,
      },
      {
        libelle: MASSE,
        valeur:
          `${fcfa(masse)} / mois · ${comparaison}` +
          (manquants ? ` · ${pluriel(manquants, 'salaire')} non renseigné${manquants > 1 ? 's' : ''}` : ''),
        montant: masse,
      },
      {
        libelle: 'Absences',
        valeur: [
          ...(absences.jours.length
            ? absences.jours.map(([t, j]) => `${LIBELLE_ABSENCE[t]} ${j} j`)
            : ['Aucune absence']),
          ...(absences.refusees
            ? [`${pluriel(absences.refusees, 'demande')} refusée${absences.refusees > 1 ? 's' : ''}`]
            : []),
        ].join(' · '),
      },
      {
        libelle: 'Temps',
        valeur:
          `${aControler.filter((f) => f.statut === 'controlee').length} / ${aControler.length} feuille(s) contrôlée(s)` +
          (sansHeures ? ` · ${sansHeures} sans heures` : '') +
          ` · ${ecarts ? `${pluriel(ecarts, 'écart')} ouvert${ecarts > 1 ? 's' : ''}` : 'aucun écart ouvert'}`,
      },
      {
        libelle: 'Demandes',
        valeur:
          `${demandes.traitees} traitée(s)` +
          (demandes.delaiMoyen == null ? '' : ` en ${demandes.delaiMoyen.toLocaleString('fr-FR')} j en moyenne`) +
          ` · ${demandes.relances ? `${pluriel(demandes.relances, 'relance')} envoyée${demandes.relances > 1 ? 's' : ''}` : 'aucune relance'}`,
      },
      {
        libelle: 'Échéances légales',
        valeur: echeances.length
          ? echeances
              .map((a) => `${nomDe(a)} · ${LIBELLE_ALERTE[a.type][a.jours < 0 ? 1 : 0]} ${dateFr(a.date)}`)
              .join(' ; ')
          : 'Aucune',
      },
      {
        libelle: 'Paie',
        valeur:
          `${payes.length - sansBulletin.length} / ${payes.length} bulletin(s) déposé(s)` +
          (sansBulletin.length ? ` · manquant${sansBulletin.length > 1 ? 's' : ''} : ${noms(sansBulletin)}` : ''),
      },
    ];
  }

  // Jours ouvrables d'absence validée tombant dans le mois, par type ; et les
  // demandes refusées dans le mois.
  private async absences(societeId: string, mois: string) {
    const { debut, fin } = bornesMois(mois);
    const [validees, refusees, feries] = await Promise.all([
      this.prisma.demandeAbsence.findMany({
        where: { statut: 'validee', dateDebut: { lte: fin }, dateFin: { gte: debut }, dossier: { societeId } },
        select: { type: true, dateDebut: true, dateFin: true },
      }),
      this.prisma.demandeAbsence.count({
        where: {
          statut: 'refusee',
          updatedAt: { gte: new Date(`${debut}T00:00:00Z`), lte: new Date(`${fin}T23:59:59.999Z`) },
          dossier: { societeId },
        },
      }),
      this.reglages.joursFeries([societeId]),
    ]);
    const ferieSet = feries.get(societeId) ?? new Set<string>();
    const parType = new Map<TypeAbsence, number>();
    for (const a of validees) {
      const j = joursOuvrables(a.dateDebut > debut ? a.dateDebut : debut, a.dateFin < fin ? a.dateFin : fin, ferieSet);
      parType.set(a.type, (parType.get(a.type) ?? 0) + j);
    }
    const ordre = Object.keys(LIBELLE_ABSENCE) as TypeAbsence[];
    return { jours: ordre.filter((t) => parType.get(t)).map((t) => [t, parType.get(t)!] as const), refusees };
  }

  // Demandes tranchées dans le mois (absences, remboursements transmis ou
  // rejetés, attestations délivrées), délai moyen depuis le dépôt, et relances
  // automatiques envoyées dans le mois pour les demandes de la société.
  private async demandes(societeId: string, debut: string, fin: string) {
    const dans = { gte: new Date(`${debut}T00:00:00Z`), lte: new Date(`${fin}T23:59:59.999Z`) };
    const dossier = { societeId };
    const [absences, remboursements, attestations, rappels] = await Promise.all([
      this.prisma.demandeAbsence.findMany({
        where: {
          dossier,
          OR: [
            { statut: 'validee', valideRhLe: dans },
            { statut: 'refusee', updatedAt: dans },
          ],
        },
        select: { createdAt: true, valideRhLe: true, decisionN1Le: true, updatedAt: true },
      }),
      this.prisma.demandeRemboursement.findMany({
        where: { dossier, OR: [{ transmiseLe: dans }, { transmiseLe: null, statut: 'rejetee', traiteLe: dans }] },
        select: { createdAt: true, transmiseLe: true, traiteLe: true },
      }),
      this.prisma.demandeAttestation.findMany({
        where: { dossier, delivreeLe: dans },
        select: { demandeLe: true, delivreeLe: true },
      }),
      this.prisma.rappelEnvoye.findMany({
        where: { cle: { startsWith: 'demande:' }, createdAt: dans },
        select: { cle: true },
      }),
    ]);
    const delais = [
      ...absences.map((a) => [a.createdAt, a.valideRhLe ?? a.decisionN1Le ?? a.updatedAt] as const),
      ...remboursements.map((r) => [r.createdAt, r.transmiseLe ?? r.traiteLe!] as const),
      ...attestations.map((t) => [t.demandeLe, t.delivreeLe!] as const),
    ].map(([de, a]) => (a.getTime() - de.getTime()) / JOUR);
    const delaiMoyen = delais.length ? Math.round((delais.reduce((t, d) => t + d, 0) / delais.length) * 10) / 10 : null;

    // « demande:<type>:<id>[:n1|:final]:<palier> » → id, puis filtre société.
    const ids = { absence: new Set<string>(), remboursement: new Set<string>(), attestation: new Set<string>() };
    const parRappel = rappels.flatMap((r) => {
      const [, type, id] = r.cle.split(':');
      if (!(type in ids)) return [];
      ids[type as keyof typeof ids].add(id);
      return [{ type: type as keyof typeof ids, id }];
    });
    const enSociete = (ensemble: Set<string>) => ({ id: { in: [...ensemble] }, dossier });
    const [a, r, t] = await Promise.all([
      ids.absence.size
        ? this.prisma.demandeAbsence.findMany({ where: enSociete(ids.absence), select: { id: true } })
        : [],
      ids.remboursement.size
        ? this.prisma.demandeRemboursement.findMany({ where: enSociete(ids.remboursement), select: { id: true } })
        : [],
      ids.attestation.size
        ? this.prisma.demandeAttestation.findMany({ where: enSociete(ids.attestation), select: { id: true } })
        : [],
    ]);
    const siens = new Set([...a, ...r, ...t].map((x) => x.id));
    return { traitees: delais.length, delaiMoyen, relances: parRappel.filter((x) => siens.has(x.id)).length };
  }
}

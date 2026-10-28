'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlarmClock,
  BadgeCheck,
  Banknote,
  CalendarCheck,
  ChevronDown,
  ClipboardList,
  FileCheck2,
  HandCoins,
  HardHat,
  Lock,
  TriangleAlert,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { getProjets } from '@/lib/crm';
import { getAbsencesAValider, LIBELLE_TYPE_ABSENCE } from '@/lib/demandes';
import {
  getAvoirsAValider,
  getClotures,
  LIBELLE_MOTIF_AVOIR,
  lienFacturationProjet,
  type AvoirAValider,
  type MoisCloture,
} from '@/lib/facturation';
import { DecisionAvoir } from '@/components/finances/decision-avoir';
import { PayerCommission } from '@/components/finances/payer-commission';
import { getCommissions, type CommissionApporteur } from '@/lib/commissions';
import { aValiderCfo } from '@/lib/finances';
import { daysSince, formatAmount, formatCompactAmount, formatDayMonth, plural, ROLE_CEO, todayIso } from '@hub/domain';
import { useSessionCourante } from '@/lib/layout-contexte';
import { getReportingsRecus, type ReportingRecu } from '@/lib/pilotage';
import { getSalairesAValider, LIBELLE_MOTIF_SALAIRE, type SalaireAValider } from '@/lib/rh';
import { contresigneAffaire, useContresignature } from '@/lib/seuil-ceo';
import type { BureauARegler, DemandeAbsence, FactureCentrale, Projet } from '@/lib/types';
import { Pill } from '@/components/ui/pill';

type Ton = 'risque' | 'attention' | 'info' | 'neutre';
type Element = {
  cle: string;
  groupe: number;
  tri: string;
  icone: LucideIcon;
  titre: string;
  detail: string;
  quand: string;
  ton: Ton;
  action: string;
  ouvrir: () => void;
};

const HEURE = 3_600_000;
// Délai de validation d'une offre par le CFO (maquette CRM) : orange à mi-
// parcours, rouge une fois dépassé — même constante que le serveur (Pilotage).
const DELAI_OFFRE_H = 48;
const nom = (p?: { prenom: string; nom: string } | null) => (p ? `${p.prenom} ${p.nom}`.trim() : 'Salarié');
const VISIBLES = 6;

// « À valider aujourd'hui » du CFO (revue CFO 20/10/2026) : en tête de
// Finances, tout ce qui attend sa décision, par urgence — offres (compteur
// des 48 h), factures directes à émettre, bureaux d'études à régler,
// salaires, absences dont il est le N+1, reporting reçu. Au-dessus : encaissé
// du mois et total en retard.
export function AValiderCfo({
  slug,
  factures,
  bureaux,
  onOuvrirFacture,
  onOuvrirClotures,
  version,
}: {
  slug: string;
  factures: FactureCentrale[] | null;
  bureaux: BureauARegler[];
  onOuvrirFacture: (id: string) => void;
  onOuvrirClotures: () => void;
  version: number; // relu après une clôture ou un avoir décidé ailleurs
}) {
  const router = useRouter();
  const session = useSessionCourante();
  const contresignature = useContresignature(slug, session);
  const [offres, setOffres] = useState<Projet[]>([]);
  const [absences, setAbsences] = useState<DemandeAbsence[]>([]);
  const [salaires, setSalaires] = useState<SalaireAValider[]>([]);
  const [reportings, setReportings] = useState<ReportingRecu[]>([]);
  const [avoirs, setAvoirs] = useState<AvoirAValider[]>([]);
  const [moisTermine, setMoisTermine] = useState<MoisCloture | null>(null);
  const [avoirOuvert, setAvoirOuvert] = useState<AvoirAValider | null>(null);
  const [commissions, setCommissions] = useState<CommissionApporteur[]>([]);
  const [commissionOuverte, setCommissionOuverte] = useState<CommissionApporteur | null>(null);
  const [versionCommissions, setVersionCommissions] = useState(0);
  const [tout, setTout] = useState(false);
  const [maintenant] = useState(() => Date.now());

  // Chaque source est facultative : sans le droit, la ligne n'apparaît pas.
  useEffect(() => {
    getProjets(slug)
      .then((p) => setOffres(p.filter((x) => x.statut === 'en_validation')))
      .catch(() => setOffres([]));
    getAbsencesAValider(slug)
      .then(setAbsences)
      .catch(() => setAbsences([]));
    getSalairesAValider(slug)
      .then(setSalaires)
      .catch(() => setSalaires([]));
    getReportingsRecus(slug)
      .then(setReportings)
      .catch(() => setReportings([]));
  }, [slug]);
  // Contrôle interne : avoirs à décider (CEO) et clôture du mois terminé.
  useEffect(() => {
    getAvoirsAValider(slug)
      .then(setAvoirs)
      .catch(() => setAvoirs([]));
    getClotures(slug)
      .then((l) => setMoisTermine(l[0] ?? null))
      .catch(() => setMoisTermine(null));
  }, [slug, version]);
  // Commissions des apporteurs à payer (revue COO) : le CFO paie.
  useEffect(() => {
    getCommissions(slug)
      .then((l) => setCommissions(l.peutPayer ? l.lignes.filter((c) => c.statut === 'a_payer') : []))
      .catch(() => setCommissions([]));
  }, [slug, versionCommissions]);

  const tresorerie = useMemo(() => {
    const mois = new Date().toISOString().slice(0, 7);
    const liste = factures ?? [];
    return {
      encaisseMois: liste.reduce(
        (t, f) => t + f.paiements.filter((p) => p.date.startsWith(mois)).reduce((s, p) => s + p.montant, 0),
        0,
      ),
      enRetard: liste.filter((f) => f.statutEffectif === 'en_retard'),
    };
  }, [factures]);

  const elements: Element[] = [];
  // 1. Offres soumises : le compteur des 48 h (le CEO ne voit que les siennes).
  for (const o of offres.filter((x) => contresigneAffaire(session, contresignature, x.offre?.montantTtc ?? 0))) {
    const ecoule = o.soumisLe ? (maintenant - Date.parse(o.soumisLe)) / HEURE : 0;
    const reste = Math.round(DELAI_OFFRE_H - ecoule);
    elements.push({
      cle: `offre-${o.id}`,
      groupe: 1,
      tri: o.soumisLe ?? '',
      icone: FileCheck2,
      titre: `Offre · ${o.client.nom} · ${o.code}`,
      detail: `${o.offre ? `${formatAmount(o.offre.montantTtc)} TTC · ` : ''}soumise${o.soumisLe ? ` le ${formatDayMonth(o.soumisLe)}` : ''}, à valider avant l’envoi au client`,
      // Au-delà d'un jour de dépassement, l'attente se lit en jours.
      quand:
        reste >= 0
          ? `reste ${reste} h`
          : ecoule >= DELAI_OFFRE_H + 24
            ? `en attente depuis ${Math.floor(ecoule / 24)} j`
            : `48 h dépassées de ${-reste} h`,
      ton: reste < 0 ? 'risque' : ecoule >= DELAI_OFFRE_H / 2 ? 'attention' : 'info',
      action: 'Examiner',
      ouvrir: () => router.push(`/admin/${slug}/crm?dossier=${o.id}`),
    });
  }
  // 1 bis. Avoirs au-delà du seuil, à valider (CEO).
  for (const a of avoirs) {
    const jours = daysSince(a.demandeLe, maintenant);
    elements.push({
      cle: `avoir-${a.id}`,
      groupe: 1,
      tri: a.demandeLe,
      icone: Undo2,
      titre: `Avoir à valider · ${a.reference ?? 'facture'}${a.client ? ` · ${a.client}` : ''}`,
      detail: `${formatAmount(a.montantTtc)} TTC · ${LIBELLE_MOTIF_AVOIR[a.motif].toLowerCase()} · demandé${a.demandePar ? ` par ${a.demandePar}` : ''}`,
      quand: jours <= 0 ? 'aujourd’hui' : `depuis ${jours} j`,
      ton: jours > 2 ? 'risque' : 'attention',
      action: 'Examiner',
      ouvrir: () => setAvoirOuvert(a),
    });
  }
  // 2. Factures directes préparées, à émettre.
  // Le CEO ne voit que celles au-delà du seuil : en deçà, c'est au CFO (revue CEO).
  for (const f of (factures ?? []).filter(
    (x) => aValiderCfo(x) && contresigneAffaire(session, contresignature, x.montantTtc),
  )) {
    const jours = daysSince(f.creeLe, maintenant);
    elements.push({
      cle: `facture-${f.id}`,
      groupe: 2,
      tri: f.creeLe,
      icone: ClipboardList,
      titre: `Facture à émettre · ${f.client?.nom ?? f.dossierCrm?.code ?? 'client'}`,
      detail: `${formatAmount(f.montantTtc)} TTC · ${f.libelle || 'facture directe'}`,
      quand: jours <= 0 ? 'aujourd’hui' : `depuis ${jours} j`,
      ton: jours > 2 ? 'risque' : 'attention',
      action: 'Émettre',
      ouvrir: () => onOuvrirFacture(f.id),
    });
  }
  // 3. Bureaux d'études à régler (client encaissé, CGV art. 5).
  for (const b of bureaux) {
    elements.push({
      cle: `bureau-${b.blocId}`,
      groupe: 3,
      tri: b.projet.code,
      icone: HardHat,
      titre: `Bureau d’études à régler · ${b.bureau}`,
      detail: `${b.libelle} · ${b.projet.code}${b.montantBureauHt != null ? ` · ${formatAmount(b.montantBureauHt)} HT` : ''} · client encaissé`,
      quand: '',
      ton: 'attention',
      action: 'Régler',
      ouvrir: () => router.push(lienFacturationProjet(slug, b.projet.id)),
    });
  }
  // 3 bis. Commissions des apporteurs exigibles (revue COO, 22/10/2026).
  for (const c of commissions) {
    const jours = daysSince(c.exigibleLe, maintenant);
    elements.push({
      cle: `commission-${c.id}`,
      groupe: 3,
      tri: c.exigibleLe,
      icone: HandCoins,
      titre: `Commission à payer · ${c.apporteur} · ${c.code}`,
      detail: `${formatAmount(c.montant)} · ${c.taux} % de ${formatAmount(c.baseHt)} HT ${c.source === 'encaissement' ? 'encaissés' : 'signés'}`,
      quand: jours <= 0 ? 'aujourd’hui' : `depuis ${jours} j`,
      ton: jours > 7 ? 'risque' : 'attention',
      action: 'Payer',
      ouvrir: () => setCommissionOuverte(c),
    });
  }
  // 4. Salaires proposés par la RH.
  for (const s of salaires) {
    const jours = daysSince(s.proposeLe, maintenant);
    elements.push({
      cle: `salaire-${s.id}`,
      groupe: 4,
      tri: s.proposeLe,
      icone: BadgeCheck,
      titre: `Salaire · ${s.salarie} · ${LIBELLE_MOTIF_SALAIRE[s.motif]}`,
      detail: `effet le ${s.dateEffet ? formatDayMonth(s.dateEffet) : 'date inconnue'} · proposé${s.proposePar ? ` par ${s.proposePar}` : ''}`,
      quand: jours <= 0 ? 'aujourd’hui' : `depuis ${jours} j`,
      ton: jours > 3 ? 'risque' : 'attention',
      action: 'Examiner',
      ouvrir: () => router.push(`/admin/${slug}/rh`),
    });
  }
  // 5. Absences dont il est le N+1 (la RH).
  for (const a of absences) {
    const jours = daysSince(a.createdAt, maintenant);
    elements.push({
      cle: `absence-${a.id}`,
      groupe: 5,
      tri: a.createdAt,
      icone: CalendarCheck,
      titre: `${LIBELLE_TYPE_ABSENCE[a.type]} · ${nom(a.salarie)}`,
      detail: `du ${formatDayMonth(a.dateDebut)} au ${formatDayMonth(a.dateFin)} · ${a.jours} j · votre décision de N+1`,
      quand: jours <= 0 ? 'aujourd’hui' : `depuis ${jours} j`,
      ton: jours > 3 ? 'risque' : 'attention',
      action: 'Décider',
      ouvrir: () => router.push(`/admin/${slug}/mon-espace?onglet=a-valider`),
    });
  }
  // 5 bis. Clôture du mois terminé (relance par défaut à partir du 5).
  if (moisTermine && !moisTermine.clos && session.role !== ROLE_CEO) {
    const jour = Number(todayIso().slice(8, 10));
    elements.push({
      cle: `cloture-${moisTermine.mois}`,
      groupe: 5,
      tri: moisTermine.mois,
      icone: Lock,
      titre: `Clôture de ${moisTermine.periode} à faire`,
      detail: `${moisTermine.chiffres.factures} facture(s) · ${moisTermine.chiffres.paiements} paiement(s) à figer`,
      quand: `terminé il y a ${jour} j`,
      ton: jour > 5 ? 'risque' : 'attention',
      action: 'Clôturer',
      ouvrir: onOuvrirClotures,
    });
  }
  // 6. Reporting reçu du dernier mois clos, tant qu'il n'est pas lu.
  for (const r of reportings.filter((x) => !x.lu)) {
    elements.push({
      cle: `reporting-${r.type}-${r.mois}`,
      groupe: 6,
      tri: r.deposeLe,
      icone: ClipboardList,
      titre: `Reporting ${r.type === 'rh' ? 'RH' : 'de la direction'} · ${r.periode}`,
      detail: `déposé par ${r.emetteur} le ${formatDayMonth(r.deposeLe)}, à lire`,
      quand: '',
      ton: 'neutre',
      action: 'Lire',
      ouvrir: () => router.push(`/admin/${slug}?onglet=reportings`),
    });
  }
  elements.sort((a, b) => a.groupe - b.groupe || a.tri.localeCompare(b.tri));
  const urgents = elements.filter((e) => e.ton === 'risque').length;
  const visibles = tout ? elements : elements.slice(0, VISIBLES);
  const retard = tresorerie.enRetard.reduce((t, f) => t + f.resteAPayer, 0);

  return (
    <section className="panel glass-panel at-rh avc" aria-label="À valider aujourd’hui">
      <div className="avc-tresorerie">
        <div className="avc-chiffre">
          <span className="avc-chiffre-icone" aria-hidden>
            <Banknote size={16} />
          </span>
          <span>
            <span className="avc-chiffre-libelle">Encaissé ce mois</span>
            <strong>{factures ? formatCompactAmount(tresorerie.encaisseMois) : '…'}</strong>
          </span>
        </div>
        <div className="avc-chiffre" data-ton={retard > 0 ? 'risque' : undefined}>
          <span className="avc-chiffre-icone" aria-hidden>
            <TriangleAlert size={16} />
          </span>
          <span>
            <span className="avc-chiffre-libelle">En retard de paiement</span>
            <strong>{factures ? formatCompactAmount(retard) : '…'}</strong>
            {tresorerie.enRetard.length > 0 && (
              <span className="cell-sub">{plural(tresorerie.enRetard.length, 'facture')}</span>
            )}
          </span>
        </div>
      </div>

      <div className="at-rh-tete">
        <h2 className="dmd-titre">
          <AlarmClock size={17} aria-hidden /> À valider aujourd’hui · {elements.length}
        </h2>
        {urgents > 0 && <Pill tone="risque">{urgents} en retard</Pill>}
      </div>
      {elements.length === 0 ? (
        <p className="dmd-note">Rien en attente : offres, factures, règlements, salaires et absences sont à jour.</p>
      ) : (
        <ul className="at-rh-liste">
          {visibles.map((e) => (
            <li key={e.cle} className="at-rh-ligne" data-ton={e.ton}>
              <span className="at-rh-icone" aria-hidden>
                <e.icone size={16} />
              </span>
              <span className="at-rh-corps">
                <strong>{e.titre}</strong>
                <span className="cell-sub">{e.detail}</span>
              </span>
              {e.quand && <span className="at-rh-quand">{e.quand}</span>}
              <button type="button" className="btn-ghost btn-ghost--sm" onClick={e.ouvrir}>
                {e.action}
              </button>
            </li>
          ))}
        </ul>
      )}
      {avoirOuvert && (
        <DecisionAvoir slug={slug} avoir={avoirOuvert} onFait={setAvoirs} onClose={() => setAvoirOuvert(null)} />
      )}
      {commissionOuverte && (
        <PayerCommission
          slug={slug}
          commission={commissionOuverte}
          onFait={() => setVersionCommissions((v) => v + 1)}
          onClose={() => setCommissionOuverte(null)}
        />
      )}
      {elements.length > VISIBLES && (
        <button type="button" className="at-rh-plus" aria-expanded={tout} onClick={() => setTout((x) => !x)}>
          <ChevronDown size={15} aria-hidden className={tout ? 'is-ouvert' : undefined} />
          {tout ? 'Réduire' : `Voir les ${elements.length - VISIBLES} autres`}
        </button>
      )}
    </section>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlarmClock,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  FileWarning,
  MessageCircleQuestion,
  IdCard,
  Inbox,
  Scale,
  Stethoscope,
  Timer,
  UserCheck,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import type { AttestationRh } from '@/lib/demandes';
import { LIBELLE_SOINS, LIBELLE_TYPE_ABSENCE } from '@/lib/demandes';
import { getFeuillesTemps } from '@/lib/temps';
import { formatAmount } from '@/lib/format';
import type { AlerteRh } from '@/lib/rh';
import type { QuestionOuverte } from '@/lib/pilotage';
import type {
  DemandeAbsence,
  DemandeRemboursement,
  DossierPersonnel,
  FeuillesTemps,
  IntegrationSalarie,
  ReportingADeposer,
} from '@/lib/types';
import { daysBetween, formatDayMonth, formatMonthYear, todayIso } from '@/lib/dates';
import { plural } from '@/lib/text';

export type OngletRh = 'personnel' | 'temps' | 'integration' | 'demandes';
export type DonneesRh = {
  demandes: { absences: DemandeAbsence[]; remboursements: DemandeRemboursement[]; attestations: AttestationRh[] };
  feuilles: FeuillesTemps;
  integrations: IntegrationSalarie[];
  alertes: AlerteRh[];
  reportings: ReportingADeposer[];
  questions: QuestionOuverte[]; // questions du destinataire sur un reporting déposé
};
type Ton = 'risque' | 'attention' | 'info' | 'neutre';
type Element = {
  cle: string;
  groupe: number; // ordre d'urgence (cf. GROUPES)
  tri: string; // à l'intérieur du groupe : le plus ancien / le plus proche d'abord
  icone: LucideIcon;
  titre: string;
  detail: string;
  quand: string;
  ton: Ton;
  action: string;
  ouvrir: () => void;
};

const nom = (p?: { prenom: string; nom: string } | null) => (p ? `${p.prenom} ${p.nom}`.trim() : 'Salarié');
// Une demande qui attend depuis plus de 3 jours passe en rouge.
const ATTENTE_ALERTE_J = 3;
const INTEGRATION_J = 7; // points d'intégration de la semaine

// « À traiter aujourd'hui » (revue RH 20/10/2026) : en tête de la page RH,
// trié par urgence — demandes (les plus anciennes d'abord), écarts de feuille
// de temps, points d'intégration de la semaine, fins de contrat, feuilles à
// contrôler, dossiers incomplets. Même principe que « Mes tâches ».
export function ATraiterRh({
  slug,
  donnees,
  dossiers,
  onOuvrir,
}: {
  slug: string;
  donnees: DonneesRh | null;
  dossiers: DossierPersonnel[];
  onOuvrir: (onglet: OngletRh, options?: { filtre?: 'incomplets' | 'fins'; dossier?: DossierPersonnel }) => void;
}) {
  const aujourdhui = useMemo(() => todayIso(), []);
  const [ecarts, setEcarts] = useState<
    { cle: string; nom: string; mois: string; commentaire: string; signaleLe: string }[]
  >([]);
  const [tout, setTout] = useState(false);
  const router = useRouter();

  // Écarts ouverts : le détail (qui, quel mois) vient des feuilles des mois concernés.
  const moisEcarts =
    donnees?.feuilles.periodes
      .filter((p) => p.ecarts > 0)
      .map((p) => p.mois)
      .join(',') ?? '';
  useEffect(() => {
    if (!moisEcarts) {
      setEcarts([]);
      return;
    }
    Promise.all(moisEcarts.split(',').map((m) => getFeuillesTemps(slug, m)))
      .then((l) =>
        setEcarts(
          l.flatMap((f) =>
            f.feuilles
              .filter((x) => x.ecart && !x.ecart.traiteLe)
              .map((x) => ({
                cle: x.ecart!.id,
                nom: `${x.prenom} ${x.nom}`.trim(),
                mois: f.mois,
                commentaire: x.ecart!.commentaire,
                signaleLe: x.ecart!.signaleLe,
              })),
          ),
        ),
      )
      .catch(() => setEcarts([]));
  }, [slug, moisEcarts]);

  if (!donnees) return null;
  const depuis = (iso: string) => {
    const n = daysBetween(iso, aujourdhui);
    return {
      quand: n <= 0 ? 'aujourd’hui' : n === 1 ? 'depuis hier' : `depuis ${n} j`,
      ton: (n > ATTENTE_ALERTE_J ? 'risque' : 'attention') as Ton,
    };
  };
  const elements: Element[] = [];

  // 1. Demandes, les plus anciennes d'abord.
  for (const a of donnees.demandes.absences.filter((x) => x.statut === 'accord_n1' && x.valideurFinal !== 'ceo')) {
    const d = depuis(a.createdAt);
    elements.push({
      cle: `abs-${a.id}`,
      groupe: 1,
      tri: a.createdAt,
      icone: Inbox,
      ...d,
      action: 'Valider',
      titre: `${LIBELLE_TYPE_ABSENCE[a.type]} · ${nom(a.salarie)}`,
      detail: `du ${formatDayMonth(a.dateDebut)} au ${formatDayMonth(a.dateFin)} · ${a.jours} j · accord du N+1, validation finale`,
      ouvrir: () => onOuvrir('demandes'),
    });
  }
  for (const r of donnees.demandes.remboursements.filter((x) => x.statut === 'soumise')) {
    const d = depuis(r.createdAt);
    elements.push({
      cle: `rbt-${r.id}`,
      groupe: 1,
      tri: r.createdAt,
      icone: Inbox,
      ...d,
      action: 'Traiter',
      titre: `Remboursement · ${nom(r.dossier)}`,
      detail: `${LIBELLE_SOINS[r.categorie]} · ${formatAmount(r.montant)} · à transmettre à l’assurance`,
      ouvrir: () => onOuvrir('demandes'),
    });
  }
  for (const t of donnees.demandes.attestations.filter((x) => !x.delivreeLe)) {
    const d = depuis(t.demandeLe);
    elements.push({
      cle: `att-${t.id}`,
      groupe: 1,
      tri: t.demandeLe,
      icone: Inbox,
      ...d,
      action: 'Délivrer',
      titre: `Attestation de travail · ${nom(t.dossier)}`,
      detail: 'document signé à déposer',
      ouvrir: () => onOuvrir('demandes'),
    });
  }
  for (const p of dossiers.filter((x) => x.paiementDemandeMode && x.paiementDemandeLe)) {
    const d = depuis(p.paiementDemandeLe!);
    elements.push({
      cle: `pai-${p.id}`,
      groupe: 1,
      tri: p.paiementDemandeLe!,
      icone: Inbox,
      ...d,
      action: 'Ouvrir',
      titre: `Moyen de paiement · ${nom(p)}`,
      detail: 'changement demandé, à valider avant la paie',
      ouvrir: () => onOuvrir('personnel', { dossier: p }),
    });
  }
  // 2. Écarts de feuille de temps (le contrôle du mois attend la réponse).
  for (const e of ecarts) {
    const d = depuis(e.signaleLe);
    elements.push({
      cle: `ecart-${e.cle}`,
      groupe: 2,
      tri: e.signaleLe,
      icone: Scale,
      ...d,
      action: 'Répondre',
      titre: `Écart signalé · ${e.nom}`,
      detail: `feuille de ${formatMonthYear(e.mois)} · « ${e.commentaire} »`,
      ouvrir: () => onOuvrir('temps'),
    });
  }
  // 3. Points d'intégration échus ou de la semaine.
  for (const i of donnees.integrations) {
    for (const p of i.points.filter(
      (x) => x.statut !== 'fait' && daysBetween(aujourdhui, x.datePrevue) <= INTEGRATION_J,
    )) {
      const n = daysBetween(aujourdhui, p.datePrevue);
      elements.push({
        cle: `int-${i.id}-${p.jalon}`,
        groupe: 3,
        tri: p.datePrevue,
        icone: UserPlus,
        action: 'Préparer',
        titre: `Point J${p.jalon} · ${nom(i)}`,
        detail: `${i.poste || 'poste à renseigner'} · arrivée le ${formatDayMonth(i.dateEntree)}`,
        quand: n < 0 ? `en retard de ${-n} j` : n === 0 ? 'aujourd’hui' : `le ${formatDayMonth(p.datePrevue)}`,
        ton: n < 0 ? 'risque' : 'attention',
        ouvrir: () => onOuvrir('integration'),
      });
    }
  }
  // 4. Échéances légales (délais des Réglages, calculées par le serveur) :
  // fins de CDD/stage, fins d'essai, visites médicales, pièces d'identité.
  const ECHEANCES: Record<
    AlerteRh['type'],
    { icone: LucideIcon; titre: (al: AlerteRh) => string; detail: string; action: string }
  > = {
    fin_contrat: {
      icone: CalendarClock,
      titre: (al) => `Fin de ${al.typeContrat.toUpperCase()} · ${nom(al)}`,
      detail: 'renouveler, transformer ou préparer la sortie',
      action: 'Ouvrir',
    },
    fin_essai: {
      icone: UserCheck,
      titre: (al) => `Fin de période d’essai · ${nom(al)}`,
      detail: 'confirmer ou rompre à temps',
      action: 'Ouvrir',
    },
    visite_medicale: {
      icone: Stethoscope,
      titre: (al) => `Visite médicale · ${nom(al)}`,
      detail: 'à programmer',
      action: 'Ouvrir',
    },
    piece_identite: {
      icone: IdCard,
      titre: (al) => `Pièce d’identité · ${nom(al)}`,
      detail: 'nouvelle pièce à demander',
      action: 'Ouvrir',
    },
  };
  for (const al of donnees.alertes) {
    const e = ECHEANCES[al.type];
    const dossier = dossiers.find((x) => x.id === al.dossierId);
    elements.push({
      cle: `${al.type}-${al.dossierId}`,
      groupe: 4,
      tri: al.date,
      icone: e.icone,
      action: e.action,
      titre: e.titre(al),
      detail: `${al.poste || 'poste à renseigner'} · ${al.type === 'piece_identite' ? 'expire' : 'le'} ${formatDayMonth(al.date)} · ${e.detail}`,
      quand: al.jours < 0 ? `dépassée de ${-al.jours} j` : al.jours === 0 ? 'aujourd’hui' : `dans ${al.jours} j`,
      ton: al.jours <= (al.type === 'fin_essai' ? 7 : 15) ? 'risque' : 'attention',
      ouvrir: () => onOuvrir('personnel', dossier ? { dossier } : undefined),
    });
  }
  // Reporting RH du mois clos à déposer (Pilotage, échéance J+5).
  for (const r of donnees.reportings) {
    const n = daysBetween(aujourdhui, r.echeance);
    elements.push({
      cle: `reporting-${r.type}-${r.mois}`,
      groupe: 4,
      tri: r.echeance,
      icone: ClipboardList,
      action: 'Déposer',
      titre: `Reporting RH · ${r.periode}`,
      detail: `prérempli, à relire et commenter · pour le CFO, échéance le ${formatDayMonth(r.echeance)}`,
      quand: n < 0 ? `en retard de ${-n} j` : n === 0 ? 'aujourd’hui' : `dans ${n} j`,
      ton: r.statut === 'en_retard' ? 'risque' : 'attention',
      ouvrir: () => router.push(`/admin/${slug}?onglet=reportings`),
    });
  }
  // Questions du CFO sur un reporting déposé : à répondre sous le reporting.
  for (const q of donnees.questions) {
    const d = depuis(q.le);
    elements.push({
      cle: `question-${q.id}`,
      groupe: 1,
      tri: q.le,
      icone: MessageCircleQuestion,
      ...d,
      action: 'Répondre',
      titre: `Question${q.par ? ` de ${q.par}` : ''} · ${q.titre} · ${q.periode}`,
      detail: 'à répondre dans le reporting (Pilotage)',
      ouvrir: () => router.push(`/admin/${slug}?onglet=reportings`),
    });
  }
  // 5. Feuilles de temps des mois clos à contrôler.
  for (const p of donnees.feuilles.periodes.filter((x) => x.clos && x.aControler > 0)) {
    // Projets dont la rentabilité attend ces feuilles (détail connu pour le
    // mois chargé) : le CFO ne voit aucune marge tant qu'elles ne sont pas contrôlées.
    const projets =
      donnees.feuilles.mois === p.mois
        ? new Set(
            donnees.feuilles.feuilles
              .filter((f) => f.statut === 'a_controler')
              .flatMap((f) => f.lignes.filter((l) => l.heures > 0).map((l) => l.projetCode)),
          ).size
        : 0;
    elements.push({
      cle: `feuilles-${p.mois}`,
      groupe: 5,
      tri: p.mois,
      icone: Timer,
      action: 'Contrôler',
      titre: `${plural(p.aControler, 'feuille')} de temps à contrôler`,
      detail: `mois clos de ${formatMonthYear(p.mois)}${projets ? ` · bloque${p.aControler > 1 ? 'nt' : ''} le calcul de la rentabilité de ${plural(projets, 'projet')}` : ''}`,
      quand: 'mois clos',
      ton: 'attention',
      ouvrir: () => onOuvrir('temps'),
    });
  }
  // 6. Dossiers incomplets : une ligne de synthèse.
  const incomplets = dossiers.filter((x) => x.completude.pourcentage < 100).length;
  if (incomplets) {
    elements.push({
      cle: 'incomplets',
      groupe: 6,
      tri: '',
      icone: FileWarning,
      action: 'Voir',
      titre: `${plural(incomplets, 'dossier')} incomplet${incomplets > 1 ? 's' : ''}`,
      detail: 'pièces ou champs manquants',
      quand: '',
      ton: 'neutre',
      ouvrir: () => onOuvrir('personnel', { filtre: 'incomplets' }),
    });
  }

  elements.sort((a, b) => a.groupe - b.groupe || a.tri.localeCompare(b.tri));
  const urgents = elements.filter((e) => e.ton === 'risque').length;
  const visibles = tout ? elements : elements.slice(0, 6);

  return (
    <section className="panel glass-panel at-rh" aria-label="À traiter aujourd’hui">
      <div className="at-rh-tete">
        <h2 className="dmd-titre">
          <AlarmClock size={17} aria-hidden /> À traiter aujourd’hui · {elements.length}
        </h2>
        {urgents > 0 && <span className="pill pill--risque">{urgents} en retard</span>}
      </div>
      {elements.length === 0 ? (
        <p className="dmd-note">Rien en attente : demandes, écarts, intégrations et contrats sont à jour.</p>
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
      {elements.length > 6 && (
        <button type="button" className="at-rh-plus" aria-expanded={tout} onClick={() => setTout((x) => !x)}>
          <ChevronDown size={15} aria-hidden className={tout ? 'is-ouvert' : undefined} />
          {tout ? 'Réduire' : `Voir les ${elements.length - 6} autres`}
        </button>
      )}
    </section>
  );
}

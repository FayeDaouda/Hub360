'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlarmClock, CalendarCheck, CalendarClock, ChevronDown, ClipboardList, FileClock, FileInput, Inbox, PackageCheck, Undo2, type LucideIcon } from 'lucide-react';
import { getProjets } from '@/lib/crm';
import { getAbsencesAValider, LIBELLE_TYPE_ABSENCE } from '@/lib/demandes';
import { formatMontant } from '@/lib/format';
import { useSessionCourante } from '@/lib/layout-contexte';
import { getADeciderProjets, type ADeciderProjets } from '@/lib/projets-ouverts';
import type { DemandeAbsence, Projet, VuePilotage } from '@/lib/types';

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

const JOUR = 24 * 3_600_000;
const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const nom = (p?: { prenom: string; nom: string } | null) => (p ? `${p.prenom} ${p.nom}`.trim() : 'Salarié');
const depuis = (jours: number) => (jours <= 0 ? 'aujourd’hui' : `depuis ${jours} j`);
const VISIBLES = 6;
// Le plus urgent d'abord (un retard ne doit jamais rester sous « Voir les autres »).
const RANG_TON: Record<Ton, number> = { risque: 0, attention: 1, info: 2, neutre: 3 };
// « Revêtements · Revêtements » : la carte n'est rappelée que si elle dit autre chose.
const carteDe = (carte: string, tache: string) => (carte === tache ? '' : ` · ${carte}`);

// « À décider aujourd'hui » du Dir. GC (revue Dir. GC, 21/10/2026) : en tête
// de Pilotage, tout ce qui attend sa décision ou son action, par urgence —
// remises et prolongations (architecte DPLG), dossiers renvoyés par le CFO,
// absences dont il est le N+1, offres sans réponse ou qui expirent, leads à
// prendre, reporting de direction à déposer au CTO.
export function ADeciderDirGc({ slug, vue, onOnglet }: { slug: string; vue: VuePilotage; onOnglet: (onglet: 'reportings') => void }) {
  const router = useRouter();
  const session = useSessionCourante();
  const [projets, setProjets] = useState<ADeciderProjets>({ remises: [], prolongations: [] });
  const [absences, setAbsences] = useState<DemandeAbsence[]>([]);
  const [dossiers, setDossiers] = useState<Projet[]>([]);
  const [tout, setTout] = useState(false);
  const [maintenant] = useState(() => Date.now());

  // Chaque source est facultative : sans le droit, la ligne n'apparaît pas.
  useEffect(() => {
    getADeciderProjets(slug)
      .then(setProjets)
      .catch(() => setProjets({ remises: [], prolongations: [] }));
    getAbsencesAValider(slug)
      .then(setAbsences)
      .catch(() => setAbsences([]));
    getProjets(slug)
      .then((l) => setDossiers(l.filter((d) => !d.archive)))
      .catch(() => setDossiers([]));
  }, [slug]);

  const joursDepuis = (iso: string) => Math.floor((maintenant - Date.parse(iso)) / JOUR);
  const aujourdhui = new Date(maintenant).toISOString().slice(0, 10);
  const joursAvant = (jour: string) => Math.round((Date.parse(jour) - Date.parse(aujourdhui)) / JOUR);
  const versTache = (projetId: string, tacheId: string) => () => router.push(`/admin/${slug}/projets?projet=${projetId}&tache=${tacheId}`);
  const versDossier = (id: string) => () => router.push(`/admin/${slug}/crm?dossier=${id}`);
  const miens = dossiers.filter((d) => d.proprietaire?.id === session.utilisateur.id);

  const elements: Element[] = [];
  // 1. Remises à valider (le travail des équipes attend son visa).
  for (const r of projets.remises) {
    const jours = r.remiseLe ? joursDepuis(r.remiseLe) : 0;
    elements.push({
      cle: `remise-${r.tacheId}`,
      groupe: 1,
      tri: r.remiseLe ?? '',
      icone: PackageCheck,
      titre: `Remise v${String(r.version).padStart(2, '0')} à valider · ${r.code} · ${r.tache}`,
      detail: `${r.assigne ?? 'Non assignée'}${carteDe(r.carte, r.tache)}${r.remiseLe ? ` · remise le ${jjmm(r.remiseLe)}` : ''}`,
      quand: depuis(jours),
      ton: jours > 2 ? 'risque' : jours >= 1 ? 'attention' : 'info',
      action: 'Examiner',
      ouvrir: versTache(r.projetId, r.tacheId),
    });
  }
  // 1 bis. Demandes de prolongation.
  for (const p of projets.prolongations) {
    const jours = joursDepuis(p.demandeLe);
    elements.push({
      cle: `prolongation-${p.tacheId}`,
      groupe: 1,
      tri: p.demandeLe,
      icone: CalendarClock,
      titre: `Prolongation demandée · ${p.code} · ${p.tache}`,
      detail: `${p.assigne ?? 'Non assignée'} · jusqu’au ${jjmm(p.jusquau)}${p.finPrevue ? ` au lieu du ${jjmm(p.finPrevue)}` : ''} · « ${p.motif} »`,
      quand: depuis(jours),
      ton: jours > 1 ? 'risque' : 'attention',
      action: 'Décider',
      ouvrir: versTache(p.projetId, p.tacheId),
    });
  }
  // 2. Dossiers renvoyés par le CFO : à corriger avant l'envoi de l'offre.
  for (const d of miens.filter((x) => x.renvoi)) {
    const jours = joursDepuis(d.renvoi!.le);
    elements.push({
      cle: `renvoi-${d.id}`,
      groupe: 2,
      tri: d.renvoi!.le,
      icone: Undo2,
      titre: `Dossier renvoyé par le CFO · ${d.client.nom} · ${d.code}`,
      detail: d.renvoi!.commentaire ? `« ${d.renvoi!.commentaire} »` : 'à corriger puis soumettre à nouveau',
      quand: depuis(jours),
      ton: jours > 2 ? 'risque' : 'attention',
      action: 'Corriger',
      ouvrir: versDossier(d.id),
    });
  }
  // 3. Absences dont il est le N+1 (chefs de cellule, salariés sans cellule).
  for (const a of absences) {
    const jours = joursDepuis(a.createdAt);
    elements.push({
      cle: `absence-${a.id}`,
      groupe: 3,
      tri: a.createdAt,
      icone: CalendarCheck,
      titre: `${LIBELLE_TYPE_ABSENCE[a.type]} · ${nom(a.salarie)}`,
      detail: `du ${jjmm(a.dateDebut)} au ${jjmm(a.dateFin)} · ${a.jours} j · votre décision de N+1`,
      quand: depuis(jours),
      ton: jours > 3 ? 'risque' : 'attention',
      action: 'Décider',
      ouvrir: () => router.push(`/admin/${slug}/mon-espace?onglet=a-valider`),
    });
  }
  // 4. Offres envoyées sans réponse : expirées, ou qui expirent (validité 7 j).
  for (const d of miens.filter((x) => x.statut === 'offre_envoyee')) {
    const o = d.offre;
    const envoyee = o?.dateEnvoi ? ` · envoyée le ${jjmm(o.dateEnvoi)}` : '';
    if (d.offreExpiree) {
      elements.push({
        cle: `offre-${d.id}`,
        groupe: 4,
        tri: o?.dateValidite ?? '',
        icone: FileClock,
        titre: `Offre expirée sans réponse · ${d.client.nom} · ${d.code}`,
        detail: `${o ? `${formatMontant(o.montantTtc)} TTC` : 'offre'}${envoyee} · relancer, refaire ou classer perdue`,
        quand: o?.dateValidite ? `expirée le ${jjmm(o.dateValidite)}` : 'expirée',
        ton: 'risque',
        action: 'Ouvrir',
        ouvrir: versDossier(d.id),
      });
      continue;
    }
    if (!o?.dateValidite) continue;
    const reste = joursAvant(o.dateValidite);
    elements.push({
      cle: `offre-${d.id}`,
      groupe: 4,
      tri: o.dateValidite,
      icone: FileClock,
      titre: `Offre sans réponse · ${d.client.nom} · ${d.code}`,
      detail: `${formatMontant(o.montantTtc)} TTC${envoyee} · expire le ${jjmm(o.dateValidite)}${o.relanceAFaire ? ' · relance à faire' : ''}`,
      quand: reste <= 0 ? 'expire aujourd’hui' : `expire dans ${reste} j`,
      ton: reste <= 2 ? 'risque' : 'attention',
      action: 'Relancer',
      ouvrir: versDossier(d.id),
    });
  }
  // 5. Leads sans responsable : l'un des Dir. GC le prend.
  for (const d of dossiers.filter((x) => !x.proprietaire && x.statut === 'nouveau_projet')) {
    const jours = joursDepuis(d.creeLe);
    elements.push({
      cle: `lead-${d.id}`,
      groupe: 5,
      tri: d.creeLe,
      icone: Inbox,
      titre: `Lead à assigner · ${d.client.nom} · ${d.code}`,
      detail: `créé le ${jjmm(d.creeLe)}${d.creePar ? ` par ${d.creePar.nom}` : ''}`,
      quand: depuis(jours),
      ton: jours > 2 ? 'risque' : 'attention',
      action: 'Prendre',
      ouvrir: versDossier(d.id),
    });
  }
  // 6. Reporting de direction à déposer au CTO (dû le 5 du mois suivant).
  for (const r of vue.reportings.filter((x) => x.peutDeposer && (x.statut === 'a_deposer' || x.statut === 'en_retard'))) {
    const reste = joursAvant(r.echeance);
    elements.push({
      cle: `reporting-${r.type}-${r.mois}`,
      groupe: 6,
      tri: r.echeance,
      icone: r.statut === 'en_retard' ? FileInput : ClipboardList,
      titre: `${r.titre} · ${r.periode}`,
      detail: `prérempli par le HUB, à compléter et déposer au ${r.destinataire}`,
      quand: r.statut === 'en_retard' ? `en retard depuis le ${jjmm(r.echeance)}` : `à déposer avant le ${jjmm(r.echeance)}`,
      ton: r.statut === 'en_retard' ? 'risque' : reste <= 2 ? 'attention' : 'info',
      action: 'Déposer',
      ouvrir: () => onOnglet('reportings'),
    });
  }
  elements.sort((a, b) => RANG_TON[a.ton] - RANG_TON[b.ton] || a.groupe - b.groupe || a.tri.localeCompare(b.tri));
  const urgents = elements.filter((e) => e.ton === 'risque').length;
  const visibles = tout ? elements : elements.slice(0, VISIBLES);

  return (
    <section className="panel glass-panel at-rh" aria-label="À décider aujourd’hui">
      <div className="at-rh-tete">
        <h2 className="dmd-titre">
          <AlarmClock size={17} aria-hidden /> À décider aujourd’hui · {elements.length}
        </h2>
        {urgents > 0 && <span className="pill pill--risque">{urgents} en retard</span>}
      </div>
      {elements.length === 0 ? (
        <p className="dmd-note">Rien en attente : remises, prolongations, dossiers, absences, offres et reporting sont à jour.</p>
      ) : (
        <ul className="at-rh-liste">
          {visibles.map((e) => (
            <li key={e.cle} className="at-rh-ligne" data-ton={e.ton}>
              <span className="at-rh-icone" aria-hidden>
                <e.icone size={16} strokeWidth={2} />
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
      {elements.length > VISIBLES && (
        <button type="button" className="at-rh-plus" aria-expanded={tout} onClick={() => setTout((x) => !x)}>
          <ChevronDown size={15} aria-hidden className={tout ? 'is-ouvert' : undefined} />
          {tout ? 'Réduire' : `Voir les ${elements.length - VISIBLES} autres`}
        </button>
      )}
    </section>
  );
}

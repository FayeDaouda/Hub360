'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { BadgeCheck, CalendarClock, ChevronRight, FileCheck2, FileWarning, Gavel, Hourglass, KeyRound, ReceiptText, Scale, Undo2, UserCheck } from 'lucide-react';
import { DecisionAvoir } from '@/components/finances/decision-avoir';
import { getProjets } from '@/lib/crm';
import { getAvoirsAValider, LIBELLE_MOTIF_AVOIR, type AvoirAValider } from '@/lib/facturation';
import { useSessionCourante } from '@/lib/layout-contexte';
import { getSalairesAValider, LIBELLE_MOTIF_SALAIRE, type SalaireAValider } from '@/lib/rh';
import { useSeuilCeo, valideAffaire } from '@/lib/seuil-ceo';
import type { Projet } from '@/lib/types';
import { getDemandesDroit, type DemandeDroit } from '@/lib/roles';
import { DecisionDroit } from './decision-droit';
import { LIBELLE_TYPE_ABSENCE } from '@/lib/demandes';
import { lienFacturationProjet } from '@/lib/facturation';
import { formatMontant } from '@/lib/format';
import type { AttentionPilotage, VuePilotage } from '@/lib/types';

// Décisions « arrivant à échéance » : ouvertes dont l'échéance tombe dans les
// 7 jours (fenêtre d'affichage), ou déjà dépassée.
const FENETRE_DECISIONS_JOURS = 7;
// Lignes visibles par rubrique avant « Afficher tout ».
const LIGNES_VISIBLES = 5;

const jjmm = (iso: string) => iso.slice(5, 10).split('-').reverse().join('/');
const ajouterJours = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const joursEntre = (de: string, a: string) =>
  Math.round((new Date(`${a}T12:00:00Z`).getTime() - new Date(`${de}T12:00:00Z`).getTime()) / 86_400_000);
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const NIVEAU_DROIT: Record<DemandeDroit['apres'], string> = { aucun: 'aucun', lecture: 'lecture', ecriture: 'écriture', validation: 'validation' };

type Ligne = {
  cle: string;
  titre: string;
  detail: string;
  pill?: { libelle: string; ton: 'risque' | 'attention' | 'neutre' };
} & ({ href: string } | { onClick: () => void });

// decision : ce qui attend la décision du CEO lui-même (revue CEO, 22/10/2026) ;
// le reste se lit « à suivre ».
type Rubrique = { cle: string; titre: string; icone: ReactNode; couleur: string; lignes: Ligne[]; decision?: boolean };

// « À votre attention » (accueil du CEO) : ce qui demande une décision ou une
// relance, rassemblé sur une page ; chaque ligne mène à l'élément concerné.
export function Attention({
  slug,
  attention,
  vue,
  onOnglet,
}: {
  slug: string;
  attention: AttentionPilotage;
  vue: VuePilotage;
  onOnglet: (o: 'registre' | 'reportings') => void;
}) {
  const jour = new Date().toISOString().slice(0, 10);
  const base = `/admin/${slug}`;
  // Droits du CIO à valider (revue CIO, 22/10/2026) : le CEO seul tranche.
  const [droits, setDroits] = useState<DemandeDroit[]>([]);
  const [droitOuvert, setDroitOuvert] = useState<DemandeDroit | null>(null);
  // Revue CEO (22/10/2026) : toutes ses décisions ici, aucune ailleurs seulement —
  // offres à contresigner, avoirs au-delà du seuil, salaire du CFO.
  const session = useSessionCourante();
  const seuil = useSeuilCeo(slug, session);
  const [offres, setOffres] = useState<Projet[]>([]);
  const [avoirs, setAvoirs] = useState<AvoirAValider[]>([]);
  const [avoirOuvert, setAvoirOuvert] = useState<AvoirAValider | null>(null);
  const [salaires, setSalaires] = useState<SalaireAValider[]>([]);
  useEffect(() => {
    getDemandesDroit(slug)
      .then((l) => setDroits(l.filter((d) => d.peutDecider)))
      .catch(() => setDroits([]));
    getProjets(slug)
      .then((l) => setOffres(l.filter((d) => d.statut === 'en_validation')))
      .catch(() => setOffres([]));
    getAvoirsAValider(slug)
      .then(setAvoirs)
      .catch(() => setAvoirs([]));
    getSalairesAValider(slug)
      .then(setSalaires)
      .catch(() => setSalaires([]));
  }, [slug]);
  const aContresigner = offres.filter((o) => valideAffaire(session, seuil, o.offre?.montantTtc ?? 0));
  const depuisJours = (iso: string) => Math.max(0, joursEntre(iso.slice(0, 10), jour));

  const decisions = vue.decisions.filter(
    (d) =>
      d.statut === 'echeance_depassee' ||
      (d.statut === 'ouverte' && !!d.echeance && d.echeance <= ajouterJours(jour, FENETRE_DECISIONS_JOURS)),
  );
  const reportings = vue.reportings.filter((r) => r.statut === 'en_retard');
  // Revues CTO et COO (22/10/2026) : ils ne reportent plus au CEO, ils lui proposent des décisions.
  const proposees = vue.decisions.filter((d) => d.peutArbitrer);

  const toutes: Rubrique[] = [
    {
      cle: 'droits',
      decision: true,
      titre: 'Droits du CIO à valider',
      icone: <KeyRound size={16} aria-hidden />,
      couleur: 'var(--corail)',
      lignes: droits.map((d) => ({
        cle: d.id,
        titre: `${d.module} · ${NIVEAU_DROIT[d.avant]} → ${NIVEAU_DROIT[d.apres]}`,
        detail: `demandé par ${d.demandePar}`,
        pill: { libelle: 'À valider', ton: 'attention' as const },
        onClick: () => setDroitOuvert(d),
      })),
    },
    {
      cle: 'proposees',
      decision: true,
      titre: 'Décisions proposées',
      icone: <Gavel size={16} aria-hidden />,
      couleur: 'var(--iris)',
      lignes: proposees.map((d) => {
        const depuis = joursEntre(d.date, jour);
        return {
          cle: d.id,
          titre: `${d.numero} · ${d.texte}`,
          detail: `${d.proposition?.par ? `${d.proposition.par} · ` : ''}${d.responsable}${d.echeance ? ` · échéance proposée le ${jjmm(d.echeance)}` : ''}`,
          pill: { libelle: depuis > 2 ? `Depuis ${depuis} j` : 'À arbitrer', ton: depuis > 2 ? 'risque' : 'attention' },
          onClick: () => onOnglet('registre'),
        };
      }),
    },
    {
      cle: 'retards',
      titre: 'Projets en retard',
      icone: <Hourglass size={16} aria-hidden />,
      couleur: 'var(--corail)',
      lignes: (attention.retards ?? []).map((p) => ({
        cle: p.projetId,
        titre: `${p.code} · ${p.client}`,
        detail: [
          p.enRetard ? `${pluriel(p.enRetard, 'tâche')} en retard (jusqu’à ${p.joursMax} j)` : null,
          p.prolongees ? `${pluriel(p.prolongees, 'retard')} qualifié${p.prolongees > 1 ? 's' : ''} par prolongation` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        pill: p.enRetard ? { libelle: 'En retard', ton: 'risque' } : { libelle: 'Qualifié', ton: 'attention' },
        href: `${base}/projets?projet=${p.projetId}`,
      })),
    },
    {
      cle: 'offres',
      titre: 'Offres à contresigner',
      decision: true,
      icone: <FileCheck2 size={16} aria-hidden />,
      couleur: 'var(--ocre)',
      lignes: aContresigner.map((o) => ({
        cle: o.id,
        titre: `${o.code} · ${o.client.nom}`,
        detail: `${o.offre ? `${formatMontant(o.offre.montantTtc)} TTC · ` : ''}au-delà du seuil · validité de 7 jours une fois envoyée`,
        pill: { libelle: o.soumisLe ? `Depuis ${depuisJours(o.soumisLe)} j` : 'À valider', ton: 'attention' as const },
        href: `${base}/crm?dossier=${o.id}`,
      })),
    },
    {
      cle: 'avoirs',
      titre: 'Avoirs à valider',
      decision: true,
      icone: <Undo2 size={16} aria-hidden />,
      couleur: 'var(--corail)',
      lignes: avoirs.map((a) => ({
        cle: a.id,
        titre: `${a.reference ?? 'Facture'}${a.client ? ` · ${a.client}` : ''}`,
        detail: `${formatMontant(a.montantTtc)} TTC · ${LIBELLE_MOTIF_AVOIR[a.motif].toLowerCase()}${a.demandePar ? ` · demandé par ${a.demandePar}` : ''}`,
        pill: { libelle: `Depuis ${depuisJours(a.demandeLe)} j`, ton: depuisJours(a.demandeLe) > 2 ? ('risque' as const) : ('attention' as const) },
        onClick: () => setAvoirOuvert(a),
      })),
    },
    {
      cle: 'factures-ceo',
      titre: 'Factures à valider par vous',
      decision: true,
      icone: <ReceiptText size={16} aria-hidden />,
      couleur: 'var(--ocre)',
      lignes: (attention.factures ?? [])
        .filter((f) => f.etat === 'a_emettre' && f.parVous)
        .map((f) => ({
          cle: `parvous:${f.factureId ?? `${f.projetId}:${f.tranche}`}`,
          titre: `${f.tranche ?? 'Facture'} · ${f.code} · ${f.client}`,
          detail: `Au-delà du seuil${f.montantTtc != null ? ` · ${formatMontant(f.montantTtc)} TTC` : ''}`,
          pill: { libelle: 'À valider par vous', ton: 'attention' as const },
          href: f.factureId ? `${base}/facturation?facture=${f.factureId}` : f.projetId ? lienFacturationProjet(slug, f.projetId) : `${base}/facturation`,
        })),
    },
    {
      cle: 'salaires',
      titre: 'Salaire à valider',
      decision: true,
      icone: <BadgeCheck size={16} aria-hidden />,
      couleur: 'var(--jade)',
      lignes: salaires.map((x) => ({
        cle: x.id,
        titre: x.salarie,
        detail: `${LIBELLE_MOTIF_SALAIRE[x.motif]}${x.proposePar ? ` · proposé par ${x.proposePar}` : ''}`,
        pill: { libelle: `Depuis ${depuisJours(x.proposeLe)} j`, ton: 'attention' as const },
        href: `${base}/rh`,
      })),
    },
    {
      // Maquette du boss : gardées, mais séparées des décisions (revue CEO).
      cle: 'factures',
      titre: 'Pour information · émission par le CFO',
      icone: <ReceiptText size={16} aria-hidden />,
      couleur: 'var(--ocre)',
      lignes: (attention.factures ?? [])
        .filter((f) => f.etat === 'a_emettre' && !f.parVous)
        .map((f) => ({
          cle: `${f.etat}:${f.factureId ?? `${f.projetId}:${f.tranche}`}`,
          titre: `${f.tranche ?? 'Facture'} · ${f.code} · ${f.client}`,
          detail: `Prête à émettre${f.montantTtc != null ? ` · ${formatMontant(f.montantTtc)} TTC` : ''}`,
          pill: { libelle: 'Le CFO émet', ton: 'neutre' as const },
          href: f.factureId ? `${base}/facturation?facture=${f.factureId}` : f.projetId ? lienFacturationProjet(slug, f.projetId) : `${base}/facturation`,
        })),
    },
    {
      cle: 'impayees',
      titre: 'Factures impayées après échéance',
      icone: <ReceiptText size={16} aria-hidden />,
      couleur: 'var(--corail)',
      lignes: (attention.factures ?? [])
        .filter((f) => f.etat === 'impayee')
        .map((f) => ({
          cle: `${f.etat}:${f.factureId ?? `${f.projetId}:${f.tranche}`}`,
          titre: `${f.tranche ?? 'Facture'} · ${f.code} · ${f.client}`,
          detail: `${f.reference ?? 'Facture'} · échue depuis ${f.joursRetard} j · reste ${formatMontant(f.montantTtc ?? 0)}`,
          pill: { libelle: 'En retard', ton: 'risque' as const },
          href: f.factureId ? `${base}/facturation?facture=${f.factureId}` : `${base}/facturation`,
        })),
    },
    {
      cle: 'ts',
      titre: 'TS non acceptés',
      icone: <FileWarning size={16} aria-hidden />,
      couleur: 'var(--mandarine)',
      lignes: (attention.ts ?? []).map((t) => ({
        cle: t.devisId,
        titre: `${t.code} · ${t.objet}`,
        detail: `Avenant envoyé il y a ${t.jours} j, sans réponse (alerte au-delà de ${t.seuil} j)`,
        pill: { libelle: 'Sans réponse', ton: 'attention' },
        href: `${base}/facturation?devis=${t.devisId}`,
      })),
    },
    {
      cle: 'decisions',
      titre: 'Décisions à échéance',
      icone: <Scale size={16} aria-hidden />,
      couleur: 'var(--iris)',
      lignes: decisions.map((d) => {
        const reste = d.echeance ? joursEntre(jour, d.echeance) : 0;
        return {
          cle: d.id,
          titre: `${d.numero} · ${d.texte}`,
          detail: `${d.responsable}${d.echeance ? ` · échéance le ${jjmm(d.echeance)}` : ''}`,
          pill:
            d.statut === 'echeance_depassee'
              ? { libelle: 'Dépassée', ton: 'risque' }
              : { libelle: reste <= 0 ? 'Aujourd’hui' : `Dans ${reste} j`, ton: 'attention' },
          onClick: () => onOnglet('registre'),
        };
      }),
    },
    {
      cle: 'reportings',
      titre: 'Reportings non remis à J+5',
      icone: <CalendarClock size={16} aria-hidden />,
      couleur: 'var(--fuchsia)',
      lignes: reportings.map((r) => ({
        cle: `${r.type}:${r.mois}`,
        titre: `${r.titre} · ${r.periode}`,
        detail: `${r.emetteur} → ${r.destinataire} · dû le ${jjmm(r.echeance)}`,
        pill: { libelle: 'En retard', ton: 'risque' },
        onClick: () => onOnglet('reportings'),
      })),
    },
    {
      cle: 'absences',
      decision: true,
      titre: 'Absences à valider',
      icone: <UserCheck size={16} aria-hidden />,
      couleur: 'var(--jade)',
      lignes: attention.absences.map((a) => ({
        cle: a.id,
        titre: a.salarie,
        detail: `${LIBELLE_TYPE_ABSENCE[a.type]} · ${pluriel(a.jours, 'jour')} · du ${jjmm(a.dateDebut)} au ${jjmm(a.dateFin)}`,
        pill: { libelle: 'Vous êtes N+1', ton: 'attention' },
        href: `${base}/mon-espace?onglet=a-valider`,
      })),
    },
  ];
  const rubriques = toutes.filter((r) => r.lignes.length > 0);
  const aDecider = rubriques.filter((r) => r.decision);
  const aSuivre = rubriques.filter((r) => !r.decision);
  const nbDecisions = aDecider.reduce((s, r) => s + r.lignes.length, 0);
  const total = rubriques.reduce((s, r) => s + r.lignes.length, 0);

  return (
    <section className="pa" aria-labelledby="pa-titre">
      <header className="pa-entete">
        <h2 id="pa-titre">À votre attention</h2>
        <span className="pa-compte">{nbDecisions ? `${pluriel(nbDecisions, 'décision')} à prendre` : total ? 'Aucune décision en attente' : 'Rien en attente'}</span>
      </header>
      {total === 0 ? (
        <p className="panel glass-panel pa-vide">Aucun retard, aucune facture ni décision en attente : tout est à jour.</p>
      ) : (
        <>
          {/* Revue CEO : d'abord ce que lui seul décide, puis ce qu'il suit. */}
          <h3 className="pa-groupe">À décider · {nbDecisions}</h3>
          {aDecider.length ? (
            <div className="pa-rubriques">
              {aDecider.map((r) => (
                <RubriqueAttention key={r.cle} rubrique={r} />
              ))}
            </div>
          ) : (
            <p className="pa-groupe-vide">Aucune décision ne vous attend.</p>
          )}
          {aSuivre.length > 0 && (
            <>
              <h3 className="pa-groupe">À suivre</h3>
              <div className="pa-rubriques">
                {aSuivre.map((r) => (
                  <RubriqueAttention key={r.cle} rubrique={r} />
                ))}
              </div>
            </>
          )}
        </>
      )}
      {avoirOuvert && <DecisionAvoir slug={slug} avoir={avoirOuvert} onFait={setAvoirs} onClose={() => setAvoirOuvert(null)} />}
      {droitOuvert && <DecisionDroit slug={slug} demande={droitOuvert} onFait={(l) => setDroits(l.filter((d) => d.peutDecider))} onClose={() => setDroitOuvert(null)} />}
    </section>
  );
}

function RubriqueAttention({ rubrique: r }: { rubrique: Rubrique }) {
  const [tout, setTout] = useState(false);
  const lignes = tout ? r.lignes : r.lignes.slice(0, LIGNES_VISIBLES);
  return (
    <section id={`pa-${r.cle}`} className="panel glass-panel pa-rubrique" style={{ ['--pa-couleur' as string]: r.couleur }}>
      <h3 className="pa-rubrique-titre">
        <span className="pa-icone">{r.icone}</span>
        {r.titre}
        <span className="pa-nombre">{r.lignes.length}</span>
      </h3>
      <ul className="pa-liste">
        {lignes.map((l) => {
          const contenu = (
            <>
              <span className="pa-texte">
                <strong>{l.titre}</strong>
                <span className="cell-sub">{l.detail}</span>
              </span>
              {l.pill && <span className={`pill pill--${l.pill.ton}`}>{l.pill.libelle}</span>}
              <ChevronRight size={16} className="pa-chevron" aria-hidden />
            </>
          );
          return (
            <li key={l.cle}>
              {'href' in l ? (
                <Link href={l.href} className="pa-ligne" title={`${l.titre} — ${l.detail}`}>
                  {contenu}
                </Link>
              ) : (
                <button type="button" className="pa-ligne" title={`${l.titre} — ${l.detail}`} onClick={l.onClick}>
                  {contenu}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {r.lignes.length > LIGNES_VISIBLES && (
        <button type="button" className="btn-ghost btn-ghost--sm pa-plus" onClick={() => setTout((v) => !v)}>
          {tout ? 'Réduire' : `Afficher tout (${r.lignes.length})`}
        </button>
      )}
    </section>
  );
}

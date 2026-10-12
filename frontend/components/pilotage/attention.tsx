'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarClock, ChevronRight, FileWarning, Hourglass, ReceiptText, Scale, UserCheck } from 'lucide-react';
import { LIBELLE_TYPE_ABSENCE } from '@/lib/demandes';
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

type Ligne = {
  cle: string;
  titre: string;
  detail: string;
  pill?: { libelle: string; ton: 'risque' | 'attention' | 'validation' | 'neutre' };
} & ({ href: string } | { onClick: () => void });

type Rubrique = { cle: string; titre: string; icone: ReactNode; couleur: string; lignes: Ligne[] };

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

  const decisions = vue.decisions.filter(
    (d) =>
      d.statut === 'echeance_depassee' ||
      (d.statut === 'ouverte' && !!d.echeance && d.echeance <= ajouterJours(jour, FENETRE_DECISIONS_JOURS)),
  );
  const reportings = vue.reportings.filter((r) => r.statut === 'en_retard');

  const toutes: Rubrique[] = [
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
      cle: 'factures',
      titre: 'Factures F1, F2, F3',
      icone: <ReceiptText size={16} aria-hidden />,
      couleur: 'var(--ocre)',
      lignes: (attention.factures ?? []).map((f) => ({
        cle: `${f.etat}:${f.factureId ?? `${f.projetId}:${f.tranche}`}`,
        titre: `${f.tranche ?? 'Facture'} · ${f.code} · ${f.client}`,
        detail:
          f.etat === 'a_emettre'
            ? `Prête à émettre${f.montantTtc != null ? ` · ${formatMontant(f.montantTtc)} TTC` : ''}`
            : `${f.reference ?? 'Facture'} · échue depuis ${f.joursRetard} j · reste ${formatMontant(f.montantTtc ?? 0)}`,
        pill:
          f.etat === 'impayee'
            ? { libelle: 'En retard', ton: 'risque' }
            : f.parVous
              ? { libelle: 'À valider par vous', ton: 'validation' }
              : { libelle: 'À émettre', ton: 'neutre' },
        href: f.factureId
          ? `${base}/facturation?facture=${f.factureId}`
          : `${base}/projets/${f.projetId}/facturation`,
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
      titre: 'Absences à valider',
      icone: <UserCheck size={16} aria-hidden />,
      couleur: 'var(--jade)',
      lignes: attention.absences.map((a) => ({
        cle: a.id,
        titre: a.salarie,
        detail: `${LIBELLE_TYPE_ABSENCE[a.type]} · ${pluriel(a.jours, 'jour')} · du ${jjmm(a.dateDebut)} au ${jjmm(a.dateFin)}`,
        pill: { libelle: 'Vous êtes N+1', ton: 'validation' },
        href: `${base}/mon-espace?onglet=a-valider`,
      })),
    },
  ];
  const rubriques = toutes.filter((r) => r.lignes.length > 0);

  const total = rubriques.reduce((s, r) => s + r.lignes.length, 0);

  return (
    <section className="pa" aria-labelledby="pa-titre">
      <header className="pa-entete">
        <h2 id="pa-titre">À votre attention</h2>
        <span className="pa-compte">{total ? pluriel(total, 'point') + ' à traiter' : 'Rien en attente'}</span>
      </header>
      {total === 0 ? (
        <p className="panel glass-panel pa-vide">Aucun retard, aucune facture ni décision en attente : tout est à jour.</p>
      ) : (
        <div className="pa-rubriques">
          {rubriques.map((r) => (
            <RubriqueAttention key={r.cle} rubrique={r} />
          ))}
        </div>
      )}
    </section>
  );
}

function RubriqueAttention({ rubrique: r }: { rubrique: Rubrique }) {
  const [tout, setTout] = useState(false);
  const lignes = tout ? r.lignes : r.lignes.slice(0, LIGNES_VISIBLES);
  return (
    <section className="panel glass-panel pa-rubrique" style={{ ['--pa-couleur' as string]: r.couleur }}>
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

'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarClock, FolderPlus, Gauge, Scale } from 'lucide-react';
import { KpiStrip } from '@/components/admin/kpi-strip';
import { ROLE_CEO } from '@/lib/acces-back-office';
import { useSessionCourante } from '@/lib/layout-contexte';
import { getAttention, getPilotage } from '@/lib/pilotage';
import type { AttentionPilotage, IndicateurPilotage, VuePilotage } from '@/lib/types';
import { Attention } from './attention';
import { Reportings } from './reportings';
import { Registre } from './registre';

type Onglet = 'indicateurs' | 'reportings' | 'registre';

const PILL_EVALUATION: Record<IndicateurPilotage['evaluation'], { classe: string; libelle: string } | null> = {
  hors_objectif: { classe: 'pill--risque', libelle: 'Hors objectif' },
  dans_objectif: { classe: 'pill--succes', libelle: 'Dans l’objectif' },
  // Carte posée sur un halo coloré : pastille inversée (fond blanc).
  a_fixer: { classe: 'pill--neutre pill--sur-couleur', libelle: 'Objectif à fixer' },
  sans_donnee: null,
};

// Une couleur par tuile (demande du boss : KPI en couleurs, comme Finances).
const DEGRADE_KPI = {
  hors: { a: '#d23c7c', b: '#ef6fae' },
  nouveaux: { a: '#5a63e8', b: '#8f9cf7' },
  reportings: { a: '#ea6f3c', b: '#f29b5e' },
  decisions: { a: '#3fa9b5', b: '#7dd6cf' },
};

const tonValeur = (i: IndicateurPilotage) =>
  i.evaluation === 'hors_objectif' ? ' pi-valeur--hors' : i.evaluation === 'dans_objectif' || i.atteintPropose ? ' pi-valeur--ok' : '';

// Pilotage · tableau de bord Holding (maquettes du boss) : tuiles, puis
// trois onglets — indicateurs du manuel, reportings mensuels, registre des
// décisions. Chaque action renvoie la vue entière, remplacée telle quelle.
export function Pilotage({ slug }: { slug: string }) {
  const session = useSessionCourante();
  // Accueil du CEO : « À votre attention » au-dessus du tableau de bord.
  const accueilCeo = session.role === ROLE_CEO;
  const [vue, setVue] = useState<VuePilotage | null>(null);
  const [attention, setAttention] = useState<AttentionPilotage | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('indicateurs');
  const [erreur, setErreur] = useState<string | null>(null);
  const ongletsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getPilotage(slug)
      .then(setVue)
      .catch((e) => setErreur(e instanceof Error && e.message ? e.message : 'Pilotage indisponible.'));
  }, [slug]);
  useEffect(() => {
    if (!accueilCeo) return;
    getAttention(slug)
      .then(setAttention)
      .catch(() => setAttention(null));
  }, [slug, accueilCeo]);

  // Depuis « À votre attention » : l'onglet concerné, amené à l'écran.
  const ouvrir = (o: Onglet) => {
    setOnglet(o);
    requestAnimationFrame(() => ongletsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  if (!vue) return erreur ? <p className="field-erreur">{erreur}</p> : <div className="skeleton admin-skeleton-panel" aria-hidden />;
  const t = vue.tuiles;
  const nouveaux = vue.indicateurs.find((i) => i.cle === 'nouveaux_projets');
  const tuiles = [
    { cle: 'hors' as const, onglet: 'indicateurs' as Onglet, libelle: 'Indicateurs hors objectif', valeur: String(t.horsObjectif), aide: `sur ${t.suivis} suivis`, icone: Gauge },
    {
      cle: 'nouveaux' as const,
      onglet: 'indicateurs' as Onglet,
      libelle: 'Nouveaux projets de conception',
      valeur: nouveaux?.affichage ?? '—',
      aide: `${vue.mois} · objectif du manuel`,
      icone: FolderPlus,
    },
    { cle: 'reportings' as const, onglet: 'reportings' as Onglet, libelle: 'Reportings', valeur: String(t.reportingsADeposer), aide: 'à déposer · J+5', icone: CalendarClock },
    { cle: 'decisions' as const, onglet: 'registre' as Onglet, libelle: 'Décisions ouvertes', valeur: String(t.decisionsOuvertes), aide: 'registre des décisions', icone: Scale },
  ];
  // La tuile mise en avant : la première de l'onglet ouvert.
  const tuileActive = tuiles.find((x) => x.onglet === onglet)?.cle;

  return (
    <div className="pi">
      <p className="eq-sous-titre">
        Indicateurs du manuel, reportings mensuels et registre des décisions. Ce qui n’est pas dans le HUB n’existe pas pour la gouvernance
        (§3.7).
      </p>
      {accueilCeo && attention && <Attention slug={slug} attention={attention} vue={vue} onOnglet={ouvrir} />}
      <KpiStrip
        tuiles={tuiles.map((x) => ({
          cle: x.cle,
          label: x.libelle,
          valeur: x.valeur,
          sousTexte: x.aide,
          icone: x.icone,
          degrade: DEGRADE_KPI[x.cle],
          action: { type: 'filtre' as const, actif: tuileActive === x.cle, onClick: () => setOnglet(x.onglet) },
        }))}
      />

      <div className="fin-onglets" ref={ongletsRef}>
        <div className="vue-toggle" role="tablist" aria-label="Pilotage">
          {(
            [
              ['indicateurs', 'Indicateurs'],
              ['reportings', `Reportings · ${t.reportingsADeposer}`],
              ['registre', `Registre des décisions · ${t.decisionsOuvertes}`],
            ] as const
          ).map(([cle, libelle]) => (
            <button key={cle} type="button" role="tab" aria-selected={onglet === cle} className={onglet === cle ? 'is-active' : ''} onClick={() => setOnglet(cle)}>
              {libelle}
            </button>
          ))}
        </div>
      </div>

      {onglet === 'indicateurs' && (
        <div className="pi-indicateurs">
          {vue.indicateurs.map((i) => {
            const pill = PILL_EVALUATION[i.evaluation];
            return (
              <section key={i.cle} className="panel glass-panel pi-indicateur">
                <header className="pi-indicateur-tete">
                  <h2>{i.titre}</h2>
                  {pill && <span className={`pill ${pill.classe}`}>{pill.libelle}</span>}
                </header>
                <strong className={`pi-valeur${tonValeur(i)}`}>{i.affichage}</strong>
                <p className="pi-objectif">{i.texteObjectif}</p>
                <p className="pi-source">{i.source}</p>
              </section>
            );
          })}
        </div>
      )}
      {onglet === 'reportings' && <Reportings slug={slug} reportings={vue.reportings} onVue={setVue} />}
      {onglet === 'registre' && <Registre slug={slug} vue={vue} onVue={setVue} />}
    </div>
  );
}

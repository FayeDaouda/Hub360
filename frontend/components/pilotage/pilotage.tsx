'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  AlarmClock,
  Banknote,
  CalendarCheck,
  Clock3,
  FileWarning,
  FolderKanban,
  FolderOpen,
  HeartPulse,
  ReceiptText,
  Send,
  Timer,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { KpiStrip } from '@/components/admin/kpi-strip';
import { DEGRADE_ETAT } from '@/lib/couleurs-etat';
import { formatMontant } from '@/lib/format';
import { ROLE_CEO, ROLE_CIO } from '@/lib/acces-back-office';
import { useSessionCourante } from '@/lib/layout-contexte';
import { getAttention, getPilotage } from '@/lib/pilotage';
import type { AttentionPilotage, IndicateurPilotage, VuePilotage } from '@/lib/types';
import { Attention } from './attention';
import { Reportings } from './reportings';
import { Registre } from './registre';
import { JournalAudit } from './journal-audit';
import { Progression, Tendance } from './tendance';

type Onglet = 'indicateurs' | 'reportings' | 'registre' | 'journal';

// Journal d'audit : mêmes rôles que le serveur (audit/journal-audit.service.ts).
const ROLES_JOURNAL = new Set([ROLE_CEO, ROLE_CIO, 'societe_admin']);

const PILL_EVALUATION: Record<IndicateurPilotage['evaluation'], { classe: string; libelle: string } | null> = {
  hors_objectif: { classe: 'pill--risque', libelle: 'Hors objectif' },
  dans_objectif: { classe: 'pill--succes', libelle: 'Dans l’objectif' },
  a_fixer: { classe: 'pill--neutre', libelle: 'Objectif à fixer' },
  sans_donnee: null,
};

// Libellé, icône et destination de chaque chiffre clé (valeurs et état :
// serveur). Montants en FCFA ; le reste en nombre.
const TUILES: Record<string, { libelle: string; icone: LucideIcon; montant?: boolean; chemin: string }> = {
  facture_mois: { libelle: 'Facturé du mois', icone: ReceiptText, montant: true, chemin: 'facturation?onglet=factures' },
  encaisse_mois: { libelle: 'Encaissé du mois', icone: Banknote, montant: true, chemin: 'facturation?onglet=factures' },
  reste_retard: { libelle: 'Reste à encaisser en retard', icone: AlarmClock, montant: true, chemin: 'facturation?onglet=factures&filtre=en_retard' },
  projets_ouverts: { libelle: 'Projets ouverts', icone: FolderKanban, chemin: 'projets' },
  pipeline: { libelle: 'Pipeline actif', icone: FolderOpen, chemin: 'crm' },
  fiches: { libelle: 'Fiches à compléter', icone: FileWarning, chemin: 'crm' },
  cfo: { libelle: 'En attente CFO', icone: Clock3, chemin: 'crm' },
  client: { libelle: 'Chez le client', icone: Send, chemin: 'crm' },
  absences: { libelle: 'Absences à valider', icone: CalendarCheck, chemin: 'rh?onglet=demandes' },
  remboursements: { libelle: 'Remboursements à traiter', icone: HeartPulse, chemin: 'rh?onglet=demandes' },
  feuilles: { libelle: 'Feuilles de temps à contrôler', icone: Timer, chemin: 'rh?onglet=temps' },
  integration: { libelle: 'Points d’intégration à faire', icone: UserPlus, chemin: 'rh?onglet=integration' },
};

// Valeur d'un indicateur : rouge hors objectif, vert atteint, couleur de
// texte normale tant que l'objectif n'est pas fixé (couleur = sens).
const tonValeur = (i: IndicateurPilotage) =>
  i.evaluation === 'hors_objectif' ? ' pi-valeur--hors' : i.evaluation === 'dans_objectif' ? ' pi-valeur--ok' : '';

// Pilotage · tableau de bord Holding (maquettes du boss) : chiffres clés
// selon le rôle, « À votre attention » (CEO), puis trois onglets — indicateurs du manuel, reportings mensuels, registre des
// décisions. Chaque action renvoie la vue entière, remplacée telle quelle.
export function Pilotage({ slug }: { slug: string }) {
  const session = useSessionCourante();
  // Accueil du CEO : « À votre attention » au-dessus du tableau de bord.
  const accueilCeo = session.role === ROLE_CEO;
  const [vue, setVue] = useState<VuePilotage | null>(null);
  const [attention, setAttention] = useState<AttentionPilotage | null>(null);
  // ?onglet= : lien direct (notification « décision à mettre en œuvre »).
  const ongletDemande = useSearchParams().get('onglet');
  const [onglet, setOnglet] = useState<Onglet>(
    ongletDemande === 'reportings' || ongletDemande === 'registre' || (ongletDemande === 'journal' && ROLES_JOURNAL.has(session.role))
      ? ongletDemande
      : 'indicateurs',
  );
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
  // « Reste à encaisser en retard » : la carte Factures de « À votre
  // attention » quand elle est affichée (CEO), sinon Finances filtrées.
  const carteFactures = accueilCeo && !!attention?.factures?.length;
  const lien = (cle: string) =>
    cle === 'reste_retard' && carteFactures ? '#pa-factures' : `/admin/${slug}/${TUILES[cle]?.chemin ?? ''}`;
  return (
    <div className="pi">
      <p className="eq-sous-titre">
        Indicateurs du manuel, reportings mensuels et registre des décisions. Ce qui n’est pas dans le HUB n’existe pas pour la gouvernance
        (§3.7).
      </p>
      {vue.chiffres && (
        <KpiStrip
          tuiles={vue.chiffres.tuiles
            .filter((x) => TUILES[x.cle])
            .map((x) => ({
              cle: x.cle,
              label: TUILES[x.cle].libelle,
              valeur: TUILES[x.cle].montant ? formatMontant(x.valeur) : String(x.valeur),
              sousTexte: x.aide,
              icone: TUILES[x.cle].icone,
              degrade: DEGRADE_ETAT[x.etat],
              action: { type: 'lien' as const, href: lien(x.cle) },
            }))}
        />
      )}
      {accueilCeo && attention && <Attention slug={slug} attention={attention} vue={vue} onOnglet={ouvrir} />}

      <div className="fin-onglets" ref={ongletsRef}>
        <div className="vue-toggle" role="tablist" aria-label="Pilotage">
          {(
            [
              ['indicateurs', 'Indicateurs'],
              ['reportings', `Reportings · ${t.reportingsADeposer}`],
              ['registre', `Registre des décisions · ${t.decisionsOuvertes}`],
              ...(ROLES_JOURNAL.has(session.role) ? ([['journal', 'Journal']] as const) : []),
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
                <Progression indicateur={i} />
                <p className="pi-objectif">{i.texteObjectif}</p>
                <Tendance indicateur={i} unite={i.cle === 'nouveaux_projets' ? '' : '%'} />
                <p className="pi-source">{i.source}</p>
              </section>
            );
          })}
        </div>
      )}
      {onglet === 'reportings' && <Reportings slug={slug} reportings={vue.reportings} onVue={setVue} />}
      {onglet === 'registre' && <Registre slug={slug} vue={vue} onVue={setVue} />}
      {onglet === 'journal' && <JournalAudit slug={slug} />}
    </div>
  );
}

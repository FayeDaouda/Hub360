'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList, FileClock, Scale, Target } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { ROLE_CIO } from '@/lib/acces-back-office';
import { useSessionCourante } from '@/lib/layout-contexte';
import { afficher, getReglages, libelleVersion, type Reglages as DonneesReglages } from '@/lib/reglages';
import { Administration } from './administration';
import { GabaritPanel } from './gabarit-panel';
import { JournalPanel } from './journal-panel';
import { ValeursPanel } from './valeurs-panel';

const SECTIONS = ['gabarit', 'regles', 'objectifs', 'journal', 'administration'] as const;
type Section = (typeof SECTIONS)[number];

// Réglages · HUB 360° (maquette du boss) : gabarit versionné, règles et
// délais, objectifs des indicateurs, journal — chaque modification exige un
// motif. « Administration » regroupe les paramètres historiques (rôles,
// gabarits Foncier/Études, localités, contrats). Section dans l'URL (?section=).
export function Reglages({ slug }: { slug: string }) {
  const session = useSessionCourante();
  const router = useRouter();
  const pathname = usePathname();
  const demande = useSearchParams().get('section');
  const [donnees, setDonnees] = useState<DonneesReglages | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    getReglages(slug)
      .then(setDonnees)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Impossible de charger les réglages.'));
  }, [slug]);
  useEffect(charger, [charger]);

  if (erreur) return <p className="field-erreur">{erreur}</p>;
  if (!donnees) {
    return (
      <div className="admin-skeleton" aria-hidden>
        <div className="skeleton admin-skeleton-panel" />
      </div>
    );
  }

  const section: Section = !donnees.disponible
    ? 'administration'
    : SECTIONS.includes(demande as Section)
      ? (demande as Section)
      : 'gabarit';
  const choisir = (s: Section) => router.replace(`${pathname}?section=${s}`, { scroll: false });

  const entete = (
    <div className="reg-titre">
      <p className="reg-sous-titre">
        Administration du HUB. Chaque modification exige un motif, entre au journal et au registre des décisions. Le
        gabarit est versionné : un projet garde la version avec laquelle il a été ouvert.
      </p>
      <span className="reg-badge">{session.role === ROLE_CIO ? 'CIO : modification des réglages' : 'Administration de la société'}</span>
    </div>
  );

  // Paramètres historiques (rôles, gabarits Foncier/Études, localités,
  // contrats) : hors maquette, accessibles par un lien discret en pied de page.
  const lienAdministration = donnees.disponible && section !== 'administration' && (
    <p className="reg-pied">
      <button type="button" className="lien-inline" onClick={() => choisir('administration')}>
        Autres paramètres : rôles, localités, contrats, gabarits Foncier et Études
      </button>
    </p>
  );

  if (!donnees.disponible) {
    return (
      <>
        {entete}
        <p className="empty-state">Pas encore de gabarit ni de règles définis pour cette société : seule l’administration est disponible.</p>
        <Administration slug={slug} />
      </>
    );
  }

  const gabarit = donnees.gabarits[0];
  const parts = donnees.regles.find((r) => r.cle === 'parts_factures')!;
  const ceo = donnees.regles.find((r) => r.cle === 'seuil_contresignature_ceo')!;
  const ouverture = donnees.regles.find((r) => r.cle === 'ouverture_projet')!;
  const aFixer = donnees.objectifs.filter((o) => o.enService === null).length;
  const p = parts.enService as Record<string, number>;

  return (
    <>
      {entete}
      <div className="reg-tuiles" role="tablist" aria-label="Sections des réglages">
        {[
          { s: 'gabarit' as const, icone: ClipboardList, label: 'Gabarit Conception', valeur: gabarit.libelle, sous: `${gabarit.projets} projet(s) en ${gabarit.libelle}` },
          {
            s: 'regles' as const,
            icone: Scale,
            label: 'Règles et délais',
            valeur: `F1 ${p.F1} · F2 ${p.F2} · F3 ${p.F3}`,
            sous: `ouverture ${afficher(ouverture, ouverture.enService)} · contresignature CEO au-delà de ${(Number(ceo.enService) / 1_000_000).toLocaleString('fr-FR')} M FCFA`,
          },
          { s: 'objectifs' as const, icone: Target, label: 'Objectifs à fixer', valeur: String(aFixer), sous: 'indicateur(s) sans objectif dans Pilotage', alerte: aFixer > 0 },
          {
            s: 'journal' as const,
            icone: FileClock,
            label: 'Modifications tracées',
            valeur: String(donnees.modifications),
            sous: donnees.modifications ? 'voir le journal des réglages' : 'aucune modification depuis la mise en service',
          },
        ].map((t) => (
          <button
            key={t.s}
            type="button"
            role="tab"
            aria-selected={section === t.s}
            className={`reg-tuile glass-panel${section === t.s ? ' is-active' : ''}`}
            onClick={() => choisir(t.s)}
          >
            <span className="kpi-tuile-icone" aria-hidden>
              <t.icone size={17} strokeWidth={2} />
            </span>
            <span className="reg-tuile-label">{t.label}</span>
            <span className={`reg-tuile-valeur${t.alerte ? ' is-alerte' : ''}`}>{t.valeur}</span>
            <span className="reg-tuile-sous">{t.sous}</span>
          </button>
        ))}
      </div>
      {section === 'gabarit' && <GabaritPanel key={gabarit.numero} slug={slug} gabarit={gabarit} onEnregistre={setDonnees} />}
      {section === 'regles' && (
        <ValeursPanel
          slug={slug}
          section="regles"
          titre="Règles et délais"
          description="Règles du process Conception et des circuits Finances. Chaque modification exige un motif et entre au registre des décisions."
          reglages={donnees.regles}
          onEnregistre={setDonnees}
        />
      )}
      {section === 'objectifs' && (
        <ValeursPanel
          slug={slug}
          section="objectifs"
          titre="Objectifs des indicateurs"
          description="Objectifs affichés dans Pilotage › Indicateurs. Un objectif vide reste « à fixer » ; dès qu’il est renseigné, l’indicateur passe « dans l’objectif » ou « hors objectif »."
          reglages={donnees.objectifs}
          placeholderMotif="Motif, par exemple décision du CODIR du … (obligatoire)"
          onEnregistre={setDonnees}
        />
      )}
      {section === 'journal' && <JournalPanel key={donnees.modifications} slug={slug} versionInitiale={libelleVersion(0)} />}
      {section === 'administration' && <Administration slug={slug} />}
      {lienAdministration}
    </>
  );
}

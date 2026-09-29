'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { definirDureeStandard, getDureesStandard } from '@/lib/temps';
import type { DureesStandardSection, SectionTache } from '@/lib/types';

const cle = (section: SectionTache, groupe: string) => `${section}:${groupe}`;

// Référentiel société des durées standard (RH · Temps, lot 4) : une durée par
// bloc de checklist assignable. Elle se répartit sur la fenêtre début →
// échéance du bloc pour calculer les feuilles de temps. Vide par défaut : un
// bloc sans durée ne produit aucune heure (rien n'est inventé). Admin ou CIO.
export function DureesStandardPanel({ slug }: { slug: string }) {
  const [sections, setSections] = useState<DureesStandardSection[] | null>(null);
  const [brouillons, setBrouillons] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [essai, setEssai] = useState(0);
  const [enCours, setEnCours] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    setSections(null);
    setErreur(null);
    getDureesStandard(slug)
      .then((d) => {
        if (!annule) setSections(d);
      })
      .catch((e) => {
        if (!annule) setErreur(e instanceof ApiError ? e.message : 'Impossible de charger les durées.');
      });
    return () => {
      annule = true;
    };
  }, [slug, essai]);

  async function enregistrer(section: SectionTache, groupe: string, actuelle: number | null) {
    const k = cle(section, groupe);
    const saisie = brouillons[k];
    if (saisie === undefined) return;
    const heures = saisie.trim() === '' ? null : Number(saisie.replace(',', '.'));
    if (heures === actuelle) {
      setBrouillons(({ [k]: _, ...reste }) => reste);
      return;
    }
    if (heures !== null && (!Number.isFinite(heures) || heures <= 0)) {
      setErreur('Durée invalide : un nombre d’heures positif (une décimale au plus), ou vide pour la retirer.');
      return;
    }
    setErreur(null);
    setEnCours(k);
    try {
      setSections(await definirDureeStandard(slug, section, groupe, heures));
      setBrouillons(({ [k]: _, ...reste }) => reste);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'L’enregistrement a échoué.');
    } finally {
      setEnCours(null);
    }
  }

  if (erreur && !sections) {
    return (
      <div className="dash-erreur" role="alert">
        <p>{erreur}</p>
        <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setEssai((n) => n + 1)}>
          <RefreshCw size={15} strokeWidth={2} aria-hidden />
          <span>Réessayer</span>
        </button>
      </div>
    );
  }
  if (!sections) {
    return (
      <div className="admin-skeleton" aria-hidden>
        <div className="skeleton admin-skeleton-panel" />
      </div>
    );
  }

  return (
    <>
      <p className="dmd-note durees-intro">
        Durée standard de chaque bloc assignable, en heures. Elle se répartit sur les jours ouvrés de la fenêtre du bloc
        (du début à l’échéance) et alimente les feuilles de temps et « Mon temps ». Un bloc sans durée ne produit aucune
        heure. Modifier une durée recalcule les feuilles non encore contrôlées, jamais celles déjà contrôlées.
      </p>
      {erreur && (
        <p className="field-erreur" role="alert">
          {erreur}
        </p>
      )}
      {sections.map((s) => (
        <section className="panel glass-panel foncier-groupe" key={s.section}>
          <h3 className="panel-title">{s.libelle}</h3>
          <ul className="durees-liste">
            {s.groupes.map((g) => {
              const k = cle(s.section, g.groupe);
              return (
                <li key={g.groupe} className="durees-ligne">
                  <label htmlFor={`duree-${k}`}>{g.libelle}</label>
                  <span className="durees-saisie">
                    <input
                      id={`duree-${k}`}
                      type="number"
                      inputMode="decimal"
                      min={0.1}
                      step={0.1}
                      className="field-input"
                      placeholder="non définie"
                      disabled={enCours === k}
                      value={brouillons[k] ?? (g.heures == null ? '' : String(g.heures))}
                      onChange={(e) => setBrouillons((b) => ({ ...b, [k]: e.target.value }))}
                      onBlur={() => enregistrer(s.section, g.groupe, g.heures)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                    />
                    <span aria-hidden>h</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

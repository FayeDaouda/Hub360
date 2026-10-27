'use client';

import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  CATEGORIES,
  GAMMES,
  STANDINGS,
  TYPES_BIEN,
  type Categorie,
  type Gamme,
  type ModifierFichePayload,
  type Projet,
  type Standing,
  type TypeBien,
} from '@/lib/types';
import {
  ANNEXES,
  COMMODITES,
  controleComposition,
  FICHE_VIDE,
  FORMES,
  GABARITS,
  libelleNiveau,
  niveaux,
  PLANCHES_MANUELLES,
  planchesCalculees,
  SOUS_SOLS,
  SURFACES,
  totaux,
  TYPOLOGIES_VILLA,
  USAGES,
  USAGES_NIVEAU,
  type Annexe,
  type FicheProgramme,
  type Forme,
  type LigneComposition,
  type TypologieVilla,
  type Usage,
  type UsageNiveau,
} from '@/lib/fiche-programme';
import { formatNumber, plural } from '@hub/domain';
import { Field } from '@/components/ui/field';

type Props = {
  projet: Projet;
  // Rejeter la promesse affiche l'erreur sous le formulaire.
  onModifier: (champs: ModifierFichePayload) => Promise<void>;
};

// Nom court du standing pour « Moyen standing : sélection type ».
const STANDING_COURT: Record<Standing, string> = { economique: 'Économique', moyen: 'Moyen', grand: 'Grand' };

// « Caractéristiques du projet » et Fiche Programme d'un lead en « Nouveau
// projet » (doc « Création de projet côté CRM » §3.3–3.4, captures du boss) :
// chaque réponse s'enregistre aussitôt, les questions s'adaptent (villa ou
// immeuble), et le serveur en déduit le résumé (colonne Programme) et, quand
// ils se calculent, les planches. Un champ attendu est cerné d'ambre.
export function CaracteristiquesProjet({ projet, onModifier }: Props) {
  const [fiche, setFiche] = useState<FicheProgramme>(() => ({ ...FICHE_VIDE, ...(projet.ficheProgramme ?? {}) }));
  const [autreSurface, setAutreSurface] = useState(
    () => projet.surfaceTerrain > 0 && !SURFACES.includes(projet.surfaceTerrain),
  );
  const [surfaceSaisie, setSurfaceSaisie] = useState(projet.surfaceTerrain > 0 ? String(projet.surfaceTerrain) : '');
  const [enCours, setEnCours] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  // Enregistrements en file : deux réponses rapprochées partent dans l'ordre.
  const file = useRef<Promise<void>>(Promise.resolve());

  function enregistrer(champs: ModifierFichePayload) {
    setEnCours((n) => n + 1);
    setErreur(null);
    file.current = file.current
      .then(() => onModifier(champs))
      .catch((e) => setErreur(e instanceof Error && e.message ? e.message : 'L’enregistrement a échoué.'))
      .finally(() => setEnCours((n) => n - 1));
  }

  // La fiche locale fait foi pendant la saisie ; chaque changement part en entier.
  function majFiche(maj: Partial<FicheProgramme>) {
    const suivante = { ...fiche, ...maj };
    setFiche(suivante);
    enregistrer({ ficheProgramme: suivante });
  }
  const majLigne = (i: number, maj: Partial<LigneComposition>) =>
    majFiche({ composition: fiche.composition.map((l, j) => (j === i ? { ...l, ...maj } : l)) });
  const basculer = <T extends string>(liste: T[], v: T) =>
    liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v];

  const classe = (manquant: boolean) => `field-input${manquant ? ' is-manquant' : ''}`;
  const choisir = (
    <option value="" disabled>
      — Choisir —
    </option>
  );
  const planches = planchesCalculees(fiche);
  const controle = controleComposition(fiche);
  const totauxImmeuble = totaux(fiche);
  const niveauxPossibles = niveaux(fiche);
  const nbCommodites = fiche.commodites.length;

  function choisirSurface(v: string) {
    if (v === 'autre') return setAutreSurface(true);
    setAutreSurface(false);
    setSurfaceSaisie(v);
    enregistrer({ surfaceTerrain: Number(v) });
  }
  function quitterSurface() {
    const n = Number(surfaceSaisie.replace(/\s/g, ''));
    if (!surfaceSaisie.trim() || n === projet.surfaceTerrain) return;
    if (!Number.isInteger(n) || n < 1) return setErreur('Surface : nombre entier de m² attendu.');
    enregistrer({ surfaceTerrain: n });
  }

  return (
    <section className="fiche-crm-section" aria-busy={enCours > 0}>
      <h3 className="fiche-crm-titre">Caractéristiques du projet</h3>
      <div className="fiche-crm-form">
        <div className="field">
          <label className="field-label" htmlFor="fiche-categorie">
            Catégorie
          </label>
          <select
            id="fiche-categorie"
            className={classe(!projet.categorie)}
            value={projet.categorie ?? ''}
            onChange={(e) => enregistrer({ categorie: e.target.value as Categorie })}
          >
            {!projet.categorie && choisir}
            {Object.entries(CATEGORIES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <span className="field-aide">Le type de mission confiée à Grey Concrete.</span>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="fiche-type">
            Type de projet
          </label>
          <select
            id="fiche-type"
            className={classe(!projet.type)}
            value={projet.type ?? ''}
            onChange={(e) => enregistrer({ type: e.target.value as TypeBien })}
          >
            {!projet.type && choisir}
            {Object.entries(TYPES_BIEN).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <span className="field-aide">La nature de l’ouvrage à concevoir.</span>
        </div>
      </div>

      <div className="fiche-crm-carte fiche-crm-programme">
        <div className="fp-tete">
          <h4 className="fiche-crm-titre">Fiche Programme</h4>
          <span className="fiche-crm-aide">les questions s’adaptent aux réponses</span>
        </div>
        <p className="fiche-crm-sous-titre">0 · Terrain et positionnement</p>
        <div className="fiche-crm-form">
          <Field label="Localisation" as="div">
            <span className={`${classe(!projet.localite)} fiche-crm-lecture`}>
              {projet.localite?.nom ?? projet.localisation}
              {projet.localite && <span className="fiche-crm-code-loc">{projet.localite.code}</span>}
            </span>
            <span className="field-aide">Reprise du référentiel à la création ; elle compose le code projet.</span>
          </Field>
          <div className="field">
            <label className="field-label" htmlFor="fiche-surface">
              Surface du terrain (m²)
            </label>
            <select
              id="fiche-surface"
              className={classe(!(projet.surfaceTerrain > 0))}
              value={autreSurface ? 'autre' : projet.surfaceTerrain > 0 ? String(projet.surfaceTerrain) : ''}
              onChange={(e) => choisirSurface(e.target.value)}
            >
              {!(projet.surfaceTerrain > 0) && !autreSurface && choisir}
              {SURFACES.map((m2) => (
                <option key={m2} value={m2}>
                  {formatNumber(m2)} m²
                </option>
              ))}
              <option value="autre">Autre surface…</option>
            </select>
            {autreSurface && (
              <input
                className={classe(!(projet.surfaceTerrain > 0))}
                inputMode="numeric"
                aria-label="Autre surface (m²)"
                placeholder="Surface en m²"
                value={surfaceSaisie}
                onChange={(e) => setSurfaceSaisie(e.target.value)}
                onBlur={quitterSurface}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
            )}
            <span className="field-aide">Surface du titre foncier, pas la surface construite.</span>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="fiche-standing">
              Standing
            </label>
            <select
              id="fiche-standing"
              className={classe(!projet.standing)}
              value={projet.standing ?? ''}
              onChange={(e) => enregistrer({ standing: e.target.value as Standing })}
            >
              {!projet.standing && choisir}
              {Object.entries(STANDINGS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <span className="field-aide">Ce que le bâtiment offre en équipements.</span>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="fiche-gamme">
              Gamme
            </label>
            <select
              id="fiche-gamme"
              className={classe(!projet.gamme)}
              value={projet.gamme ?? ''}
              onChange={(e) => enregistrer({ gamme: e.target.value as Gamme })}
            >
              {!projet.gamme && choisir}
              {Object.entries(GAMMES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <span className="field-aide">Avec quoi on le finit : durabilité et coût.</span>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="fiche-usage">
              A · Usage
            </label>
            <select
              id="fiche-usage"
              className={classe(!fiche.usage)}
              value={fiche.usage ?? ''}
              onChange={(e) => majFiche({ usage: e.target.value as Usage })}
            >
              {!fiche.usage && choisir}
              {Object.entries(USAGES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="fiche-forme">
              A · Forme bâtie
            </label>
            <select
              id="fiche-forme"
              className={classe(!fiche.forme)}
              value={fiche.forme ?? ''}
              onChange={(e) => majFiche({ forme: e.target.value as Forme })}
            >
              {!fiche.forme && choisir}
              {Object.entries(FORMES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>

        {fiche.forme && (
          <>
            <div className="fp-grille3">
              <div className="field">
                <label className="field-label" htmlFor="fiche-gabarit">
                  B · Gabarit
                </label>
                <select
                  id="fiche-gabarit"
                  className="field-input"
                  value={fiche.gabarit}
                  onChange={(e) => majFiche({ gabarit: Number(e.target.value) })}
                >
                  {GABARITS.map((g) => (
                    <option key={g.valeur} value={g.valeur}>
                      {g.libelle}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="fiche-sous-sols">
                  B · Sous-sol(s)
                </label>
                <select
                  id="fiche-sous-sols"
                  className="field-input"
                  value={fiche.sousSols}
                  onChange={(e) => majFiche({ sousSols: Number(e.target.value) })}
                >
                  {SOUS_SOLS.map((s) => (
                    <option key={s.valeur} value={s.valeur}>
                      {s.libelle}
                    </option>
                  ))}
                </select>
              </div>
              <label className="fp-case fp-case--seule">
                <input
                  type="checkbox"
                  checked={fiche.toitureTerrasse}
                  onChange={(e) => majFiche({ toitureTerrasse: e.target.checked })}
                />
                <span>Toiture-terrasse accessible</span>
              </label>
            </div>
            <p className="fiche-crm-aide">R+4 = rez-de-chaussée + 4 étages, soit 5 niveaux.</p>

            {fiche.forme === 'villa' ? (
              <>
                <div className="fp-grille-typo">
                  <div className="field">
                    <label className="field-label" htmlFor="fiche-typologie">
                      D · Typologie de la villa
                    </label>
                    <select
                      id="fiche-typologie"
                      className={classe(!fiche.typologieVilla)}
                      value={fiche.typologieVilla ?? ''}
                      onChange={(e) => majFiche({ typologieVilla: e.target.value as TypologieVilla })}
                    >
                      {!fiche.typologieVilla && choisir}
                      {Object.entries(TYPOLOGIES_VILLA).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="fp-case fp-case--seule">
                    <input
                      type="checkbox"
                      checked={fiche.suiteParentale}
                      onChange={(e) => majFiche({ suiteParentale: e.target.checked })}
                    />
                    <span>Suite parentale</span>
                  </label>
                </div>
                <Field label="Pièces annexes" as="div">
                  <div className="fp-cases fp-cases--ligne">
                    {(Object.entries(ANNEXES) as [Annexe, string][]).map(([v, l]) => (
                      <label key={v} className="fp-case">
                        <input
                          type="checkbox"
                          checked={fiche.annexes.includes(v)}
                          onChange={() => majFiche({ annexes: basculer(fiche.annexes, v) })}
                        />
                        <span>{l}</span>
                      </label>
                    ))}
                  </div>
                </Field>
              </>
            ) : (
              <div className="field">
                <span className="field-label">
                  D · Composition par niveau <span className="fiche-crm-aide">(regrouper les niveaux identiques)</span>
                </span>
                {fiche.composition.length > 0 && (
                  <div className="fp-compo">
                    <span className="fp-compo-tete">De</span>
                    <span className="fp-compo-tete">À</span>
                    <span className="fp-compo-tete">Usage</span>
                    <span className="fp-compo-tete">Typologie</span>
                    <span className="fp-compo-tete">Nb / niv.</span>
                    <span className="fp-compo-tete" aria-hidden />
                    {fiche.composition.map((l, i) => (
                      <LigneCompo
                        key={i}
                        ligne={l}
                        niveaux={niveauxPossibles}
                        onChange={(maj) => majLigne(i, maj)}
                        onRetirer={() => majFiche({ composition: fiche.composition.filter((_, j) => j !== i) })}
                      />
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="fp-ajouter"
                  onClick={() => {
                    const libre = controle.nonDecrits[0] ?? 0;
                    majFiche({
                      composition: [...fiche.composition, { de: libre, a: libre, usage: null, typologie: '', nb: 1 }],
                    });
                  }}
                >
                  <Plus size={15} aria-hidden /> Ajouter une ligne
                </button>
                <p className="fp-totaux">
                  {totauxImmeuble.length
                    ? `Totaux : ${totauxImmeuble.map((t) => `${t.n} ${t.libelle}`).join(' · ')}`
                    : 'Les totaux par typologie se calculent dès que la composition est remplie.'}
                </p>
                {controle.nonDecrits.length > 0 && (
                  <p className="fp-alerte">
                    Niveaux pas encore décrits : {controle.nonDecrits.map(libelleNiveau).join(', ')}
                  </p>
                )}
                {controle.enDouble.length > 0 && (
                  <p className="fp-alerte">
                    Niveaux décrits deux fois : {controle.enDouble.map(libelleNiveau).join(', ')}
                  </p>
                )}
              </div>
            )}

            <div className="fp-commodites-tete">
              <span className="field-label">
                F · Commodités <span className="fiche-crm-aide">({plural(nbCommodites, 'cochée')})</span>
              </span>
              <span className="fp-commodites-actions">
                {projet.standing && (
                  <button
                    type="button"
                    className="fp-bouton fp-bouton--accent"
                    disabled
                    title="Liste type de chaque standing à fournir par la direction : rien n’est pré-coché d’ici là."
                  >
                    {STANDING_COURT[projet.standing]} standing : sélection type
                  </button>
                )}
                <button
                  type="button"
                  className="fp-bouton"
                  disabled={!nbCommodites}
                  onClick={() => majFiche({ commodites: [] })}
                >
                  Tout décocher
                </button>
              </span>
            </div>
            {COMMODITES.map((g) => (
              <div key={g.groupe} className="fp-groupe">
                <p className="fp-groupe-titre">
                  {g.groupe} · {g.items.filter(([cle]) => fiche.commodites.includes(cle)).length}/{g.items.length}
                </p>
                <div className="fp-cases">
                  {g.items.map(([cle, libelle]) => (
                    <label key={cle} className="fp-case">
                      <input
                        type="checkbox"
                        checked={fiche.commodites.includes(cle)}
                        onChange={() => majFiche({ commodites: basculer(fiche.commodites, cle) })}
                      />
                      <span>{libelle}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        <hr className="fp-separateur" />
        <p className="fiche-crm-sous-titre">E · Nombre de planches</p>
        <div className="field">
          <label className="field-label" htmlFor="fiche-planches">
            N° de planches
          </label>
          {planches !== null ? (
            <span id="fiche-planches" className="field-input fiche-crm-lecture">
              {planches}
            </span>
          ) : (
            <select
              id="fiche-planches"
              className={classe(!(projet.nbPlanches > 0))}
              value={projet.nbPlanches > 0 ? projet.nbPlanches : ''}
              onChange={(e) => enregistrer({ nbPlanches: Number(e.target.value) })}
            >
              {!(projet.nbPlanches > 0) && choisir}
              {PLANCHES_MANUELLES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
          <span className="fp-ok">Se calcule tout seul dès que la composition est remplie.</span>
          <span className="field-aide">Une planche = un plan-type, pas un étage.</span>
        </div>
        <div className="fp-resume">
          <span className="fp-resume-titre">Résumé automatique · colonne Programme</span>
          <strong>{projet.programme.trim() || 'Remplir la fiche Programme : le résumé s’écrit tout seul.'}</strong>
        </div>
      </div>
      {erreur && (
        <p className="field-erreur" role="alert">
          {erreur}
        </p>
      )}
    </section>
  );
}

function LigneCompo({
  ligne,
  niveaux,
  onChange,
  onRetirer,
}: {
  ligne: LigneComposition;
  niveaux: number[];
  onChange: (maj: Partial<LigneComposition>) => void;
  onRetirer: () => void;
}) {
  const [typologie, setTypologie] = useState(ligne.typologie);
  const options = niveaux.map((n) => (
    <option key={n} value={n}>
      {libelleNiveau(n)}
    </option>
  ));
  return (
    <>
      <select
        className="field-input"
        aria-label="De"
        value={ligne.de}
        onChange={(e) => onChange({ de: Number(e.target.value), a: Math.max(Number(e.target.value), ligne.a) })}
      >
        {options}
      </select>
      <select
        className="field-input"
        aria-label="À"
        value={ligne.a}
        onChange={(e) => onChange({ a: Number(e.target.value), de: Math.min(Number(e.target.value), ligne.de) })}
      >
        {options}
      </select>
      <select
        className={`field-input${ligne.usage ? '' : ' is-manquant'}`}
        aria-label="Usage"
        value={ligne.usage ?? ''}
        onChange={(e) => onChange({ usage: e.target.value as UsageNiveau })}
      >
        {!ligne.usage && (
          <option value="" disabled>
            — Usage —
          </option>
        )}
        {Object.entries(USAGES_NIVEAU).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {/* Liste des typologies d'immeuble à recevoir : saisie courte d'ici là. */}
      <input
        className={`field-input${ligne.usage === 'logements' && !ligne.typologie.trim() ? ' is-manquant' : ''}`}
        aria-label="Typologie"
        placeholder="— Typologie —"
        maxLength={20}
        value={typologie}
        onChange={(e) => setTypologie(e.target.value)}
        onBlur={() => typologie.trim() !== ligne.typologie && onChange({ typologie: typologie.trim() })}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <input
        className="field-input"
        aria-label="Nombre par niveau"
        type="number"
        min={1}
        max={999}
        defaultValue={ligne.nb}
        key={ligne.nb}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (Number.isInteger(n) && n >= 1 && n <= 999 && n !== ligne.nb) onChange({ nb: n });
        }}
      />
      <button type="button" className="fp-retirer" aria-label="Retirer la ligne" onClick={onRetirer}>
        <X size={15} />
      </button>
    </>
  );
}

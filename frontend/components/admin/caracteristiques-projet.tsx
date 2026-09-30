'use client';

import { useState } from 'react';
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

type Props = {
  projet: Projet;
  // Rejeter la promesse affiche l'erreur sous le formulaire.
  onModifier: (champs: ModifierFichePayload) => Promise<void>;
};

type ChampNombre = 'surfaceTerrain' | 'nbPlanches';

// « Caractéristiques du projet » d'un lead en « Nouveau projet » (maquette du
// boss) : chaque champ s'enregistre seul — une liste à son choix, un nombre
// ou le programme à la sortie du champ. Une valeur se corrige, jamais ne
// s'efface ; un champ manquant est cerné d'ambre.
export function CaracteristiquesProjet({ projet, onModifier }: Props) {
  const [saisies, setSaisies] = useState<Partial<Record<ChampNombre | 'programme', string>>>({});
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function enregistrer(champs: ModifierFichePayload) {
    setEnCours(true);
    setErreur(null);
    try {
      await onModifier(champs);
      setSaisies((s) => {
        const reste = { ...s };
        for (const cle of Object.keys(champs)) delete reste[cle as keyof typeof reste];
        return reste;
      });
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'L’enregistrement a échoué.');
    } finally {
      setEnCours(false);
    }
  }

  const valeurNombre = (cle: ChampNombre) => saisies[cle] ?? (projet[cle] > 0 ? String(projet[cle]) : '');
  function quitterNombre(cle: ChampNombre) {
    const brut = saisies[cle];
    if (brut === undefined) return;
    const n = Number(brut.replace(/\s/g, ''));
    if (!brut.trim()) return setSaisies((s) => ({ ...s, [cle]: undefined }));
    if (!Number.isInteger(n) || n < 1) return setErreur('Nombre entier positif attendu.');
    if (n !== projet[cle]) void enregistrer({ [cle]: n });
  }

  const programme = saisies.programme ?? projet.programme;
  function quitterProgramme() {
    if (saisies.programme === undefined) return;
    const texte = saisies.programme.trim();
    if (!texte) return setSaisies((s) => ({ ...s, programme: undefined }));
    if (texte !== projet.programme) void enregistrer({ programme: texte });
  }

  const classe = (manquant: boolean) => `field-input${manquant ? ' is-manquant' : ''}`;
  const choisir = <option value="" disabled>— Choisir —</option>;

  return (
    <section className="fiche-crm-section" aria-busy={enCours}>
      <h3 className="fiche-crm-titre">Caractéristiques du projet</h3>
      <div className="fiche-crm-form">
        <div className="field">
          <label className="field-label" htmlFor="fiche-categorie">Catégorie</label>
          <select
            id="fiche-categorie"
            className={classe(!projet.categorie)}
            value={projet.categorie ?? ''}
            disabled={enCours}
            onChange={(e) => enregistrer({ categorie: e.target.value as Categorie })}
          >
            {!projet.categorie && choisir}
            {Object.entries(CATEGORIES).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <span className="field-aide">Le type de mission confiée à Grey Concrete.</span>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="fiche-type">Type de projet</label>
          <select
            id="fiche-type"
            className={classe(!projet.type)}
            value={projet.type ?? ''}
            disabled={enCours}
            onChange={(e) => enregistrer({ type: e.target.value as TypeBien })}
          >
            {!projet.type && choisir}
            {Object.entries(TYPES_BIEN).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <span className="field-aide">La nature de l’ouvrage à concevoir.</span>
        </div>
      </div>

      <div className="fiche-crm-carte fiche-crm-programme">
        <h4 className="fiche-crm-titre">Fiche Programme</h4>
        <p className="fiche-crm-sous-titre">0 · Terrain et positionnement</p>
        <div className="fiche-crm-form">
          <div className="field">
            <span className="field-label">Localisation</span>
            <span className={`${classe(!projet.localite)} fiche-crm-lecture`}>
              {projet.localite?.nom ?? projet.localisation}
              {projet.localite && <span className="fiche-crm-code-loc">{projet.localite.code}</span>}
            </span>
            <span className="field-aide">Reprise du référentiel à la création ; elle compose le code projet.</span>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="fiche-surface">Surface du terrain (m²)</label>
            <input
              id="fiche-surface"
              className={classe(!(projet.surfaceTerrain > 0))}
              inputMode="numeric"
              placeholder="— à renseigner —"
              value={valeurNombre('surfaceTerrain')}
              disabled={enCours}
              onChange={(e) => setSaisies((s) => ({ ...s, surfaceTerrain: e.target.value }))}
              onBlur={() => quitterNombre('surfaceTerrain')}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
            <span className="field-aide">Surface du titre foncier, pas la surface construite.</span>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="fiche-standing">Standing</label>
            <select
              id="fiche-standing"
              className={classe(!projet.standing)}
              value={projet.standing ?? ''}
              disabled={enCours}
              onChange={(e) => enregistrer({ standing: e.target.value as Standing })}
            >
              {!projet.standing && choisir}
              {Object.entries(STANDINGS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <span className="field-aide">Ce que le bâtiment offre en équipements.</span>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="fiche-gamme">Gamme</label>
            <select
              id="fiche-gamme"
              className={classe(!projet.gamme)}
              value={projet.gamme ?? ''}
              disabled={enCours}
              onChange={(e) => enregistrer({ gamme: e.target.value as Gamme })}
            >
              {!projet.gamme && choisir}
              {Object.entries(GAMMES).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <span className="field-aide">Avec quoi on le finit : durabilité et coût.</span>
          </div>
        </div>

        <p className="fiche-crm-sous-titre">E · Nombre de planches</p>
        <div className="field">
          <label className="field-label" htmlFor="fiche-planches">N° de planches</label>
          <input
            id="fiche-planches"
            className={classe(!(projet.nbPlanches > 0))}
            inputMode="numeric"
            placeholder="— à renseigner —"
            value={valeurNombre('nbPlanches')}
            disabled={enCours}
            onChange={(e) => setSaisies((s) => ({ ...s, nbPlanches: e.target.value }))}
            onBlur={() => quitterNombre('nbPlanches')}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <span className="field-aide">Une planche = un plan-type, pas un étage.</span>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="fiche-programme">Programme</label>
          <input
            id="fiche-programme"
            className={classe(!projet.programme.trim())}
            placeholder="ex. Villa R+1 · F5 · suite parentale · piscine"
            maxLength={200}
            value={programme}
            disabled={enCours}
            onChange={(e) => setSaisies((s) => ({ ...s, programme: e.target.value }))}
            onBlur={quitterProgramme}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <span className="field-aide">Résumé repris dans la colonne Programme du registre.</span>
        </div>
      </div>
      {erreur && <p className="field-erreur" role="alert">{erreur}</p>}
    </section>
  );
}

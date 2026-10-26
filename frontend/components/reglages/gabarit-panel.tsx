'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { allerA, useSectionEnLecture } from '@/lib/defilement';
import {
  enregistrerGabarit,
  libelleVersion,
  type CarteGabarit,
  type Changement,
  type GabaritEnService,
  type Reglages,
  type TacheGabarit,
  type Temps,
} from '@/lib/reglages';
import { BarreMotif } from './barre-motif';

type Champ = Changement['champ'];
const cle = (carte: string, tache: string | undefined, champ: Champ) => `${carte}|${tache ?? ''}|${champ}`;

const LIBELLE_TEMPS: Record<Exclude<Temps['type'], 'heures' | 'par_unite' | 'total'>, (t: Temps) => string> = {
  sans: () => 'sans temps atelier',
  partage: (t) => (t as Extract<Temps, { type: 'partage' }>).libelle,
  charge_gc: () => 'charge GC : durée dans Règles et délais',
  part_carte: () => 'part du temps de la carte',
};
const suffixe = (t: Temps) => (t.type === 'par_unite' ? `h par ${t.unite}` : t.type === 'total' ? 'h au total' : 'h');

// Réglages · Gabarit de projet versionné (maquette du boss) : fenêtres en
// jours ouvrés depuis J1 et temps standard. Enregistrer crée la version
// suivante ; les projets en cours gardent la leur.
export function GabaritPanel({
  slug,
  gabarit,
  onEnregistre,
}: {
  slug: string;
  gabarit: GabaritEnService;
  onEnregistre: (r: Reglages) => void;
}) {
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const etapes = gabarit.contenu.etapes;

  // En-tête collé (raccourcis des étapes + colonnes) : sa hauteur (--reg-tete-h)
  // arrête les étapes visées juste dessous ; l'étape en lecture s'allume.
  const section = useRef<HTMLElement>(null);
  const tete = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tete.current;
    if (!el) return;
    const obs = new ResizeObserver(() => section.current?.style.setProperty('--reg-tete-h', `${el.offsetHeight}px`));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const ancre = (numero: number) => `reg-etape-${numero}`;
  const etapeVue = useSectionEnLecture(
    etapes.map((e) => ancre(e.numero)),
    tete,
  );

  // Valeur d'origine de chaque champ modifiable, pour ne compter que les vrais changements.
  const origines = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of gabarit.contenu.etapes.flatMap((e) => e.cartes)) {
      for (const cible of [c, ...c.taches] as (CarteGabarit | TacheGabarit)[]) {
        const tache = cible === c ? undefined : cible.cle;
        if (cible.fenetre) {
          m.set(cle(c.cle, tache, 'debut'), cible.fenetre.debut);
          m.set(cle(c.cle, tache, 'fin'), cible.fenetre.fin);
        }
        // Seuls ces temps se modifient (le partagé est un libellé, cf. backend).
        const t = cible.temps;
        if (t && (t.type === 'heures' || t.type === 'par_unite' || t.type === 'total'))
          m.set(cle(c.cle, tache, 'heures'), t.heures);
        // Visa DPLG (revue Dir. GC) : case par tâche, 1 = exigé.
        if (tache) m.set(cle(c.cle, tache, 'visa'), (cible as TacheGabarit).visaDplg ? 1 : 0);
        // Fichier au dépôt (lot F, 23/10/2026) : obligatoire par défaut.
        if (tache) m.set(cle(c.cle, tache, 'fichier'), (cible as TacheGabarit).fichierFacultatif ? 0 : 1);
      }
    }
    return m;
  }, [gabarit]);

  const changements: Changement[] = Object.entries(saisies).flatMap(([k, v]) => {
    const n = Number(v.replace(',', '.'));
    if (v.trim() === '' || !Number.isFinite(n) || n === origines.get(k)) return [];
    const [carte, tache, champ] = k.split('|');
    return [{ carte, ...(tache && { tache }), champ: champ as Champ, valeur: n }];
  });

  const champ = (carte: string, tache: string | undefined, c: Champ, largeur: 'jour' | 'heures') => {
    const k = cle(carte, tache, c);
    const modifie = k in saisies && Number(saisies[k].replace(',', '.')) !== origines.get(k);
    return (
      <input
        className={`field-input reg-num reg-num--${largeur}${modifie ? ' is-modifie' : ''}`}
        inputMode={largeur === 'jour' ? 'numeric' : 'decimal'}
        aria-label={
          c === 'heures' ? 'Temps standard (heures)' : c === 'debut' ? 'Début (jour ouvré)' : 'Fin (jour ouvré)'
        }
        value={saisies[k] ?? String(origines.get(k))}
        onChange={(e) => setSaisies((s) => ({ ...s, [k]: e.target.value }))}
      />
    );
  };
  // Case à cocher d'une tâche (1 = oui) : visa DPLG, fichier obligatoire.
  const caseTache = (carte: string, tache: string, c: 'visa' | 'fichier', libelle: string) => {
    const k = cle(carte, tache, c);
    const coche = (saisies[k] ?? String(origines.get(k))) === '1';
    const modifie = k in saisies && Number(saisies[k]) !== origines.get(k);
    return (
      <label className={`reg-visa${modifie ? ' is-modifie' : ''}`}>
        <input
          type="checkbox"
          checked={coche}
          onChange={(e) => setSaisies((s) => ({ ...s, [k]: e.target.checked ? '1' : '0' }))}
        />
        {libelle}
      </label>
    );
  };
  const visa = (carte: string, tache: string) => (
    <>
      {caseTache(carte, tache, 'visa', 'Visa DPLG')}
      {caseTache(carte, tache, 'fichier', 'Fichier obligatoire')}
    </>
  );
  const fenetre = (carte: string, tache?: string) => (
    <span className="reg-fenetre">
      J {champ(carte, tache, 'debut', 'jour')} → J {champ(carte, tache, 'fin', 'jour')}
    </span>
  );
  const temps = (carte: string, tache: string | undefined, t?: Temps) => {
    if (!t) return null;
    if (t.type === 'heures' || t.type === 'par_unite' || t.type === 'total') {
      return (
        <span className="reg-temps">
          {champ(carte, tache, 'heures', 'heures')} <span>{suffixe(t)}</span>
        </span>
      );
    }
    return <span className="cell-sub reg-texte">{LIBELLE_TEMPS[t.type](t)}</span>;
  };

  return (
    <section ref={section} className="panel glass-panel dmd-section reg-panel">
      <div className="reg-entete">
        <h2 className="dmd-titre">
          Gabarit {gabarit.code} · version en service : {gabarit.libelle}
        </h2>
        <span className="cell-sub">
          {gabarit.projets} projet(s) en {gabarit.libelle}
        </span>
      </div>
      <p className="dmd-note">
        Fenêtres en jours ouvrés (J1 = ouverture du projet), durées standard, visa DPLG (la tâche validée attend la
        signature de l’architecte) et fichier obligatoire (sans fichier, la tâche ne peut pas être déposée). Un
        enregistrement crée la version {libelleVersion(gabarit.numero + 1)} : elle s’applique aux projets ouverts
        ensuite. Les projets en cours gardent leur version, leurs fenêtres et leurs durées (délais figés).
      </p>

      {/* Collé sous la barre du haut pendant la lecture du tableau. Les
          colonnes y sont visuelles ; celles du tableau restent pour les
          lecteurs d'écran. */}
      <div ref={tete} className="reg-gabarit-tete">
        <nav className="reg-etapes" aria-label="Aller à l’étape">
          {etapes.map((e) => (
            <button
              key={e.cle}
              type="button"
              className={`puce-ancre${ancre(e.numero) === etapeVue ? ' is-actif' : ''}`}
              aria-current={ancre(e.numero) === etapeVue ? 'true' : undefined}
              onClick={() => allerA(ancre(e.numero))}
            >
              <span className={`reg-numero reg-numero--${e.numero}`}>{String(e.numero).padStart(2, '0')}</span>
              {e.libelle}
            </button>
          ))}
        </nav>
        <div className="reg-ligne reg-ligne--tete" aria-hidden>
          <span>Ét.</span>
          <span>Carte · tâche</span>
          <span>Fenêtre (jours ouvrés)</span>
          <span>Temps standard</span>
        </div>
      </div>

      <div className="reg-gabarit" role="table" aria-label={`Gabarit ${gabarit.code}`}>
        <div className="reg-ligne sr-only" role="row">
          <span role="columnheader">Étape</span>
          <span role="columnheader">Carte · tâche</span>
          <span role="columnheader">Fenêtre (jours ouvrés)</span>
          <span role="columnheader">Temps standard</span>
        </div>
        {etapes.map((e) => (
          <div key={e.cle} role="rowgroup">
            <div id={ancre(e.numero)} className="reg-ligne reg-ligne--etape" role="row">
              <span className={`reg-numero reg-numero--${e.numero}`}>{String(e.numero).padStart(2, '0')}</span>
              <strong>{e.libelle}</strong>
            </div>
            {e.cartes.map((c) => (
              <div key={c.cle} role="rowgroup">
                <div className="reg-ligne reg-ligne--carte" role="row">
                  <span />
                  <span>
                    <strong>{c.libelle}</strong>
                    {(c.note || c.client) && (
                      <span className="cell-sub reg-texte">
                        {c.client ? 'étiquette CLIENT · hors budget atelier' : c.note}
                      </span>
                    )}
                  </span>
                  <span>{c.fenetre && fenetre(c.cle)}</span>
                  <span>
                    {c.desactivee ? (
                      <span className="cell-sub reg-texte">carte vide, désactivée</span>
                    ) : c.fichiers ? (
                      <span className="cell-sub reg-texte">rubriques de fichiers</span>
                    ) : (
                      temps(c.cle, undefined, c.temps)
                    )}
                  </span>
                </div>
                {c.taches.map((t) => (
                  <div key={t.cle} className="reg-ligne reg-ligne--tache" role="row">
                    <span />
                    <span className="reg-tache-libelle">
                      {t.libelle} {visa(c.cle, t.cle)}
                    </span>
                    <span>{t.fenetre && fenetre(c.cle, t.cle)}</span>
                    <span>{temps(c.cle, t.cle, t.temps)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      <BarreMotif
        nombre={changements.length}
        onAnnuler={() => setSaisies({})}
        onEnregistrer={async (motif) => {
          onEnregistre(await enregistrerGabarit(slug, gabarit.code, { depuis: gabarit.numero, motif, changements }));
          setSaisies({});
        }}
      />
    </section>
  );
}

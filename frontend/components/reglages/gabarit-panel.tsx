'use client';

import { useMemo, useState } from 'react';
import { enregistrerGabarit, libelleVersion, type CarteGabarit, type Changement, type GabaritEnService, type Reglages, type TacheGabarit, type Temps } from '@/lib/reglages';
import { BarreMotif } from './barre-motif';

type Champ = Changement['champ'];
const cle = (carte: string, tache: string | undefined, champ: Champ) => `${carte}|${tache ?? ''}|${champ}`;

const LIBELLE_TEMPS: Record<Exclude<Temps['type'], 'heures' | 'par_unite' | 'total'>, (t: Temps) => string> = {
  sans: () => 'sans temps atelier',
  partage: (t) => (t as Extract<Temps, { type: 'partage' }>).libelle,
  charge_gc: () => 'charge GC : durée dans Règles et délais',
};
const suffixe = (t: Temps) => (t.type === 'par_unite' ? `h par ${t.unite}` : t.type === 'total' ? 'h au total' : 'h');

// Réglages · Gabarit de projet versionné (maquette du boss) : fenêtres en
// jours ouvrés depuis J1 et temps standard. Enregistrer crée la version
// suivante ; les projets en cours gardent la leur.
export function GabaritPanel({ slug, gabarit, onEnregistre }: { slug: string; gabarit: GabaritEnService; onEnregistre: (r: Reglages) => void }) {
  const [saisies, setSaisies] = useState<Record<string, string>>({});

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
        if (cible.temps && 'heures' in cible.temps) m.set(cle(c.cle, tache, 'heures'), cible.temps.heures);
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
        aria-label={c === 'heures' ? 'Temps standard (heures)' : c === 'debut' ? 'Début (jour ouvré)' : 'Fin (jour ouvré)'}
        value={saisies[k] ?? String(origines.get(k))}
        onChange={(e) => setSaisies((s) => ({ ...s, [k]: e.target.value }))}
      />
    );
  };
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
    <section className="panel glass-panel dmd-section reg-panel">
      <div className="reg-entete">
        <h2 className="dmd-titre">
          Gabarit {gabarit.code} · version en service : {gabarit.libelle}
        </h2>
        <span className="cell-sub">
          {gabarit.projets} projet(s) en {gabarit.libelle}
        </span>
      </div>
      <p className="dmd-note">
        Fenêtres en jours ouvrés (J1 = ouverture du projet) et durées standard. Un enregistrement crée la version{' '}
        {libelleVersion(gabarit.numero + 1)} : elle s’applique aux projets ouverts ensuite. Les projets en cours gardent leur
        version, leurs fenêtres et leurs durées (délais figés).
      </p>

      <div className="reg-gabarit" role="table" aria-label={`Gabarit ${gabarit.code}`}>
        <div className="reg-ligne reg-ligne--tete" role="row">
          <span role="columnheader">Ét.</span>
          <span role="columnheader">Carte · tâche</span>
          <span role="columnheader">Fenêtre (jours ouvrés)</span>
          <span role="columnheader">Temps standard</span>
        </div>
        {gabarit.contenu.etapes.map((e) => (
          <div key={e.cle} role="rowgroup">
            <div className="reg-ligne reg-ligne--etape" role="row">
              <span className="reg-numero">{String(e.numero).padStart(2, '0')}</span>
              <strong>{e.libelle}</strong>
            </div>
            {e.cartes.map((c) => (
              <div key={c.cle} role="rowgroup">
                <div className="reg-ligne reg-ligne--carte" role="row">
                  <span />
                  <span>
                    <strong>{c.libelle}</strong>
                    {(c.note || c.client) && (
                      <span className="cell-sub reg-texte">{c.client ? 'étiquette CLIENT · hors budget atelier' : c.note}</span>
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
                    <span>{t.libelle}</span>
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

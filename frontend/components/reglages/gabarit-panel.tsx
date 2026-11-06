'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { allerA, useSectionEnLecture } from '@/lib/defilement';
import {
  enregistrerGabarit,
  libelleVersion,
  type AjoutLigne,
  type CarteGabarit,
  type Changement,
  type GabaritEnService,
  type Reglages,
  type TacheGabarit,
  type Temps,
} from '@/lib/reglages';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';
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
// jours ouvrés depuis J1 et temps standard ; lignes (tâches) ajoutées en fin
// de carte ou retirées (01/11/2026). Enregistrer crée la version suivante ;
// les projets en cours gardent la leur.
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
  // Lignes en attente : ajoutées (fin de carte) et retirées (« carte|tâche »).
  const [ajouts, setAjouts] = useState<(AjoutLigne & { id: number })[]>([]);
  const [retraits, setRetraits] = useState<Set<string>>(new Set());
  const [ajoutCarte, setAjoutCarte] = useState<CarteGabarit | null>(null);
  const etapes = gabarit.contenu.etapes;
  // Lignes qui ouvrent une autre carte (« s'ouvre quand… ») : jamais retirées.
  const conditions = useMemo(
    () => new Set(etapes.flatMap((e) => e.cartes.flatMap((c) => c.ouvreApres ?? []))),
    [etapes],
  );
  const retiree = (carte: string, tache: string) => retraits.has(`${carte}|${tache}`);
  const basculerRetrait = (carte: string, tache: string) =>
    setRetraits((s) => {
      const n = new Set(s);
      const k = `${carte}|${tache}`;
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

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
    // Une ligne retirée emporte ses modifications.
    if (tache && retiree(carte, tache)) return [];
    return [{ carte, ...(tache && { tache }), champ: champ as Champ, valeur: n }];
  });
  const enAttente = changements.length + ajouts.length + retraits.size;
  const annulerTout = () => {
    setSaisies({});
    setAjouts([]);
    setRetraits(new Set());
  };

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
        signature de l’architecte) et fichier obligatoire (sans fichier, la tâche ne peut pas être déposée). Chaque
        carte peut recevoir des lignes ou en perdre (une carte garde au moins une ligne). Un enregistrement crée la
        version {libelleVersion(gabarit.numero + 1)} : elle s’applique aux projets ouverts ensuite. Les projets en cours
        gardent leur version, leurs fenêtres et leurs durées (délais figés).
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
                {c.taches.map((t) => {
                  const retire = retiree(c.cle, t.cle);
                  const restantes = c.taches.filter((x) => !retiree(c.cle, x.cle)).length;
                  const condition = conditions.has(`${c.cle}.${t.cle}`);
                  return (
                    <div key={t.cle} className={`reg-ligne reg-ligne--tache${retire ? ' is-retiree' : ''}`} role="row">
                      <span />
                      <span className="reg-tache-libelle">
                        <span className="reg-tache-texte">
                          {retire ? <del>{t.libelle}</del> : t.libelle} {!retire && visa(c.cle, t.cle)}
                          {retire && <span className="cell-sub reg-texte"> · retirée à l’enregistrement</span>}
                        </span>
                        {retire ? (
                          <button
                            type="button"
                            className="reg-ligne-action"
                            onClick={() => basculerRetrait(c.cle, t.cle)}
                          >
                            <RotateCcw size={14} aria-hidden /> Rétablir
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="reg-ligne-action reg-ligne-action--retirer"
                            aria-label={`Retirer la ligne ${t.libelle}`}
                            title={
                              condition
                                ? 'Elle ouvre une autre carte : elle ne peut pas être retirée'
                                : restantes <= 1
                                  ? 'Une carte garde au moins une ligne'
                                  : 'Retirer la ligne'
                            }
                            disabled={condition || restantes <= 1}
                            onClick={() => basculerRetrait(c.cle, t.cle)}
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        )}
                      </span>
                      <span>{!retire && t.fenetre && fenetre(c.cle, t.cle)}</span>
                      <span>{!retire && temps(c.cle, t.cle, t.temps)}</span>
                    </div>
                  );
                })}
                {ajouts
                  .filter((a) => a.carte === c.cle)
                  .map((a) => (
                    <div key={a.id} className="reg-ligne reg-ligne--tache is-ajoutee" role="row">
                      <span />
                      <span className="reg-tache-libelle">
                        <span className="reg-tache-texte">
                          {a.libelle}
                          <span className="cell-sub reg-texte">
                            {' '}
                            · nouvelle ligne{a.visaDplg ? ' · visa DPLG' : ''}
                            {a.fichierObligatoire === false ? ' · fichier facultatif' : ''}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="reg-ligne-action"
                          onClick={() => setAjouts((l) => l.filter((x) => x.id !== a.id))}
                        >
                          <RotateCcw size={14} aria-hidden /> Annuler
                        </button>
                      </span>
                      <span className="cell-sub reg-texte">
                        {a.debut !== undefined ? `J ${a.debut} → J ${a.fin}` : ''}
                      </span>
                      <span className="cell-sub reg-texte">
                        {tempsCarte(c)
                          ? 'part du temps de la carte'
                          : a.heures
                            ? `${String(a.heures).replace('.', ',')} h`
                            : 'sans temps atelier'}
                      </span>
                    </div>
                  ))}
                {!c.fichiers && !c.desactivee && (
                  <div className="reg-ligne reg-ligne--ajout" role="row">
                    <span />
                    <span>
                      <button type="button" className="reg-ajouter" onClick={() => setAjoutCarte(c)}>
                        <Plus size={14} aria-hidden /> Ajouter une ligne
                      </button>
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <BarreMotif
        nombre={enAttente}
        onAnnuler={annulerTout}
        onEnregistrer={async (motif) => {
          onEnregistre(
            await enregistrerGabarit(slug, gabarit.code, {
              depuis: gabarit.numero,
              motif,
              changements,
              ajouts: ajouts.map(({ id: _id, ...a }) => a),
              retraits: [...retraits].map((k) => {
                const [carte, tache] = k.split('|');
                return { carte, tache };
              }),
            }),
          );
          annulerTout();
        }}
      />
      {ajoutCarte && (
        <AjoutLigneModal
          carte={ajoutCarte}
          existantes={[
            ...ajoutCarte.taches.filter((t) => !retiree(ajoutCarte.cle, t.cle)).map((t) => t.libelle),
            ...ajouts.filter((a) => a.carte === ajoutCarte.cle).map((a) => a.libelle),
          ]}
          onClose={() => setAjoutCarte(null)}
          onAjouter={(a) => {
            setAjouts((l) => [...l, { ...a, id: Date.now() + Math.random() }]);
            setAjoutCarte(null);
          }}
        />
      )}
    </section>
  );
}

// Carte au temps par unité ou au total : ses lignes en prennent une part.
const tempsCarte = (c: CarteGabarit) => c.temps?.type === 'par_unite' || c.temps?.type === 'total';

// Nouvelle ligne d'une carte : intitulé, fenêtre (facultative), temps, visa
// DPLG, fichier obligatoire, descriptif (panneau de la tâche dans le projet).
// Elle reste en attente jusqu'à l'enregistrement de la version.
function AjoutLigneModal({
  carte,
  existantes,
  onClose,
  onAjouter,
}: {
  carte: CarteGabarit;
  existantes: string[];
  onClose: () => void;
  onAjouter: (a: AjoutLigne) => void;
}) {
  const [libelle, setLibelle] = useState('');
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [heures, setHeures] = useState('');
  const [visaDplg, setVisaDplg] = useState(false);
  const [fichierObligatoire, setFichierObligatoire] = useState(true);
  const [descriptif, setDescriptif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const partCarte = tempsCarte(carte);

  function ajouter(e: FormEvent) {
    e.preventDefault();
    const nom = libelle.trim();
    if (existantes.some((x) => x.toLowerCase() === nom.toLowerCase())) {
      return setErreur(`La ligne « ${nom} » existe déjà dans cette carte.`);
    }
    const [d, f] = [debut.trim(), fin.trim()].map((v) => (v ? Number(v) : undefined));
    if ((d === undefined) !== (f === undefined)) return setErreur('Renseignez le début et la fin, ou aucun des deux.');
    if (d !== undefined && f !== undefined && (!Number.isInteger(d) || !Number.isInteger(f) || d < 1 || d > f)) {
      return setErreur('Fenêtre invalide : jours entiers, à partir de J1, début avant la fin.');
    }
    const h = heures.trim() ? Number(heures.replace(',', '.')) : null;
    if (h !== null && !(h > 0 && h <= 999)) return setErreur('Temps invalide : heures positives.');
    onAjouter({
      carte: carte.cle,
      libelle: nom,
      ...(d !== undefined && { debut: d, fin: f }),
      heures: partCarte ? null : h,
      visaDplg,
      fichierObligatoire,
      ...(descriptif.trim() && { descriptif: descriptif.trim() }),
    });
  }

  return (
    <Modal onClose={onClose} portal labelledBy="ajout-ligne-titre">
      <header className="modal-header">
        <div>
          <span className="cell-sub">Nouvelle ligne · en fin de carte</span>
          <h2 id="ajout-ligne-titre">{carte.libelle}</h2>
        </div>
        <CloseButton onClick={onClose} />
      </header>
      <form className="modal-body reg-ajout-form" onSubmit={ajouter}>
        <Field label="Intitulé">
          <input
            className="field-input"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            required
            minLength={2}
            maxLength={160}
          />
        </Field>
        <div className="reg-ajout-ligne">
          <Field label="Début (J, facultatif)">
            <input
              className="field-input"
              inputMode="numeric"
              value={debut}
              onChange={(e) => setDebut(e.target.value)}
              placeholder={carte.fenetre ? String(carte.fenetre.debut) : ''}
            />
          </Field>
          <Field label="Fin (J, facultatif)">
            <input
              className="field-input"
              inputMode="numeric"
              value={fin}
              onChange={(e) => setFin(e.target.value)}
              placeholder={carte.fenetre ? String(carte.fenetre.fin) : ''}
            />
          </Field>
          {partCarte ? (
            <p className="cell-sub reg-ajout-temps">Temps : part du temps de la carte</p>
          ) : (
            <Field label="Temps standard (h, facultatif)">
              <input
                className="field-input"
                inputMode="decimal"
                value={heures}
                onChange={(e) => setHeures(e.target.value)}
                placeholder="sans temps atelier"
              />
            </Field>
          )}
        </div>
        <div className="reg-ajout-cases">
          <label className="reg-visa">
            <input type="checkbox" checked={visaDplg} onChange={(e) => setVisaDplg(e.target.checked)} /> Visa DPLG
          </label>
          <label className="reg-visa">
            <input
              type="checkbox"
              checked={fichierObligatoire}
              onChange={(e) => setFichierObligatoire(e.target.checked)}
            />{' '}
            Fichier obligatoire au dépôt
          </label>
        </div>
        <Field label="Descriptif (facultatif, affiché dans la tâche du projet)">
          <textarea
            className="field-input"
            rows={3}
            maxLength={1000}
            value={descriptif}
            onChange={(e) => setDescriptif(e.target.value)}
          />
        </Field>
        {erreur && <FieldError>{erreur}</FieldError>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn-primary">
            Ajouter la ligne
          </button>
        </div>
      </form>
    </Modal>
  );
}

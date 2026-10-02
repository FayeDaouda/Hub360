'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getVueEquipes, majCollaborateur } from '@/lib/equipe';
import { getAbsencesAValider } from '@/lib/demandes';
import { NIVEAUX_COLLABORATEUR, type VueEquipes } from '@/lib/types';
import { AbsencesADecider } from '@/components/absences/absences-a-decider';
import { CelluleCarte } from './cellule-carte';
import { CreerCellule } from './creer-cellule';
import { Nomenclature } from './nomenclature';

type Liste = 'cellules' | 'affecter' | 'projets' | 'etapes' | 'absences';

const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

// Équipes (maquette du boss, oct. 2026) : cinq indicateurs, chacun ouvre sa
// liste pour agir directement ; « Cellules » par défaut, avec la création et
// la nomenclature ISO 9001. Écriture selon la matrice (module équipe).
export function Equipes({ slug, ecriture }: { slug: string; ecriture: boolean }) {
  const [vue, setVue] = useState<VueEquipes | null>(null);
  const [liste, setListe] = useState<Liste>('cellules');
  const [aDecider, setADecider] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    getVueEquipes(slug)
      .then(setVue)
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Équipes indisponibles.'));
  }, [slug]);
  useEffect(() => {
    charger();
    getAbsencesAValider(slug)
      .then((l) => setADecider(l.length))
      .catch(() => setADecider(0));
  }, [slug, charger]);

  async function reaffecter(collaborateurId: string, celluleId: string | null) {
    setErreur(null);
    try {
      await majCollaborateur(slug, collaborateurId, { celluleId });
      charger();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'La réaffectation a échoué.');
    }
  }

  if (!vue) return erreur ? <p className="field-erreur">{erreur}</p> : <div className="skeleton admin-skeleton-panel" aria-hidden />;
  const i = vue.indicateurs;
  const tuiles: { cle: Liste; libelle: string; valeur: string; aide: string; ton?: string }[] = [
    { cle: 'cellules', libelle: 'Cellules', valeur: `${i.cellules.actives} / ${i.cellules.total}`, aide: ecriture ? 'actives · créer, consulter' : 'actives · consulter' },
    { cle: 'affecter', libelle: 'Salariés à affecter', valeur: String(i.salariesAAffecter), aide: 'sans cellule', ton: i.salariesAAffecter ? 'attention' : undefined },
    {
      cle: 'projets',
      libelle: 'Projets signés',
      valeur: String(i.projetsSignes.total),
      aide: i.projetsSignes.nonAffectes ? `${i.projetsSignes.nonAffectes} à affecter` : 'tous affectés',
      ton: i.projetsSignes.nonAffectes ? 'attention' : undefined,
    },
    {
      cle: 'etapes',
      libelle: 'Étapes en cours',
      valeur: String(i.etapes.enCours),
      aide: `${i.etapes.pctATemps ?? 100} % à temps · ${i.etapes.enRetard} en retard`,
      ton: 'risque',
    },
    {
      cle: 'absences',
      libelle: 'Absences à décider',
      valeur: aDecider == null ? '…' : String(aDecider),
      aide: `${i.absencesEnAttente} en attente dans la société (décision N+1)`,
    },
  ];

  return (
    <div className="eq">
      <p className="eq-sous-titre">Cliquez sur un indicateur pour ouvrir la liste correspondante et agir directement.</p>
      <div className="eq-tuiles" role="tablist" aria-label="Indicateurs">
        {tuiles.map((t) => (
          <button
            key={t.cle}
            type="button"
            role="tab"
            aria-selected={liste === t.cle}
            className={`panel glass-panel po-tuile eq-tuile${liste === t.cle ? ' is-active' : ''}`}
            onClick={() => setListe(t.cle)}
          >
            <span className="po-tuile-libelle">{t.libelle}</span>
            <strong className={`po-tuile-valeur${t.ton ? ` po-ton--${t.ton}` : ''}`}>{t.valeur}</strong>
            <span className="po-aide">{t.aide}</span>
          </button>
        ))}
      </div>
      {erreur && <p className="field-erreur">{erreur}</p>}

      {liste === 'cellules' && (
        <div className="eq-colonnes">
          <div className="eq-cellules">
            {vue.cellules.map((c) => (
              <CelluleCarte key={c.id} cellule={c} cellules={vue.cellules} ecriture={ecriture} onReaffecter={reaffecter} />
            ))}
          </div>
          <aside className="eq-cote">
            {ecriture && <CreerCellule slug={slug} vue={vue} onCreee={charger} />}
            <Nomenclature prefixe={vue.prochainsCodes.ARC.split('-')[0]} />
          </aside>
        </div>
      )}

      {liste === 'affecter' && (
        <section className="panel glass-panel eq-liste">
          <h2>Salariés à affecter · {vue.salariesAAffecter.length}</h2>
          {vue.salariesAAffecter.length === 0 ? (
            <p className="eq-aide">Tous les salariés ont une cellule.</p>
          ) : (
            <ul className="eq-lignes">
              {vue.salariesAAffecter.map((s) => (
                <li key={s.id}>
                  <span className="eq-membre">
                    <strong>{s.nom}</strong>
                    <small>
                      {s.role} · {NIVEAUX_COLLABORATEUR[s.niveau]}
                      {s.dateArrivee && ` · arrivé le ${jjmmaaaa(s.dateArrivee)}`}
                    </small>
                  </span>
                  <select
                    className="field-input eq-affectation"
                    aria-label={`Affecter ${s.nom}`}
                    value=""
                    disabled={!ecriture}
                    onChange={(e) => e.target.value && reaffecter(s.id, e.target.value)}
                  >
                    <option value="">Affecter à une cellule…</option>
                    {vue.cellules.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} · {c.nom}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {liste === 'projets' && (
        <section className="panel glass-panel eq-liste">
          <h2>Projets signés · {vue.projets.length}</h2>
          <ul className="eq-lignes">
            {vue.projets.map((p) => (
              <li key={p.id}>
                <span className="eq-membre">
                  <strong className="eq-code">{p.code}</strong>
                  <small>
                    {p.client}
                    {p.programme && ` · ${p.programme}`}
                  </small>
                </span>
                <span className="eq-badges">
                  {p.cellules.length ? (
                    p.cellules.map((c) => (
                      <span key={c.code} className="pill pill--info" title={c.nom}>
                        {c.code}
                      </span>
                    ))
                  ) : (
                    <span className="pill pill--attention">à affecter</span>
                  )}
                </span>
                <Link className="lien-inline" href={`/admin/${slug}/projets?projet=${p.id}`}>
                  Ouvrir
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {liste === 'etapes' && (
        <section className="panel glass-panel eq-liste">
          <h2>
            Étapes en cours · {vue.etapesEnCours.length}
            {i.etapes.enRetard > 0 && <span className="pill pill--risque">{i.etapes.enRetard} en retard</span>}
          </h2>
          <ul className="eq-lignes">
            {vue.etapesEnCours.map((t) => (
              <li key={t.id}>
                <span className="eq-membre">
                  <strong>{t.libelle}</strong>
                  <small>
                    <span className="eq-code">{t.projet}</span> · {t.etape}
                  </small>
                </span>
                <span className="eq-charge">{t.assigne ?? 'à assigner'}</span>
                <span className={`pill ${t.enRetard ? 'pill--risque' : 'pill--neutre'}`}>
                  {t.echeance ? `${t.enRetard ? 'échue le' : 'échéance'} ${jjmmaaaa(t.echeance)}` : 'sans échéance'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {liste === 'absences' && (
        <>
          <AbsencesADecider slug={slug} onCompte={setADecider} />
          {aDecider === 0 && (
            <section className="panel glass-panel eq-liste">
              <h2>Absences à décider · 0</h2>
              <p className="eq-aide">
                Aucune demande n’attend votre décision. {i.absencesEnAttente} demande(s) attendent leur N+1 dans la société.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

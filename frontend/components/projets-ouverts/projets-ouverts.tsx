'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSessionCourante, useTitrePage } from '@/lib/layout-contexte';
import { niveauSuffisant } from '@/lib/auth';
import {
  getAssignables,
  getDossierProjet,
  getTableauProjets,
  heuresTache,
  jjmm,
  jjmmaaaa,
  numeroEtape,
  pastilleCarte,
  pastilleEtape,
  pastilleTache,
  type Assignable,
  type CarteOuverte,
  type DossierProjetOuvert,
  type TableauProjets,
} from '@/lib/projets-ouverts';
import { TachePanneau } from './tache-panneau';

const HEURES_PAR_JOUR = 8;

// Projets · gabarit (maquette « Projets » du boss, vue CIO) : tuiles, projets
// ouverts, et le dossier du projet choisi — étapes, cartes, tâches.
export function ProjetsOuverts({ slug }: { slug: string }) {
  const session = useSessionCourante();
  const [tableau, setTableau] = useState<TableauProjets | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [projetId, setProjetId] = useState<string | null>(null);
  const [dossier, setDossier] = useState<DossierProjetOuvert | null>(null);
  const [etape, setEtape] = useState(1);
  const [tacheId, setTacheId] = useState<string | null>(null);
  // « Lecture et assignation » : la liste n'est chargée que pour qui assigne.
  const peutAssigner = niveauSuffisant(session, 'projets', 'ecriture');
  const [assignables, setAssignables] = useState<Assignable[] | null>(null);

  useTitrePage(`Projets · gabarit ${tableau?.gabarit ?? 'GC-CONCEPTION'}`);

  useEffect(() => {
    getTableauProjets(slug)
      .then((t) => {
        setTableau(t);
        setProjetId((id) => id ?? t.projets[0]?.id ?? null);
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Lecture impossible.'));
  }, [slug]);

  useEffect(() => {
    if (!peutAssigner) return;
    getAssignables(slug)
      .then(setAssignables)
      .catch(() => setAssignables(null));
  }, [slug, peutAssigner]);

  // Après une écriture : le dossier relu, la tâche choisie gardée.
  const recharger = useCallback(async () => {
    if (projetId) setDossier(await getDossierProjet(slug, projetId));
  }, [slug, projetId]);

  useEffect(() => {
    if (!projetId) return;
    let annule = false;
    setDossier(null);
    setTacheId(null);
    getDossierProjet(slug, projetId)
      .then((d) => !annule && setDossier(d))
      .catch((e) => !annule && setErreur(e instanceof Error ? e.message : 'Lecture impossible.'));
    return () => {
      annule = true;
    };
  }, [slug, projetId]);

  const horizon = tableau ? Math.round(tableau.budgetHeures / HEURES_PAR_JOUR) : null;
  const acces = peutAssigner ? 'Lecture et assignation · accès complet' : 'Lecture seule';

  return (
    <div className="po">
      <div className="po-entete">
        <p className="po-sous-titre">
          Étapes → cartes → tâches générées depuis le devis signé à l’émission de F1
          {horizon !== null && ` · ${horizon} jours ouvrés (${tableau!.budgetHeures} h)`}, délais figés, validation par le chef de team.
        </p>
        <div className="po-entete-actions">
          <Link className="btn-ghost" href={`/admin/${slug}/reglages?section=gabarit`}>
            Gabarit et paramètres
          </Link>
          <span className="po-acces">{acces}</span>
        </div>
      </div>

      {erreur && <p className="field-erreur">{erreur}</p>}

      <div className="po-tuiles">
        <Tuile libelle="Remises à valider" valeur={tableau?.kpi.remisesAValider} aide="tous projets · chef de team ou DPLG" ton="validation" />
        <Tuile libelle="Tâches en retard" valeur={tableau?.kpi.tachesEnRetard} aide="échéance de référence dépassée" ton="risque" />
        <Tuile
          libelle="Prolongations à décider"
          valeur={tableau?.kpi.prolongations}
          aide="le retard est qualifié par le chef de team ou le DPLG"
          ton="attention"
        />
        <Tuile
          libelle="Signalements et mentions"
          valeur={tableau ? tableau.kpi.tsNonAcceptes + tableau.kpi.mentions : undefined}
          aide={tableau ? `${tableau.kpi.tsNonAcceptes} TS non accepté(s) · ${tableau.kpi.mentions} tâche(s)` : ''}
          ton="risque"
        />
      </div>

      {tableau && tableau.projets.length === 0 ? (
        <section className="panel glass-panel po-vide">
          <h2>Aucun projet ouvert</h2>
          <p className="po-aide">
            Un projet s’ouvre à l’émission de sa facture F1 (Réglages · Ouverture du projet) : ses étapes, cartes et tâches sont alors
            générées depuis le gabarit, délais figés.
          </p>
        </section>
      ) : (
        <div className="po-colonnes">
          <section className="panel glass-panel po-liste" aria-label="Projets ouverts">
            <h2 className="po-liste-titre">Projets ouverts</h2>
            {!tableau ? (
              <div className="skeleton admin-skeleton-panel" aria-hidden />
            ) : (
              <ul>
                {tableau.projets.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`po-projet${p.id === projetId ? ' is-actif' : ''}`}
                      aria-pressed={p.id === projetId}
                      onClick={() => setProjetId(p.id)}
                    >
                      <span className="po-projet-tete">
                        <span className="po-code">{p.code}</span>
                        <span className={`po-pastille po-pastille--${p.enRetard ? 'risque' : 'succes'}`}>
                          {p.enRetard ? `${p.enRetard} en retard` : 'Dans les délais'}
                        </span>
                      </span>
                      <span className="po-projet-client">{p.client}</span>
                      <span className="po-barre" aria-hidden>
                        <span style={{ width: `${p.total ? Math.round((p.faites / p.total) * 100) : 0}%` }} />
                      </span>
                      <span className="po-aide">
                        {p.cellule ?? 'Cellule à assigner'} · J{p.jour} / {p.horizon} · {p.faites}/{p.total} tâches
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel glass-panel po-dossier" aria-label="Dossier projet">
            {!dossier ? (
              <div className="skeleton admin-skeleton-panel" aria-hidden />
            ) : (
              <Dossier
                slug={slug}
                dossier={dossier}
                etape={etape}
                onEtape={setEtape}
                tacheId={tacheId}
                onTache={setTacheId}
                assignables={peutAssigner ? assignables : null}
                onMaj={recharger}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Tuile({ libelle, valeur, aide, ton }: { libelle: string; valeur: number | undefined; aide: string; ton: string }) {
  return (
    <div className="panel glass-panel po-tuile">
      <span className="po-tuile-libelle">{libelle}</span>
      <strong className={`po-tuile-valeur po-ton--${ton}`}>{valeur ?? '…'}</strong>
      <span className="po-aide">{aide}</span>
    </div>
  );
}

type PropsDossier = {
  slug: string;
  dossier: DossierProjetOuvert;
  etape: number;
  onEtape: (n: number) => void;
  tacheId: string | null;
  onTache: (id: string | null) => void;
  assignables: Assignable[] | null;
  onMaj: () => Promise<void>;
};

function Dossier({ slug, dossier: d, etape, onEtape, tacheId, onTache, assignables, onMaj }: PropsDossier) {
  const cartes = d.cartes.filter((c) => c.etapeNumero === etape);
  const choisie = d.cartes.flatMap((c) => c.taches.map((t) => ({ carte: c, tache: t }))).find((x) => x.tache.id === tacheId) ?? null;
  const factures = pastillesFactures(d);

  return (
    <>
      <header className="po-dossier-tete">
        <div>
          <p className="po-kicker">Dossier projet</p>
          <h2 className="po-dossier-titre">
            <span className="po-code po-code--grand">{d.code}</span> {d.client.nom}
          </h2>
          <p className="po-aide">
            {d.cellule ? `${libelleCellule(d.cellule.nom)} · chef de team ${d.cellule.chef ?? 'à désigner'}` : 'Cellule à assigner'}
            {d.cellule?.chef && ` · validation aujourd’hui : ${d.cellule.chef}`} · pilote des études : {d.pilote}
            {d.version && ` · ${d.version.code} ${d.version.libelle}`}
            {d.offre && ` depuis ${d.offre}`}
          </p>
          <div className="po-pastilles">
            {factures.map((f) => (
              <span key={f.libelle} className={`po-pastille po-pastille--${f.ton}`}>
                {f.libelle}
              </span>
            ))}
          </div>
        </div>
        <div className="po-dossier-jour">
          <strong>
            J{d.jour} / {d.horizon}
          </strong>
          <span className="po-aide">
            J1 le {jjmmaaaa(d.ouvertLe)} → livraison J{d.horizon} le {jjmmaaaa(d.livraisonLe)}
          </span>
          {d.budgetHeures !== null && <span className="po-aide">Budget atelier {d.budgetHeures} h · durée, pas une somme d’heures</span>}
        </div>
      </header>

      <div className="po-etapes" role="tablist" aria-label="Étapes">
        {d.etapes.map((e) => {
          const p = pastilleEtape(e);
          return (
            <button
              key={e.numero}
              type="button"
              role="tab"
              aria-selected={e.numero === etape}
              className={`po-etape${e.numero === etape ? ' is-actif' : ''}`}
              onClick={() => {
                onEtape(e.numero);
                onTache(null);
              }}
            >
              <span className="po-etape-tete">
                <span>{numeroEtape(e.numero)}</span>
                <span>
                  {e.faites}/{e.total} tâches
                </span>
              </span>
              <strong>{e.libelle}</strong>
              <span className={`po-pastille po-pastille--${p.ton}`}>{p.libelle}</span>
            </button>
          );
        })}
      </div>

      <div className="po-corps">
        <div className="po-cartes">
          {cartes.map((c) => (
            <Carte key={c.id} carte={c} tacheId={tacheId} onTache={onTache} />
          ))}
        </div>
        {choisie ? (
          <TachePanneau
            slug={slug}
            projetId={d.id}
            code={d.code}
            carte={choisie.carte}
            tache={choisie.tache}
            assignables={assignables}
            onMaj={onMaj}
          />
        ) : (
          <p className="po-panneau po-panneau--vide">Cliquez une tâche pour voir son descriptif, son échéance et qui la valide.</p>
        )}
      </div>
    </>
  );
}

function Carte({ carte: c, tacheId, onTache }: { carte: CarteOuverte; tacheId: string | null; onTache: (id: string) => void }) {
  const p = pastilleCarte(c.etat);
  const eteinte = c.etat.code === 'desactivee';
  // « délai en heures ouvrées depuis J1 » : la fenêtre se lit aussi en heures.
  const enHeures = c.note?.includes('heures ouvrées') && c.debutJ !== null && c.finJ !== null;
  const fenetre =
    c.debutJ !== null && c.debutLe && c.finLe
      ? `J${c.debutJ} → J${c.finJ} · ${jjmm(c.debutLe)} → ${jjmm(c.finLe)}${enHeures ? ` · ${(c.finJ! - c.debutJ + 1) * HEURES_PAR_JOUR} h ouvrées` : ''}`
      : c.note?.split(' : ')[0] ?? null;
  const etiquettes = [c.etiquette, c.client ? 'CLIENT · hors budget atelier' : null].filter((x): x is string => !!x);

  return (
    <article className={`po-carte${eteinte ? ' is-eteinte' : ''}`}>
      <header className="po-carte-tete">
        <div>
          <p className="po-kicker po-kicker--code">{c.cle.toUpperCase()}</p>
          <h3>{c.libelle}</h3>
        </div>
        <div className="po-carte-droite">
          <span className={`po-pastille po-pastille--${p.ton}`}>{p.libelle}</span>
          {fenetre && <span className="po-aide">{fenetre}</span>}
          {etiquettes.map((e) => (
            <span key={e} className="po-pastille po-pastille--validation">
              {e}
            </span>
          ))}
        </div>
      </header>
      {c.descriptif && <p className="po-aide po-carte-descriptif">{c.descriptif}</p>}
      {c.etat.code === 'verrouillee' && (
        <p className="po-attente">S’ouvre quand ces tâches sont validées : {c.etat.attend.join(', ')}.</p>
      )}
      {c.fichiers ? (
        <p className="po-aide">Aucun fichier source déposé dans cette étape.</p>
      ) : c.taches.length === 0 ? (
        <p className="po-aide">Aucune tâche générée pour ce projet.</p>
      ) : (
        <ul className="po-taches">
          {c.taches.map((t) => {
            const pt = pastilleTache(t.etat);
            const eteint = t.etat.code === 'non_necessaire' || t.etat.code === 'desactivee';
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className={`po-tache${t.id === tacheId ? ' is-actif' : ''}${eteint ? ' is-eteinte' : ''}`}
                  aria-pressed={t.id === tacheId}
                  onClick={() => onTache(t.id)}
                >
                  <span className="po-tache-libelle">
                    <strong>{t.libelle}</strong>
                    <span className="po-aide">
                      {t.cle.replace(/_/g, ' ')}
                      {t.motif && ` · ${t.motif}`}
                    </span>
                  </span>
                  <span className="po-tache-assigne">{t.assigne?.nom ?? 'À assigner'}</span>
                  <span className="po-tache-heures">{heuresTache(t)}</span>
                  <span className={`po-tache-echeance${t.etat.code === 'en_retard' ? ' po-retard' : ''}`}>{t.finLe ? jjmm(t.finLe) : '—'}</span>
                  <span className={`po-pastille po-pastille--${pt.ton}`}>{pt.libelle}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

// « F1 émise · projet ouvert », « F2 attend 02, 03, récépissé 04 »… La
// première facture en attente est mise en avant (maquette).
function pastillesFactures(d: DossierProjetOuvert) {
  let premiere = true;
  return (['F1', 'F2', 'F3'] as const).map((f) => {
    if (d.factures[f] === 'emise') return { libelle: f === 'F1' ? 'F1 émise · projet ouvert' : `${f} émise`, ton: 'succes' };
    const attend = f === 'F1' ? [] : d.attentes[f];
    const ton = premiere ? 'attention' : 'neutre';
    premiere = false;
    return { libelle: attend.length ? `${f} attend ${attend.join(', ')}` : `${f} à émettre`, ton };
  });
}

// « Cellule Archi 3 » est déjà nommée ; « GC-ARC-02 » (maquette) ne l'est pas.
const libelleCellule = (nom: string) => (/^cellule\b/i.test(nom) ? nom : `Cellule ${nom}`);

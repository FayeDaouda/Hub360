'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { definirDispatcher, getVueEquipes, majCollaborateur, renommerCellule, supprimerCellule } from '@/lib/equipe';
import { getAbsencesAValider } from '@/lib/demandes';
import { NIVEAUX_COLLABORATEUR, type CelluleEquipe, type NiveauCollaborateur, type VueEquipes } from '@/lib/types';
import { AbsencesADecider } from '@/components/absences/absences-a-decider';
import { ChampModal } from '@/components/admin/champ-modal';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { CelluleCarte } from './cellule-carte';
import { CreerCellule } from './creer-cellule';
import { Nomenclature } from './nomenclature';
import { SommaireCellules, ancreCellule } from './sommaire-cellules';
import { useSectionEnLecture } from '@/lib/defilement';
import { useEnteteFixe } from '@/lib/entete-fixe';
import { useMediaQuery } from '@/lib/media';
import { formatDate, plural } from '@hub/domain';
import { Pill } from '@/components/ui/pill';
import { Skeleton } from '@/components/ui/feedback';
import { FieldError } from '@/components/ui/field';

type Liste = 'cellules' | 'affecter' | 'projets' | 'taches' | 'absences';

// Équipes (maquette du boss, oct. 2026) : cinq indicateurs, chacun ouvre sa
// liste pour agir directement ; « Cellules » par défaut, avec la création et
// la nomenclature ISO 9001. Écriture selon la matrice (module équipe).
export function Equipes({ slug, ecriture }: { slug: string; ecriture: boolean }) {
  const [vue, setVue] = useState<VueEquipes | null>(null);
  // ?liste=affecter : depuis « À décider aujourd'hui » (nouvel arrivant).
  const demandee = useSearchParams().get('liste');
  const [liste, setListe] = useState<Liste>(demandee === 'affecter' ? 'affecter' : 'cellules');
  const [aDecider, setADecider] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aRenommer, setARenommer] = useState<CelluleEquipe | null>(null);
  const [aSupprimer, setASupprimer] = useState<CelluleEquipe | null>(null);

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

  // Actions reprises de l'ancienne page Équipe (phase 1, G1 à G4) : chaque
  // réussite recharge la vue, le serveur fait foi (règles de cellule, 409).
  async function agir(action: () => Promise<unknown>, repli: string) {
    setErreur(null);
    try {
      await action();
      charger();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : repli);
    }
  }
  const definirPilote = (celluleId: string, collaborateurId: string | null) =>
    agir(() => definirDispatcher(slug, celluleId, collaborateurId), 'Le pilote n’a pas été modifié.');
  const majMembre = (collaborateurId: string, patch: { niveau?: NiveauCollaborateur; photo?: string | null }) =>
    agir(() => majCollaborateur(slug, collaborateurId, patch), 'La modification a échoué.');

  // Sommaire des cellules : barre de raccourcis collée tant que les cellules
  // tiennent sur une colonne (≤ 1100 px), sinon en tête de la colonne de
  // droite collée (23-equipes-pilotage.css).
  const etroit = useMediaQuery('(max-width: 1100px)');
  const barreRaccourcis = useRef<HTMLElement>(null);
  const avecSommaire = liste === 'cellules' && !!vue;
  useEnteteFixe(avecSommaire && etroit);
  const enLecture = useSectionEnLecture(
    avecSommaire ? vue.cellules.map((c) => ancreCellule(c.id)) : [],
    etroit ? barreRaccourcis : undefined,
  );

  if (!vue) return erreur ? <FieldError>{erreur}</FieldError> : <Skeleton />;
  const i = vue.indicateurs;
  const tuiles: { cle: Liste; libelle: string; valeur: string; aide: string; ton?: string }[] = [
    {
      cle: 'cellules',
      libelle: 'Cellules',
      valeur: `${i.cellules.actives} / ${i.cellules.total}`,
      aide: ecriture ? 'actives · créer, consulter' : 'actives · consulter',
    },
    {
      cle: 'affecter',
      libelle: 'Salariés à affecter',
      valeur: String(i.salariesAAffecter),
      aide: 'sans cellule',
      ton: i.salariesAAffecter ? 'attention' : undefined,
    },
    {
      cle: 'projets',
      libelle: 'Projets signés',
      valeur: String(i.projetsSignes.total),
      aide: i.projetsSignes.nonAffectes ? `${i.projetsSignes.nonAffectes} à affecter` : 'tous affectés',
      ton: i.projetsSignes.nonAffectes ? 'attention' : undefined,
    },
    {
      // Des tâches ; « soit N étapes » fait le lien avec le reporting de la direction.
      cle: 'taches',
      libelle: 'Tâches en cours',
      valeur: String(i.taches.enCours),
      aide: `${i.taches.pctATemps ?? 100} % à temps · ${i.taches.enRetard} en retard${
        i.taches.enRetard ? `, soit ${plural(i.taches.etapesEnRetard, 'étape')}` : ''
      }`,
      ton: 'risque',
    },
    {
      cle: 'absences',
      libelle: 'Absences à décider',
      valeur: aDecider == null ? '…' : String(aDecider),
      aide: `${i.absencesEnAttente} en attente dans la société (décision N+1)`,
    },
  ];

  // Pilotes sans compte HUB : signalés une fois pour toutes les cellules.
  const sansCompte = vue.cellules.filter((c) => c.pilote?.sansCompte).map((c) => c.pilote!.nom);

  return (
    <div className="eq">
      <p className="eq-sous-titre">Choisissez un indicateur pour ouvrir la liste correspondante et agir directement.</p>
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
      {erreur && <FieldError>{erreur}</FieldError>}

      {liste === 'cellules' && sansCompte.length > 0 && (
        <p className="eq-alerte" role="note">
          {sansCompte.length === 1
            ? `${sansCompte[0]} n’a pas de compte HUB : les remises et demandes de sa cellule remontent au Dir. GC. Créez-lui un compte, ou désignez un autre pilote.`
            : `${sansCompte.length} pilotes n’ont pas de compte HUB (${sansCompte.join(', ')}) : les remises et demandes de leur cellule remontent au Dir. GC. Créez-leur un compte, ou désignez d’autres pilotes.`}
        </p>
      )}
      {liste === 'cellules' && etroit && (
        <SommaireCellules cellules={vue.cellules} enLecture={enLecture} compact barre={barreRaccourcis} />
      )}
      {liste === 'cellules' && (
        <div className="eq-colonnes">
          <div className="eq-cellules">
            {vue.cellules.map((c) => (
              <CelluleCarte
                key={c.id}
                slug={slug}
                cellule={c}
                cellules={vue.cellules}
                ecriture={ecriture}
                onReaffecter={reaffecter}
                onRenommer={setARenommer}
                onSupprimer={setASupprimer}
                onPilote={definirPilote}
                onMajMembre={majMembre}
              />
            ))}
          </div>
          <aside className="eq-cote">
            {!etroit && <SommaireCellules cellules={vue.cellules} enLecture={enLecture} compact={false} />}
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
                      {s.dateArrivee && ` · arrivé le ${formatDate(s.dateArrivee)}`}
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
                      <Pill key={c.code} tone="info" title={c.nom}>
                        {c.code}
                      </Pill>
                    ))
                  ) : (
                    <Pill tone="attention">à affecter</Pill>
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

      {liste === 'taches' && (
        <section className="panel glass-panel eq-liste">
          <h2>
            Tâches en cours · {vue.tachesEnCours.length}
            {i.taches.enRetard > 0 && <Pill tone="risque">{i.taches.enRetard} en retard</Pill>}
          </h2>
          <ul className="eq-lignes">
            {vue.tachesEnCours.map((t) => (
              <li key={t.id}>
                <span className="eq-membre">
                  <strong>{t.libelle}</strong>
                  <small>
                    <span className="eq-code">{t.projet}</span> · {t.etape}
                  </small>
                </span>
                <span className="eq-charge">{t.assigne ?? 'à assigner'}</span>
                {t.prolongeeJusquau ? (
                  <Pill tone="attention">prolongée jusqu’au {formatDate(t.prolongeeJusquau)}</Pill>
                ) : (
                  <Pill className={t.enRetard ? 'pill--risque' : 'pill--neutre'}>
                    {t.echeance ? `${t.enRetard ? 'échue le' : 'échéance'} ${formatDate(t.echeance)}` : 'sans échéance'}
                  </Pill>
                )}
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
                Aucune demande n’attend votre décision. {i.absencesEnAttente} demande(s) attendent leur N+1 dans la
                société.
              </p>
            </section>
          )}
        </>
      )}
      {/* Hors des cartes « glass » : une modale fixe y serait positionnée par
          rapport à la carte, pas à l'écran. */}
      {aRenommer && (
        <ChampModal
          titre="Renommer la cellule"
          label="Nom"
          valeurInitiale={aRenommer.nom}
          onSubmit={async (nom) => {
            await renommerCellule(slug, aRenommer.id, nom.trim());
            setARenommer(null);
            charger();
          }}
          onClose={() => setARenommer(null)}
        />
      )}
      {aSupprimer && (
        <ConfirmModal
          title="Supprimer la cellule"
          message={`Supprimer « ${aSupprimer.code} · ${aSupprimer.nom} » ? Une cellule qui a encore des membres ne peut pas être supprimée.`}
          confirmLabel="Supprimer"
          danger
          onConfirm={async () => {
            await supprimerCellule(slug, aSupprimer.id);
            setASupprimer(null);
            charger();
          }}
          onClose={() => setASupprimer(null)}
        />
      )}
    </div>
  );
}

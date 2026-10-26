'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserCheck } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { confirmerIntegration, enregistrerPointIntegration, getIntegrations, LIBELLE_CONTRAT } from '@/lib/rh';
import type { IntegrationSalarie, PointIntegration } from '@/lib/types';
import { ConfirmModal } from '@/components/admin/confirm-modal';

const jjmm = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const jjmmaaaa = (iso: string) => iso.split('-').reverse().join('/');
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Action impossible.');

const PILL_POINT: Record<PointIntegration['statut'], string> = {
  fait: 'pill--succes',
  a_faire: 'pill--attention',
  a_venir: 'pill--neutre',
};
const libellePoint = (p: PointIntegration) =>
  p.statut === 'fait'
    ? `J${p.jalon} · fait`
    : p.statut === 'a_faire'
      ? `J${p.jalon} · à faire`
      : `J${p.jalon} · le ${jjmm(p.datePrevue)}`;

// Onglet « Intégration » de la page RH (lot 3) : nouveaux arrivants jusqu'à
// leur confirmation, points J30/J60/J90 (compte rendu libre — critères du
// manuel §9.3 non reçus). RH écriture, CFO/CEO lecture.
export function IntegrationRh({ slug, ecriture }: { slug: string; ecriture: boolean }) {
  const [liste, setListe] = useState<IntegrationSalarie[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choisi, setChoisi] = useState<string | null>(null);

  const charger = useCallback(() => {
    getIntegrations(slug)
      .then(setListe)
      .catch((e) => setErreur(msg(e)));
  }, [slug]);
  useEffect(charger, [charger]);

  if (!liste)
    return erreur ? (
      <p className="field-erreur">{erreur}</p>
    ) : (
      <div className="skeleton admin-skeleton-panel" aria-hidden />
    );

  const aTraiter = liste.reduce((n, s) => n + s.aTraiter, 0);
  const courant = liste.find((s) => s.id === choisi) ?? null;
  const remplacer = (s: IntegrationSalarie) => setListe((l) => (l ?? []).map((x) => (x.id === s.id ? s : x)));

  return (
    <>
      <div className="integ">
        <section className="panel glass-panel dmd-section">
          <h2 className="dmd-titre">Intégration des nouveaux · cap des 90 jours</h2>
          <p className="dmd-note">
            Uniquement les nouveaux arrivants, jusqu’à leur confirmation. Un CDI ou un CDD confirmé n’a plus de carte de
            mission.
          </p>
          {liste.length === 0 ? (
            <p className="empty-state">Aucun nouvel arrivant en période d’intégration.</p>
          ) : (
            <ul className="dmd-liste">
              {liste.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`integ-carte${s.id === choisi ? ' is-active' : ''}`}
                    aria-pressed={s.id === choisi}
                    onClick={() => setChoisi(s.id)}
                  >
                    <span className="integ-carte-tete">
                      <strong>{`${s.prenom} ${s.nom}`.trim() || s.matricule}</strong>
                      <span className={`pill ${s.aTraiter > 0 ? 'pill--attention' : 'pill--info'}`}>
                        {s.aTraiter > 0 ? 'Point à enregistrer' : 'En intégration'}
                      </span>
                    </span>
                    <span className="cell-sub">
                      {s.poste || 'poste à renseigner'} · {s.societe} · {LIBELLE_CONTRAT[s.typeContrat]} · entré(e) le{' '}
                      {jjmmaaaa(s.dateEntree)}
                    </span>
                    <span className="integ-jalons">
                      {s.points.map((p) => (
                        <span key={p.jalon} className={`pill ${PILL_POINT[p.statut]}`}>
                          {libellePoint(p)}
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel glass-panel dmd-section integ-detail">
          {!courant ? (
            <p className="dmd-note">Sélectionnez un nouvel arrivant.</p>
          ) : (
            <DetailIntegration
              key={courant.id}
              slug={slug}
              s={courant}
              ecriture={ecriture}
              onMaj={remplacer}
              onConfirme={() => {
                setChoisi(null);
                charger();
              }}
            />
          )}
        </section>
      </div>
    </>
  );
}

function DetailIntegration({
  slug,
  s,
  ecriture,
  onMaj,
  onConfirme,
}: {
  slug: string;
  s: IntegrationSalarie;
  ecriture: boolean;
  onMaj: (s: IntegrationSalarie) => void;
  onConfirme: () => void;
}) {
  const [confirmation, setConfirmation] = useState(false);
  const mission = [
    ['Résultat attendu', s.mission.resultat],
    ['Livrables', s.mission.livrables],
    ['KPI', s.mission.kpi],
    ['Signal d’alerte', s.mission.signalAlerte],
  ] as const;
  const j90Fait = s.points.some((p) => p.jalon === 90 && p.statut === 'fait');

  return (
    <>
      <div>
        <h2 className="dmd-titre">{`${s.prenom} ${s.nom}`.trim() || s.matricule}</h2>
        <span className="cell-sub">
          {s.matricule} · {s.poste || 'poste à renseigner'} · {s.societe} · entré(e) le {jjmmaaaa(s.dateEntree)}
        </span>
      </div>

      <div>
        <h3 className="rh-section">Carte de mission</h3>
        {mission.every(([, v]) => !v.trim()) ? (
          <p className="dmd-note">Non renseignée — à compléter dans le dossier du salarié (onglet Personnel).</p>
        ) : (
          <dl className="integ-mission">
            {mission.map(([libelle, valeur]) => (
              <div key={libelle}>
                <dt>{libelle}</dt>
                <dd>{valeur.trim() || '—'}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div>
        <h3 className="rh-section">Points d’intégration</h3>
        <div className="dmd-liste">
          {s.points.map((p) => (
            <BlocPoint key={p.jalon} slug={slug} dossierId={s.id} p={p} ecriture={ecriture} onMaj={onMaj} />
          ))}
        </div>
      </div>

      {ecriture && (
        <div className="integ-confirmer">
          <button type="button" className="btn-primary" disabled={!j90Fait} onClick={() => setConfirmation(true)}>
            <UserCheck size={16} aria-hidden /> Confirmer l’intégration
          </button>
          {!j90Fait && <span className="cell-sub">Possible une fois le point J90 enregistré.</span>}
        </div>
      )}

      {confirmation && (
        <ConfirmModal
          titre="Confirmer l’intégration"
          message={`${s.prenom} ${s.nom} sort du suivi des nouveaux arrivants. Les comptes rendus restent dans son dossier.`}
          onConfirm={async () => {
            await confirmerIntegration(slug, s.id);
            onConfirme();
          }}
          onClose={() => setConfirmation(false)}
        />
      )}
    </>
  );
}

function BlocPoint({
  slug,
  dossierId,
  p,
  ecriture,
  onMaj,
}: {
  slug: string;
  dossierId: string;
  p: PointIntegration;
  ecriture: boolean;
  onMaj: (s: IntegrationSalarie) => void;
}) {
  const [edition, setEdition] = useState(false);
  const [date, setDate] = useState(p.realiseLe ?? aujourdhui());
  const [texte, setTexte] = useState(p.compteRendu ?? '');
  const [etat, setEtat] = useState<{ envoi: boolean; erreur: string | null }>({ envoi: false, erreur: null });
  const formulaire = ecriture && (edition || p.statut !== 'fait');

  async function enregistrer() {
    setEtat({ envoi: true, erreur: null });
    try {
      onMaj(await enregistrerPointIntegration(slug, dossierId, p.jalon, { realiseLe: date, compteRendu: texte }));
      setEdition(false);
      setEtat({ envoi: false, erreur: null });
    } catch (e) {
      setEtat({ envoi: false, erreur: msg(e) });
    }
  }

  return (
    <div className="integ-point">
      <span className="integ-carte-tete">
        <strong>
          J{p.jalon} · prévu le {jjmmaaaa(p.datePrevue)}
        </strong>
        <span className={`pill ${PILL_POINT[p.statut]}`}>
          {p.statut === 'fait' ? `Fait le ${jjmmaaaa(p.realiseLe!)}` : p.statut === 'a_faire' ? 'À faire' : 'À venir'}
        </span>
      </span>
      {p.statut === 'fait' && !edition && (
        <>
          <p className="integ-cr">{p.compteRendu}</p>
          {ecriture && (
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setEdition(true)}>
              Modifier
            </button>
          )}
        </>
      )}
      {formulaire && (
        <div className="integ-form">
          <label className="field">
            <span className="field-label">Réalisé le</span>
            <input
              type="date"
              className="field-input"
              max={aujourdhui()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Compte rendu</span>
            <textarea className="field-input" rows={3} value={texte} onChange={(e) => setTexte(e.target.value)} />
          </label>
          {etat.erreur && <p className="field-erreur">{etat.erreur}</p>}
          <span className="dmd-actions">
            {edition && (
              <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setEdition(false)}>
                Annuler
              </button>
            )}
            <button
              type="button"
              className="btn-primary btn-primary--sm"
              disabled={etat.envoi || !texte.trim() || !date}
              onClick={enregistrer}
            >
              {etat.envoi ? 'Enregistrement…' : 'Enregistrer le point'}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

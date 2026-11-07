'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { formatDate } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import { basculerMaintenance, basculerModule, getInterrupteurs, type Interrupteurs } from '@/lib/interrupteurs';
import { Field } from '@/components/ui/field';
import { Modal, ModalHeader } from '@/components/ui/dialog';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { Pill } from '@/components/ui/pill';

type Bascule =
  | { type: 'module'; cle: string; nom: string; actif: boolean }
  | { type: 'maintenance'; actif: boolean; message: string };

const message = (e: unknown, repli: string) => (e instanceof ApiError ? e.message : repli);

// Administration du HUB › Interrupteurs (Administrateur HUB, 29/10/2026) :
// couper ou rendre un module de la matrice pour la société de connexion, et
// fermer le HUB entier pour maintenance. Chaque bascule exige un motif et
// entre au journal d'audit.
export function InterrupteursPanel({ slug }: { slug: string }) {
  const [etat, setEtat] = useState<Interrupteurs | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [bascule, setBascule] = useState<Bascule | null>(null);
  const [essai, setEssai] = useState(0);

  useEffect(() => {
    let annule = false;
    getInterrupteurs(slug)
      .then((e) => !annule && setEtat(e))
      .catch(
        (e) =>
          !annule &&
          setErreur(message(e, 'Impossible de charger les interrupteurs. Vérifiez votre connexion, puis réessayez.')),
      );
    return () => {
      annule = true;
    };
  }, [slug, essai]);

  const reessayer = () => {
    setErreur(null);
    setEssai((n) => n + 1);
  };
  if (erreur) return <ErrorState onRetry={reessayer}>{erreur}</ErrorState>;
  if (!etat) {
    return (
      <section className="groupe-panel glass-panel" aria-busy="true" aria-label="Chargement des interrupteurs">
        <Skeleton />
      </section>
    );
  }

  const m = etat.maintenance;
  return (
    <section className="groupe-panel glass-panel" aria-label="Interrupteurs">
      {/* Titre et explication : en-tête commun de la console (app/groupe). */}
      <article className="deb-carte">
        <h3>Maintenance du HUB entier</h3>
        <p className="deb-titre">
          <Pill tone={m.actif ? 'risque' : 'succes'}>{m.actif ? 'HUB fermé' : 'HUB ouvert'}</Pill>
          {m.actif && m.message && <span className="deb-note">« {m.message} »</span>}
        </p>
        <p className="deb-note">
          Fermé, le HUB refuse connexions et requêtes à tous les comptes, sauf l’Administrateur HUB. Les liens publics
          des clients (offres, contrats) restent ouverts.
        </p>
        <div className="deb-actions">
          <button
            type="button"
            className={m.actif ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setBascule({ type: 'maintenance', actif: !m.actif, message: m.message })}
          >
            {m.actif ? 'Rouvrir le HUB' : 'Fermer le HUB pour maintenance'}
          </button>
        </div>
      </article>

      <div>
        <h3 className="deb-sous-titre">Modules de la société</h3>
        <ul className="int-modules">
          {etat.modules.map((mod) => (
            <li key={mod.cle}>
              <span className="int-module-nom">
                <strong>{mod.nom}</strong>
                {!mod.actif && (
                  <span className="deb-note">
                    Coupé le {formatDate(mod.desactiveLe)} · {mod.motif}
                  </span>
                )}
              </span>
              <Pill tone={mod.actif ? 'succes' : 'neutre'}>{mod.actif ? 'Actif' : 'Coupé'}</Pill>
              <button
                type="button"
                className="btn-ghost btn-ghost--sm"
                onClick={() => setBascule({ type: 'module', cle: mod.cle, nom: mod.nom, actif: !mod.actif })}
              >
                {mod.actif ? 'Couper' : 'Réactiver'}
              </button>
            </li>
          ))}
        </ul>
        <p className="deb-note">
          Un module coupé disparaît des menus et ses pages sont refusées, quoi que dise la matrice des droits. Mon
          espace, Mes tâches et la messagerie ne sont pas des modules de la matrice.
        </p>
      </div>

      {bascule && (
        <ModaleBascule
          bascule={bascule}
          onClose={() => setBascule(null)}
          executer={(motif, texte) =>
            bascule.type === 'module'
              ? basculerModule(slug, bascule.cle, bascule.actif, motif)
              : basculerMaintenance(slug, bascule.actif, texte, motif)
          }
          onFait={(maj) => {
            setEtat(maj);
            setBascule(null);
          }}
        />
      )}
    </section>
  );
}

function ModaleBascule({
  bascule,
  onClose,
  onFait,
  executer,
}: {
  bascule: Bascule;
  onClose: () => void;
  onFait: (etat: Interrupteurs) => void;
  executer: (motif: string, message: string) => Promise<Interrupteurs>;
}) {
  const [motif, setMotif] = useState('');
  const [texte, setTexte] = useState(bascule.type === 'maintenance' ? bascule.message : '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const titre =
    bascule.type === 'module'
      ? `${bascule.actif ? 'Réactiver' : 'Couper'} le module ${bascule.nom}`
      : bascule.actif
        ? 'Fermer le HUB pour maintenance'
        : 'Rouvrir le HUB';
  const explication =
    bascule.type === 'module'
      ? bascule.actif
        ? 'Le module revient selon la matrice des droits, pour tous les comptes de la société.'
        : 'Le module disparaît des menus et ses pages sont refusées pour tous les comptes de la société, sauf vous.'
      : bascule.actif
        ? 'Tous les comptes sont refusés dès maintenant, sauf l’Administrateur HUB. Le message ci-dessous leur est affiché.'
        : 'Les comptes peuvent de nouveau se connecter.';

  async function valider(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      onFait(await executer(motif.trim(), texte.trim()));
    } catch (err) {
      setErreur(message(err, 'Bascule impossible.'));
      setEnvoi(false);
    }
  }

  return (
    <Modal onClose={onClose} portal className="modal--sm" label={titre}>
      <ModalHeader title={titre} onClose={onClose} closeDisabled={envoi} />
      <form className="modal-body deb-modale" onSubmit={valider}>
        <p>{explication}</p>
        {bascule.type === 'maintenance' && bascule.actif && (
          <Field label="Message affiché aux comptes">
            <input
              className="field-input"
              maxLength={300}
              placeholder="ex. Mise à jour en cours, retour vers 14 h."
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
            />
          </Field>
        )}
        <Field label="Motif (obligatoire, inscrit au journal)">
          <input className="field-input" maxLength={500} value={motif} onChange={(e) => setMotif(e.target.value)} />
        </Field>
        {erreur && (
          <p className="field-erreur" role="alert">
            {erreur}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={onClose} disabled={envoi}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={envoi || motif.trim().length < 3}>
            {envoi ? 'En cours…' : 'Confirmer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

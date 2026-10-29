'use client';

import { useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { formatDate, formatDateTime } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import {
  changerCellulesProjet,
  getEtatInterventions,
  onboarderSansSignature,
  ouvrirProjet,
  rouvrirDossier,
  supprimerCode,
  type EtatInterventions,
} from '@/lib/interventions';
import { STATUTS_CRM } from '@/lib/types';
import { Field } from '@/components/ui/field';
import { Modal, ModalHeader } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/feedback';
import { Pill } from '@/components/ui/pill';

type Action = 'onboard' | 'reouverture' | 'ouverture' | 'cellules' | 'suppression';

const ACTIONS: Record<Action, { titre: string; texte: string; confirmer: string }> = {
  onboard: {
    titre: 'Passer en Onboard (offre acceptée)',
    texte:
      'Pour un dossier dont l’offre acceptée attend encore : comme à l’acceptation, le projet est créé, l’offre lui est rattachée et ses factures sont préparées en brouillon. Le contrat se régularise ensuite.',
    confirmer: 'Passer en Onboard',
  },
  reouverture: {
    titre: 'Rouvrir le dossier perdu',
    texte: 'Le dossier revient en « Nouveau projet » : sa fiche redevient modifiable pour une nouvelle offre.',
    confirmer: 'Rouvrir',
  },
  ouverture: {
    titre: 'Ouvrir le projet sans F1',
    texte:
      'Comme à l’émission de F1 : la version en service du gabarit est recopiée en cartes et tâches, jour 1 aujourd’hui. Les factures restent en brouillon.',
    confirmer: 'Ouvrir le projet',
  },
  cellules: {
    titre: 'Cellules du projet',
    texte:
      'Les cellules cochées remplacent celles du projet. Leur chef de team valide les remises et leurs membres voient le projet.',
    confirmer: 'Enregistrer',
  },
  suppression: {
    titre: 'Supprimer définitivement',
    texte:
      'Le dossier CRM et son projet sont effacés avec tout ce qui en dépend : offres, contrat, factures (émises comprises), avoirs, paiements, cartes et tâches. C’est irréversible ; seule la trace au journal d’audit reste.',
    confirmer: 'Supprimer définitivement',
  },
};

const LIBELLE_INTERVENTION: Record<EtatInterventions['historique'][number]['type'], string> = {
  onboard_sans_signature: 'Onboard débloqué',
  ouverture_projet: 'Projet ouvert sans F1',
  cellules_projet: 'Cellules modifiées',
  reouverture_dossier: 'Dossier rouvert',
  module_desactive: 'Module désactivé',
  module_reactive: 'Module réactivé',
  maintenance_activee: 'Maintenance activée',
  maintenance_levee: 'Maintenance levée',
  suppression: 'Supprimé définitivement',
};

const message = (e: unknown, repli: string) => (e instanceof ApiError ? e.message : repli);

// Administration du HUB › Déblocages (Administrateur HUB, 29/10/2026) : un
// dossier ou un projet retrouvé par son code, et les interventions que le
// parcours normal ne permet pas. Chacune exige un motif, inscrit au journal.
export function DeblocagesPanel({ slug }: { slug: string }) {
  const [code, setCode] = useState('');
  const [etat, setEtat] = useState<EtatInterventions | null>(null);
  const [recherche, setRecherche] = useState<{ envoi: boolean; erreur: string | null }>({ envoi: false, erreur: null });
  const [action, setAction] = useState<Action | null>(null);

  async function chercher(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setRecherche({ envoi: true, erreur: null });
    try {
      setEtat(await getEtatInterventions(slug, code.trim()));
      setRecherche({ envoi: false, erreur: null });
    } catch (err) {
      setRecherche({ envoi: false, erreur: message(err, 'Recherche impossible.') });
    }
  }

  const d = etat?.dossier ?? null;
  const p = etat?.projet ?? null;
  const peutOnboarder = !!d && d.statut === 'offre_envoyee' && d.offreAcceptee && !p;

  return (
    <section className="groupe-panel glass-panel" aria-labelledby="groupe-deblocages-titre">
      <header className="groupe-panel-entete">
        <div>
          <h2 id="groupe-deblocages-titre">Déblocages</h2>
          <p>
            Retrouvez un dossier ou un projet par son code pour faire ce que le parcours normal ne permet pas. Chaque
            intervention exige un motif et entre au journal d’audit.
          </p>
        </div>
      </header>

      <form className="deb-recherche" onSubmit={chercher}>
        <Field label="Code du dossier ou du projet">
          <input
            className="field-input"
            placeholder="ex. GB_TBD.26"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <button type="submit" className="btn-primary" disabled={recherche.envoi || !code.trim()}>
          <Search size={15} aria-hidden /> {recherche.envoi ? 'Recherche…' : 'Rechercher'}
        </button>
      </form>
      {recherche.erreur && (
        <p className="field-erreur" role="alert">
          {recherche.erreur}
        </p>
      )}

      {etat && !d && !p && <EmptyState>Aucun dossier ni projet avec ce code.</EmptyState>}

      {etat && (d || p) && (
        <div className="deb-grille">
          <article className="deb-carte">
            <h3>Dossier CRM</h3>
            {d ? (
              <>
                <p className="deb-titre">
                  <strong>{d.code}</strong> · {d.client}{' '}
                  <Pill tone={d.statut === 'perdu' ? 'risque' : d.statut === 'onboard' ? 'succes' : 'info'}>
                    {STATUTS_CRM[d.statut]}
                  </Pill>
                </p>
                <dl className="deb-faits">
                  <dt>Offre acceptée</dt>
                  <dd>{d.offreAcceptee ? 'Oui' : 'Non'}</dd>
                  <dt>Contrat signé</dt>
                  <dd>{d.contratSigne ? 'Oui' : 'Non'}</dd>
                </dl>
                <div className="deb-actions">
                  {peutOnboarder && (
                    <button type="button" className="btn-primary" onClick={() => setAction('onboard')}>
                      {ACTIONS.onboard.titre}
                    </button>
                  )}
                  {d.statut === 'perdu' && (
                    <button type="button" className="btn-ghost" onClick={() => setAction('reouverture')}>
                      {ACTIONS.reouverture.titre}
                    </button>
                  )}
                  {!peutOnboarder && d.statut === 'offre_envoyee' && !d.offreAcceptee && (
                    <p className="deb-note">L’Onboard attend une offre acceptée par le client.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="deb-note">Aucun dossier CRM avec ce code (projet antérieur au CRM).</p>
            )}
          </article>

          <article className="deb-carte">
            <h3>Projet</h3>
            {p ? (
              <>
                <p className="deb-titre">
                  <strong>{p.code}</strong>{' '}
                  <Pill tone={p.ouvertLe ? 'succes' : 'attention'}>
                    {p.ouvertLe ? `Ouvert, J1 le ${formatDate(p.ouvertLe)}` : 'Pas encore ouvert'}
                  </Pill>
                </p>
                <dl className="deb-faits">
                  <dt>Cellules</dt>
                  <dd>{p.cellules.length ? p.cellules.map((c) => c.nom).join(', ') : 'Aucune'}</dd>
                </dl>
                <div className="deb-actions">
                  {!p.ouvertLe && p.gabarit && (
                    <button type="button" className="btn-primary" onClick={() => setAction('ouverture')}>
                      {ACTIONS.ouverture.titre}
                    </button>
                  )}
                  {!p.ouvertLe && !p.gabarit && (
                    <p className="deb-note">Pas de gabarit pour la catégorie de ce projet : il ne s’ouvre pas.</p>
                  )}
                  <button type="button" className="btn-ghost" onClick={() => setAction('cellules')}>
                    Modifier les cellules
                  </button>
                </div>
              </>
            ) : (
              <p className="deb-note">Pas encore de projet : il naît à l’Onboard du dossier.</p>
            )}
          </article>
        </div>
      )}

      {etat && (d || p) && (
        <div className="deb-danger">
          <p className="deb-note">
            Supprimer définitivement {d && p ? 'le dossier et son projet' : d ? 'le dossier' : 'le projet'}{' '}
            {(d ?? p)!.code}, avec ses offres, factures, paiements et tâches.
          </p>
          <button type="button" className="btn-danger" onClick={() => setAction('suppression')}>
            Supprimer définitivement
          </button>
        </div>
      )}

      {etat && etat.historique.length > 0 && (
        <div>
          <h3 className="deb-sous-titre">Interventions sur ce code</h3>
          <ul className="deb-historique">
            {etat.historique.map((h) => (
              <li key={h.id}>
                <strong>{LIBELLE_INTERVENTION[h.type]}</strong> · {h.detail} · motif : {h.motif}
                <span className="deb-note">
                  {' '}
                  — {h.par ?? 'inconnu'}, {formatDateTime(h.le)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {action && etat && (
        <ModaleIntervention
          action={action}
          etat={etat}
          onClose={() => setAction(null)}
          onFait={(maj) => {
            setEtat(maj);
            setAction(null);
          }}
          executer={(motif, celluleIds) => {
            if (action === 'onboard') return onboarderSansSignature(slug, d!.id, motif);
            if (action === 'reouverture') return rouvrirDossier(slug, d!.id, motif);
            if (action === 'ouverture') return ouvrirProjet(slug, p!.id, motif);
            if (action === 'suppression') return supprimerCode(slug, (d ?? p)!.code, motif);
            return changerCellulesProjet(slug, p!.id, celluleIds, motif);
          }}
        />
      )}
    </section>
  );
}

function ModaleIntervention({
  action,
  etat,
  onClose,
  onFait,
  executer,
}: {
  action: Action;
  etat: EtatInterventions;
  onClose: () => void;
  onFait: (etat: EtatInterventions) => void;
  executer: (motif: string, celluleIds: string[]) => Promise<EtatInterventions>;
}) {
  const a = ACTIONS[action];
  const [motif, setMotif] = useState('');
  const [cellules, setCellules] = useState<string[]>(etat.projet?.cellules.map((c) => c.id) ?? []);
  // Suppression : le code retapé à l'identique confirme.
  const code = etat.dossier?.code ?? etat.projet?.code ?? '';
  const [confirmation, setConfirmation] = useState('');
  const confirme = action !== 'suppression' || confirmation.trim() === code;
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function valider(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      onFait(await executer(motif.trim(), cellules));
    } catch (err) {
      setErreur(message(err, 'Intervention impossible.'));
      setEnvoi(false);
    }
  }

  const basculer = (id: string) => setCellules((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  return (
    <Modal onClose={onClose} portal className="modal--sm" label={a.titre}>
      <ModalHeader title={a.titre} onClose={onClose} closeDisabled={envoi} />
      <form className="modal-body deb-modale" onSubmit={valider}>
        <p>{a.texte}</p>
        {action === 'cellules' &&
          (etat.cellulesDisponibles.length ? (
            <fieldset className="deb-cellules">
              <legend className="field-label">Cellules</legend>
              {etat.cellulesDisponibles.map((c) => (
                <label key={c.id}>
                  <input type="checkbox" checked={cellules.includes(c.id)} onChange={() => basculer(c.id)} /> {c.nom}{' '}
                  <span className="deb-note">{c.code}</span>
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="deb-note">Aucune cellule dans cette société : créez-les dans Équipes.</p>
          ))}
        <Field label="Motif (obligatoire, inscrit au journal)">
          <input
            className="field-input"
            maxLength={500}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            autoFocus
          />
        </Field>
        {action === 'suppression' && (
          <Field label={`Retapez ${code} pour confirmer`}>
            <input
              className="field-input"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
            />
          </Field>
        )}
        {erreur && (
          <p className="field-erreur" role="alert">
            {erreur}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={onClose} disabled={envoi}>
            Annuler
          </button>
          <button
            type="submit"
            className={action === 'suppression' ? 'btn-danger' : 'btn-primary'}
            disabled={envoi || motif.trim().length < 3 || !confirme}
          >
            {envoi ? 'En cours…' : a.confirmer}
          </button>
        </div>
      </form>
    </Modal>
  );
}

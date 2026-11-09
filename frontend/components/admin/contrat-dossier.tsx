'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Paperclip } from 'lucide-react';
import {
  deposerDocumentContrat,
  envoyerContrat,
  getContrat,
  majAnnexeContrat,
  preparerContrat,
  regenererContrat,
  retirerEnvoiContrat,
  signerContratPapier,
} from '@/lib/contrats';
import { lireFichier, FICHIERS_ACCEPTES } from '@/lib/fichiers';
import { formatDate, formatDayShortMonth } from '@hub/domain';
import {
  MODES_SIGNATURE,
  STATUTS_CONTRAT,
  type ContratDossier as EtatContrat,
  type Projet,
  type StatutAnnexeContrat,
} from '@/lib/types';
import { useConfirmer } from '@/components/confirmation';
import { Modal, ModalHeader } from '@/components/ui/dialog';
import { ParametresContratPanel } from '@/components/admin/parametres-contrat-panel';
import { peutReglerContrats } from '@/lib/acces-back-office';
import { useSessionCourante } from '@/lib/layout-contexte';
import { Pill } from '@/components/ui/pill';
import { FieldError } from '@/components/ui/field';

type Props = {
  slug: string;
  projet: Projet; // le dossier CRM
  peutPreparer: boolean; // finances_devis ≥ écriture
  onMaj: () => Promise<void>; // recharge le dossier après une signature
};

const CLASSE_ANNEXE: Record<StatutAnnexeContrat, string> = {
  a_joindre: 'pill--attention',
  jointe: 'pill--succes',
  non_necessaire: 'pill--neutre',
};
const LIBELLE_ANNEXE: Record<StatutAnnexeContrat, string> = {
  a_joindre: 'À joindre',
  jointe: 'Jointe',
  non_necessaire: 'Non nécessaire',
};

// Contrat du dossier (étape G) — depuis le 29/10/2026, l'offre acceptée fait
// passer le dossier en Onboard : le contrat se prépare ensuite, s'envoie au
// client par lien (signature en ligne) ou se signe sur papier, pour
// RÉGULARISER — rappel non bloquant tant qu'il n'est pas signé. Contient le
// prix : visible avec finances_devis (clé `offre` présente sur le dossier),
// comme l'offre.
export function ContratDossier({ slug, projet, peutPreparer, onMaj }: Props) {
  const confirmer = useConfirmer();
  const session = useSessionCourante();
  // Réglages des contrats ouverts depuis le bloc (Dir. GC, CIO…) ; à la
  // fermeture, l'état est relu (réglages manquants à jour).
  const [reglages, setReglages] = useState(false);
  const [relecture, setRelecture] = useState(0);
  const [etat, setEtat] = useState<EtatContrat | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lien, setLien] = useState<{ url: string; email: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const cibleFichier = useRef<{ type: 'document' | 'scan' | 'annexe'; annexeId?: string } | null>(null);
  const entreeFichier = useRef<HTMLInputElement>(null);

  const visible = 'offre' in projet && (projet.offre?.statutEffectif === 'accepte' || projet.statut === 'onboard');

  useEffect(() => {
    if (!visible) return;
    let annule = false;
    getContrat(slug, projet.id)
      .then((e) => {
        if (!annule) setEtat(e);
      })
      .catch(() => {
        if (!annule) setEtat(null);
      });
    return () => {
      annule = true;
    };
  }, [slug, projet.id, projet.statut, visible, relecture]);

  if (!visible || !etat) return null;
  const c = etat.contrat;
  const prep = etat.preparation;
  const modifiable = peutPreparer && c?.statut === 'brouillon';
  // Pas de contrat à préparer avant l'Onboard, ni pour un dossier sans offre
  // acceptée (antérieur à l'étape F).
  if (!c && (projet.statut !== 'onboard' || !prep.offreAcceptee)) return null;

  async function agir<T>(fn: () => Promise<T>, apres?: (r: T) => void) {
    setEnCours(true);
    setErreur(null);
    try {
      const r = await fn();
      setEtat(r as unknown as EtatContrat);
      apres?.(r);
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'L’action a échoué.');
    } finally {
      setEnCours(false);
    }
  }

  function choisirFichier(type: 'document' | 'scan' | 'annexe', annexeId?: string) {
    cibleFichier.current = { type, annexeId };
    entreeFichier.current?.click();
  }

  async function fichierChoisi(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    const cible = cibleFichier.current;
    if (!f || !cible) return;
    let lu: { nom: string; url: string };
    try {
      lu = await lireFichier(f);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Lecture du fichier impossible.');
      return;
    }
    const fichier = { nom: lu.nom, url: lu.url };
    if (cible.type === 'document') {
      await agir(() => deposerDocumentContrat(slug, projet.id, fichier));
    } else if (cible.type === 'annexe' && cible.annexeId) {
      await agir(() => majAnnexeContrat(slug, projet.id, cible.annexeId!, 'jointe', fichier));
    } else if (cible.type === 'scan') {
      if (
        !(await confirmer({
          titre: 'Enregistrer le contrat papier signé ?',
          message: 'Le contrat sera marqué signé : le dossier est régularisé.',
          confirmer: 'Enregistrer',
        }))
      ) {
        return;
      }
      await agir(
        () => signerContratPapier(slug, projet.id, fichier),
        () => {
          setMessage('Contrat signé — dossier régularisé.');
          void onMaj();
        },
      );
    }
  }

  // Réglages manquants (réglages des contrats), dits en clair : « le
  // signataire », « le modèle de contrat » — pas le détail nom / fonction.
  const manquants = [
    ...(prep.reglagesManquants.some((m) => m.includes('signataire'))
      ? [prep.signataire?.qui === 'ceo' ? 'le signataire (CEO)' : 'le signataire (Dir. GC)']
      : []),
    ...(prep.reglagesManquants.includes('modèle de contrat') ? ['le modèle de contrat'] : []),
  ];
  const annexesManquantes = c?.annexes.filter((a) => a.statut === 'a_joindre') ?? [];
  const documentManquant = c?.mode === 'sur_mesure' && !c.document;

  return (
    <section className="offre-dossier" aria-label="Contrat">
      <input ref={entreeFichier} type="file" accept={FICHIERS_ACCEPTES.contrat} hidden onChange={fichierChoisi} />
      <div className="cycle-dossier-tete">
        <span className="field-label">Contrat</span>
        {c && (
          <Pill
            className={c.statut === 'signe' ? 'pill--succes' : c.statut === 'envoye' ? 'pill--info' : 'pill--neutre'}
          >
            {STATUTS_CONTRAT[c.statut]}
          </Pill>
        )}
        {c?.statut !== 'signe' && <Pill className="pill--attention">À régulariser</Pill>}
        {c && <span className="cell-sub">{c.mode === 'modele' ? 'Généré depuis le modèle' : 'Rédigé sur mesure'}</span>}
      </div>

      {/* Pas encore préparé : une phrase pour la situation, une pour ce qui
          manque (dit simplement, et à qui le demander), puis l'action. */}
      {!c && (
        <>
          <p className="field-aide">
            Le projet est lancé. Il reste à faire signer le contrat au client — cela ne bloque rien.
          </p>
          {manquants.length > 0 ? (
            <>
              <p className="field-aide" role="note">
                Le contrat ne peut pas encore être préparé : il manque {manquants.join(' et ')}.
                {!peutReglerContrats(session) && ' À compléter par le Dir. GC ou le CIO.'}
              </p>
              {peutReglerContrats(session) && (
                <div className="cycle-dossier-actions">
                  <button type="button" className="btn-primary" onClick={() => setReglages(true)}>
                    Renseigner le modèle et le signataire
                  </button>
                </div>
              )}
            </>
          ) : (
            prep.signataire?.nom && (
              <p className="field-aide">
                Signé pour la société par{' '}
                <strong>
                  {prep.signataire.nom}, {prep.signataire.fonction}
                </strong>
                {prep.modePrevu === 'sur_mesure' && ' — montant élevé : contrat rédigé sur mesure, à déposer'}.
              </p>
            )
          )}
          {peutPreparer && manquants.length === 0 && (
            <div className="cycle-dossier-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={enCours}
                data-action-principale=""
                onClick={() => agir(() => preparerContrat(slug, projet.id))}
              >
                Préparer le contrat
              </button>
            </div>
          )}
        </>
      )}

      {c && (
        <>
          {c.mode === 'modele' && c.contenu && (
            <details className="contrat-apercu">
              <summary>Voir le texte du contrat</summary>
              <div className="contrat-texte">{c.contenu}</div>
              <p className="field-aide">
                Signataire : {c.signataire.nom}, {c.signataire.fonction}.
              </p>
            </details>
          )}
          {c.mode === 'sur_mesure' && (
            <p className="field-aide">
              {c.document ? `Contrat déposé : ${c.document.nom}` : 'Contrat sur mesure à déposer.'}
            </p>
          )}

          <ul className="contrat-annexes">
            {c.annexes.map((a) => (
              <li key={a.id}>
                <span>
                  {a.libelle}
                  {a.fichierNom && <span className="cell-sub">{a.fichierNom}</span>}
                </span>
                <Pill className={CLASSE_ANNEXE[a.statut]}>
                  {a.automatique ? 'Jointe d’office' : LIBELLE_ANNEXE[a.statut]}
                </Pill>
                {modifiable && !a.automatique && (
                  <span className="factu-actions">
                    <button
                      type="button"
                      className="lien-inline"
                      disabled={enCours}
                      onClick={() => choisirFichier('annexe', a.id)}
                    >
                      <Paperclip size={12} aria-hidden /> Joindre
                    </button>
                    {a.statut !== 'non_necessaire' ? (
                      <button
                        type="button"
                        className="lien-inline"
                        disabled={enCours}
                        onClick={() => agir(() => majAnnexeContrat(slug, projet.id, a.id, 'non_necessaire'))}
                      >
                        Non nécessaire
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="lien-inline"
                        disabled={enCours}
                        onClick={() => agir(() => majAnnexeContrat(slug, projet.id, a.id, 'a_joindre'))}
                      >
                        Rétablir
                      </button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {c.statut === 'signe' && (
            <p className="cycle-dossier-note cycle-dossier-note--renvoi" role="note">
              Signé le {formatDayShortMonth(c.signeLe!)}
              {c.signeParNom ? ` par ${c.signeParNom}` : ''} — {c.modeSignature ? MODES_SIGNATURE[c.modeSignature] : ''}
              {c.scan ? ` (${c.scan.nom})` : ''}.
            </p>
          )}
          {c.statut === 'signe' && c.signatureTrace && (
            <figure className="contrat-signature">
              <img src={c.signatureTrace} alt="Signature du client" />
              <figcaption>
                {c.signeParNom || 'Signataire'} · {formatDate(c.signeLe)}
              </figcaption>
            </figure>
          )}
          {c.statut === 'envoye' && c.dateEnvoi && (
            <p className="field-aide">
              Envoyé au client le {formatDayShortMonth(c.dateEnvoi)} — en attente de signature.
            </p>
          )}

          {lien && (
            <div className="crm-banner" role="status">
              <span>
                {lien.email
                  ? 'Contrat envoyé par email au client.'
                  : 'Email non envoyé (client sans adresse, ou envoi indisponible) — transmets ce lien au client.'}{' '}
                Lien (ne sera plus réaffiché) : <code>{lien.url}</code>{' '}
                <button type="button" className="lien-inline" onClick={() => navigator.clipboard?.writeText(lien.url)}>
                  <Copy size={12} aria-hidden /> Copier
                </button>
              </span>
              <button type="button" aria-label="Fermer" onClick={() => setLien(null)}>
                ×
              </button>
            </div>
          )}
          {message && (
            <p className="cycle-dossier-note cycle-dossier-note--renvoi" role="status">
              {message}
            </p>
          )}

          {peutPreparer && c.statut !== 'signe' && (
            <div className="cycle-dossier-actions">
              {c.statut === 'brouillon' && c.mode === 'modele' && (
                <button
                  type="button"
                  className="btn-ghost btn-ghost--sm"
                  disabled={enCours}
                  onClick={() => agir(() => regenererContrat(slug, projet.id))}
                  title="Reprend le modèle et le signataire actuels des réglages des contrats"
                >
                  Régénérer depuis le modèle
                </button>
              )}
              {c.statut === 'brouillon' && c.mode === 'sur_mesure' && (
                <button
                  type="button"
                  className="btn-ghost btn-ghost--sm"
                  disabled={enCours}
                  onClick={() => choisirFichier('document')}
                >
                  <Paperclip size={12} aria-hidden /> {c.document ? 'Remplacer le contrat' : 'Déposer le contrat'}
                </button>
              )}
              {c.statut === 'brouillon' && (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={enCours || annexesManquantes.length > 0 || documentManquant}
                  onClick={() =>
                    agir(
                      () => envoyerContrat(slug, projet.id),
                      (r) => setLien({ url: r.lienPublic, email: r.emailEnvoye }),
                    )
                  }
                >
                  Envoyer au client
                </button>
              )}
              {c.statut === 'envoye' && (
                <button
                  type="button"
                  className="btn-ghost btn-ghost--sm"
                  disabled={enCours}
                  onClick={async () => {
                    if (
                      await confirmer({
                        titre: 'Retirer l’envoi ?',
                        message: 'Le lien du client cessera de fonctionner.',
                        confirmer: 'Retirer l’envoi',
                        danger: true,
                      })
                    ) {
                      void agir(() => retirerEnvoiContrat(slug, projet.id));
                    }
                  }}
                >
                  Retirer l’envoi
                </button>
              )}
              <button
                type="button"
                className="btn-ghost btn-ghost--sm"
                disabled={enCours || annexesManquantes.length > 0 || documentManquant}
                onClick={() => choisirFichier('scan')}
                title="Contrat signé sur papier, scanné — vaut signature"
              >
                Signature papier (scan)
              </button>
            </div>
          )}
          {modifiable && (annexesManquantes.length > 0 || documentManquant) && (
            <p className="field-aide">
              Avant l’envoi :{' '}
              {[
                ...(documentManquant ? ['déposer le contrat sur mesure'] : []),
                ...annexesManquantes.map((a) => `« ${a.libelle} » (joindre ou « non nécessaire »)`),
              ].join(', ')}
              .
            </p>
          )}
        </>
      )}
      {erreur && <FieldError>{erreur}</FieldError>}
      {reglages && (
        <Modal
          onClose={() => {
            setReglages(false);
            setRelecture((n) => n + 1);
          }}
          closeOnEscape={false}
          portal
          labelledBy="reglages-contrats-titre"
          className="modal--large"
          backdropClassName="modal-backdrop--premier-plan"
        >
          <ModalHeader
            title="Réglages des contrats"
            titleId="reglages-contrats-titre"
            onClose={() => {
              setReglages(false);
              setRelecture((n) => n + 1);
            }}
          />
          <div className="modal-body">
            <ParametresContratPanel slug={slug} />
          </div>
        </Modal>
      )}
    </section>
  );
}

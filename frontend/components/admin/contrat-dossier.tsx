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
import { formatDateCourte, formatMontantCompact } from '@/lib/format';
import {
  MODES_SIGNATURE,
  STATUTS_CONTRAT,
  type ContratDossier as EtatContrat,
  type Projet,
  type StatutAnnexeContrat,
} from '@/lib/types';
import { useConfirmer } from '@/components/confirmation';

type Props = {
  slug: string;
  projet: Projet; // le dossier CRM
  peutPreparer: boolean; // finances_devis ≥ écriture
  onMaj: () => Promise<void>; // recharge le dossier (signature → Onboard)
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

// Contrat du dossier (étape G) — préparé une fois l'offre acceptée, envoyé au
// client par lien (signature en ligne) ou signé sur papier ; la SIGNATURE
// fait passer le dossier en Onboard. Contient le prix : visible avec
// finances_devis (clé `offre` présente sur le dossier), comme l'offre.
export function ContratDossier({ slug, projet, peutPreparer, onMaj }: Props) {
  const confirmer = useConfirmer();
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
  }, [slug, projet.id, projet.statut, visible]);

  if (!visible || !etat) return null;
  const c = etat.contrat;
  const prep = etat.preparation;
  const modifiable = peutPreparer && c?.statut === 'brouillon';
  // Un dossier sans contrat déjà en Onboard (antérieur à l'étape G) : rien.
  if (!c && projet.statut !== 'offre_envoyee') return null;

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
          message: 'Le dossier passera en Onboard (projet et factures brouillon créés).',
          confirmer: 'Enregistrer',
        }))
      ) {
        return;
      }
      await agir(
        () => signerContratPapier(slug, projet.id, fichier),
        (r) => {
          setMessage(
            `Contrat signé — dossier en Onboard, ${r.facturesPreparees} facture${r.facturesPreparees > 1 ? 's' : ''} préparée${r.facturesPreparees > 1 ? 's' : ''} en brouillon.`,
          );
          void onMaj();
        },
      );
    }
  }

  const annexesManquantes = c?.annexes.filter((a) => a.statut === 'a_joindre') ?? [];
  const documentManquant = c?.mode === 'sur_mesure' && !c.document;

  return (
    <section className="offre-dossier" aria-label="Contrat">
      <input ref={entreeFichier} type="file" accept={FICHIERS_ACCEPTES.contrat} hidden onChange={fichierChoisi} />
      <div className="cycle-dossier-tete">
        <span className="field-label">Contrat</span>
        {c && (
          <span
            className={`pill ${c.statut === 'signe' ? 'pill--succes' : c.statut === 'envoye' ? 'pill--info' : 'pill--neutre'}`}
          >
            {STATUTS_CONTRAT[c.statut]}
          </span>
        )}
        {c && <span className="cell-sub">{c.mode === 'modele' ? 'Généré depuis le modèle' : 'Rédigé sur mesure'}</span>}
      </div>

      {/* Pas encore préparé */}
      {!c && (
        <>
          <p className="field-aide">
            Offre {prep.offreAcceptee?.reference} acceptée ({formatMontantCompact(prep.offreAcceptee?.montantHt ?? 0)}{' '}
            HT) — contrat{' '}
            {prep.modePrevu === 'sur_mesure'
              ? `rédigé sur mesure (offre ≥ seuil de ${formatMontantCompact(prep.seuilSurMesureHt ?? 0)} HT)`
              : 'généré depuis le modèle de la société'}
            . Sa signature fera passer le dossier en Onboard.
          </p>
          {prep.signataire && prep.offreAcceptee && (
            <p className="field-aide">
              Signataire pour la société :{' '}
              <strong>
                {prep.signataire.nom
                  ? `${prep.signataire.nom}, ${prep.signataire.fonction}`
                  : prep.signataire.qui === 'ceo'
                    ? 'le CEO (non renseigné)'
                    : 'l’Architecte DPLG (non renseigné)'}
              </strong>{' '}
              — {prep.signataire.qui === 'ceo' ? 'seul le CEO contresigne' : 'l’Architecte DPLG signe'} : offre de{' '}
              {formatMontantCompact(prep.offreAcceptee.montantTtc)} TTC,{' '}
              {prep.signataire.qui === 'ceo' ? 'au-delà' : 'en deçà'} du seuil de{' '}
              {formatMontantCompact(prep.signataire.seuilTtc)}.
            </p>
          )}
          {prep.reglagesManquants.length > 0 && (
            <p className="cycle-dossier-note cycle-dossier-note--perte" role="note">
              À renseigner dans Paramètres → Contrats : {prep.reglagesManquants.join(', ')}.
            </p>
          )}
          {peutPreparer && (
            <div className="cycle-dossier-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={enCours || prep.reglagesManquants.length > 0}
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
                <span className={`pill ${CLASSE_ANNEXE[a.statut]}`}>
                  {a.automatique ? 'Jointe d’office' : LIBELLE_ANNEXE[a.statut]}
                </span>
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
              Signé le {formatDateCourte(c.signeLe!)}
              {c.signeParNom ? ` par ${c.signeParNom}` : ''} — {c.modeSignature ? MODES_SIGNATURE[c.modeSignature] : ''}
              {c.scan ? ` (${c.scan.nom})` : ''}.
            </p>
          )}
          {c.statut === 'signe' && c.signatureTrace && (
            <img src={c.signatureTrace} alt="Signature du client" className="contrat-signature" />
          )}
          {c.statut === 'envoye' && c.dateEnvoi && (
            <p className="field-aide">Envoyé au client le {formatDateCourte(c.dateEnvoi)} — en attente de signature.</p>
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
                  title="Reprend le modèle et le signataire actuels de Paramètres"
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
                title="Contrat signé sur papier, scanné — vaut signature (Onboard)"
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
      {erreur && <p className="field-erreur">{erreur}</p>}
    </section>
  );
}

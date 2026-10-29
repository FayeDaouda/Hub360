'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Copy } from 'lucide-react';
import { marquerReponseDevis, relancerDevis } from '@/lib/devis';
import { completudeFiche, type OffreEmise } from '@/lib/crm';
import { daysSince, formatCompactAmount, formatDayShortMonth, plural } from '@hub/domain';
import { STATUTS_DEVIS, type OffreDossier as Offre, type Projet } from '@/lib/types';
import { useConfirmer } from '@/components/confirmation';
import { Pill } from '@/components/ui/pill';
import { FieldError } from '@/components/ui/field';

type Props = {
  slug: string;
  projet: Projet;
  peutPreparer: boolean; // finances_devis ≥ écriture
  // Arrivé de Finances (« Nouveau client ») : « Continuer vers le devis ».
  depuisFinances?: boolean;
  onMaj: () => Promise<void>; // recharge le dossier après une action
  // Lien émis (validation DAF ou relance) — le clair n'existe qu'à cet instant.
  lienEmis: OffreEmise | null;
  onLienEmis: (l: OffreEmise | null) => void;
};

const CLASSE_OFFRE: Record<string, string> = {
  brouillon: 'pill--neutre',
  envoye: 'pill--info',
  accepte: 'pill--succes',
  refuse: 'pill--risque',
  expire: 'pill--attention',
  transforme: 'pill--succes',
};

// Offre en cours d'un dossier CRM (étape F). Absente pour qui n'a pas
// finances_devis en lecture (clé `offre` omise par le serveur).
export function OffreDossier({
  slug,
  projet,
  peutPreparer,
  depuisFinances = false,
  onMaj,
  lienEmis,
  onLienEmis,
}: Props) {
  const confirmer = useConfirmer();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (!('offre' in projet)) return null;
  const offre: Offre | null = projet.offre ?? null;
  const modifiable = projet.statut === 'nouveau_projet' && peutPreparer;
  const fiche = completudeFiche(projet);
  // L'offre se prépare dans Finances (panneau « Nouvelle offre », maquette
  // oct. 2026) : création pour ce lead, ou reprise du brouillon.
  const lienOffre = (offreId?: string) =>
    offreId ? `/admin/${slug}/facturation?devis=${offreId}` : `/admin/${slug}/facturation?offre=${projet.id}`;
  const libelleCreer = depuisFinances ? 'Continuer vers le devis' : 'Créer une offre';

  async function agir(fn: () => Promise<unknown>) {
    setEnCours(true);
    setErreur(null);
    try {
      await fn();
      await onMaj();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'L’action a échoué.');
    } finally {
      setEnCours(false);
    }
  }

  function relancer(o: Offre) {
    void agir(async () => {
      const r = await relancerDevis(slug, o.id);
      onLienEmis({ reference: r.reference, lienPublic: r.lienPublic, emailEnvoye: r.emailEnvoye });
    });
  }

  async function saisirReponse(o: Offre, reponse: 'accepte' | 'refuse') {
    const accepte = reponse === 'accepte';
    const ok = await confirmer({
      titre: accepte ? 'Enregistrer l’acceptation du client ?' : 'Enregistrer le refus du client ?',
      message: accepte
        ? 'Réponse reçue par un autre canal. Le dossier passera en Onboard (projet et factures brouillon créés) ; le contrat se régularise ensuite.'
        : 'Le dossier passera en « Perdu ».',
      confirmer: accepte ? 'Enregistrer l’acceptation' : 'Enregistrer le refus',
      danger: !accepte,
    });
    if (!ok) return;
    void agir(() => marquerReponseDevis(slug, o.id, reponse));
  }

  // Offre acceptée (maquette CTO, oct. 2026) : plus rien à faire ici — l'offre
  // se consulte et ses tranches se facturent dans Finances ; le contrat se
  // régularise dans son bloc.
  if (offre && (offre.statutEffectif === 'accepte' || offre.statutEffectif === 'transforme')) {
    return (
      <section className="offre-dossier offre-dossier--acceptee" aria-label="Offre">
        <Link className="btn-primary offre-dossier-cta" href={`/admin/${slug}/facturation?devis=${offre.id}`}>
          Voir l’offre et facturer les tranches
        </Link>
      </section>
    );
  }

  return (
    <section className="offre-dossier" aria-label="Offre">
      <div className="cycle-dossier-tete">
        <span className="field-label">Offre</span>
        {offre && (
          <Pill className={CLASSE_OFFRE[offre.statutEffectif] ?? 'pill--neutre'}>
            {STATUTS_DEVIS[offre.statutEffectif]}
          </Pill>
        )}
        {offre?.relanceAFaire && <Pill tone="attention">Relance à faire</Pill>}
        {!!offre?.lignesAZero && (
          <Pill tone="attention" title="Un forfait « prix à fixer » laissé vide ?">
            {plural(offre.lignesAZero, 'ligne')} à 0 FCFA
          </Pill>
        )}
      </div>

      {!offre ? (
        <p className="field-aide">
          {modifiable
            ? 'Aucune offre préparée — elle est requise pour soumettre le dossier à la DAF.'
            : 'Aucune offre.'}
        </p>
      ) : (
        <p className="offre-dossier-resume">
          {offre.reference && <strong>{offre.reference} · </strong>}
          {plural(offre.nbLignes, 'ligne')} · <strong>{formatCompactAmount(offre.montantTtc)} TTC</strong>
          {offre.objet && <span className="cell-sub">{offre.objet}</span>}
          {offre.dateEnvoi && (
            <span className="cell-sub">
              Envoyée le {formatDayShortMonth(offre.dateEnvoi)} (J+{daysSince(offre.dateEnvoi)})
              {offre.dateValidite && ` · valable jusqu’au ${formatDayShortMonth(offre.dateValidite)}`}
              {offre.relancesEnvoyees > 0 && ` · ${plural(offre.relancesEnvoyees, 'relance')}`}
            </span>
          )}
          {offre.dateReponse && (
            <span className="cell-sub">Réponse du client le {formatDayShortMonth(offre.dateReponse)}</span>
          )}
        </p>
      )}

      {lienEmis && (
        <div className="crm-banner" role="status">
          <span>
            {lienEmis.emailEnvoye
              ? `Offre ${lienEmis.reference ?? ''} envoyée par email au client.`
              : `Email non envoyé (client sans adresse, ou envoi indisponible) — transmets ce lien au client.`}{' '}
            Lien de secours (ne sera plus réaffiché) : <code>{lienEmis.lienPublic}</code>{' '}
            <button
              type="button"
              className="lien-inline"
              onClick={() => navigator.clipboard?.writeText(lienEmis.lienPublic)}
            >
              <Copy size={12} aria-hidden /> Copier
            </button>
          </span>
          <button type="button" aria-label="Fermer" onClick={() => onLienEmis(null)}>
            ×
          </button>
        </div>
      )}

      {peutPreparer && (
        <div className="cycle-dossier-actions">
          {/* Maquette : bloqué tant que la fiche n'est pas complète (le serveur
              refuse aussi — le tarif CO dépend des planches et de la catégorie). */}
          {modifiable && !offre && fiche.faits === fiche.total && (
            <Link className={depuisFinances ? 'btn-primary' : 'btn-ghost btn-ghost--sm'} href={lienOffre()}>
              {libelleCreer}
            </Link>
          )}
          {modifiable && !offre && fiche.faits < fiche.total && (
            <div className="offre-bloquee">
              <button type="button" className="offre-bloquee-bouton" disabled>
                {libelleCreer}
              </button>
              <span className="field-aide">
                Bloqué : compléter la fiche ({fiche.faits}/{fiche.total}). Une offre peut aussi être préparée en
                brouillon{' '}
                <Link className="lien-inline" href={lienOffre()}>
                  depuis Finances
                </Link>
                .
              </span>
            </div>
          )}
          {modifiable && offre?.statutEffectif === 'brouillon' && (
            <Link className="btn-ghost btn-ghost--sm" href={lienOffre(offre.id)}>
              Modifier l’offre
            </Link>
          )}
          {/* Après expiration + « Refaire une offre », on repart d'un brouillon neuf. */}
          {modifiable && offre && offre.statutEffectif === 'expire' && (
            <Link className="btn-ghost btn-ghost--sm" href={lienOffre()}>
              Préparer une nouvelle offre
            </Link>
          )}
          {offre?.statutEffectif === 'envoye' && (
            <>
              <button
                type="button"
                className={offre.relanceAFaire ? 'btn-primary' : 'btn-ghost btn-ghost--sm'}
                disabled={enCours}
                onClick={() => relancer(offre)}
                title="Envoie un rappel au client avec un nouveau lien (l’ancien ne marchera plus)"
              >
                Relancer le client
              </button>
              <button
                type="button"
                className="btn-ghost btn-ghost--sm"
                disabled={enCours}
                onClick={() => saisirReponse(offre, 'accepte')}
              >
                Le client a accepté
              </button>
              <button
                type="button"
                className="btn-ghost btn-ghost--sm btn-ghost--danger"
                disabled={enCours}
                onClick={() => saisirReponse(offre, 'refuse')}
              >
                Le client a refusé
              </button>
            </>
          )}
        </div>
      )}
      {erreur && <FieldError>{erreur}</FieldError>}
    </section>
  );
}

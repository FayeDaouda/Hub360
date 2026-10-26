'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/client-api';
import { formatAmount } from '@/lib/format';
import {
  dateEffetMin,
  getSalaireDossier,
  LIBELLE_MOTIF_SALAIRE,
  proposerSalaire,
  retirerSalaire,
  type ChangementSalaire,
  type HistoriqueSalaire,
  type MotifSalaire,
} from '@/lib/rh';
import type { DossierPersonnel } from '@/lib/types';
import { formatDate, todayIso } from '@/lib/dates';
import { Pill } from '@/components/ui/pill';
import { Field, FieldError } from '@/components/ui/field';

const message = (e: unknown, repli: string) => (e instanceof ApiError ? e.message : repli);
const STATUT: Record<ChangementSalaire['statut'], { libelle: string; pill: string }> = {
  a_valider: { libelle: 'En attente', pill: 'pill--attention' },
  valide: { libelle: 'Validé', pill: 'pill--succes' },
  refuse: { libelle: 'Refusé', pill: 'pill--risque' },
};

// Salaire du dossier (revue RH validée 20/10/2026) : historique avec date
// d'effet et motif. Masqué tant qu'on ne l'affiche pas (affichage tracé) ;
// la RH propose un changement, le CFO (le CEO pour le CFO) le valide.
export function SalaireDossier({
  slug,
  dossier,
  ecriture,
}: {
  slug: string;
  dossier: DossierPersonnel;
  ecriture: boolean;
}) {
  const [historique, setHistorique] = useState<HistoriqueSalaire | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const aujourdhui = todayIso();
  const premier = !dossier.salaireRenseigne;
  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState<MotifSalaire>(premier ? 'embauche' : 'augmentation');
  const [dateEffet, setDateEffet] = useState(premier ? (dossier.dateEntree ?? aujourdhui) : aujourdhui);

  // Autre dossier ouvert : de nouveau masqué.
  useEffect(() => {
    setHistorique(null);
    setErreur(null);
    setMontant('');
    setMotif(dossier.salaireRenseigne ? 'augmentation' : 'embauche');
    setDateEffet(dossier.salaireRenseigne ? todayIso() : (dossier.dateEntree ?? todayIso()));
  }, [dossier.id, dossier.salaireRenseigne, dossier.dateEntree]);

  async function lancer(action: () => Promise<HistoriqueSalaire>, repli: string) {
    setEnvoi(true);
    setErreur(null);
    try {
      setHistorique(await action());
      return true;
    } catch (e) {
      setErreur(message(e, repli));
      return false;
    } finally {
      setEnvoi(false);
    }
  }

  const enAttente = historique?.changements.find((c) => c.statut === 'a_valider') ?? null;
  const aUnSalaire = historique ? historique.changements.some((c) => c.statut === 'valide') : dossier.salaireRenseigne;
  const montantNombre = Number(montant.replace(/\D/g, ''));

  async function proposer() {
    const ok = await lancer(
      () => proposerSalaire(slug, dossier.id, { montant: montantNombre, dateEffet, motif }),
      'Proposition impossible.',
    );
    if (ok) setMontant('');
  }

  if (!historique) {
    return (
      <div className="sal-bloc">
        <span className="rh-salaire-masque">
          <span aria-label="Salaire masqué">{dossier.salaireRenseigne ? '••••••' : 'Aucun salaire validé'}</span>
          <button
            type="button"
            className="btn-ghost btn-ghost--sm"
            disabled={envoi}
            onClick={() => lancer(() => getSalaireDossier(slug, dossier.id), 'Salaire indisponible.')}
          >
            {dossier.salaireRenseigne ? 'Afficher' : ecriture ? 'Proposer le salaire d’entrée' : 'Historique'}
          </button>
          {dossier.salaireEnAttente && <Pill tone="attention">Changement en attente de validation</Pill>}
        </span>
        <span className="cell-sub">Chaque affichage est inscrit au journal de la paie.</span>
        {erreur && <FieldError>{erreur}</FieldError>}
      </div>
    );
  }

  return (
    <div className="sal-bloc">
      <p className="sal-vigueur">
        <span className="field-label">En vigueur aujourd’hui</span>
        <strong>
          {historique.enVigueur == null ? 'Aucun salaire validé' : `${formatAmount(historique.enVigueur)} / mois`}
        </strong>
      </p>

      {enAttente && (
        <div className="sal-attente" role="status">
          <span>
            <strong>{formatAmount(enAttente.montant)}</strong> à partir du{' '}
            {formatDate(enAttente.dateEffet, 'date inconnue')} · {LIBELLE_MOTIF_SALAIRE[enAttente.motif].toLowerCase()}{' '}
            — en attente de validation du {historique.valideur}
            {enAttente.proposePar && ` (proposé par ${enAttente.proposePar})`}
          </span>
          {ecriture && (
            <button
              type="button"
              className="btn-ghost btn-ghost--sm"
              disabled={envoi}
              onClick={() => lancer(() => retirerSalaire(slug, dossier.id, enAttente.id), 'Retrait impossible.')}
            >
              Retirer
            </button>
          )}
        </div>
      )}

      {ecriture && !enAttente && (
        <div className="sal-proposer">
          <p className="field-label">{aUnSalaire ? 'Proposer un changement' : 'Proposer le salaire d’entrée'}</p>
          <div className="sal-proposer-champs">
            <Field label="Salaire de base (FCFA / mois)">
              <input
                className="field-input"
                inputMode="numeric"
                value={montant}
                placeholder="Ex. 650 000"
                onChange={(e) => setMontant(e.target.value)}
              />
            </Field>
            <Field label="Date d’effet">
              <input
                className="field-input"
                type="date"
                value={dateEffet}
                min={aUnSalaire ? dateEffetMin(aujourdhui) : undefined}
                onChange={(e) => setDateEffet(e.target.value)}
              />
            </Field>
            <Field label="Motif">
              <select
                className="field-input"
                value={motif}
                disabled={!aUnSalaire}
                onChange={(e) => setMotif(e.target.value as MotifSalaire)}
              >
                {(aUnSalaire
                  ? (['augmentation', 'promotion', 'fin_essai', 'correction'] as const)
                  : (['embauche'] as const)
                ).map((m) => (
                  <option key={m} value={m}>
                    {LIBELLE_MOTIF_SALAIRE[m]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="sal-proposer-pied">
            <span className="cell-sub">
              Validé par le {historique.valideur} avant d’entrer en vigueur.
              {aUnSalaire &&
                ` Date d’effet passée : 3 mois au plus (${formatDate(dateEffetMin(aujourdhui), 'date inconnue')}).`}
            </span>
            <button
              type="button"
              className="btn-primary"
              disabled={envoi || !montantNombre || !dateEffet}
              onClick={proposer}
            >
              Proposer au {historique.valideur}
            </button>
          </div>
        </div>
      )}

      {historique.changements.length > 0 && (
        <ul className="sal-historique">
          {historique.changements.map((c) => (
            <li key={c.id}>
              <span className="sal-date">{formatDate(c.dateEffet, 'date inconnue')}</span>
              <span className="sal-montant">{formatAmount(c.montant)}</span>
              <span className="sal-motif">
                {LIBELLE_MOTIF_SALAIRE[c.motif]}
                <span className="cell-sub">
                  {c.statut === 'valide' && c.decidePar
                    ? `validé par ${c.decidePar}`
                    : c.statut === 'refuse'
                      ? `refusé${c.decidePar ? ` par ${c.decidePar}` : ''} : ${c.motifRefus}`
                      : c.proposePar
                        ? `proposé par ${c.proposePar}`
                        : 'reprise'}
                </span>
              </span>
              <Pill className={STATUT[c.statut].pill}>{STATUT[c.statut].libelle}</Pill>
            </li>
          ))}
        </ul>
      )}
      {erreur && <FieldError>{erreur}</FieldError>}
    </div>
  );
}

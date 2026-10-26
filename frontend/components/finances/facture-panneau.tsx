'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BellRing, Download, Undo2 } from 'lucide-react';
import {
  ajouterPaiementCentrale,
  emettreFactureCentrale,
  getFactureCentrale,
  lienFacturationProjet,
  relancerFacture,
  supprimerFactureCentrale,
} from '@/lib/facturation';
import { DemandeAvoir } from '@/components/finances/demande-avoir';
import { formatAmount } from '@/lib/format';
import { MODES_PAIEMENT, type FactureCentrale, type ModePaiement } from '@/lib/types';
import { FactureDocument, type FactureDocumentProps } from '@/components/finances/facture-document';
import { useConfirmer } from '@/components/confirmation';
import { daysSince, formatDate, todayIso } from '@/lib/dates';
import { CloseButton, Drawer } from '@/components/ui/dialog';
import { Pill } from '@/components/ui/pill';
import { FieldError } from '@/components/ui/field';

type Props = {
  slug: string;
  facture: FactureCentrale;
  document: FactureDocumentProps | null; // aperçu : le modèle imprimé (lot 6)
  statut: { libelle: string; classe: string };
  societeNom: string;
  droits: { ecriture: boolean; validation: boolean; emission?: boolean };
  onMaj: (f: FactureCentrale) => void;
  onSupprimee: () => void;
  onTelecharger: () => void;
  onClose: () => void;
};

// Facture en panneau latéral (maquette Finances, oct. 2026) : statut,
// bandeau « à valider par le CFO » d'une facture directe préparée, document,
// encaissements. Le CFO (validation) l'émet et enregistre les encaissements.
export function FacturePanneau({
  slug,
  facture: f,
  document,
  statut,
  societeNom,
  droits,
  onMaj,
  onSupprimee,
  onTelecharger,
  onClose,
}: Props) {
  const confirmer = useConfirmer();
  const [avoir, setAvoir] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [paiement, setPaiement] = useState<{ date: string; montant: string; mode: ModePaiement | '' } | null>(null);
  const [relance, setRelance] = useState<string | null>(null);

  async function agir(fn: () => Promise<void>) {
    setEnCours(true);
    setErreur(null);
    try {
      await fn();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'L’action a échoué.');
    } finally {
      setEnCours(false);
    }
  }

  const brouillon = f.statut === 'brouillon';
  const directeAValider = brouillon && !!f.dossierCrm;
  const pct = f.montantTtc > 0 ? Math.min(100, Math.round((f.montantPaye / f.montantTtc) * 100)) : 0;
  const encaissable = f.statut === 'emise' && !f.estAvoir && f.resteAPayer > 0;
  const montantSaisi = paiement ? Number(paiement.montant.replace(/\s/g, '')) : 0;

  return (
    <Drawer onClose={onClose} as="aside" labelledBy="fp-facture">
      <header className="fiche-crm-entete">
        <div>
          <p className="fiche-crm-titre">{f.estAvoir ? 'Avoir' : 'Facture'}</p>
          <h2 id="fp-facture" className="fiche-crm-code fac-titre">
            {f.reference ?? 'Brouillon'}
            <Pill className={statut.classe}>{statut.libelle}</Pill>
          </h2>
          <p className="fiche-crm-meta">
            {[
              f.client?.nom,
              f.dossierCrm?.code ?? f.projet?.code,
              f.emiseLe
                ? `émise le ${formatDate(f.emiseLe)}`
                : `préparée le ${formatDate(f.creeLe)} · référence attribuée à la validation`,
              f.echeanceLe && `échéance ${formatDate(f.echeanceLe)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <CloseButton onClick={onClose} />
      </header>

      {directeAValider && (
        <div className="fiche-crm-alerte" role="note">
          <strong>
            Préparée par {societeNom} · à valider par le CFO avant émission. Elle n’est ni envoyée ni comptée tant
            qu’elle n’est pas validée.
          </strong>
        </div>
      )}

      {document && (
        <div className="fac-document">
          <FactureDocument {...document} />
        </div>
      )}

      {!f.estAvoir && f.statut !== 'brouillon' && (
        <section className="fiche-crm-section">
          <div className="fiche-crm-titre-ligne">
            <h3 className="fiche-crm-titre">Encaissements</h3>
            <strong>
              {formatAmount(f.montantPaye)} / {formatAmount(f.montantTtc)}
            </strong>
          </div>
          <div className="po-barre" aria-hidden>
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="fiche-crm-titre-ligne">
            <span>Reste dû</span>
            <strong className="nfd-ttc">{formatAmount(f.resteAPayer)}</strong>
          </div>
          {f.paiements.length === 0 ? (
            <p className="fiche-crm-aide">Aucun encaissement enregistré.</p>
          ) : (
            <ul className="fiche-crm-historique">
              {f.paiements.map((p) => (
                <li key={p.id}>
                  <time>{formatDate(p.date)}</time>
                  <span>
                    {formatAmount(p.montant)}
                    {p.mode && ` · ${MODES_PAIEMENT[p.mode]}`}
                    {p.reference && ` · ${p.reference}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {droits.validation && encaissable && !paiement && (
            <button
              type="button"
              className="btn-ghost fac-bouton"
              onClick={() => setPaiement({ date: todayIso(), montant: String(f.resteAPayer), mode: '' })}
            >
              Enregistrer un encaissement
            </button>
          )}
          {paiement && (
            <div className="fac-paiement">
              <input
                type="date"
                className="field-input"
                aria-label="Date"
                value={paiement.date}
                onChange={(e) => setPaiement({ ...paiement, date: e.target.value })}
              />
              <input
                className="field-input"
                aria-label="Montant"
                inputMode="numeric"
                value={paiement.montant}
                onChange={(e) => setPaiement({ ...paiement, montant: e.target.value })}
              />
              <select
                className="field-input"
                aria-label="Mode"
                value={paiement.mode}
                onChange={(e) => setPaiement({ ...paiement, mode: e.target.value as ModePaiement | '' })}
              >
                <option value="">Mode…</option>
                {Object.entries(MODES_PAIEMENT).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <span className="dmd-actions">
                <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setPaiement(null)}>
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn-primary btn-primary--sm"
                  disabled={enCours || !(montantSaisi > 0) || !paiement.date}
                  onClick={() =>
                    agir(async () => {
                      onMaj(
                        await ajouterPaiementCentrale(slug, f.id, {
                          date: paiement.date,
                          montant: montantSaisi,
                          mode: paiement.mode || undefined,
                        }),
                      );
                      setPaiement(null);
                    })
                  }
                >
                  Enregistrer
                </button>
              </span>
            </div>
          )}
        </section>
      )}

      {relance && (
        <p className="fiche-crm-aide" role="status">
          {relance}
        </p>
      )}
      {erreur && <FieldError>{erreur}</FieldError>}
      <div className="fac-actions">
        {/* Émission : exclusive au-delà du seuil de contresignature (revue CEO). */}
        {brouillon && (droits.emission ?? droits.validation) && (
          <button
            type="button"
            className="btn-primary"
            disabled={enCours}
            onClick={() => agir(async () => onMaj(await emettreFactureCentrale(slug, f.id)))}
          >
            Valider et émettre
          </button>
        )}
        {directeAValider && droits.ecriture && (
          <button
            type="button"
            className="btn-ghost"
            disabled={enCours}
            onClick={async () =>
              (await confirmer({
                titre: 'Supprimer ce brouillon de facture ?',
                message: 'Aucun numéro n’a encore été attribué.',
                confirmer: 'Supprimer',
                danger: true,
              })) &&
              agir(async () => {
                await supprimerFactureCentrale(slug, f.id);
                onSupprimee();
              })
            }
          >
            Supprimer le brouillon
          </button>
        )}
        {f.statutEffectif === 'en_retard' && droits.ecriture && (
          <button
            type="button"
            className="btn-ghost"
            disabled={enCours}
            onClick={() =>
              agir(async () => {
                const { envoye } = await relancerFacture(slug, f.id);
                const client = f.client?.nom ?? 'ce client';
                setRelance(
                  envoye
                    ? `Relance envoyée à ${client}.`
                    : `E-mail non envoyé (transport indisponible) : contactez ${client} autrement.`,
                );
              })
            }
          >
            <BellRing size={14} aria-hidden /> Relancer
          </button>
        )}
        {/* Avoir motivé (contrôle interne) : facture émise d'un projet. */}
        {f.statut === 'emise' && !f.estAvoir && f.projet && droits.validation && !f.avoirEnAttente && (
          <button type="button" className="btn-ghost" disabled={enCours} onClick={() => setAvoir(true)}>
            <Undo2 size={14} aria-hidden /> Faire un avoir
          </button>
        )}
        {f.avoirEnAttente && (
          <Pill tone="attention">
            Avoir en attente du CEO
            {f.avoirEnAttenteDepuis ? ` depuis ${Math.max(0, daysSince(f.avoirEnAttenteDepuis))} j` : ''}
          </Pill>
        )}
        {f.projet && (
          <Link className="btn-ghost" href={lienFacturationProjet(slug, f.projet.id)}>
            Facturation du projet
          </Link>
        )}
        <button type="button" className="btn-ghost" onClick={onTelecharger}>
          <Download size={14} aria-hidden /> Télécharger
        </button>
      </div>
      {/* Dans le panneau : un clic dans la fenêtre ne ferme pas le panneau. */}
      {avoir && f.projet && (
        <DemandeAvoir
          slug={slug}
          projetId={f.projet.id}
          facture={{ id: f.id, reference: f.reference, montantTtc: f.montantTtc }}
          onFait={() =>
            getFactureCentrale(slug, f.id)
              .then(onMaj)
              .catch(() => undefined)
          }
          onClose={() => setAvoir(false)}
        />
      )}
    </Drawer>
  );
}

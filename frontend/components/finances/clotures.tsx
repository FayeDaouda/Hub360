'use client';

import { useEffect, useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { cloturerMois, getClotures, rouvrirMois, type MoisCloture } from '@/lib/facturation';
import { formatAmount } from '@/lib/format';
import { formatDate } from '@/lib/dates';
import { plural } from '@/lib/text';
import { Modal, ModalHeader } from '@/components/ui/dialog';
import { Pill } from '@/components/ui/pill';
import { Field, FieldError } from '@/components/ui/field';

const message = (e: unknown, repli: string) => (e instanceof ApiError ? e.message : repli);

// Clôture mensuelle (contrôle interne, revue CFO 20/10/2026) : le CFO fige un
// mois terminé après en avoir relu les chiffres ; plus aucun paiement daté de
// ce mois ne s'ajoute ni ne se supprime. Seul le CEO rouvre, avec un motif.
export function Clotures({ slug, estCeo, onClose }: { slug: string; estCeo: boolean; onClose: () => void }) {
  const [mois, setMois] = useState<MoisCloture[] | null>(null);
  const [confirmer, setConfirmer] = useState<string | null>(null);
  const [rouvrir, setRouvrir] = useState<{ mois: string; motif: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    getClotures(slug)
      .then(setMois)
      .catch((e) => setErreur(message(e, 'Clôtures indisponibles.')));
  }, [slug]);

  async function lancer(action: () => Promise<MoisCloture[]>) {
    setEnvoi(true);
    setErreur(null);
    try {
      setMois(await action());
      setConfirmer(null);
      setRouvrir(null);
    } catch (e) {
      setErreur(message(e, 'Action impossible.'));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Modal onClose={onClose} busy={envoi} portal className="clo-modal" labelledBy="clo-titre">
      <ModalHeader title="Clôtures mensuelles" titleId="clo-titre" onClose={onClose} closeDisabled={envoi} />
      <div className="modal-body clo-corps">
        <p className="dmd-note">
          Un mois clôturé est figé : aucun paiement daté de ce mois ne peut plus être ajouté ni supprimé. Toute
          correction passe par un avoir ou une écriture datée du mois en cours. Seul le CEO rouvre un mois, avec un
          motif.
        </p>
        {mois === null && !erreur && <p className="dmd-note">Chargement…</p>}
        {mois?.length === 0 && <p className="dmd-note">Aucun mois terminé avec des factures ou des paiements.</p>}
        <ul className="clo-liste">
          {(mois ?? []).map((m) => (
            <li key={m.mois} className="clo-ligne" data-clos={m.clos || undefined}>
              <div className="clo-tete">
                <strong className="clo-periode">{m.periode}</strong>
                {m.clos ? (
                  <Pill tone="succes">
                    <Lock size={11} aria-hidden /> Clôturé{m.le ? ` le ${formatDate(m.le)}` : ''}
                    {m.par ? ` par ${m.par}` : ''}
                  </Pill>
                ) : (
                  <Pill tone="attention">{m.derniereReouverture ? 'Rouvert' : 'À clôturer'}</Pill>
                )}
              </div>
              <p className="clo-chiffres">
                {plural(m.chiffres.factures, 'facture')} · {formatAmount(m.chiffres.factureTtc)} TTC
                {m.chiffres.avoirs > 0 &&
                  ` · ${plural(m.chiffres.avoirs, 'avoir')} (${formatAmount(m.chiffres.avoirsTtc)})`}{' '}
                · {plural(m.chiffres.paiements, 'paiement')} · {formatAmount(m.chiffres.encaisse)} encaissés
              </p>
              {!m.clos && m.derniereReouverture && (
                <p className="cell-sub">Motif de la réouverture : {m.derniereReouverture}</p>
              )}

              {!m.clos && !estCeo && confirmer !== m.mois && (
                <button
                  type="button"
                  className="btn-ghost btn-ghost--sm"
                  disabled={envoi}
                  onClick={() => setConfirmer(m.mois)}
                >
                  <Lock size={13} aria-hidden /> Clôturer {m.periode}
                </button>
              )}
              {confirmer === m.mois && (
                <div className="clo-confirmer">
                  <span>
                    Les chiffres ci-dessus sont justes ? Après la clôture, seul le CEO peut rouvrir {m.periode}.
                  </span>
                  <span className="clo-boutons">
                    <button type="button" className="btn-ghost" disabled={envoi} onClick={() => setConfirmer(null)}>
                      Annuler
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={envoi}
                      onClick={() => lancer(() => cloturerMois(slug, m.mois))}
                    >
                      Clôturer
                    </button>
                  </span>
                </div>
              )}

              {m.clos && estCeo && rouvrir?.mois !== m.mois && (
                <button
                  type="button"
                  className="btn-ghost btn-ghost--sm"
                  disabled={envoi}
                  onClick={() => setRouvrir({ mois: m.mois, motif: '' })}
                >
                  <LockOpen size={13} aria-hidden /> Rouvrir
                </button>
              )}
              {rouvrir?.mois === m.mois && (
                <div className="clo-confirmer">
                  <Field label="Motif de la réouverture (transmis au CFO)">
                    <textarea
                      className="field-input"
                      rows={2}
                      maxLength={300}
                      value={rouvrir.motif}
                      onChange={(e) => setRouvrir({ mois: m.mois, motif: e.target.value })}
                    />
                  </Field>
                  <span className="clo-boutons">
                    <button type="button" className="btn-ghost" disabled={envoi} onClick={() => setRouvrir(null)}>
                      Annuler
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={envoi || rouvrir.motif.trim().length < 5}
                      onClick={() => lancer(() => rouvrirMois(slug, m.mois, rouvrir.motif.trim()))}
                    >
                      Rouvrir {m.periode}
                    </button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
        {erreur && <FieldError>{erreur}</FieldError>}
      </div>
    </Modal>
  );
}

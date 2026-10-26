'use client';

import { useState } from 'react';
import { ImageUp, Lock, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import {
  formaterNumero,
  modifierNumerotation,
  modifierProfilFacturation,
  PREFIXE_TEST,
  type FormatNumero,
  ANNEXE_CGV,
  MODES_COMMISSION,
  type AnnexeCgv,
  type ModeCommission,
  type ParametresFacturation,
  type ProfilFacturation,
} from '@/lib/facturation';
import { formatDate } from '@/lib/dates';
import { Modal, ModalHeader } from '@/components/ui/dialog';
import { Pill } from '@/components/ui/pill';
import { Field, FieldError } from '@/components/ui/field';

// Coordonnées de paiement : un changement est confirmé, notifié au CEO et tracé.
const CHAMPS_PAIEMENT: ChampTexte[] = ['banque', 'rib', 'wave', 'orangeMoney'];
const LOGO_MAX = 600 * 1024;

const message = (e: unknown, repli: string) => (e instanceof ApiError ? e.message : repli);

type ChampTexte = Exclude<keyof ProfilFacturation, 'logoDocument' | 'cgvAnnexe' | 'modeCommission'>;
const CHAMPS: { cle: ChampTexte; libelle: string; long?: boolean; aide?: string }[] = [
  { cle: 'raisonSociale', libelle: 'Raison sociale' },
  { cle: 'adresse', libelle: 'Adresse', long: true },
  { cle: 'ninea', libelle: 'NINEA' },
  { cle: 'rccm', libelle: 'RCCM' },
  { cle: 'cofi', libelle: 'COFI (code fiscal)', aide: 'Imprimé après le NINEA, ex. « 292 »' },
  { cle: 'capital', libelle: 'Capital social', aide: 'Ex. « 1 000 000 FCFA »' },
  { cle: 'telephone', libelle: 'Téléphone' },
  { cle: 'email', libelle: 'E-mail de facturation' },
  { cle: 'banque', libelle: 'Banque' },
  { cle: 'rib', libelle: 'RIB ou IBAN' },
  { cle: 'wave', libelle: 'Numéro Wave' },
  { cle: 'orangeMoney', libelle: 'Numéro Orange Money' },
  {
    cle: 'conditionsPaiement',
    libelle: 'Conditions de paiement',
    long: true,
    aide: 'Ex. « Paiement à 15 jours à réception de facture. »',
  },
  { cle: 'mentionsPied', libelle: 'Mentions légales (pied de page)', long: true },
];

// Paramètres de facturation (lot 6, à la manière de Zervant) : numérotation
// (aperçu avant validation, préfixes déjà utilisés, verrou annuel) et profil
// imprimé sur les factures. Le CFO seul modifie ; les autres lisent.
export function ParametresFacturationFenetre({
  slug,
  parametres,
  onMaj,
  onClose,
}: {
  slug: string;
  parametres: ParametresFacturation;
  onMaj: (p: ParametresFacturation) => void;
  onClose: () => void;
}) {
  const p = parametres;
  const [format, setFormat] = useState<FormatNumero>(p.format);
  const [motif, setMotif] = useState('');
  const [profil, setProfil] = useState<ProfilFacturation>(p.profil);
  const [envoi, setEnvoi] = useState<'format' | 'profil' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [confirmerPaiement, setConfirmerPaiement] = useState(false);
  const [preuve, setPreuve] = useState(''); // mot de passe ou code, jamais gardé

  const lecture = !p.peutModifier;
  const formatFige = lecture || p.verrouille;
  const apercu = formaterNumero(format, p.annee, format.numeroDepart);
  const paiementChange = CHAMPS_PAIEMENT.filter((c) => (p.profil[c] ?? '').trim() !== (profil[c] ?? '').trim());
  const LIBELLES = Object.fromEntries(CHAMPS.map((c) => [c.cle, c.libelle]));

  function choisirLogo(fichier: File | undefined) {
    if (!fichier) return;
    setErreur(null);
    if (!['image/svg+xml', 'image/png'].includes(fichier.type))
      return setErreur('Logo : un fichier SVG ou PNG (fond transparent).');
    if (fichier.size > LOGO_MAX) return setErreur('Logo : 600 Ko au plus.');
    const lecteur = new FileReader();
    lecteur.onload = () => setProfil((x) => ({ ...x, logoDocument: String(lecteur.result) }));
    lecteur.readAsDataURL(fichier);
  }

  function enregistrerProfil() {
    if (paiementChange.length && !confirmerPaiement) return setConfirmerPaiement(true);
    lancer(
      'profil',
      async () => {
        const r = await modifierProfilFacturation(slug, {
          ...profil,
          ...(paiementChange.length ? { confirmation: preuve } : {}),
        });
        setConfirmerPaiement(false);
        return r;
      },
      'Profil de facturation enregistré.',
    ).finally(() => setPreuve(''));
  }

  async function lancer(quoi: 'format' | 'profil', action: () => Promise<ParametresFacturation>, succes: string) {
    setEnvoi(quoi);
    setErreur(null);
    setOk(null);
    try {
      onMaj(await action());
      setOk(succes);
      if (quoi === 'format') setMotif('');
    } catch (e) {
      setErreur(message(e, 'Enregistrement impossible.'));
    } finally {
      setEnvoi(null);
    }
  }

  return (
    <Modal onClose={onClose} busy={!!envoi} portal className="pf-modal" labelledBy="pf-titre">
      <ModalHeader title="Paramètres de facturation" titleId="pf-titre" onClose={onClose} closeDisabled={!!envoi} />
      <div className="modal-body pf-corps">
        {lecture && (
          <p className="dmd-note">Consultation seule : le CFO règle la numérotation et le profil de facturation.</p>
        )}

        <section className="pf-section">
          <h3 className="fiche-crm-titre">Numérotation des factures et des avoirs</h3>
          <p className="dmd-note">
            Une seule suite pour les factures et les avoirs, attribuée à l’émission, sans trou, qui repart au numéro de
            départ chaque 1er janvier. Le préfixe {PREFIXE_TEST} sert aux essais : changez-le le jour où vous facturez
            vos vrais clients.
          </p>
          <div className="pf-apercu">
            <span className="field-label">Prochain numéro</span>
            <strong>{p.prochain}</strong>
            {p.format.prefixe.toUpperCase() === PREFIXE_TEST && <Pill tone="attention">factures d’essai</Pill>}
            {p.parDefaut && <Pill tone="neutre">format par défaut</Pill>}
          </div>
          {p.verrouille && (
            <p className="pf-verrou">
              <Lock size={14} aria-hidden /> Format verrouillé pour {p.annee} : une vraie facture a déjà été émise. Il
              pourra changer à partir du 1er janvier.
            </p>
          )}
          <div className="pf-format">
            <Field label="Préfixe">
              <input
                className="field-input"
                list="pf-prefixes"
                maxLength={10}
                value={format.prefixe}
                disabled={formatFige}
                onChange={(e) =>
                  setFormat({ ...format, prefixe: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })
                }
              />
              <datalist id="pf-prefixes">
                {[...new Set([PREFIXE_TEST, ...p.prefixes])].map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </Field>
            <Field label="Année">
              <select
                className="field-input"
                value={format.formatAnnee}
                disabled={formatFige}
                onChange={(e) => setFormat({ ...format, formatAnnee: e.target.value as 'AAAA' | 'AA' })}
              >
                <option value="AAAA">{p.annee}</option>
                <option value="AA">{String(p.annee % 100).padStart(2, '0')}</option>
              </select>
            </Field>
            <Field label="Séparateur">
              <select
                className="field-input"
                value={format.separateur}
                disabled={formatFige}
                onChange={(e) => setFormat({ ...format, separateur: e.target.value })}
              >
                <option value="-">tiret (-)</option>
                <option value="/">barre (/)</option>
                <option value=".">point (.)</option>
                <option value="">aucun</option>
              </select>
            </Field>
            <Field label="Chiffres">
              <select
                className="field-input"
                value={format.chiffres}
                disabled={formatFige}
                onChange={(e) => setFormat({ ...format, chiffres: Number(e.target.value) })}
              >
                {[3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Numéro de départ">
              <input
                className="field-input"
                inputMode="numeric"
                value={format.numeroDepart}
                disabled={formatFige}
                onChange={(e) => setFormat({ ...format, numeroDepart: Number(e.target.value.replace(/\D/g, '')) || 1 })}
              />
            </Field>
          </div>
          {!formatFige && (
            <>
              <p className="pf-apercu-ligne">
                Aperçu de la première facture de ce format : <strong>{apercu}</strong>
                <span className="cell-sub">
                  {' '}
                  (si ce préfixe a déjà servi cette année, la suite continue au numéro suivant)
                </span>
              </p>
              <Field label="Motif (obligatoire)">
                <input
                  className="field-input"
                  maxLength={300}
                  value={motif}
                  disabled={!!envoi}
                  onChange={(e) => setMotif(e.target.value)}
                />
              </Field>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!!envoi || motif.trim().length < 3}
                  onClick={() =>
                    lancer(
                      'format',
                      () => modifierNumerotation(slug, { ...format, motif: motif.trim() }),
                      'Numérotation enregistrée.',
                    )
                  }
                >
                  {envoi === 'format' ? 'Enregistrement…' : 'Enregistrer la numérotation'}
                </button>
              </div>
            </>
          )}
          {p.historique.length > 0 && (
            <ul className="rtf-mois">
              {p.historique.map((h) => (
                <li key={h.le}>
                  <span className="rtf-mois-nom">{h.exemple}</span>
                  <span>le {formatDate(h.le)}</span>
                  <span className="cell-sub">
                    {h.motif}
                    {h.par ? ` · ${h.par}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="pf-section">
          <h3 className="fiche-crm-titre">Profil imprimé sur les factures</h3>
          {p.profil.parDefaut && (
            <p className="dmd-note">
              Pré-rempli avec les coordonnées et mentions légales déjà connues de la société : à vérifier et compléter.
            </p>
          )}
          <div className="pf-logo">
            <span className="field-label">Logo des factures</span>
            <div className="pf-logo-ligne">
              <div className="pf-logo-apercu">
                {profil.logoDocument ? (
                  <img src={profil.logoDocument} alt="Logo des factures" />
                ) : (
                  <span className="cell-sub">Logo de la société</span>
                )}
              </div>
              {!lecture && (
                <div className="pf-logo-actions">
                  <label className="btn-ghost">
                    <ImageUp size={15} aria-hidden /> {profil.logoDocument ? 'Remplacer' : 'Choisir un fichier'}
                    <input
                      type="file"
                      accept="image/svg+xml,image/png"
                      hidden
                      disabled={!!envoi}
                      onChange={(e) => (choisirLogo(e.target.files?.[0]), (e.target.value = ''))}
                    />
                  </label>
                  {profil.logoDocument && (
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={!!envoi}
                      onClick={() => setProfil({ ...profil, logoDocument: null })}
                    >
                      <Trash2 size={15} aria-hidden /> Retirer
                    </button>
                  )}
                </div>
              )}
            </div>
            <span className="cell-sub">SVG de préférence, ou PNG à fond transparent · 600 Ko au plus</span>
          </div>
          <div className="pf-profil">
            {CHAMPS.map((c) => (
              <label key={c.cle} className={`field${c.long ? ' pf-long' : ''}`}>
                <span className="field-label">{c.libelle}</span>
                {c.long ? (
                  <textarea
                    className="field-input"
                    rows={2}
                    value={profil[c.cle]}
                    disabled={lecture || !!envoi}
                    placeholder={c.aide}
                    onChange={(e) => (setProfil({ ...profil, [c.cle]: e.target.value }), setConfirmerPaiement(false))}
                  />
                ) : (
                  <input
                    className="field-input"
                    value={profil[c.cle]}
                    disabled={lecture || !!envoi}
                    placeholder={c.aide}
                    onChange={(e) => (setProfil({ ...profil, [c.cle]: e.target.value }), setConfirmerPaiement(false))}
                  />
                )}
              </label>
            ))}
          </div>
          <Field label="CGV complètes en annexe">
            <select
              className="field-input"
              value={profil.cgvAnnexe ?? 'premiere_facture'}
              disabled={lecture || !!envoi}
              onChange={(e) => setProfil({ ...profil, cgvAnnexe: e.target.value as AnnexeCgv })}
            >
              {(Object.keys(ANNEXE_CGV) as AnnexeCgv[]).map((k) => (
                <option key={k} value={k}>
                  {ANNEXE_CGV[k]}
                </option>
              ))}
            </select>
            <span className="cell-sub">
              La page 1 de chaque facture cite toujours les CGV, l’offre acceptée et les articles clés.
            </span>
          </Field>
          <Field label="Commissions des apporteurs">
            <select
              className="field-input"
              value={profil.modeCommission ?? 'encaisse_prorata'}
              disabled={lecture || !!envoi}
              onChange={(e) => setProfil({ ...profil, modeCommission: e.target.value as ModeCommission })}
            >
              {(Object.keys(MODES_COMMISSION) as ModeCommission[]).map((k) => (
                <option key={k} value={k}>
                  {MODES_COMMISSION[k]}
                </option>
              ))}
            </select>
            <span className="cell-sub">
              Le % est celui de la fiche apporteur. Le mode s’applique aux dossiers signés à partir de son changement ;
              le COO suit, le CFO paie.
            </span>
          </Field>
          {!lecture && confirmerPaiement && (
            <div className="pf-alerte" role="alert">
              <p>
                Vous modifiez les coordonnées de paiement ({paiementChange.map((c) => LIBELLES[c]).join(', ')}). Elles
                seront imprimées sur toutes les prochaines factures ; le CEO sera prévenu et le changement gardé dans le
                journal d’audit. Vérifiez chaque chiffre.
              </p>
              <Field
                label={
                  p.confirmation === 'code'
                    ? 'Code de votre application de double authentification'
                    : 'Votre mot de passe, pour confirmer'
                }
              >
                <input
                  className="field-input"
                  type={p.confirmation === 'code' ? 'text' : 'password'}
                  inputMode={p.confirmation === 'code' ? 'numeric' : undefined}
                  autoComplete={p.confirmation === 'code' ? 'one-time-code' : 'current-password'}
                  value={preuve}
                  disabled={!!envoi}
                  autoFocus
                  onChange={(e) => setPreuve(e.target.value)}
                />
              </Field>
            </div>
          )}
          {!lecture && (
            <div className="modal-actions">
              {confirmerPaiement && (
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={!!envoi}
                  onClick={() => (setConfirmerPaiement(false), setPreuve(''))}
                >
                  Revoir
                </button>
              )}
              <button
                type="button"
                className="btn-primary"
                disabled={!!envoi || !profil.raisonSociale.trim() || (confirmerPaiement && !preuve.trim())}
                onClick={enregistrerProfil}
              >
                {envoi === 'profil'
                  ? 'Enregistrement…'
                  : confirmerPaiement
                    ? 'Confirmer les nouvelles coordonnées'
                    : 'Enregistrer le profil'}
              </button>
            </div>
          )}
        </section>
        {ok && <p className="pf-ok">{ok}</p>}
        {erreur && <FieldError>{erreur}</FieldError>}
      </div>
    </Modal>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, X } from 'lucide-react';
import { comparerRoles, creerCompte, libelleRole } from '@/lib/groupe';
import type { InvitationCompte, SocieteComptes } from '@/lib/types';

// Parcours unique de création d'un compte (phase 1, 14/10/2026) : dossier RH
// → compte → rôle → cellule. Le dossier RH porte l'identité ; sans cellule,
// aucune fiche d'équipe (comptes de direction).
export function NouveauCompteModal({
  societe,
  onClose,
  onCree,
}: {
  societe: SocieteComptes;
  onClose: () => void;
  onCree: () => void;
}) {
  const roles = useMemo(() => [...societe.rolesAttribuables].sort(comparerRoles), [societe.rolesAttribuables]);
  const [dossierId, setDossierId] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [celluleId, setCelluleId] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultat, setResultat] = useState<(InvitationCompte & { nom: string; email: string }) | null>(null);

  function choisirDossier(id: string) {
    setDossierId(id);
    const d = societe.dossiersSansCompte.find((x) => x.id === id);
    if (d?.emailPro) setEmail(d.emailPro);
  }

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setBusy(true);
    try {
      const r = await creerCompte({ dossierId, email, roleId, ...(celluleId && { celluleId }) });
      setResultat({ ...r, nom: `${r.compte.prenom} ${r.compte.nom}`, email: r.compte.email });
      onCree();
    } catch (err) {
      setErreur(err instanceof Error && err.message ? err.message : 'Création impossible.');
    } finally {
      setBusy(false);
    }
  }

  // Portail : ouverte depuis un panneau « glass » (backdrop-filter), la modale
  // serait sinon positionnée par rapport au panneau, pas à l'écran.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal--sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-titre-compte"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="modal-titre-compte">Nouveau compte · {societe.nom}</h2>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        <div className="modal-body">
          {resultat ? (
            <ResultatInvitation {...resultat} onClose={onClose} />
          ) : societe.dossiersSansCompte.length === 0 ? (
            <p className="empty-state">
              Tous les dossiers RH de {societe.nom} ont déjà un compte. Créez d&rsquo;abord le dossier
              de la personne dans RH.
            </p>
          ) : (
            <form onSubmit={soumettre} style={{ display: 'grid', gap: '0.85rem' }}>
              <label className="field">
                <span className="field-label">Dossier RH</span>
                <select
                  className="field-input"
                  value={dossierId}
                  onChange={(e) => choisirDossier(e.target.value)}
                  required
                >
                  <option value="">Choisir une personne…</option>
                  {societe.dossiersSansCompte.map((d) => (
                    <option key={d.id} value={d.id}>
                      {`${d.prenom} ${d.nom}`.trim() || 'Sans nom'}
                      {d.poste ? ` · ${d.poste}` : ''} · {d.matricule}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">E-mail de connexion</span>
                <input
                  type="email"
                  className="field-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                  required
                />
              </label>
              <label className="field">
                <span className="field-label">Rôle</span>
                <select className="field-input" value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
                  <option value="">Choisir un rôle…</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {libelleRole(r.nom)}
                      {r.transverse ? ' (transverse)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Cellule</span>
                <select className="field-input" value={celluleId} onChange={(e) => setCelluleId(e.target.value)}>
                  <option value="">Aucune (direction, hors cellule)</option>
                  {societe.cellules.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
              </label>
              {erreur && (
                <p className="field-erreur" role="alert">
                  {erreur}
                </p>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-ghost btn-ghost--sm" onClick={onClose}>
                  Annuler
                </button>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? 'Création…' : 'Créer et inviter'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Lien affiché dans tous les cas : repli quand l'e-mail n'est pas parti
// (pas de serveur d'envoi configuré en local, panne du transport).
export function ResultatInvitation({
  nom,
  email,
  lien,
  emailEnvoye,
  onClose,
}: InvitationCompte & { nom: string; email: string; onClose: () => void }) {
  const [copie, setCopie] = useState(false);
  return (
    <div style={{ display: 'grid', gap: '0.85rem' }}>
      <p style={{ margin: 0 }}>
        {emailEnvoye
          ? `Invitation envoyée à ${nom} (${email}). Le lien est valable 72 h.`
          : `Compte prêt pour ${nom}, mais l’e-mail n’est pas parti. Transmettez-lui ce lien (valable 72 h) :`}
      </p>
      <div className="field" style={{ display: 'flex', gap: '0.5rem' }}>
        <input className="field-input" readOnly value={lien} aria-label="Lien d’invitation" onFocus={(e) => e.target.select()} />
        <button
          type="button"
          className="btn-ghost btn-ghost--sm"
          onClick={() => navigator.clipboard?.writeText(lien).then(() => setCopie(true))}
        >
          <Copy size={14} aria-hidden /> {copie ? 'Copié' : 'Copier'}
        </button>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn-primary" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}

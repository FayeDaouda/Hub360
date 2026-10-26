'use client';

import { useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { comparerRoles, creerCompte, libelleRole } from '@/lib/groupe';
import type { InvitationCompte, SocieteComptes } from '@/lib/types';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/feedback';
import { Field } from '@/components/ui/field';

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
      const r = await creerCompte({ dossierId, email, roleId });
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
  return (
    <Modal onClose={onClose} closeOnEscape={false} portal className="modal--sm" labelledBy="modal-titre-compte">
      <header className="modal-header">
        <h2 id="modal-titre-compte">Nouveau compte · {societe.nom}</h2>
        <CloseButton onClick={onClose} />
      </header>

      <div className="modal-body">
        {resultat ? (
          <ResultatInvitation {...resultat} onClose={onClose} />
        ) : societe.dossiersSansCompte.length === 0 ? (
          <EmptyState>
            Tous les dossiers RH de {societe.nom} ont déjà un compte. Créez d&rsquo;abord le dossier de la personne dans
            RH.
          </EmptyState>
        ) : (
          <form onSubmit={soumettre} style={{ display: 'grid', gap: '0.85rem' }}>
            <Field label="Dossier RH">
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
            </Field>
            <Field label="E-mail de connexion">
              <input
                type="email"
                className="field-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Rôle">
              <select className="field-input" value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
                <option value="">Choisir un rôle…</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {libelleRole(r.nom)}
                    {r.transverse ? ' (transverse)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            {/* Revue Dir. GC (21/10/2026) : la cellule est choisie par le Dir. GC. */}
            <p className="dmd-note">
              La cellule n’est pas choisie ici : un compte Salarié arrive dans Équipes › Salariés à affecter, et le Dir.
              GC, qui organise les cellules, est prévenu.
            </p>
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
    </Modal>
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
        <input
          className="field-input"
          readOnly
          value={lien}
          aria-label="Lien d’invitation"
          onFocus={(e) => e.target.select()}
        />
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

'use client';

import { useState, type FormEvent } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { useMajSession, useSessionCourante } from '@/lib/layout-contexte';
import { majNomAffiche, majPhoto, nomAffiche, preparerPhoto, retirerPhoto, type Profil } from '@/lib/profil';
import { AvatarPersonne } from '@/components/avatar-personne';
import { Modal, ModalHeader } from '@/components/ui/dialog';

// « Mon profil » (menu du compte, Réglages) : photo et nom affiché. La photo
// s'enregistre dès qu'elle est choisie ; le nom, au bouton. Le nom officiel
// (RH) reste dans les traces de travail — rappelé sous le champ.
export function ProfilModal({ onClose }: { onClose: () => void }) {
  const session = useSessionCourante();
  const majSession = useMajSession();
  const u = session.utilisateur;
  const nomOfficiel = `${u.prenom} ${u.nom}`.trim();
  const [nom, setNom] = useState(u.nomAffiche ?? '');
  const [enCours, setEnCours] = useState<'photo' | 'nom' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);

  // Le profil renvoyé par le serveur fait foi : la session (coquille) suit.
  function appliquer(p: Profil, message: string) {
    majSession({ ...session, utilisateur: { ...u, nomAffiche: p.nomAffiche, photoUrl: p.photoUrl } });
    setFait(message);
  }

  async function choisirPhoto(fichier: File | undefined) {
    if (!fichier) return;
    setEnCours('photo');
    setErreur(null);
    setFait(null);
    try {
      appliquer(await majPhoto(await preparerPhoto(fichier)), 'Photo enregistrée.');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Photo non enregistrée.');
    } finally {
      setEnCours(null);
    }
  }

  async function enleverPhoto() {
    setEnCours('photo');
    setErreur(null);
    setFait(null);
    try {
      appliquer(await retirerPhoto(), 'Photo retirée.');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Photo non retirée.');
    } finally {
      setEnCours(null);
    }
  }

  async function enregistrerNom(e: FormEvent) {
    e.preventDefault();
    setEnCours('nom');
    setErreur(null);
    setFait(null);
    try {
      appliquer(
        await majNomAffiche(nom.trim() || null),
        nom.trim() ? 'Nom affiché enregistré.' : 'Nom officiel rétabli.',
      );
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Nom non enregistré.');
    } finally {
      setEnCours(null);
    }
  }

  const affiche = nomAffiche(u);
  const modifie = (nom.trim() || null) !== (u.nomAffiche ?? null);

  return (
    <Modal
      onClose={onClose}
      busy={!!enCours}
      backdropClassName="modal-backdrop--premier-plan"
      className="modal--sm profil"
      labelledBy="profil-titre"
    >
      <ModalHeader title="Mon profil" titleId="profil-titre" onClose={onClose} closeDisabled={!!enCours} />
      <div className="modal-body profil-corps">
        <div className="profil-photo">
          <label className={`profil-photo-cible${enCours === 'photo' ? ' is-en-cours' : ''}`} title="Choisir une photo">
            <AvatarPersonne nom={affiche} photo={u.photoUrl} cle={u.id} taille="xl" />
            <span className="profil-photo-voile" aria-hidden>
              <Camera size={20} />
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={!!enCours}
              aria-label="Choisir une photo de profil"
              onChange={(e) => {
                void choisirPhoto(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <div className="profil-photo-actions">
            <strong>{affiche}</strong>
            <span className="po-aide">Photo carrée, recadrée automatiquement.</span>
            <span className="profil-photo-boutons">
              <label className={`btn-ghost btn-ghost--sm${enCours ? ' is-desactive' : ''}`}>
                <Camera size={14} aria-hidden /> {u.photoUrl ? 'Changer la photo' : 'Ajouter une photo'}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={!!enCours}
                  onChange={(e) => {
                    void choisirPhoto(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
              {u.photoUrl && (
                <button
                  type="button"
                  className="btn-ghost btn-ghost--sm"
                  disabled={!!enCours}
                  onClick={() => void enleverPhoto()}
                >
                  <Trash2 size={14} aria-hidden /> Retirer
                </button>
              )}
            </span>
          </div>
        </div>

        <form className="profil-nom" onSubmit={enregistrerNom}>
          <label className="po-panneau-label" htmlFor="profil-nom-affiche">
            Nom affiché
          </label>
          <input
            id="profil-nom-affiche"
            className="field-input"
            value={nom}
            maxLength={60}
            placeholder={nomOfficiel}
            onChange={(e) => setNom(e.target.value)}
          />
          <p className="po-aide">
            Votre nom dans la messagerie, les fils de discussion et les mentions. Laissez vide pour utiliser votre nom
            officiel ({nomOfficiel}), qui reste sur les validations et les documents ; pour le corriger, voyez avec la
            RH.
          </p>
          {erreur && <p className="field-erreur">{erreur}</p>}
          {fait && (
            <p className="profil-fait" role="status">
              {fait}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={!!enCours}>
              Fermer
            </button>
            <button type="submit" className="btn-primary" disabled={!!enCours || !modifie}>
              {enCours === 'nom' ? '…' : 'Enregistrer le nom'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

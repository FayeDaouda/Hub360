'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  creerCellule,
  creerCollaborateur,
  definirDispatcher,
  getCellules,
  getCollaborateurs,
  getIndicateurs,
  inviterCollaborateur,
  majCollaborateur,
  renommerCellule,
  supprimerCellule,
  supprimerCollaborateur,
} from '@/lib/equipe';
import { estImage, lireImageRedimensionnee } from '@/lib/image-fichier';
import { useSessionCourante, useTitrePage } from '@/lib/layout-contexte';
import {
  NIVEAUX_COLLABORATEUR,
  NIVEAUX_ORDRE,
  STATUTS_COMPTE,
  type Cellule,
  type Collaborateur,
  type IndicateursCollaborateur,
  type NiveauCollaborateur,
} from '@/lib/types';
import { niveauSuffisant } from '@/lib/auth';
import type { Session } from '@/lib/types';
import { ChampModal } from '@/components/admin/champ-modal';
import { ConfirmModal } from '@/components/admin/confirm-modal';
import { AbsencesADecider } from '@/components/absences/absences-a-decider';

type Props = { params: { slug: string } };

const SANS = '__sans__';

type CelluleModalEtat =
  | { mode: 'creer' }
  | { mode: 'renommer'; cel: { id: string; nom: string } };

export default function EquipePage({ params }: Props) {
  useTitrePage('Équipe');
  const ecriture = niveauEquipeEcriture(useSessionCourante());
  const [cellules, setCellules] = useState<Cellule[] | null>(null);
  const [orphelins, setOrphelins] = useState<Collaborateur[]>([]);
  const [recherche, setRecherche] = useState('');
  // Collaborateur en cours d'édition/création : { cible } = collaborateur, ou
  // { celluleId } pour une création pré-affectée. null = fermé.
  const [edite, setEdite] = useState<
    { collab: Collaborateur } | { celluleId: string | null } | null
  >(null);
  const [celluleModal, setCelluleModal] = useState<CelluleModalEtat | null>(null);
  const [suppression, setSuppression] = useState<{ id: string; nom: string } | null>(null);

  const charger = useCallback(() => {
    getCellules(params.slug).then(setCellules);
    getCollaborateurs(params.slug, { cellule: 'sans' }).then(setOrphelins);
  }, [params.slug]);

  useEffect(() => {
    charger();
  }, [charger]);

  const total = useMemo(() => {
    if (!cellules) return 0;
    return cellules.reduce((n, c) => n + c.collaborateurs.length, 0) + orphelins.length;
  }, [cellules, orphelins]);

  const q = recherche.trim().toLowerCase();
  const filtre = (c: Collaborateur) =>
    !q || `${c.prenom} ${c.nom} ${c.role}`.toLowerCase().includes(q);

  const groupes: {
    id: string;
    nom: string;
    membres: Collaborateur[];
    dispatcherId?: string | null;
  }[] = [
    ...(cellules ?? []).map((c) => ({
      id: c.id,
      nom: c.nom,
      membres: c.collaborateurs.filter(filtre),
      dispatcherId: c.dispatcherId,
    })),
    { id: SANS, nom: 'Sans cellule', membres: orphelins.filter(filtre) },
  ];

  async function changerDispatcher(celluleId: string, dispatcherId: string | null) {
    const maj = await definirDispatcher(params.slug, celluleId, dispatcherId);
    setCellules((actuel) =>
      (actuel ?? []).map((c) => (c.id === celluleId ? maj : c)),
    );
  }

  return (
    <>
      <AbsencesADecider slug={params.slug} />
      <div className="projets-toolbar">
        <div className="projets-toolbar-info">
          <input
            type="search"
            className="field-input projets-recherche"
            placeholder="Rechercher un nom, un rôle…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
          {cellules && (
            <span className="projets-compte">
              {total} collaborateur{total > 1 ? 's' : ''} · {cellules.length} cellules
            </span>
          )}
        </div>
        <div className="equipe-toolbar-actions">
          {ecriture && (
<button
            type="button"
            className="btn-ghost"
            onClick={() => setCelluleModal({ mode: 'creer' })}
          >
            <Plus size={16} strokeWidth={2} aria-hidden />
            <span>Nouvelle cellule</span>
          </button>
)}
          {ecriture && (
<button
            type="button"
            className="btn-primary"
            onClick={() => setEdite({ celluleId: null })}
          >
            <Plus size={16} strokeWidth={2} aria-hidden />
            <span>Collaborateur</span>
          </button>
)}
        </div>
      </div>

      {!cellules ? (
        <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />
      ) : (
        <div className="equipe-grille">
          {groupes.map((g) => {
            const estSans = g.id === SANS;
            if (estSans && g.membres.length === 0) return null;
            return (
              <section key={g.id} className={`equipe-cellule${estSans ? ' equipe-cellule--sans' : ''}`}>
                <header className="equipe-cellule-tete">
                  <h3>{g.nom}</h3>
                  <span className="equipe-cellule-compte">
                    {g.membres.length} collaborateur{g.membres.length > 1 ? 's' : ''}
                  </span>
                  {!estSans && (
                    <span className="equipe-cellule-actions">
                      {ecriture && (
<button
                        type="button"
                        className="lien-inline"
                        aria-label="Renommer"
                        onClick={() => setCelluleModal({ mode: 'renommer', cel: g })}
                      >
                        <Pencil size={13} strokeWidth={2} aria-hidden />
                      </button>
)}
                      {ecriture && (
<button
                        type="button"
                        className="lien-inline"
                        aria-label="Supprimer"
                        onClick={() => setSuppression(g)}
                      >
                        <Trash2 size={13} strokeWidth={2} aria-hidden />
                      </button>
)}
                    </span>
                  )}
                </header>

                {!estSans && (
                  <label className="equipe-dispatcher">
                    <span className="equipe-dispatcher-label">Dispatcher</span>
                    <select disabled={!ecriture}
                      className="field-input"
                      value={g.dispatcherId ?? ''}
                      onChange={(e) => changerDispatcher(g.id, e.target.value || null)}
                    >
                      <option value="">— Aucun —</option>
                      {(cellules?.find((c) => c.id === g.id)?.collaborateurs ?? []).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.prenom} {m.nom}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <ul className="equipe-membres">
                  {g.membres.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="equipe-membre"
                        onClick={() => setEdite({ collab: c })}
                      >
                        <span
                          className="equipe-avatar"
                          style={
                            c.photoUrl ? { backgroundImage: `url(${c.photoUrl})` } : undefined
                          }
                          aria-hidden
                        >
                          {!c.photoUrl && `${c.prenom[0] ?? ''}${c.nom[0] ?? ''}`}
                        </span>
                        <span className="equipe-membre-txt">
                          <span className="equipe-membre-nom">
                            {c.prenom} {c.nom}
                            {c.statutCompte === 'actif' && (
                              <span
                                className="equipe-compte-dot"
                                title="Compte actif"
                                aria-label="Compte actif"
                              />
                            )}
                          </span>
                          <span className="equipe-membre-role">{c.role}</span>
                        </span>
                        {(c.statutCompte === 'invite' ||
                          c.statutCompte === 'desactive') && (
                          <span className={`equipe-compte equipe-compte--${c.statutCompte}`}>
                            {STATUTS_COMPTE[c.statutCompte]}
                          </span>
                        )}
                        <span className={`equipe-niveau equipe-niveau--${c.niveau}`}>
                          {NIVEAUX_COLLABORATEUR[c.niveau]}
                        </span>
                      </button>
                    </li>
                  ))}
                  {g.membres.length === 0 && (
                    <li className="equipe-vide">
                      {q ? 'Aucun résultat.' : 'Aucun collaborateur.'}
                    </li>
                  )}
                </ul>

                {!estSans && ecriture && (
<button
                    type="button"
                    className="equipe-ajout"
                    onClick={() => setEdite({ celluleId: g.id })}
                  >
                    <Plus size={14} strokeWidth={2} aria-hidden />
                    <span>Ajouter</span>
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}

      {edite && cellules && (
        <CollaborateurModal
          slug={params.slug}
          cellules={cellules}
          initial={edite}
          onClose={() => setEdite(null)}
          onEnregistre={() => {
            setEdite(null);
            charger();
          }}
          onRefresh={charger}
          lectureSeule={!ecriture}
        />
      )}

      {celluleModal && (
        <ChampModal
          titre={celluleModal.mode === 'creer' ? 'Nouvelle cellule' : 'Renommer la cellule'}
          label="Nom de la cellule"
          placeholder="ex : Cellule Archi 5"
          valeurInitiale={celluleModal.mode === 'renommer' ? celluleModal.cel.nom : ''}
          confirmer={celluleModal.mode === 'creer' ? 'Créer' : 'Renommer'}
          onClose={() => setCelluleModal(null)}
          onSubmit={async (nom) => {
            if (celluleModal.mode === 'creer') {
              await creerCellule(params.slug, nom);
            } else {
              await renommerCellule(params.slug, celluleModal.cel.id, nom);
            }
            setCelluleModal(null);
            charger();
          }}
        />
      )}

      {suppression && (
        <ConfirmModal
          titre="Supprimer la cellule"
          danger
          confirmer="Supprimer"
          message={
            <>
              Supprimer <strong>{suppression.nom}</strong> ? Cette action est définitive.
            </>
          }
          onClose={() => setSuppression(null)}
          onConfirm={async () => {
            // Un 409 « cellule non vide » remonte ici et reste affiché dans la modale.
            await supprimerCellule(params.slug, suppression.id);
            setSuppression(null);
            charger();
          }}
        />
      )}
    </>
  );
}

// -- Modale création / édition d'un collaborateur ------------------------------

function CollaborateurModal({
  slug,
  cellules,
  initial,
  onClose,
  onEnregistre,
  onRefresh,
  lectureSeule = false,
}: {
  slug: string;
  cellules: Cellule[];
  initial: { collab: Collaborateur } | { celluleId: string | null };
  onClose: () => void;
  // Ferme la modale + recharge la grille (après un enregistrement plein).
  onEnregistre: () => void;
  // Recharge la grille en arrière-plan, modale laissée ouverte (invitation :
  // l'admin doit encore voir / copier le lien généré).
  onRefresh: () => void;
  lectureSeule?: boolean;
}) {
  const collab = 'collab' in initial ? initial.collab : null;
  const [prenom, setPrenom] = useState(collab?.prenom ?? '');
  const [nom, setNom] = useState(collab?.nom ?? '');
  const [role, setRole] = useState(collab?.role ?? '');
  const [niveau, setNiveau] = useState<NiveauCollaborateur>(collab?.niveau ?? 'confirme');
  const [celluleId, setCelluleId] = useState<string>(
    collab?.celluleId ?? ('celluleId' in initial ? (initial.celluleId ?? '') : ''),
  );
  // Entrée dans le studio — alimente l'ancienneté de « Mes indicateurs ».
  const [dateArrivee, setDateArrivee] = useState(collab?.dateArrivee ?? '');
  const [photo, setPhoto] = useState<string | null | undefined>(undefined); // undefined = inchangé
  const [apercu, setApercu] = useState<string | null>(collab?.photoUrl ?? null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [indic, setIndic] = useState<IndicateursCollaborateur | null>(null);
  const [confirmSuppr, setConfirmSuppr] = useState(false);
  const [confirmActif, setConfirmActif] = useState<boolean | null>(null);
  const [emailInvite, setEmailInvite] = useState(collab?.email ?? '');
  const [lienInvite, setLienInvite] = useState<string | null>(null);
  const [emailEnvoye, setEmailEnvoye] = useState(false); // l'email est vraiment parti
  const [compteEnCours, setCompteEnCours] = useState(false);
  const [compteErreur, setCompteErreur] = useState<string | null>(null);
  // Id du collaborateur qu'on vient de créer dans cette session de modale :
  // pose la vue « Compte & accès » sans fermer, et empêche un second create si
  // l'admin re-valide après un échec d'invitation.
  const [creeId, setCreeId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Cible des actions de compte : le collaborateur en édition, ou celui qu'on
  // vient de créer.
  const cibleId = collab?.id ?? creeId;

  useEffect(() => {
    if (collab) getIndicateurs(slug, collab.id).then(setIndic).catch(() => setIndic(null));
  }, [slug, collab]);

  async function choisirPhoto(f: File | undefined) {
    if (!f || !estImage(f)) return;
    const { url } = await lireImageRedimensionnee(f);
    setPhoto(url);
    setApercu(url);
  }

  async function envoyerInvitation() {
    if (!cibleId || !emailInvite.trim()) return;
    setCompteEnCours(true);
    setCompteErreur(null);
    try {
      const { lien, emailEnvoye } = await inviterCollaborateur(
        slug,
        cibleId,
        emailInvite.trim(),
      );
      setLienInvite(lien);
      setEmailEnvoye(emailEnvoye);
      onRefresh(); // badge de la grille -> « Invité », sans fermer la modale
    } catch (e) {
      setCompteErreur(e instanceof Error ? e.message : "L'invitation a échoué.");
    }
    setCompteEnCours(false);
  }

  // Coupe / rétablit l'accès. Lève en cas d'échec : la ConfirmModal (désactivation)
  // ou le .catch du bouton (réactivation) affiche alors le message.
  async function changerAcces(actif: boolean) {
    if (!cibleId) return;
    setCompteEnCours(true);
    setCompteErreur(null);
    try {
      await majCollaborateur(slug, cibleId, { actif });
    } finally {
      setCompteEnCours(false);
    }
    onEnregistre(); // succès -> ferme la modale + recharge la grille
  }

  // `lienInvite` non nul = une invitation vient de partir dans cette session :
  // on affiche « Invité » tout de suite, sans attendre un rechargement de la grille
  // (le `collab` reçu en prop est figé à l'ouverture de la modale). Après une
  // création, `creeId` amorce la vue compte à « sans_compte ».
  const statutCompte = lienInvite
    ? 'invite'
    : (collab?.statutCompte ?? (creeId ? 'sans_compte' : undefined));

  async function enregistrer() {
    if (!prenom.trim() || !nom.trim() || !role.trim()) {
      setErreur('Prénom, nom et rôle sont requis.');
      return;
    }
    const email = emailInvite.trim();
    if (!collab && email && !/^\S+@\S+\.\S+$/.test(email)) {
      setErreur('Adresse email invalide.');
      return;
    }
    setEnvoi(true);
    setErreur(null);
    setCompteErreur(null);

    const base = {
      prenom: prenom.trim(),
      nom: nom.trim(),
      role: role.trim(),
      niveau,
      celluleId: celluleId || null,
      dateArrivee: dateArrivee || null,
      ...(photo !== undefined ? { photo } : {}),
    };

    if (collab) {
      try {
        await majCollaborateur(slug, collab.id, base);
        onEnregistre();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Enregistrement impossible');
        setEnvoi(false);
      }
      return;
    }

    // Création. `creeId` déjà posé = create réussi à une tentative précédente
    // (seule l'invitation avait échoué) : on ne recrée pas.
    let id = creeId;
    if (!id) {
      try {
        id = (await creerCollaborateur(slug, base)).id;
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Création impossible');
        setEnvoi(false);
        return;
      }
      setCreeId(id);
      onRefresh(); // il apparaît tout de suite dans la grille
    }

    if (!email) {
      onEnregistre(); // aucune invitation demandée -> comportement d'avant
      return;
    }

    // Le collaborateur est enregistré : un échec ici ne porte que sur
    // l'invitation -> message dans le bloc compte, avec le bouton « Renvoyer ».
    try {
      const invit = await inviterCollaborateur(slug, id, email);
      setLienInvite(invit.lien);
      setEmailEnvoye(invit.emailEnvoye);
      onRefresh(); // badge « Invité »
    } catch (e) {
      setCompteErreur(
        e instanceof Error
          ? `Collaborateur créé, mais l’invitation a échoué : ${e.message}`
          : 'Collaborateur créé, mais l’invitation a échoué.',
      );
    }
    setEnvoi(false); // modale laissée ouverte : lien à copier ou invitation à refaire
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>
            {collab || creeId
              ? `${prenom} ${nom}`.trim()
              : 'Nouveau collaborateur'}
          </h2>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        <div className="modal-body">
          {/* Consultation : tous les champs et actions de compte désactivés. */}
          <fieldset disabled={lectureSeule} className="fieldset-nu">
          <div className="equipe-form-photo">
            <span
              className="equipe-avatar equipe-avatar--lg"
              style={apercu ? { backgroundImage: `url(${apercu})` } : undefined}
              aria-hidden
            >
              {!apercu && `${prenom[0] ?? ''}${nom[0] ?? ''}`}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => choisirPhoto(e.target.files?.[0])}
            />
            <button
              type="button"
              className="btn-ghost btn-ghost--sm"
              onClick={() => fileRef.current?.click()}
            >
              {apercu ? 'Changer la photo' : 'Ajouter une photo'}
            </button>
            {apercu && (
              <button
                type="button"
                className="lien-inline"
                onClick={() => {
                  setPhoto(null);
                  setApercu(null);
                }}
              >
                Retirer
              </button>
            )}
          </div>

          <div className="field-row">
            <label className="field">
              <span className="field-label">Prénom</span>
              <input className="field-input" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Nom</span>
              <input className="field-input" value={nom} onChange={(e) => setNom(e.target.value)} />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span className="field-label">Rôle (métier)</span>
              <input
                className="field-input"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Architecte, Designer, Dessinateur…"
              />
            </label>
            <label className="field">
              <span className="field-label">Niveau</span>
              <select
                className="field-input"
                value={niveau}
                onChange={(e) => setNiveau(e.target.value as NiveauCollaborateur)}
              >
                {NIVEAUX_ORDRE.map((n) => (
                  <option key={n} value={n}>
                    {NIVEAUX_COLLABORATEUR[n]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span className="field-label">Cellule</span>
              <select
                className="field-input"
                value={celluleId}
                onChange={(e) => setCelluleId(e.target.value)}
              >
                <option value="">Sans cellule</option>
                {cellules.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Date d’arrivée (facultatif)</span>
              <input
                type="date"
                className="field-input"
                value={dateArrivee}
                onChange={(e) => setDateArrivee(e.target.value)}
              />
              <span className="field-aide">
                Entrée dans le studio — sert l’ancienneté sur sa fiche indicateurs.
              </span>
            </label>
          </div>

          {!collab && !creeId && (
            <label className="field">
              <span className="field-label">Email professionnel (facultatif)</span>
              <input
                type="email"
                className="field-input"
                value={emailInvite}
                onChange={(e) => setEmailInvite(e.target.value)}
                placeholder="prenom.nom@greyconcrete.hub"
              />
              <span className="field-aide">
                Renseigné, une invitation part dès la création — par email si l’envoi est
                configuré, sinon un lien à copier s’affiche.
              </span>
            </label>
          )}

          {(collab || creeId) && (
            <div className="equipe-compte-bloc">
              <h4>Compte &amp; accès</h4>

              {(statutCompte === 'sans_compte' || statutCompte === 'invite') && (
                <>
                  <p className="cell-sub">
                    {statutCompte === 'invite'
                      ? 'Invitation envoyée — en attente d’activation par le collaborateur.'
                      : 'Aucun compte. Envoie une invitation pour lui ouvrir l’accès au hub.'}
                  </p>
                  <label className="field">
                    <span className="field-label">Email professionnel</span>
                    <input
                      type="email"
                      className="field-input"
                      value={emailInvite}
                      onChange={(e) => setEmailInvite(e.target.value)}
                      placeholder="prenom.nom@greyconcrete.hub"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-ghost btn-ghost--sm"
                    onClick={envoyerInvitation}
                    disabled={compteEnCours || !emailInvite.trim()}
                  >
                    {compteEnCours
                      ? 'Envoi…'
                      : statutCompte === 'invite'
                        ? 'Renvoyer l’invitation'
                        : 'Envoyer l’invitation'}
                  </button>
                  {lienInvite && (
                    <div className="equipe-lien-invite">
                      <p className="cell-sub">
                        {emailEnvoye ? (
                          <>
                            <span className="equipe-compte-dot" aria-hidden /> Email
                            d’invitation envoyé à {emailInvite.trim()}. Lien de secours
                            si besoin&nbsp;:
                          </>
                        ) : (
                          <>
                            L’envoi d’email n’est pas configuré — copie ce lien et
                            transmets-le au collaborateur&nbsp;:
                          </>
                        )}
                      </p>
                      <div className="equipe-lien-invite-row">
                        <code>{lienInvite}</code>
                        <button
                          type="button"
                          className="lien-inline"
                          onClick={() => navigator.clipboard?.writeText(lienInvite)}
                        >
                          Copier
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {statutCompte === 'actif' && (
                <>
                  <p className="cell-sub">
                    <span className="equipe-compte-dot" aria-hidden /> Accès actif ·{' '}
                    {collab?.email}
                  </p>
                  <button
                    type="button"
                    className="btn-ghost btn-ghost--sm btn-ghost--danger"
                    onClick={() => setConfirmActif(false)}
                    disabled={compteEnCours}
                  >
                    Désactiver l’accès
                  </button>
                </>
              )}

              {statutCompte === 'desactive' && (
                <>
                  <p className="cell-sub">
                    Accès coupé{collab?.email ? ` · ${collab.email}` : ''}. Le compte et son
                    historique sont conservés.
                  </p>
                  <button
                    type="button"
                    className="btn-ghost btn-ghost--sm"
                    onClick={() =>
                      changerAcces(true).catch((e) =>
                        setCompteErreur(
                          e instanceof Error ? e.message : 'Réactivation impossible.',
                        ),
                      )
                    }
                    disabled={compteEnCours}
                  >
                    {compteEnCours ? 'Réactivation…' : 'Réactiver l’accès'}
                  </button>
                </>
              )}

              {compteErreur && <p className="field-erreur">{compteErreur}</p>}
            </div>
          )}

          {collab && (
            <div className="equipe-indic">
              <h4>Indicateurs</h4>
              {!indic ? (
                <p className="cell-sub">Calcul…</p>
              ) : (
                <ul>
                  <li>
                    <b>{indic.projetsEnCours}</b> projet{indic.projetsEnCours > 1 ? 's' : ''} en cours
                    · <b>{indic.projetsLivres}</b> livré{indic.projetsLivres > 1 ? 's' : ''}
                  </li>
                  <li>
                    Tâches complétées :{' '}
                    {indic.mesTaches.pct === null ? (
                      <span className="cell-sub">—</span>
                    ) : (
                      <b>{indic.mesTaches.pct} %</b>
                    )}
                  </li>
                  <li>
                    En retard :{' '}
                    {indic.mesTaches.enRetard === 0 ? (
                      <span className="cell-sub">Aucune</span>
                    ) : (
                      <b>{indic.mesTaches.enRetard}</b>
                    )}
                  </li>
                  <li>
                    Respect des délais :{' '}
                    {indic.mesTaches.respectDelais.total === 0 ? (
                      <span className="cell-sub">—</span>
                    ) : (
                      <b>
                        {indic.mesTaches.respectDelais.aTemps}/
                        {indic.mesTaches.respectDelais.total}
                      </b>
                    )}
                  </li>
                </ul>
              )}
              <Link
                href={`/admin/${slug}/projets?collab=${collab.id}`}
                className="lien-inline"
              >
                Voir ses projets
              </Link>
            </div>
          )}

          </fieldset>
          {erreur && <p className="field-erreur">{erreur}</p>}

          <div className="modal-actions">
            {lectureSeule ? (
              <button type="button" className="btn-ghost" onClick={onClose}>
                Fermer
              </button>
            ) : (
            <>
            {collab && (
              <button
                type="button"
                className="btn-ghost btn-ghost--danger"
                onClick={() => setConfirmSuppr(true)}
                disabled={envoi}
              >
                Supprimer
              </button>
            )}
            {creeId && !collab ? (
              // Le collaborateur existe déjà : plus de « Enregistrer » (create
              // rejoué = doublon). Les actions de compte restent dans le bloc
              // ci-dessus ; ce bouton ne fait que fermer + rafraîchir.
              <button type="button" className="btn-primary" onClick={onEnregistre}>
                Terminer
              </button>
            ) : (
              <>
                <button type="button" className="btn-ghost" onClick={onClose}>
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={enregistrer}
                  disabled={envoi}
                >
                  {envoi ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </>
            )}
            </>
            )}
          </div>
        </div>
      </div>

      {confirmActif === false && collab && (
        <ConfirmModal
          titre="Désactiver l’accès"
          danger
          confirmer="Désactiver"
          message={
            <>
              <strong>{collab.prenom} {collab.nom}</strong> ne pourra plus se connecter et
              ses sessions ouvertes seront coupées immédiatement. Le compte et son
              historique restent en base — l’accès pourra être rétabli plus tard.
            </>
          }
          onClose={() => setConfirmActif(null)}
          onConfirm={async () => {
            // changerAcces lève en cas d'échec -> la ConfirmModal l'affiche.
            await changerAcces(false);
            setConfirmActif(null);
          }}
        />
      )}

      {confirmSuppr && collab && (
        <ConfirmModal
          titre="Supprimer le collaborateur"
          danger
          confirmer="Supprimer"
          message={
            <>
              Supprimer <strong>{collab.prenom} {collab.nom}</strong> ? Il sera retiré des
              avant-projets où il figure comme dessinateur ou responsable 3D.
            </>
          }
          onClose={() => setConfirmSuppr(false)}
          onConfirm={async () => {
            await supprimerCollaborateur(slug, collab.id);
            onEnregistre();
          }}
        />
      )}
    </div>
  );
}

// Module « équipe » de la matrice : écriture = admin ou Dir. GC ; les autres
// rôles qui y ont accès (CEO, CTO, RH, Salarié) consultent seulement.
function niveauEquipeEcriture(session: Session): boolean {
  return session.role === 'societe_admin' || niveauSuffisant(session, 'equipe', 'ecriture');
}

'use client';

import { use, useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, UserPlus } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import {
  ajouterCandidat,
  deciderEmbauche,
  deciderPoste,
  demanderPoste,
  fermerPoste,
  getCandidats,
  getRecrutement,
  noterCandidat,
  retirerCandidat,
  type Candidat,
  type Poste,
  type VueRecrutement,
} from '@/lib/recrutement';
import { useTitrePage } from '@/lib/layout-contexte';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/feedback';
import { Pill } from '@/components/ui/pill';

type Props = { params: Promise<{ slug: string }> };

const STATUT: Record<Poste['statut'], { libelle: string; tone: 'attention' | 'info' | 'succes' | 'neutre' }> = {
  a_approuver: { libelle: 'À approuver', tone: 'attention' },
  ouvert: { libelle: 'Ouvert', tone: 'info' },
  pourvu: { libelle: 'Pourvu', tone: 'succes' },
  ferme: { libelle: 'Fermé', tone: 'neutre' },
};
const ETAPES: { cle: Candidat['etape']; libelle: string }[] = [
  { cle: 'candidature', libelle: 'Candidatures' },
  { cle: 'entretien', libelle: 'Entretiens' },
  { cle: 'embauche', libelle: 'Embauchés' },
  { cle: 'refusee', libelle: 'Refusés' },
];

// Recrutement (lot 13, 01/11/2026) : Poste ouvert → Candidatures →
// Entretiens → Décision → Intégration RH (le dossier du personnel s'ouvre à
// l'embauche). Chaque bouton suit son étape de la matrice (le serveur le dit
// et revérifie). Une candidature refusée est effacée 12 mois après le refus.
export default function RecrutementPage(props: Props) {
  const { slug } = use(props.params);
  useTitrePage('Recrutement');
  const [vue, setVue] = useState<VueRecrutement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [posteOuvert, setPosteOuvert] = useState<string | null>(null);
  const [nouveauPoste, setNouveauPoste] = useState(false);

  const charger = useCallback(() => {
    getRecrutement(slug)
      .then((v) => {
        setVue(v);
        setErreur(null);
      })
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Recrutement indisponible.'));
  }, [slug]);
  useEffect(charger, [charger]);

  async function agir(f: () => Promise<unknown>) {
    try {
      await f();
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'L’action a échoué.');
    }
  }

  if (!vue) return erreur ? <FieldError>{erreur}</FieldError> : <Skeleton size="sm" />;
  const poste = vue.postes.find((p) => p.id === posteOuvert) ?? null;

  return (
    <div className="recrutement">
      <div className="annonces-barre">
        <p className="annonces-intro">
          Poste ouvert, puis candidatures, entretiens, décision ; l’embauche ouvre le dossier du personnel.
        </p>
        {vue.droits.demanderPoste && (
          <button type="button" className="btn-primary" onClick={() => setNouveauPoste(true)}>
            <Plus size={16} aria-hidden /> {vue.droits.approuverPoste ? 'Ouvrir un poste' : 'Demander un poste'}
          </button>
        )}
      </div>
      {erreur && <FieldError>{erreur}</FieldError>}

      {vue.postes.length === 0 ? (
        <p className="pi-aide">Aucun poste pour l’instant.</p>
      ) : (
        <div className="recrutement-postes">
          {vue.postes.map((p) => (
            <article key={p.id} className={`annonce recrutement-poste${p.id === posteOuvert ? ' is-actif' : ''}`}>
              <header className="annonce-tete">
                <h3>{p.intitule}</h3>
                <span className="annonce-meta">
                  {p.equipe ? `${p.equipe} · ` : ''}demandé par {p.demandePar}
                </span>
              </header>
              <div className="annonce-actions">
                <Pill tone={STATUT[p.statut].tone}>{STATUT[p.statut].libelle}</Pill>
                <span className="annonce-meta">
                  {p.candidats.candidature} candidature(s) · {p.candidats.entretien} en entretien
                </span>
              </div>
              {p.motifRefus && <p className="annonce-meta">Refusé : {p.motifRefus}</p>}
              <div className="annonce-actions">
                {p.statut === 'a_approuver' && vue.droits.approuverPoste && (
                  <>
                    <button
                      type="button"
                      className="btn-primary btn-primary--sm"
                      onClick={() => agir(() => deciderPoste(slug, p.id, true))}
                    >
                      Approuver
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-ghost--sm"
                      onClick={() => {
                        const motif = window.prompt('Motif du refus');
                        if (motif) void agir(() => deciderPoste(slug, p.id, false, motif));
                      }}
                    >
                      Refuser
                    </button>
                  </>
                )}
                {vue.droits.voirCandidats && p.statut !== 'a_approuver' && (
                  <button
                    type="button"
                    className="btn-ghost btn-ghost--sm"
                    onClick={() => setPosteOuvert(p.id === posteOuvert ? null : p.id)}
                  >
                    {p.id === posteOuvert ? 'Masquer les candidats' : 'Voir les candidats'}
                  </button>
                )}
                {vue.droits.fermerPoste && (p.statut === 'ouvert' || p.statut === 'pourvu') && (
                  <button
                    type="button"
                    className="btn-ghost btn-ghost--sm"
                    onClick={() => agir(() => fermerPoste(slug, p.id))}
                  >
                    Fermer
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {poste && <Candidats slug={slug} poste={poste} droits={vue.droits} onMaj={charger} />}
      {nouveauPoste && (
        <NouveauPoste
          equipes={vue.equipes}
          direct={vue.droits.approuverPoste}
          onClose={() => setNouveauPoste(false)}
          onEnvoyer={async (p) => {
            await demanderPoste(slug, p);
            setNouveauPoste(false);
            charger();
          }}
        />
      )}
    </div>
  );
}

function Candidats({
  slug,
  poste,
  droits,
  onMaj,
}: {
  slug: string;
  poste: Poste;
  droits: VueRecrutement['droits'];
  onMaj: () => void;
}) {
  const [liste, setListe] = useState<Candidat[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ajout, setAjout] = useState(false);

  const charger = useCallback(() => {
    getCandidats(slug, poste.id)
      .then(setListe)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Candidats indisponibles.'));
  }, [slug, poste.id]);
  useEffect(charger, [charger]);

  async function agir(f: () => Promise<unknown>) {
    try {
      await f();
      charger();
      onMaj();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'L’action a échoué.');
    }
  }

  return (
    <section className="panel glass-panel recrutement-candidats" aria-label={`Candidats · ${poste.intitule}`}>
      <div className="annonces-barre">
        <h2>Candidats · {poste.intitule}</h2>
        {droits.gererCandidats && poste.statut === 'ouvert' && (
          <button type="button" className="btn-ghost" onClick={() => setAjout(true)}>
            <UserPlus size={16} aria-hidden /> Ajouter un candidat
          </button>
        )}
      </div>
      {erreur && <FieldError>{erreur}</FieldError>}
      {!liste ? (
        <Skeleton size="sm" />
      ) : (
        <div className="recrutement-colonnes">
          {ETAPES.map((e) => (
            <div key={e.cle} className="recrutement-colonne">
              <h3>
                {e.libelle} · {liste.filter((c) => c.etape === e.cle).length}
              </h3>
              {liste
                .filter((c) => c.etape === e.cle)
                .map((c) => (
                  <div key={c.id} className="agenda-element">
                    <strong>
                      {c.prenom} {c.nom}
                    </strong>
                    {(c.email || c.telephone) && (
                      <span className="agenda-detail">{[c.email, c.telephone].filter(Boolean).join(' · ')}</span>
                    )}
                    {c.notes && <span className="agenda-detail recrutement-notes">{c.notes}</span>}
                    {c.motif && <span className="agenda-detail">Motif : {c.motif}</span>}
                    {c.dossierId && <span className="agenda-detail">Dossier du personnel ouvert</span>}
                    <div className="annonce-actions">
                      {droits.gererCandidats && (c.etape === 'candidature' || c.etape === 'entretien') && (
                        <button
                          type="button"
                          className="btn-ghost btn-ghost--sm"
                          onClick={() => {
                            const note = window.prompt(
                              c.etape === 'candidature' ? 'Note (passage en entretien)' : 'Note d’entretien',
                            );
                            if (note) void agir(() => noterCandidat(slug, c.id, note, c.etape === 'candidature'));
                          }}
                        >
                          {c.etape === 'candidature' ? 'Passer en entretien' : 'Ajouter une note'}
                        </button>
                      )}
                      {droits.decider && c.etape === 'entretien' && (
                        <>
                          <button
                            type="button"
                            className="btn-primary btn-primary--sm"
                            onClick={() => {
                              const dateEntree = window.prompt('Date d’entrée (AAAA-MM-JJ)');
                              if (dateEntree)
                                void agir(() => deciderEmbauche(slug, c.id, { embaucher: true, dateEntree }));
                            }}
                          >
                            Embaucher
                          </button>
                          <button
                            type="button"
                            className="btn-ghost btn-ghost--sm"
                            onClick={() => {
                              const motif = window.prompt('Motif du refus');
                              if (motif) void agir(() => deciderEmbauche(slug, c.id, { embaucher: false, motif }));
                            }}
                          >
                            Refuser
                          </button>
                        </>
                      )}
                      {droits.retirerCandidats && c.etape !== 'embauche' && (
                        <button
                          type="button"
                          className="btn-ghost btn-ghost--sm"
                          onClick={() => agir(() => retirerCandidat(slug, c.id))}
                        >
                          Retirer
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
      {ajout && (
        <NouveauCandidat
          onClose={() => setAjout(false)}
          onEnvoyer={async (c) => {
            await ajouterCandidat(slug, poste.id, c);
            setAjout(false);
            charger();
            onMaj();
          }}
        />
      )}
    </section>
  );
}

function NouveauPoste({
  equipes,
  direct,
  onClose,
  onEnvoyer,
}: {
  equipes: { id: string; nom: string }[];
  direct: boolean;
  onClose: () => void;
  onEnvoyer: (p: { intitule: string; description?: string; celluleId?: string }) => Promise<void>;
}) {
  const [intitule, setIntitule] = useState('');
  const [description, setDescription] = useState('');
  const [celluleId, setCelluleId] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    try {
      await onEnvoyer({ intitule, description: description || undefined, celluleId: celluleId || undefined });
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Le poste n’a pas été créé.');
      setEnvoi(false);
    }
  }
  return (
    <Modal onClose={onClose} busy={envoi} portal labelledBy="poste-titre">
      <header className="modal-header">
        <h2 id="poste-titre">{direct ? 'Ouvrir un poste' : 'Demander l’ouverture d’un poste'}</h2>
        <CloseButton onClick={onClose} disabled={envoi} />
      </header>
      <form className="modal-body annonce-formulaire" onSubmit={envoyer}>
        <Field label="Intitulé du poste">
          <input
            className="field-input"
            value={intitule}
            onChange={(e) => setIntitule(e.target.value)}
            required
            minLength={2}
          />
        </Field>
        <Field label="Équipe (facultatif)">
          <select className="field-input" value={celluleId} onChange={(e) => setCelluleId(e.target.value)}>
            <option value="">—</option>
            {equipes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.nom}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description (facultatif)">
          <textarea
            className="field-input"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        {!direct && <p className="pi-aide">Le poste s’ouvrira après approbation.</p>}
        {erreur && <FieldError>{erreur}</FieldError>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={envoi}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={envoi}>
            {direct ? 'Ouvrir' : 'Envoyer la demande'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NouveauCandidat({
  onClose,
  onEnvoyer,
}: {
  onClose: () => void;
  onEnvoyer: (c: { prenom: string; nom: string; email?: string; telephone?: string; notes?: string }) => Promise<void>;
}) {
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [notes, setNotes] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    try {
      await onEnvoyer({
        prenom,
        nom,
        email: email || undefined,
        telephone: telephone || undefined,
        notes: notes || undefined,
      });
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Le candidat n’a pas été ajouté.');
      setEnvoi(false);
    }
  }
  return (
    <Modal onClose={onClose} busy={envoi} portal labelledBy="candidat-titre">
      <header className="modal-header">
        <h2 id="candidat-titre">Ajouter un candidat</h2>
        <CloseButton onClick={onClose} disabled={envoi} />
      </header>
      <form className="modal-body annonce-formulaire" onSubmit={envoyer}>
        <div className="agenda-formulaire-ligne recrutement-ligne">
          <Field label="Prénom">
            <input className="field-input" value={prenom} onChange={(e) => setPrenom(e.target.value)} required />
          </Field>
          <Field label="Nom">
            <input className="field-input" value={nom} onChange={(e) => setNom(e.target.value)} required />
          </Field>
        </div>
        <Field label="E-mail (facultatif)">
          <input type="email" className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Téléphone (facultatif)">
          <input className="field-input" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
        </Field>
        <Field label="Notes (facultatif)">
          <textarea className="field-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <p className="pi-aide">Une candidature refusée est effacée 12 mois après le refus.</p>
        {erreur && <FieldError>{erreur}</FieldError>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={envoi}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={envoi}>
            Ajouter
          </button>
        </div>
      </form>
    </Modal>
  );
}

'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { Briefcase, CalendarClock, Plus, UserCheck, UserPlus } from 'lucide-react';
import { formatTime, formatWeekdayDayMonth, plural, todayIso } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import {
  ajouterCandidat,
  deciderEmbauche,
  deciderPoste,
  demanderPoste,
  embaucheDirecte,
  fermerPoste,
  getCandidats,
  getRecrutement,
  getRecrutementGroupe,
  noterCandidat,
  planifierEntretien,
  retirerCandidat,
  type Candidat,
  type EmbaucheDirecte,
  type Poste,
  type RecrutementSociete,
  type VueRecrutement,
} from '@/lib/recrutement';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/feedback';
import { Pill } from '@/components/ui/pill';

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
const message = (e: unknown, defaut: string) => (e instanceof ApiError ? e.message : defaut);

// Une saisie demandée par un bouton (motif, note, date d'entrée).
type Saisie = {
  titre: string;
  label: string;
  type: 'texte' | 'date';
  bouton: string;
  envoyer: (valeur: string) => Promise<unknown>;
};

// Recrutement (lot 13, 01/11/2026) : Poste ouvert → Candidatures →
// Entretiens → Décision → Intégration RH (le dossier du personnel s'ouvre à
// l'embauche). Côté RH (01/11/2026) : « Recruter » propose l'embauche directe
// ou l'ouverture d'un poste ; l'entretien est un rendez-vous de l'Agenda ; la
// RH voit aussi les recrutements de toutes les sociétés. Même vue dans le
// module Recrutement et dans l'onglet de la page RH. Chaque bouton suit son
// étape de la matrice (le serveur le dit et revérifie).
export function RecrutementVue({ slug }: { slug: string }) {
  const [vue, setVue] = useState<VueRecrutement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [posteOuvert, setPosteOuvert] = useState<string | null>(null);
  const [portee, setPortee] = useState<'societe' | 'groupe'>('societe');
  const [fenetre, setFenetre] = useState<'choix' | 'direct' | 'poste' | null>(null);
  const [saisie, setSaisie] = useState<Saisie | null>(null);
  const [embauche, setEmbauche] = useState<{ nom: string; dossierId: string } | null>(null);

  const charger = useCallback(() => {
    getRecrutement(slug)
      .then((v) => {
        setVue(v);
        setErreur(null);
      })
      .catch((e) => setErreur(message(e, 'Recrutement indisponible.')));
  }, [slug]);
  useEffect(charger, [charger]);

  async function agir(f: () => Promise<unknown>) {
    try {
      await f();
      charger();
    } catch (e) {
      setErreur(message(e, 'L’action a échoué.'));
    }
  }

  if (!vue) return erreur ? <FieldError>{erreur}</FieldError> : <Skeleton size="sm" />;
  const poste = vue.postes.find((p) => p.id === posteOuvert) ?? null;
  const { droits } = vue;
  // « Recruter » : le choix des deux chemins, ou directement le seul permis.
  const recruter =
    droits.embaucheDirecte && droits.demanderPoste ? 'choix' : droits.embaucheDirecte ? 'direct' : 'poste';

  return (
    <div className="recrutement">
      <div className="annonces-barre">
        <p className="annonces-intro">
          Embauche directe, ou poste ouvert puis candidatures, entretiens et décision ; l’embauche ouvre le dossier du
          personnel.
        </p>
        <div className="recrutement-actions">
          {droits.voirGroupe && (
            <div className="vue-toggle" role="radiogroup" aria-label="Portée">
              {(
                [
                  ['societe', 'Cette société'],
                  ['groupe', 'Toutes les sociétés'],
                ] as const
              ).map(([cle, libelle]) => (
                <button
                  key={cle}
                  type="button"
                  role="radio"
                  aria-checked={portee === cle}
                  className={portee === cle ? 'is-active' : ''}
                  onClick={() => setPortee(cle)}
                >
                  {libelle}
                </button>
              ))}
            </div>
          )}
          {(droits.embaucheDirecte || droits.demanderPoste) && portee === 'societe' && (
            <button type="button" className="btn-primary" onClick={() => setFenetre(recruter)}>
              <Plus size={16} aria-hidden />{' '}
              {recruter === 'poste' && !droits.approuverPoste ? 'Demander un poste' : 'Recruter'}
            </button>
          )}
        </div>
      </div>
      {erreur && <FieldError>{erreur}</FieldError>}
      {embauche && (
        <p className="recrutement-succes" role="status">
          <UserCheck size={16} aria-hidden /> Dossier du personnel ouvert pour {embauche.nom}.{' '}
          <Link href={`/admin/${slug}/rh?dossier=${embauche.dossierId}`}>Le compléter dans RH</Link>
        </p>
      )}

      {portee === 'groupe' ? (
        <RecrutementGroupe slug={slug} />
      ) : vue.postes.length === 0 ? (
        <p className="pi-aide">Aucun poste pour l’instant.</p>
      ) : (
        <div className="recrutement-postes">
          {vue.postes.map((p) => (
            <article key={p.id} className={`annonce recrutement-poste${p.id === posteOuvert ? ' is-actif' : ''}`}>
              <header className="annonce-tete">
                <h3>{p.intitule}</h3>
                <span className="annonce-meta">
                  {p.equipe ? `${p.equipe} · ` : ''}
                  {p.direct ? `embauche directe par ${p.demandePar}` : `demandé par ${p.demandePar}`}
                </span>
              </header>
              <div className="annonce-actions">
                <Pill tone={STATUT[p.statut].tone}>{STATUT[p.statut].libelle}</Pill>
                {!p.direct && (
                  <span className="annonce-meta">
                    {plural(p.candidats.candidature, 'candidature')} · {p.candidats.entretien} en entretien
                  </span>
                )}
              </div>
              {p.motifRefus && <p className="annonce-meta">Refusé : {p.motifRefus}</p>}
              <div className="annonce-actions">
                {p.statut === 'a_approuver' && droits.approuverPoste && (
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
                      onClick={() =>
                        setSaisie({
                          titre: `Refuser le poste · ${p.intitule}`,
                          label: 'Motif du refus',
                          type: 'texte',
                          bouton: 'Refuser',
                          envoyer: (motif) => deciderPoste(slug, p.id, false, motif),
                        })
                      }
                    >
                      Refuser
                    </button>
                  </>
                )}
                {droits.voirCandidats && p.statut !== 'a_approuver' && (
                  <button
                    type="button"
                    className="btn-ghost btn-ghost--sm"
                    onClick={() => setPosteOuvert(p.id === posteOuvert ? null : p.id)}
                  >
                    {p.id === posteOuvert ? 'Masquer les candidats' : 'Voir les candidats'}
                  </button>
                )}
                {droits.fermerPoste && (p.statut === 'ouvert' || p.statut === 'pourvu') && (
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

      {poste && portee === 'societe' && (
        <Candidats slug={slug} poste={poste} vue={vue} onSaisie={setSaisie} onMaj={charger} />
      )}

      {fenetre === 'choix' && (
        <ChoixRecrutement
          ouvreDirect={droits.approuverPoste}
          onClose={() => setFenetre(null)}
          onChoix={(c) => setFenetre(c)}
        />
      )}
      {fenetre === 'direct' && (
        <EmbaucheDirecteModal
          equipes={vue.equipes}
          onClose={() => setFenetre(null)}
          onEnvoyer={async (e) => {
            const r = await embaucheDirecte(slug, e);
            setFenetre(null);
            setEmbauche({ nom: `${e.prenom} ${e.nom}`, dossierId: r.dossierId });
            charger();
          }}
        />
      )}
      {fenetre === 'poste' && (
        <NouveauPoste
          equipes={vue.equipes}
          direct={droits.approuverPoste}
          onClose={() => setFenetre(null)}
          onEnvoyer={async (p) => {
            await demanderPoste(slug, p);
            setFenetre(null);
            charger();
          }}
        />
      )}
      {saisie && (
        <SaisieModal
          saisie={saisie}
          onClose={() => setSaisie(null)}
          onFait={() => {
            setSaisie(null);
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
  vue,
  onSaisie,
  onMaj,
}: {
  slug: string;
  poste: Poste;
  vue: VueRecrutement;
  onSaisie: (s: Saisie) => void;
  onMaj: () => void;
}) {
  const { droits } = vue;
  const [liste, setListe] = useState<Candidat[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ajout, setAjout] = useState(false);
  const [entretien, setEntretien] = useState<Candidat | null>(null);

  const charger = useCallback(() => {
    getCandidats(slug, poste.id)
      .then(setListe)
      .catch((e) => setErreur(message(e, 'Candidats indisponibles.')));
  }, [slug, poste.id]);
  useEffect(charger, [charger]);

  async function agir(f: () => Promise<unknown>) {
    try {
      await f();
      charger();
      onMaj();
    } catch (e) {
      setErreur(message(e, 'L’action a échoué.'));
    }
  }
  // Une saisie qui recharge aussi la liste des candidats.
  const saisir = (s: Saisie) =>
    onSaisie({
      ...s,
      envoyer: async (v) => {
        await s.envoyer(v);
        charger();
      },
    });

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
                .map((c) => {
                  const enCours = c.etape === 'candidature' || c.etape === 'entretien';
                  const nom = `${c.prenom} ${c.nom}`;
                  return (
                    <div key={c.id} className="agenda-element">
                      <strong>{nom}</strong>
                      {(c.email || c.telephone) && (
                        <span className="agenda-detail">{[c.email, c.telephone].filter(Boolean).join(' · ')}</span>
                      )}
                      {c.entretien && enCours && (
                        <span className="agenda-detail recrutement-entretien">
                          <CalendarClock size={13} aria-hidden /> {formatWeekdayDayMonth(c.entretien.debut)},{' '}
                          {formatTime(c.entretien.debut)} – {formatTime(c.entretien.fin)}
                          {c.entretien.lieu ? ` · ${c.entretien.lieu}` : ''}
                        </span>
                      )}
                      {c.notes && <span className="agenda-detail recrutement-notes">{c.notes}</span>}
                      {c.motif && <span className="agenda-detail">Motif : {c.motif}</span>}
                      {c.dossierId && <span className="agenda-detail">Dossier du personnel ouvert</span>}
                      <div className="annonce-actions">
                        {droits.gererCandidats && enCours && (
                          <>
                            <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setEntretien(c)}>
                              {c.entretien ? 'Replanifier' : 'Planifier l’entretien'}
                            </button>
                            <button
                              type="button"
                              className="btn-ghost btn-ghost--sm"
                              onClick={() =>
                                saisir({
                                  titre: `Note · ${nom}`,
                                  label: c.etape === 'entretien' ? 'Note d’entretien' : 'Note',
                                  type: 'texte',
                                  bouton: 'Ajouter',
                                  envoyer: (note) => noterCandidat(slug, c.id, note),
                                })
                              }
                            >
                              Ajouter une note
                            </button>
                          </>
                        )}
                        {droits.decider && c.etape === 'entretien' && (
                          <>
                            <button
                              type="button"
                              className="btn-primary btn-primary--sm"
                              onClick={() =>
                                saisir({
                                  titre: `Embaucher ${nom}`,
                                  label: 'Date d’entrée',
                                  type: 'date',
                                  bouton: 'Embaucher',
                                  envoyer: (dateEntree) => deciderEmbauche(slug, c.id, { embaucher: true, dateEntree }),
                                })
                              }
                            >
                              Embaucher
                            </button>
                            <button
                              type="button"
                              className="btn-ghost btn-ghost--sm"
                              onClick={() =>
                                saisir({
                                  titre: `Ne pas retenir ${nom}`,
                                  label: 'Motif du refus',
                                  type: 'texte',
                                  bouton: 'Refuser',
                                  envoyer: (motif) => deciderEmbauche(slug, c.id, { embaucher: false, motif }),
                                })
                              }
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
                  );
                })}
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
      {entretien && (
        <EntretienModal
          candidat={entretien}
          personnes={vue.personnes}
          onClose={() => setEntretien(null)}
          onEnvoyer={async (e) => {
            await planifierEntretien(slug, entretien.id, e);
            setEntretien(null);
            charger();
            onMaj();
          }}
        />
      )}
    </section>
  );
}

// Toutes les sociétés du groupe : postes en cours et embauches des 12
// derniers mois (lecture seule ; on agit dans l'espace de la société).
function RecrutementGroupe({ slug }: { slug: string }) {
  const [societes, setSocietes] = useState<RecrutementSociete[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    getRecrutementGroupe(slug)
      .then(setSocietes)
      .catch((e) => setErreur(message(e, 'Recrutements du groupe indisponibles.')));
  }, [slug]);
  if (!societes) return erreur ? <FieldError>{erreur}</FieldError> : <Skeleton size="sm" />;
  return (
    <div className="recrutement-groupe">
      {societes.map((s) => (
        <section key={s.societe.id} className="annonce recrutement-groupe-societe">
          <header className="annonce-tete">
            <h3>{s.societe.nom}</h3>
            <span className="annonce-meta">
              {plural(s.postes.length, 'poste')} en cours · {plural(s.embauches12Mois, 'embauche')} sur 12 mois
            </span>
          </header>
          {s.postes.length === 0 ? (
            <p className="pi-aide">Aucun poste en cours.</p>
          ) : (
            <ul className="recrutement-groupe-postes">
              {s.postes.map((p) => (
                <li key={p.id}>
                  <strong>{p.intitule}</strong>
                  <span className="annonce-meta">
                    {plural(p.candidature, 'candidature')} · {p.entretien} en entretien
                  </span>
                  <Pill tone={STATUT[p.statut].tone}>{STATUT[p.statut].libelle}</Pill>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function Fenetre({
  id,
  titre,
  envoi,
  onClose,
  children,
}: {
  id: string;
  titre: ReactNode;
  envoi: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal onClose={onClose} busy={envoi} portal labelledBy={id}>
      <header className="modal-header">
        <h2 id={id}>{titre}</h2>
        <CloseButton onClick={onClose} disabled={envoi} />
      </header>
      {children}
    </Modal>
  );
}

function Actions({ envoi, bouton, onClose }: { envoi: boolean; bouton: string; onClose: () => void }) {
  return (
    <div className="modal-actions">
      <button type="button" className="btn-ghost" onClick={onClose} disabled={envoi}>
        Annuler
      </button>
      <button type="submit" className="btn-primary" disabled={envoi}>
        {envoi ? 'Envoi…' : bouton}
      </button>
    </div>
  );
}

// Envoi d'un formulaire : erreur affichée, fenêtre gardée ouverte.
function useEnvoi(defaut: string) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  async function lancer(e: FormEvent, f: () => Promise<unknown>) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await f();
    } catch (err) {
      setErreur(message(err, defaut));
      setEnvoi(false);
    }
  }
  return { envoi, erreur, lancer };
}

function ChoixRecrutement({
  ouvreDirect,
  onClose,
  onChoix,
}: {
  ouvreDirect: boolean;
  onClose: () => void;
  onChoix: (c: 'direct' | 'poste') => void;
}) {
  return (
    <Fenetre id="recruter-titre" titre="Recruter" envoi={false} onClose={onClose}>
      <div className="modal-body recrutement-choix">
        <button type="button" className="recrutement-choix-carte" onClick={() => onChoix('direct')}>
          <UserCheck size={20} aria-hidden />
          <strong>Embauche directe</strong>
          <span>
            La personne est déjà choisie : son dossier du personnel s’ouvre tout de suite, l’intégration suit.
            L’embauche reste tracée dans Recrutement.
          </span>
        </button>
        <button type="button" className="recrutement-choix-carte" onClick={() => onChoix('poste')}>
          <Briefcase size={20} aria-hidden />
          <strong>{ouvreDirect ? 'Ouvrir un poste' : 'Demander un poste'}</strong>
          <span>
            Le circuit complet : {ouvreDirect ? 'poste ouvert' : 'poste à approuver'}, candidatures, entretiens dans
            l’Agenda, décision, puis intégration.
          </span>
        </button>
      </div>
    </Fenetre>
  );
}

function EmbaucheDirecteModal({
  equipes,
  onClose,
  onEnvoyer,
}: {
  equipes: { id: string; nom: string }[];
  onClose: () => void;
  onEnvoyer: (e: EmbaucheDirecte) => Promise<void>;
}) {
  const [f, setF] = useState({
    prenom: '',
    nom: '',
    intitule: '',
    dateEntree: todayIso(),
    celluleId: '',
    email: '',
    telephone: '',
  });
  const { envoi, erreur, lancer } = useEnvoi('L’embauche n’a pas été enregistrée.');
  const champ = (cle: keyof typeof f) => ({
    className: 'field-input',
    value: f[cle],
    onChange: (e: { target: { value: string } }) => setF((x) => ({ ...x, [cle]: e.target.value })),
  });
  return (
    <Fenetre id="direct-titre" titre="Embauche directe" envoi={envoi} onClose={onClose}>
      <form
        className="modal-body annonce-formulaire"
        onSubmit={(e) =>
          lancer(e, () =>
            onEnvoyer({
              prenom: f.prenom,
              nom: f.nom,
              intitule: f.intitule,
              dateEntree: f.dateEntree,
              celluleId: f.celluleId || undefined,
              email: f.email || undefined,
              telephone: f.telephone || undefined,
            }),
          )
        }
      >
        <div className="agenda-formulaire-ligne recrutement-ligne">
          <Field label="Prénom">
            <input {...champ('prenom')} required />
          </Field>
          <Field label="Nom">
            <input {...champ('nom')} required />
          </Field>
        </div>
        <div className="agenda-formulaire-ligne recrutement-ligne">
          <Field label="Poste">
            <input {...champ('intitule')} required minLength={2} />
          </Field>
          <Field label="Date d’entrée">
            <input type="date" {...champ('dateEntree')} required />
          </Field>
        </div>
        <Field label="Équipe (facultatif)">
          <select {...champ('celluleId')}>
            <option value="">—</option>
            {equipes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.nom}
              </option>
            ))}
          </select>
        </Field>
        <div className="agenda-formulaire-ligne recrutement-ligne">
          <Field label="E-mail (facultatif)">
            <input type="email" {...champ('email')} />
          </Field>
          <Field label="Téléphone (facultatif)">
            <input {...champ('telephone')} />
          </Field>
        </div>
        <p className="pi-aide">Le dossier du personnel s’ouvre tout de suite ; la RH le complète.</p>
        {erreur && <FieldError>{erreur}</FieldError>}
        <Actions envoi={envoi} bouton="Embaucher" onClose={onClose} />
      </form>
    </Fenetre>
  );
}

// Entretien : un rendez-vous de l'Agenda (heure de Dakar = UTC) ; le
// demandeur du poste est invité d'office par le serveur.
function EntretienModal({
  candidat,
  personnes,
  onClose,
  onEnvoyer,
}: {
  candidat: Candidat;
  personnes: { id: string; nom: string }[];
  onClose: () => void;
  onEnvoyer: (e: { debut: string; fin: string; lieu?: string; inviteIds: string[] }) => Promise<void>;
}) {
  const [date, setDate] = useState(candidat.entretien?.debut.slice(0, 10) ?? todayIso());
  const [debut, setDebut] = useState(candidat.entretien?.debut.slice(11, 16) ?? '10:00');
  const [fin, setFin] = useState(candidat.entretien?.fin.slice(11, 16) ?? '11:00');
  const [lieu, setLieu] = useState(candidat.entretien?.lieu ?? '');
  const [invites, setInvites] = useState<string[]>([]);
  const { envoi, erreur, lancer } = useEnvoi('L’entretien n’a pas été planifié.');
  return (
    <Fenetre
      id="entretien-titre"
      titre={
        <>
          <CalendarClock size={18} aria-hidden /> Entretien · {candidat.prenom} {candidat.nom}
        </>
      }
      envoi={envoi}
      onClose={onClose}
    >
      <form
        className="modal-body agenda-formulaire"
        onSubmit={(e) =>
          lancer(e, () =>
            onEnvoyer({
              debut: `${date}T${debut}:00.000Z`,
              fin: `${date}T${fin}:00.000Z`,
              lieu: lieu || undefined,
              inviteIds: invites,
            }),
          )
        }
      >
        <div className="agenda-formulaire-ligne">
          <Field label="Date">
            <input
              type="date"
              className="field-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </Field>
          <Field label="Début">
            <input
              type="time"
              className="field-input"
              value={debut}
              onChange={(e) => setDebut(e.target.value)}
              required
            />
          </Field>
          <Field label="Fin">
            <input type="time" className="field-input" value={fin} onChange={(e) => setFin(e.target.value)} required />
          </Field>
        </div>
        <Field label="Lieu (facultatif)">
          <input className="field-input" value={lieu} onChange={(e) => setLieu(e.target.value)} />
        </Field>
        {personnes.length > 0 && (
          <fieldset className="agenda-invites">
            <legend className="field-label">Inviter aussi (facultatif)</legend>
            {personnes.map((p) => (
              <label key={p.id} className="agenda-invite">
                <input
                  type="checkbox"
                  checked={invites.includes(p.id)}
                  onChange={() => setInvites((l) => (l.includes(p.id) ? l.filter((x) => x !== p.id) : [...l, p.id]))}
                />
                {p.nom}
              </label>
            ))}
          </fieldset>
        )}
        <p className="pi-aide">
          L’entretien s’ajoute à l’Agenda ; le demandeur du poste et les invités sont prévenus.
          {candidat.entretien ? ' L’entretien déjà prévu est annulé.' : ''}
        </p>
        {erreur && <FieldError>{erreur}</FieldError>}
        <Actions envoi={envoi} bouton={candidat.entretien ? 'Replanifier' : 'Planifier'} onClose={onClose} />
      </form>
    </Fenetre>
  );
}

function SaisieModal({ saisie, onClose, onFait }: { saisie: Saisie; onClose: () => void; onFait: () => void }) {
  const [valeur, setValeur] = useState(saisie.type === 'date' ? todayIso() : '');
  const { envoi, erreur, lancer } = useEnvoi('L’action a échoué.');
  return (
    <Fenetre id="saisie-titre" titre={saisie.titre} envoi={envoi} onClose={onClose}>
      <form
        className="modal-body annonce-formulaire"
        onSubmit={(e) =>
          lancer(e, async () => {
            await saisie.envoyer(valeur.trim());
            onFait();
          })
        }
      >
        <Field label={saisie.label}>
          {saisie.type === 'date' ? (
            <input
              type="date"
              className="field-input"
              value={valeur}
              onChange={(e) => setValeur(e.target.value)}
              required
            />
          ) : (
            <textarea
              className="field-input"
              rows={3}
              value={valeur}
              onChange={(e) => setValeur(e.target.value)}
              required
              minLength={3}
            />
          )}
        </Field>
        {erreur && <FieldError>{erreur}</FieldError>}
        <Actions envoi={envoi} bouton={saisie.bouton} onClose={onClose} />
      </form>
    </Fenetre>
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
  const { envoi, erreur, lancer } = useEnvoi('Le poste n’a pas été créé.');
  return (
    <Fenetre
      id="poste-titre"
      titre={direct ? 'Ouvrir un poste' : 'Demander l’ouverture d’un poste'}
      envoi={envoi}
      onClose={onClose}
    >
      <form
        className="modal-body annonce-formulaire"
        onSubmit={(e) =>
          lancer(e, () =>
            onEnvoyer({ intitule, description: description || undefined, celluleId: celluleId || undefined }),
          )
        }
      >
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
        <p className="pi-aide">
          {direct ? 'La RH est prévenue pour trouver des candidats.' : 'Le poste s’ouvrira après approbation.'}
        </p>
        {erreur && <FieldError>{erreur}</FieldError>}
        <Actions envoi={envoi} bouton={direct ? 'Ouvrir' : 'Envoyer la demande'} onClose={onClose} />
      </form>
    </Fenetre>
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
  const { envoi, erreur, lancer } = useEnvoi('Le candidat n’a pas été ajouté.');
  return (
    <Fenetre id="candidat-titre" titre="Ajouter un candidat" envoi={envoi} onClose={onClose}>
      <form
        className="modal-body annonce-formulaire"
        onSubmit={(e) =>
          lancer(e, () =>
            onEnvoyer({
              prenom,
              nom,
              email: email || undefined,
              telephone: telephone || undefined,
              notes: notes || undefined,
            }),
          )
        }
      >
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
        <Actions envoi={envoi} bouton="Ajouter" onClose={onClose} />
      </form>
    </Fenetre>
  );
}

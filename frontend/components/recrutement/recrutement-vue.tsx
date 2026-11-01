'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Link2,
  Plus,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { formatDate, formatDateTime, formatTime, formatWeekdayDayMonth, plural, todayIso } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import { telechargerFichier } from '@/lib/fichiers';
import {
  ajouterCandidat,
  changerEtatAppel,
  deciderEmbauche,
  deciderPoste,
  demanderPoste,
  embaucheDirecte,
  fermerPoste,
  enregistrerAppel,
  getCandidats,
  getFicheCandidat,
  getPieceCandidat,
  getRecrutement,
  getRecrutementGroupe,
  noterCandidat,
  planifierEntretien,
  retirerCandidat,
  type Candidat,
  type EmbaucheDirecte,
  type FicheCandidat,
  type Poste,
  type ReglagesAppel,
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
  // Case « prévenir le candidat par e-mail » (cochée d'office), si le candidat a une adresse.
  prevenir?: string;
  envoyer: (valeur: string, prevenir: boolean) => Promise<unknown>;
};
const lienPublic = (chemin: string) => `${typeof window === 'undefined' ? '' : window.location.origin}${chemin}`;

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
  const [appelEdite, setAppelEdite] = useState<Poste | null>(null);

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
          {droits.gererAppels && portee === 'societe' && (
            <BoutonCopier texte={lienPublic(`/carrieres/${slug}`)} libelle="Lien de la page Carrières" icone={Globe} />
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
              {p.appel ? (
                <AppelBloc
                  poste={p}
                  peutGerer={droits.gererAppels}
                  onModifier={() => setAppelEdite(p)}
                  onEtat={(ouvert) => agir(() => changerEtatAppel(slug, p.id, ouvert))}
                />
              ) : (
                droits.gererAppels &&
                p.statut === 'ouvert' &&
                !p.direct && (
                  <button type="button" className="recrutement-appel-publier" onClick={() => setAppelEdite(p)}>
                    <Link2 size={15} aria-hidden /> Publier un appel à candidatures
                  </button>
                )
              )}
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
      {appelEdite && (
        <AppelModal
          poste={appelEdite}
          onClose={() => setAppelEdite(null)}
          onEnvoyer={async (r) => {
            await enregistrerAppel(slug, appelEdite.id, r);
            setAppelEdite(null);
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
  const [fiche, setFiche] = useState<string | null>(null);

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
      envoyer: async (v, prevenir) => {
        await s.envoyer(v, prevenir);
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
                      {c.source === 'lien' && (
                        <span className="agenda-detail recrutement-via-lien">
                          <Link2 size={13} aria-hidden /> Via le lien · {formatDate(c.creeLe.slice(0, 10))} ·{' '}
                          {plural(c.pieces, 'pièce')}
                        </span>
                      )}
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
                        <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setFiche(c.id)}>
                          <FileText size={14} aria-hidden /> Fiche
                        </button>
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
                                  prevenir: c.email ? `Annoncer la bonne nouvelle à ${c.prenom} par e-mail` : undefined,
                                  envoyer: (dateEntree, prevenirCandidat) =>
                                    deciderEmbauche(slug, c.id, { embaucher: true, dateEntree, prevenirCandidat }),
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
                                  prevenir: c.email
                                    ? `Envoyer à ${c.prenom} une réponse polie par e-mail (sans ce motif, qui reste interne)`
                                    : undefined,
                                  envoyer: (motif, prevenirCandidat) =>
                                    deciderEmbauche(slug, c.id, { embaucher: false, motif, prevenirCandidat }),
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
      {fiche && <FicheCandidatModal slug={slug} id={fiche} onClose={() => setFiche(null)} />}
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
  onEnvoyer: (e: {
    debut: string;
    fin: string;
    lieu?: string;
    inviteIds: string[];
    prevenirCandidat: boolean;
  }) => Promise<void>;
}) {
  const [date, setDate] = useState(candidat.entretien?.debut.slice(0, 10) ?? todayIso());
  const [debut, setDebut] = useState(candidat.entretien?.debut.slice(11, 16) ?? '10:00');
  const [fin, setFin] = useState(candidat.entretien?.fin.slice(11, 16) ?? '11:00');
  const [lieu, setLieu] = useState(candidat.entretien?.lieu ?? '');
  const [invites, setInvites] = useState<string[]>([]);
  const [prevenir, setPrevenir] = useState(!!candidat.email);
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
              prevenirCandidat: prevenir && !!candidat.email,
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
        {candidat.email && (
          <label className="recrutement-case">
            <input type="checkbox" checked={prevenir} onChange={(e) => setPrevenir(e.target.checked)} />
            Envoyer la convocation à {candidat.prenom} ({candidat.email})
          </label>
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
  const [prevenir, setPrevenir] = useState(true);
  const { envoi, erreur, lancer } = useEnvoi('L’action a échoué.');
  return (
    <Fenetre id="saisie-titre" titre={saisie.titre} envoi={envoi} onClose={onClose}>
      <form
        className="modal-body annonce-formulaire"
        onSubmit={(e) =>
          lancer(e, async () => {
            await saisie.envoyer(valeur.trim(), !!saisie.prevenir && prevenir);
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
        {saisie.prevenir && (
          <label className="recrutement-case">
            <input type="checkbox" checked={prevenir} onChange={(e) => setPrevenir(e.target.checked)} />
            {saisie.prevenir}
          </label>
        )}
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

// Copie un lien dans le presse-papiers, avec « Copié » pendant 2 s.
function BoutonCopier({
  texte,
  libelle,
  icone: Icone = Copy,
}: {
  texte: string;
  libelle: string;
  icone?: typeof Copy;
}) {
  const [copie, setCopie] = useState(false);
  async function copier() {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      window.prompt('Copiez le lien :', texte);
    }
  }
  return (
    <button type="button" className="btn-ghost btn-ghost--sm" onClick={copier} aria-live="polite">
      {copie ? <Check size={14} aria-hidden /> : <Icone size={14} aria-hidden />} {copie ? 'Lien copié' : libelle}
    </button>
  );
}

// L'appel à candidatures d'un poste : en ligne ou non, candidatures reçues,
// lien à partager.
function AppelBloc({
  poste,
  peutGerer,
  onModifier,
  onEtat,
}: {
  poste: Poste;
  peutGerer: boolean;
  onModifier: () => void;
  onEtat: (ouvert: boolean) => void;
}) {
  const a = poste.appel!;
  const etat = a.enLigne
    ? { libelle: 'En ligne', tone: 'succes' as const }
    : !a.ouvert
      ? { libelle: 'Clos', tone: 'neutre' as const }
      : a.dateLimite && a.dateLimite < todayIso()
        ? { libelle: 'Date limite passée', tone: 'attention' as const }
        : { libelle: 'Hors ligne', tone: 'neutre' as const };
  return (
    <div className="recrutement-appel">
      <div className="recrutement-appel-tete">
        <Link2 size={15} aria-hidden />
        <strong>Appel à candidatures</strong>
        <Pill tone={etat.tone}>{etat.libelle}</Pill>
      </div>
      <span className="annonce-meta">
        {a.recues} candidature{a.recues > 1 ? 's reçues' : ' reçue'} via le lien
        {a.dateLimite ? ` · jusqu’au ${formatDate(a.dateLimite)}` : ''}
      </span>
      <div className="annonce-actions">
        <BoutonCopier texte={lienPublic(`/candidature/${a.slug}`)} libelle="Copier le lien" />
        <a
          className="btn-ghost btn-ghost--sm"
          href={`/candidature/${a.slug}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={14} aria-hidden /> Voir la page
        </a>
        {peutGerer && (
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={onModifier}>
            Modifier
          </button>
        )}
        {peutGerer &&
          (a.ouvert ? (
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => onEtat(false)}>
              Clore
            </button>
          ) : (
            poste.statut === 'ouvert' && (
              <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => onEtat(true)}>
                Rouvrir
              </button>
            )
          ))}
      </div>
    </div>
  );
}

const PIECES_PROPOSEES: { cle: ReglagesAppel['pieces'][number]['cle']; libelle: string }[] = [
  { cle: 'lettre', libelle: 'Lettre de motivation' },
  { cle: 'diplomes', libelle: 'Diplômes et attestations' },
  { cle: 'portfolio', libelle: 'Portfolio' },
  { cle: 'references', libelle: 'Références' },
  { cle: 'autre', libelle: 'Autre document' },
];
const TYPES_CONTRAT = ['CDI', 'CDD', 'Stage', 'Alternance', 'Prestation'];

// Réglages de l'appel : ce que le candidat lit (présentation, lieu, contrat,
// date limite) et ce qu'il fournit (pièces, questions). Le CV est toujours
// demandé ; le lien ne change pas quand on modifie l'appel.
function AppelModal({
  poste,
  onClose,
  onEnvoyer,
}: {
  poste: Poste;
  onClose: () => void;
  onEnvoyer: (r: ReglagesAppel) => Promise<void>;
}) {
  const a = poste.appel;
  const [presentation, setPresentation] = useState(a?.presentation ?? '');
  const [lieu, setLieu] = useState(a?.lieu ?? '');
  const [typeContrat, setTypeContrat] = useState(a?.typeContrat ?? '');
  const [dateLimite, setDateLimite] = useState(a?.dateLimite ?? '');
  const [pieces, setPieces] = useState<Record<string, { demandee: boolean; obligatoire: boolean; libelle: string }>>(
    () =>
      Object.fromEntries(
        PIECES_PROPOSEES.map((p) => {
          const x = a?.pieces.find((y) => y.cle === p.cle);
          return [p.cle, { demandee: !!x, obligatoire: x?.obligatoire ?? false, libelle: x?.libelle ?? '' }];
        }),
      ),
  );
  const [questions, setQuestions] = useState<{ id?: string; libelle: string; obligatoire: boolean }[]>(
    a?.questions ?? [],
  );
  const { envoi, erreur, lancer } = useEnvoi('L’appel n’a pas été enregistré.');
  const majPiece = (cle: string, maj: Partial<(typeof pieces)[string]>) =>
    setPieces((x) => ({ ...x, [cle]: { ...x[cle], ...maj } }));
  const majQuestion = (i: number, maj: Partial<(typeof questions)[number]>) =>
    setQuestions((l) => l.map((q, j) => (j === i ? { ...q, ...maj } : q)));

  return (
    <Fenetre
      id="appel-titre"
      titre={`${a ? 'Modifier l’appel' : 'Publier un appel à candidatures'} · ${poste.intitule}`}
      envoi={envoi}
      onClose={onClose}
    >
      <form
        className="modal-body annonce-formulaire recrutement-appel-form"
        onSubmit={(e) =>
          lancer(e, () =>
            onEnvoyer({
              presentation,
              lieu: lieu || undefined,
              typeContrat: typeContrat || undefined,
              dateLimite: dateLimite || undefined,
              pieces: PIECES_PROPOSEES.filter((p) => pieces[p.cle].demandee).map((p) => ({
                cle: p.cle,
                obligatoire: pieces[p.cle].obligatoire,
                libelle: p.cle === 'autre' ? pieces[p.cle].libelle || undefined : undefined,
              })),
              questions: questions.filter((q) => q.libelle.trim()),
            }),
          )
        }
      >
        <Field label="Présentation du poste">
          <textarea
            className="field-input"
            rows={7}
            value={presentation}
            onChange={(e) => setPresentation(e.target.value)}
            placeholder="Missions, profil recherché, ce que la société offre…"
            required
            minLength={20}
          />
        </Field>
        <div className="agenda-formulaire-ligne">
          <Field label="Lieu (facultatif)">
            <input className="field-input" value={lieu} onChange={(e) => setLieu(e.target.value)} />
          </Field>
          <Field label="Type de contrat (facultatif)">
            <input
              className="field-input"
              list="types-contrat"
              value={typeContrat}
              onChange={(e) => setTypeContrat(e.target.value)}
            />
            <datalist id="types-contrat">
              {TYPES_CONTRAT.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field label="Date limite (facultatif)">
            <input
              type="date"
              className="field-input"
              min={todayIso()}
              value={dateLimite}
              onChange={(e) => setDateLimite(e.target.value)}
            />
          </Field>
        </div>

        <fieldset className="recrutement-appel-groupe">
          <legend className="field-label">Pièces demandées</legend>
          <div className="recrutement-appel-piece">
            <label className="recrutement-case">
              <input type="checkbox" checked disabled /> CV
            </label>
            <span className="annonce-meta">toujours demandé, obligatoire</span>
          </div>
          {PIECES_PROPOSEES.map((p) => (
            <div key={p.cle} className="recrutement-appel-piece">
              <label className="recrutement-case">
                <input
                  type="checkbox"
                  checked={pieces[p.cle].demandee}
                  onChange={(e) => majPiece(p.cle, { demandee: e.target.checked })}
                />
                {p.libelle}
              </label>
              {pieces[p.cle].demandee && (
                <>
                  {p.cle === 'autre' && (
                    <input
                      className="field-input"
                      aria-label="Nom du document"
                      placeholder="Nom du document (ex. permis de conduire)"
                      value={pieces[p.cle].libelle}
                      onChange={(e) => majPiece(p.cle, { libelle: e.target.value })}
                      maxLength={80}
                    />
                  )}
                  <label className="recrutement-case">
                    <input
                      type="checkbox"
                      checked={pieces[p.cle].obligatoire}
                      onChange={(e) => majPiece(p.cle, { obligatoire: e.target.checked })}
                    />
                    Obligatoire
                  </label>
                </>
              )}
            </div>
          ))}
        </fieldset>

        <fieldset className="recrutement-appel-groupe">
          <legend className="field-label">Questions au candidat (facultatif, 5 au plus)</legend>
          {questions.map((q, i) => (
            <div key={q.id ?? `n${i}`} className="recrutement-appel-question">
              <input
                className="field-input"
                aria-label={`Question ${i + 1}`}
                placeholder="Ex. Quelle est votre disponibilité ?"
                value={q.libelle}
                onChange={(e) => majQuestion(i, { libelle: e.target.value })}
                maxLength={300}
              />
              <label className="recrutement-case">
                <input
                  type="checkbox"
                  checked={q.obligatoire}
                  onChange={(e) => majQuestion(i, { obligatoire: e.target.checked })}
                />
                Obligatoire
              </label>
              <button
                type="button"
                className="btn-ghost btn-ghost--sm"
                onClick={() => setQuestions((l) => l.filter((_, j) => j !== i))}
              >
                Retirer
              </button>
            </div>
          ))}
          {questions.length < 5 && (
            <button
              type="button"
              className="btn-ghost btn-ghost--sm"
              onClick={() => setQuestions((l) => [...l, { libelle: '', obligatoire: false }])}
            >
              <Plus size={14} aria-hidden /> Ajouter une question
            </button>
          )}
        </fieldset>
        <p className="pi-aide">
          Le candidat remplit aussi ses prénom, nom, e-mail et téléphone, et reçoit un accusé de réception.
          {a ? ' Le lien reste le même.' : ' Vous obtenez un lien à partager (site, LinkedIn, WhatsApp…).'}
        </p>
        {erreur && <FieldError>{erreur}</FieldError>}
        <Actions envoi={envoi} bouton={a ? 'Enregistrer' : 'Publier'} onClose={onClose} />
      </form>
    </Fenetre>
  );
}

const taille = (octets: number) =>
  octets >= 1024 * 1024
    ? `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`
    : `${Math.ceil(octets / 1024)} Ko`;

// Fiche d'un candidat : coordonnées, réponses, pièces à télécharger, notes.
function FicheCandidatModal({ slug, id, onClose }: { slug: string; id: string; onClose: () => void }) {
  const [fiche, setFiche] = useState<FicheCandidat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    getFicheCandidat(slug, id)
      .then(setFiche)
      .catch((e) => setErreur(message(e, 'Fiche indisponible.')));
  }, [slug, id]);
  async function telecharger(pieceId: string) {
    try {
      telechargerFichier(await getPieceCandidat(slug, id, pieceId));
    } catch (e) {
      setErreur(message(e, 'Téléchargement impossible.'));
    }
  }
  return (
    <Modal onClose={onClose} portal labelledBy="fiche-titre" className="recrutement-fiche">
      <header className="modal-header">
        <div>
          <span className="cell-sub">{fiche ? `${fiche.poste} · ${fiche.reference}` : 'Candidat'}</span>
          <h2 id="fiche-titre">{fiche ? `${fiche.prenom} ${fiche.nom}` : 'Chargement…'}</h2>
        </div>
        <CloseButton onClick={onClose} />
      </header>
      <div className="modal-body recrutement-fiche-corps">
        {erreur && <FieldError>{erreur}</FieldError>}
        {!fiche ? (
          !erreur && <Skeleton size="sm" />
        ) : (
          <>
            <section>
              <h3>Coordonnées</h3>
              <p>
                {fiche.email ? <a href={`mailto:${fiche.email}`}>{fiche.email}</a> : 'Pas d’e-mail'}
                {fiche.telephone && (
                  <>
                    {' · '}
                    <a href={`tel:${fiche.telephone.replace(/\s/g, '')}`}>{fiche.telephone}</a>
                  </>
                )}
              </p>
              <p className="annonce-meta">
                {fiche.source === 'lien'
                  ? `Candidature déposée par le lien le ${formatDateTime(fiche.creeLe)}`
                  : `Saisie par la RH le ${formatDateTime(fiche.creeLe)}`}
                {fiche.consentementLe ? ' · consentement donné' : ''}
              </p>
            </section>
            {fiche.reponses.length > 0 && (
              <section>
                <h3>Réponses</h3>
                <dl className="recrutement-reponses">
                  {fiche.reponses.map((r, i) => (
                    <div key={i}>
                      <dt>{r.question}</dt>
                      <dd>{r.reponse}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            <section>
              <h3>Pièces</h3>
              {fiche.pieces.length === 0 ? (
                <p className="annonce-meta">Aucune pièce.</p>
              ) : (
                <ul className="recrutement-pieces">
                  {fiche.pieces.map((p) => (
                    <li key={p.id}>
                      <FileText size={16} aria-hidden />
                      <span>
                        <strong>{p.libelle}</strong>
                        <span className="annonce-meta">
                          {p.nom} · {taille(p.taille)}
                        </span>
                      </span>
                      <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => telecharger(p.id)}>
                        Télécharger
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {fiche.notes && (
              <section>
                <h3>Notes</h3>
                <p className="recrutement-notes">{fiche.notes}</p>
              </section>
            )}
            {fiche.motif && (
              <section>
                <h3>Motif du refus (interne)</h3>
                <p>{fiche.motif}</p>
              </section>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { getSociete } from '@/lib/api';
import {
  ajouterLigneChecklistAvp,
  devaliderAvantProjet,
  enregistrerAvantProjet,
  getAvantProjet,
  getProjetExecution,
  majLigneChecklistAvp,
  supprimerLigneChecklistAvp,
  validerAvantProjet,
} from '@/lib/projets';
import { getCollaborateurs } from '@/lib/equipe';
import { getSession } from '@/lib/auth';
import { destinationForSession } from '@/lib/session-redirect';
import {
  avancementChecklistAvp,
  CATEGORIES,
  checklistAvantProjet,
  ETAPES_PRE_BILAN,
  itemsChecklistAvp,
  NATURES_DOSSIER,
  NIVEAUX_FINITION,
  preBilanComplet,
  TYPES_BIEN,
  type AvantProjet,
  type Categorie,
  type Collaborateur,
  type GroupeChecklistAvp,
  type NiveauFinition,
  type PatchAvantProjet,
  type PreBilan,
  type ProjetExecution,
  type Session,
  type Societe,
} from '@/lib/types';
import { formatDateCourte, formatMontant } from '@/lib/format';
import { AdminShell } from '@/components/admin/admin-shell';
import { PreBilanBloc } from '@/components/admin/pre-bilan-bloc';

type Props = {
  params: { slug: string; projetId: string };
};

function nombreOuNull(v: string): number | null {
  return v.trim() === '' ? null : Number(v);
}

export default function AvantProjetPage({ params }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [societe, setSociete] = useState<Societe | null>(null);
  const [projet, setProjet] = useState<ProjetExecution | null | undefined>(undefined);
  const [ap, setAp] = useState<AvantProjet | null>(null);
  const [collaborateurs, setCollaborateurs] = useState<Collaborateur[]>([]);
  const [preBilan, setPreBilan] = useState<PreBilan | null>(null);
  const [enregistre, setEnregistre] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [programmeOuvert, setProgrammeOuvert] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    const current = getSession();
    if (!current || current.societe.slug !== params.slug) {
      router.replace(`/login/${params.slug}`);
      return;
    }
    if (current.role !== 'societe_admin') {
      router.replace(destinationForSession(current));
      return;
    }
    setSession(current);
    getSociete(params.slug)
      .then(setSociete)
      .catch(() => setSociete(null));
    getProjetExecution(params.slug, params.projetId).then((p) => {
      setProjet(p);
      // Ne charge l'avant-projet que si le projet existe : sinon le GET
      // renvoie 404 « Projet introuvable » et l'erreur remonte non gérée.
      if (p) getAvantProjet(params.slug, params.projetId).then(setAp);
    });
    getCollaborateurs(params.slug).then(setCollaborateurs).catch(() => setCollaborateurs([]));
  }, [params.slug, params.projetId, router]);

  if (!session) return null;

  const retour = `/admin/${params.slug}/projets/${params.projetId}`;
  const valide = !!ap?.valideLe;
  // Le pré-bilan doit être structurellement complet pour que la case
  // « Budget validé / Pré-bilan validé » soit cochable.
  const categorie = projet ? projet.categorie : null;
  const preBilanOk = categorie ? preBilanComplet(preBilan, categorie) : false;
  const items = ap && projet ? checklistAvantProjet(projet.categorie, projet.nature) : [];
  const suiviAvp = avancementChecklistAvp(ap ? itemsChecklistAvp(ap.checklists) : []);
  const checklistComplete =
    !!ap &&
    items.length > 0 &&
    items.every((it) =>
      it.cle === 'budgetValide'
        ? ap.checklist[it.cle] && preBilanOk
        : ap.checklist[it.cle],
    );

  function texteManquePreBilan(cat: Categorie): string {
    const sequence = ETAPES_PRE_BILAN[cat];
    const faites = preBilan?.versions.length ?? 0;
    if (faites < sequence.length) {
      return sequence.slice(faites).map((e) => e.libelle).join(', ');
    }
    return 'renseigne les montants de la dernière version';
  }

  function maj<K extends keyof AvantProjet>(cle: K, valeur: AvantProjet[K]) {
    setAp((a) => (a ? { ...a, [cle]: valeur } : a));
    setEnregistre(false);
  }

  function majChecklist(cle: keyof AvantProjet['checklist'], valeur: boolean) {
    setAp((a) => (a ? { ...a, checklist: { ...a.checklist, [cle]: valeur } } : a));
    setEnregistre(false);
  }

  function champsFiche(a: AvantProjet): PatchAvantProjet {
    return {
      besoinSurface: a.besoinSurface,
      nbLots: a.nbLots,
      usages: a.usages,
      niveauFinition: a.niveauFinition,
      budgetCibleClient: a.budgetCibleClient,
      delaiSouhaite: a.delaiSouhaite,
      contraintes: a.contraintes,
      references: a.references,
      dessinateurId: a.dessinateur?.id ?? null,
      responsable3dId: a.responsable3d?.id ?? null,
      dateDebut: a.dateDebut || null,
      dateFin: a.dateFin || null,
      checklist: a.checklist,
      pieceValidation: a.pieceValidation,
    };
  }

  // Les 2 champs FK : on stocke le { id, nom } localement pour le rendu, l'envoi
  // se fait par id via champsFiche.
  function majRefCollab(cle: 'dessinateur' | 'responsable3d', id: string) {
    const c = collaborateurs.find((x) => x.id === id) ?? null;
    setAp((a) =>
      a ? { ...a, [cle]: c ? { id: c.id, nom: `${c.prenom} ${c.nom}`.trim() } : null } : a,
    );
    setEnregistre(false);
  }

  // Coche / N-A / annote une ligne de sous-checklist — persiste tout de suite
  // (pas de bouton « Enregistrer » pour ce bloc). Le serveur renvoie
  // l'avant-projet complet, `checklists` recalculées.
  async function majItemChecklist(
    ligneId: string,
    patch: { fait?: boolean; nonRequis?: boolean; note?: string },
  ) {
    setErreur(null);
    try {
      const resultat = await majLigneChecklistAvp(
        params.slug,
        params.projetId,
        ligneId,
        patch,
      );
      setAp(resultat);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  }

  // Ajout/suppression d'un item — réservés admin côté serveur (403 pour un
  // collaborateur) ; cette page n'est de toute façon accessible qu'à l'admin.
  async function ajouterItemChecklist(groupe: GroupeChecklistAvp, libelle: string) {
    setErreur(null);
    try {
      setAp(await ajouterLigneChecklistAvp(params.slug, params.projetId, { groupe, libelle }));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Ajout impossible.');
    }
  }

  async function supprimerItemChecklist(ligneId: string) {
    if (!window.confirm('Retirer cet item de la checklist ?')) return;
    setErreur(null);
    try {
      setAp(await supprimerLigneChecklistAvp(params.slug, params.projetId, ligneId));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Suppression impossible.');
    }
  }

  async function enregistrer() {
    if (!ap) return;
    setEnCours(true);
    setErreur(null);
    const resultat = await enregistrerAvantProjet(params.slug, params.projetId, champsFiche(ap));
    setAp(resultat);
    setEnCours(false);
    setEnregistre(true);
  }

  async function valider() {
    if (!ap) return;
    setEnCours(true);
    setErreur(null);
    try {
      await enregistrerAvantProjet(params.slug, params.projetId, champsFiche(ap));
      const nom = `${session!.utilisateur.prenom} ${session!.utilisateur.nom}`.trim();
      const resultat = await validerAvantProjet(params.slug, params.projetId, nom);
      setAp(resultat);
      // recharge le projet (statut a pu passer « en cours »)
      getProjetExecution(params.slug, params.projetId).then(setProjet);
    } catch {
      setErreur('Coche les 4 points de la checklist avant de valider.');
    }
    setEnCours(false);
  }

  async function devalider() {
    setEnCours(true);
    const resultat = await devaliderAvantProjet(params.slug, params.projetId);
    setAp(resultat);
    setEnCours(false);
  }

  return (
    <AdminShell societe={societe} session={session} active="projets" titre="Avant-projet">
      <Link href={retour} className="lien-retour">
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        <span>{projet ? projet.programme : 'Projet'}</span>
      </Link>

      {projet === null ? (
        <p className="empty-state empty-state--bloc">Projet introuvable.</p>
      ) : projet === undefined || !ap ? (
        <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />
      ) : (
        <>
          <header className="projet-entete">
            <div className="projet-entete-titre">
              <span className="projet-entete-sur">
                <span className="dossier-code">{projet.code}</span>
                <span className={`pill pill--nature-${projet.nature}`}>
                  {NATURES_DOSSIER[projet.nature]}
                </span>
                <span className={`pill pill--cat-${projet.categorie}`}>
                  {CATEGORIES[projet.categorie]}
                </span>
              </span>
              <h2>Avant-projet</h2>
              <p className="projet-entete-meta">
                {projet.programme} · {projet.client.nom} · {projet.localisation}
              </p>
            </div>
          </header>

          {valide && (
            <div className="ap-bandeau" role="status">
              <CheckCircle2 size={16} strokeWidth={2} aria-hidden />
              <span>
                Avant-projet validé le {formatDateCourte(ap.valideLe!)} par {ap.validePar}.
              </span>
            </div>
          )}

          {/* Contexte repris du CRM — non ressaisi */}
          <div className="ap-contexte">
            <span>
              <strong>Type</strong> {TYPES_BIEN[projet.type]}
            </span>
            <span>
              <strong>Catégorie</strong> {CATEGORIES[projet.categorie]}
            </span>
          </div>

          <section className="panel">
            <div className="panel-tete">
              <button
                type="button"
                className="panel-title panel-title--repliable"
                aria-expanded={programmeOuvert}
                onClick={() => setProgrammeOuvert((o) => !o)}
              >
                <ChevronDown
                  size={16}
                  strokeWidth={2}
                  aria-hidden
                  className={`panel-repli-icone${programmeOuvert ? '' : ' est-replie'}`}
                />
                <span>Programme</span>
              </button>
            </div>
            {programmeOuvert && (
            <div className="ap-form">
              <div className="field-row">
                <label className="field">
                  <span className="field-label">Surface à construire / aménager (m²)</span>
                  <input
                    className="field-input"
                    type="number"
                    min="0"
                    disabled={valide}
                    value={ap.besoinSurface ?? ''}
                    onChange={(e) => maj('besoinSurface', nombreOuNull(e.target.value))}
                    placeholder="ex : 480"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Nombre de pièces / lots</span>
                  <input
                    className="field-input"
                    type="number"
                    min="0"
                    disabled={valide}
                    value={ap.nbLots ?? ''}
                    onChange={(e) => maj('nbLots', nombreOuNull(e.target.value))}
                    placeholder="ex : 12"
                  />
                </label>
              </div>

              <div className="field-row">
                <label className="field">
                  <span className="field-label">Usages</span>
                  <input
                    className="field-input"
                    disabled={valide}
                    value={ap.usages}
                    onChange={(e) => maj('usages', e.target.value)}
                    placeholder="ex : Habitation, bureaux, commerce…"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Niveau de finition</span>
                  <select
                    className="field-input"
                    disabled={valide}
                    value={ap.niveauFinition}
                    onChange={(e) => maj('niveauFinition', e.target.value as NiveauFinition)}
                  >
                    {(Object.keys(NIVEAUX_FINITION) as NiveauFinition[]).map((k) => (
                      <option key={k} value={k}>
                        {NIVEAUX_FINITION[k]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="field-row">
                <label className="field">
                  <span className="field-label">Budget cible client (FCFA)</span>
                  <input
                    className="field-input"
                    type="number"
                    min="0"
                    disabled={valide}
                    value={ap.budgetCibleClient ?? ''}
                    onChange={(e) => maj('budgetCibleClient', nombreOuNull(e.target.value))}
                    placeholder="ex : 620000000"
                  />
                  {ap.budgetCibleClient != null && (
                    <span className="field-aide">{formatMontant(ap.budgetCibleClient)}</span>
                  )}
                </label>
                <label className="field">
                  <span className="field-label">Délai souhaité</span>
                  <input
                    className="field-input"
                    disabled={valide}
                    value={ap.delaiSouhaite}
                    onChange={(e) => maj('delaiSouhaite', e.target.value)}
                    placeholder="ex : Livraison T3 2027"
                  />
                </label>
              </div>

              <label className="field">
                <span className="field-label">Contraintes particulières</span>
                <textarea
                  className="field-input"
                  rows={2}
                  disabled={valide}
                  value={ap.contraintes}
                  onChange={(e) => maj('contraintes', e.target.value)}
                  placeholder="Servitudes, mitoyenneté, exigences techniques…"
                />
              </label>

              <label className="field">
                <span className="field-label">Références / style</span>
                <textarea
                  className="field-input"
                  rows={2}
                  disabled={valide}
                  value={ap.references}
                  onChange={(e) => maj('references', e.target.value)}
                  placeholder="Liens, notes. La galerie de références vit dans « Images »."
                />
              </label>

              <div className="field-row">
                <label className="field">
                  <span className="field-label">Dessinateur</span>
                  <select
                    className="field-input"
                    disabled={valide}
                    value={ap.dessinateur?.id ?? ''}
                    onChange={(e) => majRefCollab('dessinateur', e.target.value)}
                  >
                    <option value="">— Aucun —</option>
                    {collaborateurs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.prenom} {c.nom} · {c.role}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Responsable 3D</span>
                  <select
                    className="field-input"
                    disabled={valide}
                    value={ap.responsable3d?.id ?? ''}
                    onChange={(e) => majRefCollab('responsable3d', e.target.value)}
                  >
                    <option value="">— Aucun —</option>
                    {collaborateurs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.prenom} {c.nom} · {c.role}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="field-row">
                <label className="field">
                  <span className="field-label">Début avant-projet</span>
                  <input
                    className="field-input"
                    type="date"
                    disabled={valide}
                    value={ap.dateDebut ?? ''}
                    onChange={(e) => maj('dateDebut', e.target.value || null)}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Fin avant-projet</span>
                  <input
                    className="field-input"
                    type="date"
                    disabled={valide}
                    value={ap.dateFin ?? ''}
                    onChange={(e) => maj('dateFin', e.target.value || null)}
                  />
                </label>
              </div>
            </div>
            )}
          </section>

          <section className="panel">
            <h3 className="panel-title">
              Suivi opérationnel
              <span className="pill pill--info">
                {suiviAvp.faits}/{suiviAvp.total}
              </span>
            </h3>
            <p className="ap-souscheck-intro">
              Les checklists de production de l’équipe. Indicatif — ne bloque pas
              le passage de phase (seule la validation ci-dessous le fait).
            </p>

            <div className="ap-souscheck">
              {ap.checklists.map((groupe) => {
                const av = avancementChecklistAvp(groupe.items);
                return (
                  <div className="ap-souscheck-groupe" key={groupe.groupe}>
                    <div className="ap-souscheck-tete">
                      <h4>{groupe.libelle}</h4>
                      <span
                        className={`ap-souscheck-compteur${
                          av.complete ? ' is-complet' : ''
                        }`}
                      >
                        {av.faits}/{av.total}
                      </span>
                    </div>
                    <ul>
                      {groupe.items.map((it) => (
                        <li
                          key={it.id}
                          className={`ap-souscheck-item${it.nonRequis ? ' is-na' : ''}`}
                        >
                          <label className="ap-souscheck-fait">
                            <input
                              type="checkbox"
                              disabled={valide || it.nonRequis}
                              checked={it.fait}
                              onChange={(e) =>
                                majItemChecklist(it.id, { fait: e.target.checked })
                              }
                            />
                            <span>{it.libelle}</span>
                          </label>
                          <label className="ap-souscheck-na" title="Non requise sur ce projet">
                            <input
                              type="checkbox"
                              disabled={valide}
                              checked={it.nonRequis}
                              onChange={(e) =>
                                majItemChecklist(it.id, { nonRequis: e.target.checked })
                              }
                            />
                            <span>N/A</span>
                          </label>
                          <input
                            className="field-input ap-souscheck-note"
                            disabled={valide}
                            defaultValue={it.note}
                            placeholder="note…"
                            onBlur={(e) => {
                              if (e.target.value !== it.note) {
                                majItemChecklist(it.id, { note: e.target.value });
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="ap-souscheck-suppr"
                            disabled={valide}
                            title="Retirer cet item"
                            onClick={() => supprimerItemChecklist(it.id)}
                          >
                            <Trash2 size={14} strokeWidth={2} aria-hidden />
                          </button>
                        </li>
                      ))}
                      <li className="ap-souscheck-item ap-souscheck-ajout">
                        <form
                          className="ap-souscheck-ajout-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const form = e.currentTarget;
                            const input = form.elements.namedItem('libelle') as HTMLInputElement;
                            const libelle = input.value.trim();
                            if (!libelle) return;
                            ajouterItemChecklist(groupe.groupe, libelle);
                            form.reset();
                          }}
                        >
                          <input
                            name="libelle"
                            className="field-input"
                            placeholder="Ajouter un item…"
                            disabled={valide}
                          />
                          <button
                            type="submit"
                            className="btn-ghost btn-ghost--sm"
                            disabled={valide}
                          >
                            <Plus size={14} strokeWidth={2} aria-hidden />
                            <span>Ajouter</span>
                          </button>
                        </form>
                      </li>
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>

          <PreBilanBloc
            slug={params.slug}
            projet={projet}
            verrouille={valide}
            onEtat={setPreBilan}
          />

          <section className="panel">
            <h3 className="panel-title">Validation</h3>

            <ul className="ap-checklist">
              {checklistAvantProjet(projet.categorie, projet.nature).map((item) => {
                const bloque = item.cle === 'budgetValide' && !preBilanOk;
                return (
                  <li key={item.cle}>
                    <label>
                      <input
                        type="checkbox"
                        disabled={valide || bloque}
                        checked={bloque ? false : ap.checklist[item.cle]}
                        onChange={(e) => majChecklist(item.cle, e.target.checked)}
                      />
                      <span>{item.libelle}</span>
                    </label>
                    {bloque && (
                      <span className="ap-checklist-hint">
                        Complète d’abord le pré-bilan ({texteManquePreBilan(projet.categorie)}).
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            <label className="field ap-piece">
              <span className="field-label">Pièce de validation (mail / PV)</span>
              <input
                className="field-input"
                disabled={valide}
                value={ap.pieceValidation ?? ''}
                onChange={(e) => maj('pieceValidation', e.target.value || null)}
                placeholder="ex : Mail de validation du client — 12/09"
              />
            </label>

            {erreur && <p className="field-erreur">{erreur}</p>}

            <div className="ap-actions">
              {!valide ? (
                <>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={enregistrer}
                    disabled={enCours}
                  >
                    {enregistre ? 'Enregistré' : 'Enregistrer'}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={valider}
                    disabled={enCours || !checklistComplete}
                    title={checklistComplete ? undefined : 'Coche les 4 points d’abord'}
                  >
                    Valider l’avant-projet
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={devalider}
                  disabled={enCours}
                >
                  Dévalider
                </button>
              )}
            </div>
          </section>

          <p className="ap-a-venir">
            Prochainement dans cette section : Site &amp; réglementation · Esquisse &amp; APD.
          </p>
        </>
      )}
    </AdminShell>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, FileCheck2, Paperclip, Ruler } from 'lucide-react';
import { getProjetExecution } from '@/lib/projets';
import {
  annulerDce,
  constituerDce,
  getEtudes,
  joindreFichiersItemEtude,
  joindreImagesItemEtude,
  patchBlocEtude,
  patchItemEtude,
  type PatchBlocEtude,
} from '@/lib/etudes';
import { lireFichier } from '@/lib/fichiers';
import { useTitrePage } from '@/lib/layout-contexte';
import {
  avancementChecklistFichiers,
  CATEGORIES,
  NATURES_DOSSIER,
  STATUTS_ETUDE,
  etudesCompletes,
  etudesEnAttente,
  type BlocEtude,
  type Etudes,
  type ItemEtude,
  type ProjetExecution,
  type StatutEtude,
} from '@/lib/types';
import { formatDateCourte } from '@/lib/format';
import { BoutonDetail, JoindreAvecItemModal } from '@/components/permis-piece-jointe';
import { FoncierDetailModal } from '@/components/foncier-detail-modal';

type Props = { params: { slug: string; projetId: string } };

function dateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

export default function EtudePage({ params }: Props) {
  useTitrePage('Bureau d’études technique');
  const router = useRouter();
  const [projet, setProjet] = useState<ProjetExecution | null | undefined>(undefined);
  const [etudes, setEtudes] = useState<Etudes | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [blocsFermes, setBlocsFermes] = useState<Set<string>>(new Set());
  const [detailItem, setDetailItem] = useState<ItemEtude | null>(null);
  const [joindreBlocOuvert, setJoindreBlocOuvert] = useState<string | null>(null);

  useEffect(() => {
    getProjetExecution(params.slug, params.projetId).then((p) => {
      setProjet(p);
      if (p && p.categorie !== 'conception') {
        router.replace(`/admin/${params.slug}/projets/${params.projetId}`);
      }
    });
    getEtudes(params.slug, params.projetId).then(setEtudes);
  }, [params.slug, params.projetId, router]);

  const retour = `/admin/${params.slug}/projets/${params.projetId}`;

  function toggleBloc(id: string) {
    setBlocsFermes((s) => {
      const suivant = new Set(s);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  }

  const nbValidees = etudes ? etudes.blocs.filter((b) => b.statut === 'validee').length : 0;
  const nbNonRequises = etudes
    ? etudes.blocs.filter((b) => b.statut === 'non_requise').length
    : 0;
  const complet = etudes ? etudesCompletes(etudes) : false;

  async function patchBloc(blocId: string, patch: PatchBlocEtude) {
    setErreur(null);
    try {
      setEtudes(await patchBlocEtude(params.slug, params.projetId, blocId, patch));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  }

  async function basculerNonNecessaire(item: ItemEtude) {
    setErreur(null);
    try {
      setEtudes(
        await patchItemEtude(params.slug, params.projetId, item.id, {
          nonRequise: item.statut !== 'non_necessaire',
        }),
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La mise à jour a échoué.');
    }
  }

  async function basculerFait(item: ItemEtude) {
    setErreur(null);
    try {
      setEtudes(
        await patchItemEtude(params.slug, params.projetId, item.id, {
          fait: item.statut !== 'fait',
        }),
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La mise à jour a échoué.');
    }
  }

  async function joindreImages(itemId: string, fichiers: { nom: string; url: string }[]) {
    setErreur(null);
    try {
      setEtudes(await joindreImagesItemEtude(params.slug, params.projetId, itemId, fichiers));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'ajout a échoué.");
    }
  }

  async function joindreFichiers(
    itemId: string,
    fichiers: { nom: string; url: string; taille?: number }[],
  ) {
    setErreur(null);
    try {
      setEtudes(await joindreFichiersItemEtude(params.slug, params.projetId, itemId, fichiers));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'ajout a échoué.");
    }
  }

  async function surFactureFichier(bloc: BlocEtude, fichier: File | undefined) {
    if (!fichier) return;
    setErreur(null);
    try {
      const lu = await lireFichier(fichier);
      await patchBloc(bloc.id, { factureFichierNom: lu.nom, factureFichierCle: lu.url });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'ajout a échoué.");
    }
  }

  async function faireDce() {
    setEnCours(true);
    setErreur(null);
    try {
      setEtudes(await constituerDce(params.slug, params.projetId));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de constituer le DCE.');
    }
    setEnCours(false);
  }

  async function defaireDce() {
    setEtudes(await annulerDce(params.slug, params.projetId));
  }

  return (
    <>
      <Link href={retour} className="lien-retour lien-retour--etude">
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        <span>{projet ? projet.programme : 'Projet'}</span>
      </Link>

      {!etudes || projet === undefined ? (
        <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />
      ) : projet === null ? (
        <p className="empty-state empty-state--bloc">Projet introuvable.</p>
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
              <h2>
                <span className="module-icone module-icone--etude" aria-hidden>
                  <Ruler size={17} strokeWidth={1.75} />
                </span>
                Bureau d’études technique
              </h2>
              <p className="projet-entete-meta">
                {projet.programme} · {projet.client.nom} · {projet.localisation}
              </p>
            </div>
          </header>

          <p className="permis-delai permis-delai--ok">
            {nbValidees} validée{nbValidees > 1 ? 's' : ''}
            {nbNonRequises > 0 && ` · ${nbNonRequises} non requise${nbNonRequises > 1 ? 's' : ''}`}
            {' · '}
            {etudesEnAttente(etudes)} en attente
            {' — '}
            {etudes.dceConstitue
              ? `DCE constitué le ${formatDateCourte(etudes.dceLe!)}`
              : 'DCE non constitué'}
          </p>

          {erreur && <p className="field-erreur">{erreur}</p>}

          {etudes.blocs.map((bloc) => {
            const av = avancementChecklistFichiers(bloc.items);
            const fermee = blocsFermes.has(bloc.id);
            return (
              <section className="panel" key={bloc.id}>
                <button
                  type="button"
                  className="ap-souscheck-tete ap-souscheck-tete--repliable"
                  aria-expanded={!fermee}
                  onClick={() => toggleBloc(bloc.id)}
                >
                  <span className="repli-badge">
                    <ChevronDown
                      size={17}
                      strokeWidth={2.25}
                      aria-hidden
                      className={`repli-icone${fermee ? ' est-replie' : ''}`}
                    />
                  </span>
                  <span className="ap-souscheck-tete-txt">
                    <h4>{bloc.libelle}</h4>
                  </span>
                  <span className={`ap-souscheck-compteur${av.complete ? ' is-complet' : ''}`}>
                    {av.faits}/{av.total}
                  </span>
                </button>

                <div className="ap-souscheck-bloc-meta">
                  <label className="field ap-souscheck-bloc-champ">
                    <span className="field-label">Interlocuteur</span>
                    <input
                      className="field-input"
                      defaultValue={bloc.interlocuteur}
                      placeholder="Nom du bureau d’études"
                      onBlur={(e) => {
                        if (e.target.value !== bloc.interlocuteur) {
                          patchBloc(bloc.id, { interlocuteur: e.target.value });
                        }
                      }}
                    />
                  </label>
                  <label className="field ap-souscheck-bloc-champ">
                    <span className="field-label">Contact</span>
                    <input
                      className="field-input"
                      defaultValue={bloc.contactInterlocuteur}
                      placeholder="Téléphone, e-mail…"
                      onBlur={(e) => {
                        if (e.target.value !== bloc.contactInterlocuteur) {
                          patchBloc(bloc.id, { contactInterlocuteur: e.target.value });
                        }
                      }}
                    />
                  </label>
                  <label className="field ap-souscheck-bloc-champ">
                    <span className="field-label">Statut</span>
                    <select
                      className={`field-input etude-statut etude-statut--${bloc.statut}`}
                      value={bloc.statut}
                      onChange={(e) => patchBloc(bloc.id, { statut: e.target.value as StatutEtude })}
                    >
                      {(Object.keys(STATUTS_ETUDE) as StatutEtude[]).map((s) => (
                        <option key={s} value={s}>
                          {STATUTS_ETUDE[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field ap-souscheck-bloc-champ">
                    <span className="field-label">Remise prévue</span>
                    <input
                      type="date"
                      className="field-input"
                      value={dateInput(bloc.dateRemisePrevue)}
                      onChange={(e) => patchBloc(bloc.id, { dateRemisePrevue: e.target.value || null })}
                    />
                  </label>
                  <label className="field ap-souscheck-bloc-champ">
                    <span className="field-label">Remise réelle</span>
                    <input
                      type="date"
                      className="field-input"
                      value={dateInput(bloc.dateRemiseReelle)}
                      onChange={(e) => patchBloc(bloc.id, { dateRemiseReelle: e.target.value || null })}
                    />
                  </label>
                  <label className="field ap-souscheck-bloc-champ">
                    <span className="field-label">Note</span>
                    <input
                      className="field-input"
                      defaultValue={bloc.note}
                      placeholder="—"
                      onBlur={(e) => {
                        if (e.target.value !== bloc.note) patchBloc(bloc.id, { note: e.target.value });
                      }}
                    />
                  </label>
                  <div className="field ap-souscheck-bloc-champ ap-souscheck-bloc-champ--joindre">
                    <span className="field-label">Ajouter une pièce</span>
                    <button
                      type="button"
                      className="field-input ap-souscheck-joindre-champ"
                      onClick={() => setJoindreBlocOuvert(bloc.id)}
                    >
                      <Paperclip size={14} strokeWidth={2} aria-hidden />
                      Joindre
                    </button>
                  </div>
                </div>

                {bloc.facture && (
                  <div className="ap-souscheck-bloc-meta ap-souscheck-bloc-meta--facture">
                    <label className="field ap-souscheck-bloc-champ">
                      {/* HT : base de la refacturation au client (× 1,10,
                          puis TVA) — CGV : prix exprimés hors taxes. */}
                      <span className="field-label">Facture — montant HT (FCFA)</span>
                      <input
                        type="number"
                        min={0}
                        className="field-input"
                        defaultValue={bloc.facture.montant ?? ''}
                        placeholder="—"
                        onBlur={(e) => {
                          const valeur = e.target.value ? Number(e.target.value) : null;
                          if (valeur !== bloc.facture!.montant) {
                            patchBloc(bloc.id, { factureMontant: valeur });
                          }
                        }}
                      />
                    </label>
                    <div className="field ap-souscheck-bloc-champ">
                      <span className="field-label">Facture — fichier</span>
                      {bloc.facture.fichierNom ? (
                        <a
                          href={bloc.facture.fichierCle ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="lien-inline"
                          title={bloc.facture.fichierNom}
                        >
                          {bloc.facture.fichierNom}
                        </a>
                      ) : (
                        <span className="permis-detail-vide" style={{ margin: 0 }}>
                          Aucun fichier
                        </span>
                      )}
                      <label className="ap-souscheck-joindre" style={{ marginTop: '0.4rem' }}>
                        <Paperclip size={12} strokeWidth={2} aria-hidden />
                        {bloc.facture.fichierNom ? 'Remplacer' : 'Joindre'}
                        <input
                          type="file"
                          hidden
                          onChange={(e) => surFactureFichier(bloc, e.target.files?.[0])}
                        />
                      </label>
                    </div>
                  </div>
                )}

                {!fermee && (
                  <ul>
                    {bloc.items.map((item) => (
                      <li
                        key={item.id}
                        className={`ap-souscheck-item ap-souscheck-item--permis${
                          item.statut === 'non_necessaire' ? ' ap-souscheck-item--non-requise' : ''
                        }`}
                      >
                        <label className="ap-souscheck-fait">
                          <input
                            type="checkbox"
                            checked={item.statut === 'fait'}
                            disabled={item.statut === 'non_necessaire'}
                            onChange={() => basculerFait(item)}
                          />
                          <span>{item.libelle}</span>
                        </label>
                        <span className="ap-souscheck-actions">
                          <button
                            type="button"
                            className={`ap-souscheck-non-requise${
                              item.statut === 'non_necessaire' ? ' est-actif' : ''
                            }`}
                            onClick={() => basculerNonNecessaire(item)}
                          >
                            Non nécessaire
                          </button>
                          <BoutonDetail
                            actif={item.fichiers.length > 0}
                            onClick={() => setDetailItem(item)}
                          />
                        </span>
                      </li>
                    ))}
                    {bloc.items.length === 0 && (
                      <p className="empty-state">
                        Aucun livrable configuré pour ce bloc — à ajouter depuis Paramètres ›
                        Gabarit Études.
                      </p>
                    )}
                  </ul>
                )}
              </section>
            );
          })}

          <section className="panel">
            <h3 className="panel-title">Dossier de consultation des entreprises (DCE)</h3>
            <p className="ap-a-venir">
              Mobilisable quand chaque étude est validée ou non requise. Sert de base à la
              consultation des entreprises — l’attribution des marchés se fait dans « Dossier
              Exécutions ».
            </p>
            {etudes.dceConstitue ? (
              <div className="ap-bandeau" role="status">
                <FileCheck2 size={16} strokeWidth={2} aria-hidden />
                <span>DCE constitué le {formatDateCourte(etudes.dceLe!)}.</span>
                <button type="button" className="lien-inline" onClick={defaireDce}>
                  Annuler
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-primary"
                onClick={faireDce}
                disabled={enCours || !complet}
                title={complet ? undefined : 'Toutes les études ne sont pas validées.'}
              >
                Constituer le DCE
              </button>
            )}
          </section>
        </>
      )}

      {detailItem && (
        <FoncierDetailModal
          libelle={detailItem.libelle}
          fichiers={detailItem.fichiers}
          onTelecharger={(f) => {
            const a = document.createElement('a');
            a.href = f.url;
            a.download = f.nom;
            document.body.appendChild(a);
            a.click();
            a.remove();
          }}
          onClose={() => setDetailItem(null)}
        />
      )}

      {joindreBlocOuvert && (
        <JoindreAvecItemModal
          items={
            etudes?.blocs
              .find((b) => b.id === joindreBlocOuvert)
              ?.items.map((it) => ({ id: it.id, libelle: it.libelle })) ?? []
          }
          onJoindreImages={joindreImages}
          onJoindreFichiers={joindreFichiers}
          onClose={() => setJoindreBlocOuvert(null)}
        />
      )}
    </>
  );
}

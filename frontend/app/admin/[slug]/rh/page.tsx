'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, CalendarClock, FileWarning, Paperclip, Plus, Users, X } from 'lucide-react';
import { useSessionCourante, useTitrePage } from '@/lib/layout-contexte';
import { niveauSuffisant } from '@/lib/auth';
import { ApiError } from '@/lib/client-api';
import { lireFichier } from '@/lib/fichiers';
import {
  archiverDossier,
  creerDossier,
  finProche,
  getDossiers,
  getOptionsDossiers,
  getPieceDossier,
  joindrePieceDossier,
  LIBELLE_CONTRAT,
  majDossier,
  PIECES,
  type MajDossier,
} from '@/lib/rh';
import type { DossierPersonnel, OptionsDossiers, TypePieceDossier } from '@/lib/types';
import { KpiStrip } from '@/components/admin/kpi-strip';
import { DemandesRh } from '@/components/absences/demandes-rh';
import { IntegrationRh } from '@/components/rh/integration-rh';
import { FeuillesTempsRh } from '@/components/rh/feuilles-temps-rh';

type Props = { params: { slug: string } };

const jjmmaaaa = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

function messageErreur(e: unknown, repli: string) {
  return e instanceof ApiError ? e.message : repli;
}

// RH · Dossiers du personnel du groupe (lot 1). Module « rh » de la matrice :
// RH en écriture, CFO et CEO en lecture. Le serveur revérifie tout.
export default function RhPage({ params }: Props) {
  useTitrePage('Ressources humaines');
  const session = useSessionCourante();
  const ecriture = session.role === 'societe_admin' || niveauSuffisant(session, 'rh', 'ecriture');

  const [dossiers, setDossiers] = useState<DossierPersonnel[] | null>(null);
  const [options, setOptions] = useState<OptionsDossiers | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [societe, setSociete] = useState<string>('tous');
  const [filtre, setFiltre] = useState<'incomplets' | 'fins' | null>(null);
  const [archives, setArchives] = useState(false);
  const [ouvert, setOuvert] = useState<DossierPersonnel | 'nouveau' | null>(null);
  const [onglet, setOnglet] = useState<'personnel' | 'temps' | 'integration' | 'demandes'>('personnel');

  useEffect(() => {
    Promise.all([getDossiers(params.slug), getOptionsDossiers(params.slug)])
      .then(([d, o]) => {
        setDossiers(d);
        setOptions(o);
      })
      .catch((e) => setErreur(messageErreur(e, 'Impossible de charger les dossiers.')));
  }, [params.slug]);

  const actifs = useMemo(() => (dossiers ?? []).filter((d) => !d.archiveLe), [dossiers]);
  const visibles = useMemo(() => {
    let l = (dossiers ?? []).filter((d) => (archives ? !!d.archiveLe : !d.archiveLe));
    if (societe !== 'tous') l = l.filter((d) => d.societeId === societe);
    if (filtre === 'incomplets') l = l.filter((d) => d.completude.pourcentage < 100);
    if (filtre === 'fins') l = l.filter((d) => finProche(d));
    return l;
  }, [dossiers, archives, societe, filtre]);

  function remplacer(d: DossierPersonnel) {
    setDossiers((l) => {
      const liste = l ?? [];
      return liste.some((x) => x.id === d.id) ? liste.map((x) => (x.id === d.id ? d : x)) : [...liste, d];
    });
    setOuvert(d);
  }

  if (erreur) return <p className="field-erreur">{erreur}</p>;
  if (!dossiers || !options) {
    return (
      <div className="admin-skeleton" aria-hidden>
        <div className="skeleton admin-skeleton-panel" />
      </div>
    );
  }

  const parSociete = options.societes.map((s) => ({ ...s, n: actifs.filter((d) => d.societeId === s.id).length }));
  const incomplets = actifs.filter((d) => d.completude.pourcentage < 100).length;
  const fins = actifs.filter((d) => finProche(d)).length;
  const basculerFiltre = (f: 'incomplets' | 'fins') => setFiltre((x) => (x === f ? null : f));

  const onglets = (
    <div className="vue-toggle rh-onglets" role="tablist" aria-label="Rubrique RH">
      {(['personnel', 'temps', 'integration', 'demandes'] as const).map((o) => (
        <button key={o} type="button" role="tab" aria-selected={onglet === o} className={onglet === o ? 'is-active' : ''} onClick={() => setOnglet(o)}>
          {{ personnel: 'Personnel', temps: 'Feuilles de temps', integration: 'Intégration', demandes: 'Demandes' }[o]}
        </button>
      ))}
    </div>
  );
  if (onglet === 'temps') {
    return (
      <>
        {onglets}
        <FeuillesTempsRh slug={params.slug} ecriture={ecriture} />
      </>
    );
  }
  if (onglet === 'integration') {
    return (
      <>
        {onglets}
        <IntegrationRh slug={params.slug} ecriture={ecriture} />
      </>
    );
  }
  if (onglet === 'demandes') {
    return (
      <>
        {onglets}
        <DemandesRh slug={params.slug} ecriture={ecriture} />
      </>
    );
  }

  return (
    <>
      {onglets}
      <div className="rh-entete">
        <p className="rh-sous-titre">
          Dossiers du personnel des sociétés du groupe. Accès : RH (modification), CFO et CEO
          (consultation).
        </p>
        {ecriture && (
          <button type="button" className="btn-primary" onClick={() => setOuvert('nouveau')}>
            <Plus size={16} strokeWidth={2} aria-hidden /> Nouveau salarié
          </button>
        )}
      </div>

      <KpiStrip
        tuiles={[
          {
            cle: 'effectif',
            label: 'Effectif du groupe',
            valeur: actifs.length,
            sousTexte: parSociete.map((s) => `${s.nom} ${s.n}`).join(' · '),
            icone: Users,
          },
          {
            cle: 'incomplets',
            label: 'Dossiers incomplets',
            valeur: incomplets,
            sousTexte: 'pièces ou champs manquants',
            icone: FileWarning,
            alerte: incomplets > 0,
            action: { type: 'filtre', actif: filtre === 'incomplets', onClick: () => basculerFiltre('incomplets') },
          },
          {
            cle: 'fins',
            label: 'Fins de contrat < 6 mois',
            valeur: fins,
            sousTexte: 'CDD et stages à anticiper',
            icone: CalendarClock,
            alerte: fins > 0,
            action: { type: 'filtre', actif: filtre === 'fins', onClick: () => basculerFiltre('fins') },
          },
        ]}
      />

      <section className="panel glass-panel rh-liste">
        <div className="rh-outils">
          <div className="vue-toggle" role="group" aria-label="Société">
            <button type="button" className={societe === 'tous' ? 'is-active' : ''} onClick={() => setSociete('tous')}>
              Tous · {actifs.length}
            </button>
            {parSociete.map((s) => (
              <button
                key={s.id}
                type="button"
                className={societe === s.id ? 'is-active' : ''}
                onClick={() => setSociete(s.id)}
              >
                {s.nom} · {s.n}
              </button>
            ))}
          </div>
          <label className="rh-archives">
            <input type="checkbox" checked={archives} onChange={(e) => setArchives(e.target.checked)} />
            Dossiers archivés
          </label>
        </div>

        {visibles.length === 0 ? (
          <p className="empty-state">Aucun dossier.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table rh-table">
              <thead>
                <tr>
                  <th>Matricule</th>
                  <th>Salarié</th>
                  <th>Société</th>
                  <th>Équipe</th>
                  <th>Contrat</th>
                  <th>Dossier</th>
                  <th>Entrée</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((d) => (
                  <tr key={d.id}>
                    <td className="rh-matricule">{d.matricule}</td>
                    <td data-label="Salarié">
                      <button type="button" className="rh-nom" onClick={() => setOuvert(d)}>
                        {`${d.prenom} ${d.nom}`.trim() || 'Sans nom'}
                      </button>
                      <span className="cell-sub">{d.poste || 'poste à renseigner'}</span>
                    </td>
                    <td data-label="Société">{d.societe.nom}</td>
                    <td data-label="Équipe">{d.cellule ?? <span className="cell-sub">à affecter par la direction</span>}</td>
                    <td data-label="Contrat">
                      {LIBELLE_CONTRAT[d.typeContrat]}
                      {d.typeContrat !== 'cdi' && d.dateFin && ` → ${jjmmaaaa(d.dateFin)}`}
                    </td>
                    <td data-label="Dossier">
                      <span className="progress">
                        <span className="progress-track">
                          <span
                            className={`progress-fill progress-fill--${d.completude.pourcentage === 100 ? 'succes' : 'attention'}`}
                            style={{ width: `${d.completude.pourcentage}%` }}
                          />
                        </span>
                        {d.completude.pourcentage} %
                      </span>
                    </td>
                    <td data-label="Entrée">{jjmmaaaa(d.dateEntree)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {ouvert && (
        <FicheDossier
          slug={params.slug}
          dossier={ouvert === 'nouveau' ? null : ouvert}
          options={options}
          ecriture={ecriture}
          onChange={remplacer}
          onClose={() => setOuvert(null)}
        />
      )}
    </>
  );
}

const CHAMPS_VIDES: MajDossier = {
  poste: '',
  typeContrat: 'cdi',
  dateEntree: new Date().toISOString().slice(0, 10),
  dateFin: null,
  salaireBase: null,
  prenom: '',
  nom: '',
  dateNaissance: null,
  lieuNaissance: '',
  nationalite: 'Sénégalaise',
  numeroPiece: '',
  telephone: '',
  emailPro: '',
  contactUrgence: '',
  modePaiement: 'virement',
  coordonneesPaiement: '',
  numeroIpm: '',
  missionResultat: '',
  missionLivrables: '',
  missionKpi: '',
  missionSignalAlerte: '',
  societeId: '',
  collaborateurId: null,
  utilisateurId: null,
};

function versFormulaire(d: DossierPersonnel): MajDossier {
  const f: MajDossier = {};
  for (const cle of Object.keys(CHAMPS_VIDES) as (keyof MajDossier)[]) {
    (f as Record<string, unknown>)[cle] = d[cle as keyof DossierPersonnel] ?? null;
  }
  return f;
}

function FicheDossier({
  slug,
  dossier,
  options,
  ecriture,
  onChange,
  onClose,
}: {
  slug: string;
  dossier: DossierPersonnel | null;
  options: OptionsDossiers;
  ecriture: boolean;
  onChange: (d: DossierPersonnel) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<MajDossier>(dossier ? versFormulaire(dossier) : CHAMPS_VIDES);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState(false);

  useEffect(() => {
    if (dossier) setForm(versFormulaire(dossier));
  }, [dossier]);

  const maj = (cle: keyof MajDossier) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    const valeur =
      cle === 'salaireBase'
        ? v === '' ? null : Number(v.replace(/\D/g, ''))
        : ['dateEntree', 'dateFin', 'dateNaissance', 'collaborateurId', 'utilisateurId'].includes(cle)
          ? v || null
          : v;
    // Une fiche d'équipe porte son propre compte : relier une fiche retire le compte direct.
    setForm((f) => ({ ...f, [cle]: valeur, ...(cle === 'collaborateurId' && valeur ? { utilisateurId: null } : {}) }));
    setEnregistre(false);
  };

  async function enregistrer() {
    setEnvoi(true);
    setErreur(null);
    try {
      const d = dossier ? await majDossier(slug, dossier.id, form) : await creerDossier(slug, form);
      onChange(d);
      setEnregistre(true);
    } catch (e) {
      setErreur(messageErreur(e, 'Enregistrement impossible.'));
    } finally {
      setEnvoi(false);
    }
  }

  async function joindre(type: TypePieceDossier, fichier?: File) {
    if (!dossier || !fichier) return;
    setErreur(null);
    try {
      const lu = await lireFichier(fichier);
      onChange(await joindrePieceDossier(slug, dossier.id, type, lu.nom, lu.url));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Pièce non jointe.');
    }
  }

  async function ouvrirPiece(type: TypePieceDossier) {
    if (!dossier) return;
    const p = await getPieceDossier(slug, dossier.id, type);
    const a = document.createElement('a');
    a.href = p.url;
    a.download = p.nom;
    a.click();
  }

  async function archiver() {
    if (!dossier) return;
    try {
      onChange(await archiverDossier(slug, dossier.id, !dossier.archiveLe));
    } catch (e) {
      setErreur(messageErreur(e, 'Action impossible.'));
    }
  }

  const collabs = options.collaborateursSansDossier.filter((c) => c.societeId === form.societeId);
  const titre = dossier ? `${dossier.prenom} ${dossier.nom}`.trim() || 'Sans nom' : 'Nouveau salarié';
  const champ = (cle: keyof MajDossier, libelle: string, props: Record<string, unknown> = {}) => (
    <label className="field">
      <span className="field-label">{libelle}</span>
      <input className="field-input" value={(form[cle] as string | null) ?? ''} onChange={maj(cle)} {...props} />
    </label>
  );
  const zone = (cle: keyof MajDossier, libelle: string) => (
    <label className="field">
      <span className="field-label">{libelle}</span>
      <textarea className="field-input" rows={2} value={(form[cle] as string) ?? ''} onChange={maj(cle)} />
    </label>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal rh-fiche" role="dialog" aria-modal="true" aria-label={titre} onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div>
            <span className="cell-sub">Dossier du personnel{dossier ? ` · ${dossier.matricule}` : ''}</span>
            <h2>{titre}</h2>
          </div>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        <div className="modal-body">
          {dossier && (
            <div className="rh-completude">
              <span>Complétude du dossier</span>
              <span className="progress">
                <span className="progress-track rh-completude-piste">
                  <span
                    className={`progress-fill progress-fill--${dossier.completude.pourcentage === 100 ? 'succes' : 'attention'}`}
                    style={{ width: `${dossier.completude.pourcentage}%` }}
                  />
                </span>
                {dossier.completude.pourcentage} %
              </span>
              {dossier.archiveLe && <span className="pill pill--neutre">Archivé</span>}
            </div>
          )}

          <fieldset disabled={!ecriture} className="fieldset-nu">
            <h3 className="rh-section">Affectation et contrat</h3>
            <div className="rh-grille">
              <label className="field">
                <span className="field-label">Société</span>
                <select className="field-input" value={form.societeId ?? ''} onChange={maj('societeId')}>
                  <option value="">À choisir</option>
                  {options.societes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nom}
                    </option>
                  ))}
                </select>
              </label>
              {champ('poste', 'Poste', { placeholder: 'ex. Architecte' })}
              <label className="field">
                <span className="field-label">Type de contrat</span>
                <select className="field-input" value={form.typeContrat} onChange={maj('typeContrat')}>
                  {Object.entries(LIBELLE_CONTRAT).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              {champ('dateEntree', 'Date d’entrée', { type: 'date' })}
              {form.typeContrat !== 'cdi' && champ('dateFin', 'Fin (CDD, stage)', { type: 'date' })}
              {champ('salaireBase', 'Salaire de base (FCFA)', { inputMode: 'numeric', placeholder: 'Non renseigné' })}
              <label className="field">
                <span className="field-label">Fiche d’équipe liée</span>
                <select className="field-input" value={form.collaborateurId ?? ''} onChange={maj('collaborateurId')}>
                  <option value="">Aucune (à affecter par la direction)</option>
                  {dossier?.collaborateurId && <option value={dossier.collaborateurId}>{dossier.cellule ?? 'Fiche actuelle'}</option>}
                  {collabs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.libelle}
                      {c.cellule ? ` · ${c.cellule}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Compte HUB (Mon espace)</span>
                {form.collaborateurId ? (
                  <input
                    className="field-input"
                    disabled
                    value={
                      dossier?.compte?.viaFiche && dossier.collaborateurId === form.collaborateurId
                        ? `${dossier.compte.libelle} · via la fiche d’équipe`
                        : 'Celui de la fiche d’équipe'
                    }
                  />
                ) : (
                  <select className="field-input" value={form.utilisateurId ?? ''} onChange={maj('utilisateurId')}>
                    <option value="">Aucun</option>
                    {dossier?.compte && !dossier.compte.viaFiche && (
                      <option value={dossier.compte.id}>
                        {dossier.compte.libelle} · {dossier.compte.email}
                      </option>
                    )}
                    {options.comptesSansDossier.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.libelle} · {c.email}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            </div>

            <h3 className="rh-section">Identité</h3>
            <div className="rh-grille">
              {champ('prenom', 'Prénom(s)')}
              {champ('nom', 'Nom')}
              {champ('dateNaissance', 'Date de naissance', { type: 'date' })}
              {champ('lieuNaissance', 'Lieu de naissance')}
              {champ('nationalite', 'Nationalité')}
              {champ('numeroPiece', 'N° CNI ou passeport')}
            </div>

            <h3 className="rh-section">Contact, paie, prévoyance</h3>
            <div className="rh-grille">
              {champ('telephone', 'Téléphone', { type: 'tel' })}
              {champ('emailPro', 'E-mail professionnel', { type: 'email', placeholder: 'prenom.nom@…' })}
              {champ('contactUrgence', 'Contact d’urgence')}
              <label className="field">
                <span className="field-label">Paiement du salaire</span>
                <select className="field-input" value={form.modePaiement} onChange={maj('modePaiement')}>
                  <option value="virement">Virement</option>
                  <option value="wave">Wave</option>
                  <option value="orange_money">Orange Money</option>
                </select>
              </label>
              {champ('coordonneesPaiement', 'RIB ou numéro')}
              {champ('numeroIpm', 'N° adhérent IPM / assurance')}
            </div>

            <h3 className="rh-section">Carte de mission · nouvel arrivant</h3>
            <div className="rh-grille rh-grille--2">
              {zone('missionResultat', 'Résultat attendu')}
              {zone('missionLivrables', 'Livrables')}
              {zone('missionKpi', 'KPI')}
              {zone('missionSignalAlerte', 'Signal d’alerte')}
            </div>
          </fieldset>

          <h3 className="rh-section">Pièces jointes</h3>
          {!dossier ? (
            <p className="cell-sub">Enregistrez le dossier pour joindre les pièces.</p>
          ) : (
            <ul className="rh-pieces">
              {PIECES.map((p) => {
                const piece = dossier.pieces.find((x) => x.type === p.type);
                return (
                  <li key={p.type} className="rh-piece">
                    <span className={`rh-piece-point${piece?.nom ? ' est-joint' : ''}`} aria-hidden />
                    <span className="rh-piece-libelle">
                      <strong>{p.libelle}</strong>
                      {p.aide && <span className="cell-sub">{p.aide}</span>}
                    </span>
                    {piece?.nom ? (
                      <button type="button" className="lien-inline" onClick={() => ouvrirPiece(p.type)}>
                        {piece.nom}
                      </button>
                    ) : (
                      <span className="rh-manquant">manquant</span>
                    )}
                    {ecriture && (
                      <label className="btn-ghost btn-ghost--sm">
                        <Paperclip size={14} strokeWidth={2} aria-hidden />
                        {piece?.nom ? 'Remplacer' : 'Joindre'}
                        <input type="file" hidden onChange={(e) => joindre(p.type, e.target.files?.[0])} />
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="cell-sub">Un dossier n’est jamais supprimé : en cas de départ, il est archivé.</p>

          {erreur && <p className="field-erreur">{erreur}</p>}
          <div className="modal-actions">
            {ecriture && dossier && (
              <button type="button" className="btn-ghost" onClick={archiver}>
                {dossier.archiveLe ? (
                  <>
                    <ArchiveRestore size={14} aria-hidden /> Réactiver
                  </>
                ) : (
                  <>
                    <Archive size={14} aria-hidden /> Archiver (départ)
                  </>
                )}
              </button>
            )}
            <button type="button" className="btn-ghost" onClick={onClose}>
              Fermer
            </button>
            {ecriture && (
              <button type="button" className="btn-primary" onClick={enregistrer} disabled={envoi}>
                {envoi ? 'Enregistrement…' : enregistre ? 'Enregistré' : dossier ? 'Enregistrer' : 'Créer le dossier'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

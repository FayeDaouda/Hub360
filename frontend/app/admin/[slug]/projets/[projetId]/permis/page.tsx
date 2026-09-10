'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import { getSociete } from '@/lib/api';
import { getProjetExecution } from '@/lib/projets';
import { ajouterEntreeJournal, enregistrerPermis, getPermis } from '@/lib/permis';
import { getSession } from '@/lib/auth';
import { destinationForSession } from '@/lib/session-redirect';
import {
  CATEGORIES,
  DELAI_INSTRUCTION_JOURS,
  NATURES_DOSSIER,
  PIECES_DOSSIER_PERMIS,
  STATUTS_NICAD,
  STATUTS_PERMIS,
  VOIES_DEPOT,
  dossierPermisComplet,
  joursRestantsInstruction,
  niveauDelai,
  type Permis,
  type PieceDossierPermis,
  type ProjetExecution,
  type Session,
  type Societe,
  type StatutNicad,
  type StatutPermis,
  type VoieDepot,
} from '@/lib/types';
import { formatDateCourte } from '@/lib/format';
import { AdminShell } from '@/components/admin/admin-shell';

type Props = { params: { slug: string; projetId: string } };

// Ordre des statuts pour désactiver ceux « au-delà du dépôt » tant que le
// dossier n'est pas prêt.
const APRES_DEPOT: StatutPermis[] = ['depose', 'instruction', 'observations', 'obtenu', 'refuse'];

export default function PermisPage({ params }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [societe, setSociete] = useState<Societe | null>(null);
  const [projet, setProjet] = useState<ProjetExecution | null | undefined>(undefined);
  const [permis, setPermis] = useState<Permis | null>(null);
  const [journalTexte, setJournalTexte] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [enregistre, setEnregistre] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const utilisateur = session
    ? `${session.utilisateur.prenom} ${session.utilisateur.nom}`.trim()
    : '';

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
    getSociete(params.slug).then(setSociete).catch(() => setSociete(null));
    getProjetExecution(params.slug, params.projetId).then((p) => {
      setProjet(p);
      // Le permis n'existe que pour la conception.
      if (p && p.categorie !== 'conception') {
        router.replace(`/admin/${params.slug}/projets/${params.projetId}`);
      }
    });
    getPermis(params.slug, params.projetId).then(setPermis);
  }, [params.slug, params.projetId, router]);

  if (!session) return null;

  const retour = `/admin/${params.slug}/projets/${params.projetId}`;
  const dossierPret = permis
    ? permis.nicad === 'obtenu' && dossierPermisComplet(permis.dossier)
    : false;
  const jr = permis ? joursRestantsInstruction(permis) : null;
  const niveau = niveauDelai(jr);

  function maj<K extends keyof Permis>(cle: K, valeur: Permis[K]) {
    setPermis((p) => (p ? { ...p, [cle]: valeur } : p));
    setEnregistre(false);
  }

  function majPiece(cle: PieceDossierPermis, valeur: boolean) {
    setPermis((p) => (p ? { ...p, dossier: { ...p.dossier, [cle]: valeur } } : p));
    setEnregistre(false);
  }

  async function enregistrer() {
    if (!permis) return;
    setEnCours(true);
    setErreur(null);
    try {
      const { projetId, journal, ...patch } = permis;
      const maj = await enregistrerPermis(params.slug, params.projetId, patch);
      setPermis(maj);
      setEnregistre(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible');
    }
    setEnCours(false);
  }

  async function ajouterEntree() {
    if (!journalTexte.trim()) return;
    const maj = await ajouterEntreeJournal(
      params.slug,
      params.projetId,
      journalTexte,
      utilisateur,
    );
    setPermis(maj);
    setJournalTexte('');
  }

  return (
    <AdminShell societe={societe} session={session} active="projets" titre="Permis de construire">
      <Link href={retour} className="lien-retour">
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        <span>{projet ? projet.programme : 'Projet'}</span>
      </Link>

      {!permis || projet === undefined ? (
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
              <h2>Permis de construire</h2>
              <p className="projet-entete-meta">
                {projet.programme} · {projet.client.nom} · {projet.localisation}
              </p>
            </div>
            <span
              className={`pill ${
                permis.statut === 'obtenu'
                  ? 'pill--succes'
                  : permis.statut === 'refuse'
                    ? 'pill--risque'
                    : 'pill--info'
              }`}
            >
              {STATUTS_PERMIS[permis.statut]}
            </span>
          </header>

          {(() => {
            if (permis.statut === 'obtenu') {
              return (
                <p className="permis-delai permis-delai--ok">
                  Permis obtenu le {formatDateCourte(permis.dateObtention!)}
                </p>
              );
            }
            if (permis.statut === 'refuse') {
              return (
                <p className="permis-delai permis-delai--depasse">
                  Permis refusé le {formatDateCourte(permis.dateRefus!)}
                </p>
              );
            }
            if (jr === null) return null;
            return (
              <p className={`permis-delai permis-delai--${niveau}`}>
                {jr > 0
                  ? `${jr} jour${jr > 1 ? 's' : ''} restant${jr > 1 ? 's' : ''} sur les ${DELAI_INSTRUCTION_JOURS} jours d'instruction.`
                  : `Délai d'instruction dépassé de ${-jr} jour${-jr > 1 ? 's' : ''}, sans décision.`}
              </p>
            );
          })()}

          {/* NICAD */}
          <section className="panel">
            <h3 className="panel-title">NICAD — identification cadastrale</h3>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Statut</span>
                <select
                  className="field-input"
                  value={permis.nicad}
                  onChange={(e) => maj('nicad', e.target.value as StatutNicad)}
                >
                  {(Object.keys(STATUTS_NICAD) as StatutNicad[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUTS_NICAD[s]}
                    </option>
                  ))}
                </select>
              </label>
              {permis.nicad === 'obtenu' && (
                <label className="field">
                  <span className="field-label">Numéro NICAD</span>
                  <input
                    className="field-input"
                    value={permis.nicadNumero}
                    onChange={(e) => maj('nicadNumero', e.target.value)}
                    placeholder="NICAD-DK-2026-…"
                  />
                </label>
              )}
            </div>
            <label className="ap-checklist-item">
              <input
                type="checkbox"
                checked={permis.planBornage}
                onChange={(e) => maj('planBornage', e.target.checked)}
              />
              <span>Plan de bornage du géomètre-expert joint</span>
            </label>
          </section>

          {/* Dossier */}
          <section className="panel">
            <h3 className="panel-title">
              Dossier technique
              <span className={`pill ${dossierPret ? 'pill--succes' : 'pill--attention'}`}>
                {dossierPret ? 'Complet' : 'Incomplet — requis avant dépôt'}
              </span>
            </h3>
            <ul className="ap-checklist">
              {PIECES_DOSSIER_PERMIS.map((p) => (
                <li key={p.cle}>
                  <label className="ap-checklist-item">
                    <input
                      type="checkbox"
                      checked={permis.dossier[p.cle]}
                      onChange={(e) => majPiece(p.cle, e.target.checked)}
                    />
                    <span>{p.libelle}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          {/* Dépôt & instruction */}
          <section className="panel">
            <h3 className="panel-title">Dépôt &amp; instruction</h3>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Statut du permis</span>
                <select
                  className="field-input"
                  value={permis.statut}
                  onChange={(e) => maj('statut', e.target.value as StatutPermis)}
                >
                  {(Object.keys(STATUTS_PERMIS) as StatutPermis[]).map((s) => (
                    <option
                      key={s}
                      value={s}
                      disabled={
                        !dossierPret && APRES_DEPOT.includes(s) && permis.statut === 'a_deposer'
                      }
                    >
                      {STATUTS_PERMIS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Voie de dépôt</span>
                <select
                  className="field-input"
                  value={permis.voie ?? ''}
                  onChange={(e) =>
                    maj('voie', e.target.value ? (e.target.value as VoieDepot) : null)
                  }
                >
                  <option value="">—</option>
                  {(Object.keys(VOIES_DEPOT) as VoieDepot[]).map((v) => (
                    <option key={v} value={v}>
                      {VOIES_DEPOT[v]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Date de dépôt</span>
                <input
                  type="date"
                  className="field-input"
                  value={permis.dateDepot ? permis.dateDepot.slice(0, 10) : ''}
                  onChange={(e) =>
                    maj('dateDepot', e.target.value ? new Date(e.target.value).toISOString() : null)
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">N° accusé de réception</span>
                <input
                  className="field-input"
                  value={permis.numeroRecepisse}
                  onChange={(e) => maj('numeroRecepisse', e.target.value)}
                  placeholder="TLD-2026-… / MR-…"
                />
              </label>
            </div>
            {permis.statut === 'obtenu' && (
              <label className="field">
                <span className="field-label">Date d’obtention</span>
                <input
                  type="date"
                  className="field-input"
                  value={permis.dateObtention ? permis.dateObtention.slice(0, 10) : ''}
                  onChange={(e) =>
                    maj(
                      'dateObtention',
                      e.target.value ? new Date(e.target.value).toISOString() : null,
                    )
                  }
                />
              </label>
            )}
            {!dossierPret && (
              <p className="phase-hint">
                Le dépôt exige le NICAD obtenu et toutes les pièces du dossier cochées.
              </p>
            )}
          </section>

          {/* Journal */}
          <section className="panel">
            <h3 className="panel-title">Échanges avec l’administration</h3>
            <div className="permis-journal-ajout">
              <input
                className="field-input"
                value={journalTexte}
                onChange={(e) => setJournalTexte(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && ajouterEntree()}
                placeholder="ex : Demande de pièce complémentaire reçue"
              />
              <button
                type="button"
                className="btn-ghost btn-ghost--sm"
                onClick={ajouterEntree}
                disabled={!journalTexte.trim()}
              >
                <Plus size={14} strokeWidth={2} aria-hidden />
                <span>Ajouter</span>
              </button>
            </div>
            {permis.journal.length === 0 ? (
              <p className="images-vide">Aucun échange consigné.</p>
            ) : (
              <ul className="permis-journal">
                {permis.journal.map((e) => (
                  <li key={e.id}>
                    <span className="permis-journal-date">{formatDateCourte(e.date)}</span>
                    <span className="permis-journal-texte">{e.texte}</span>
                    <span className="permis-journal-auteur">{e.auteur}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Conformité */}
          <section className="panel">
            <h3 className="panel-title">Certificat de conformité</h3>
            <label className="ap-checklist-item">
              <input
                type="checkbox"
                checked={permis.certificatConformite}
                onChange={(e) => maj('certificatConformite', e.target.checked)}
              />
              <span>Certificat de conformité obtenu</span>
            </label>
            {permis.certificatConformite && (
              <label className="field" style={{ marginTop: '0.6rem', maxWidth: 260 }}>
                <span className="field-label">Date du certificat</span>
                <input
                  type="date"
                  className="field-input"
                  value={permis.dateCertificat ? permis.dateCertificat.slice(0, 10) : ''}
                  onChange={(e) =>
                    maj(
                      'dateCertificat',
                      e.target.value ? new Date(e.target.value).toISOString() : null,
                    )
                  }
                />
              </label>
            )}
            <p className="ap-a-venir">À demander à la fin du chantier — délai de délivrance de 15 jours.</p>
          </section>

          {erreur && <p className="field-erreur">{erreur}</p>}
          <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={enregistrer}
              disabled={enCours}
            >
              {enregistre ? 'Enregistré' : enCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </>
      )}
    </AdminShell>
  );
}

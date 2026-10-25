'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, CircleCheck, FileUp, LoaderCircle, X } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { lireFichier, FICHIERS_ACCEPTES } from '@/lib/fichiers';
import { deposerBulletin } from '@/lib/rh';
import { libelleMois } from '@/lib/temps';
import type { DossierPersonnel } from '@/lib/types';

// `confirme` : un rattachement par le nom (homonymes, fautes) est à confirmer
// ligne par ligne par la RH avant tout dépôt (revue RH validée, 20/10/2026).
type Ligne = { fichier: File; dossierId: string | null; par: 'matricule' | 'nom' | 'manuel' | null; confirme: boolean; etat: 'attente' | 'envoi' | 'fait' | 'erreur'; message?: string };

// « Kh. SOW » → « kh sow » : comparaison sans accents ni casse.
const normaliser = (x: string) =>
  x
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Rattachement d'un fichier : le matricule dans le nom (« GH-0005_2026-09.pdf »),
// sinon le prénom et le nom du salarié tous deux présents dans le nom.
function rattacher(fichier: File, dossiers: DossierPersonnel[]): Pick<Ligne, 'dossierId' | 'par' | 'confirme'> {
  const matricule = /([A-Z]{2,4})[-_ ]?(\d{4})/i.exec(fichier.name);
  if (matricule) {
    const cle = `${matricule[1]}-${matricule[2]}`.toUpperCase();
    const d = dossiers.find((x) => x.matricule.toUpperCase() === cle);
    if (d) return { dossierId: d.id, par: 'matricule', confirme: true };
  }
  const nom = ` ${normaliser(fichier.name)} `;
  const candidats = dossiers.filter((x) => {
    const p = normaliser(x.prenom);
    const n = normaliser(x.nom);
    return !!p && !!n && nom.includes(` ${p} `) && nom.includes(` ${n} `);
  });
  return candidats.length === 1 ? { dossierId: candidats[0].id, par: 'nom', confirme: false } : { dossierId: null, par: null, confirme: false };
}

// Dépôt groupé des bulletins du mois (revue RH 20/10/2026) : 240 dépôts par
// an ramenés à un par mois. Chaque fichier est rattaché à son salarié, la RH
// vérifie (non reconnus, doublons, remplacements) puis dépose — même route
// qu'un dépôt unitaire : notification du salarié, journal de la paie.
export function DepotBulletins({
  slug,
  dossiers,
  moisParDefaut,
  onFait,
  onClose,
}: {
  slug: string;
  dossiers: DossierPersonnel[];
  moisParDefaut: string;
  onFait: () => void;
  onClose: () => void;
}) {
  const [mois, setMois] = useState(moisParDefaut);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const actifs = useMemo(() => dossiers.filter((d) => !d.archiveLe).sort((a, b) => a.matricule.localeCompare(b.matricule)), [dossiers]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !envoi && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, envoi]);

  function ajouter(fichiers: FileList | null) {
    if (!fichiers) return;
    setLignes((l) => [...l, ...[...fichiers].map((f) => ({ fichier: f, ...rattacher(f, actifs), etat: 'attente' as const }))]);
  }

  const parDossier = new Map<string, number>();
  for (const l of lignes) if (l.dossierId) parDossier.set(l.dossierId, (parDossier.get(l.dossierId) ?? 0) + 1);
  const doublon = (l: Ligne) => !!l.dossierId && (parDossier.get(l.dossierId) ?? 0) > 1;
  const remplace = (l: Ligne) => !!l.dossierId && !!actifs.find((d) => d.id === l.dossierId)?.bulletins.some((b) => b.mois === mois);
  const aConfirmer = (l: Ligne) => !!l.dossierId && !l.confirme && l.etat !== 'fait';
  const pretes = lignes.filter((l) => l.dossierId && l.confirme && !doublon(l) && l.etat !== 'fait');
  const nonReconnus = lignes.filter((l) => !l.dossierId).length;
  const nbAConfirmer = lignes.filter(aConfirmer).length;
  const termine = lignes.length > 0 && lignes.every((l) => l.etat === 'fait' || !l.dossierId || doublon(l));
  const confirmer = (i: number) => setLignes((x) => x.map((y, j) => (j === i ? { ...y, confirme: true } : y)));

  async function deposer() {
    setEnvoi(true);
    for (const l of pretes) {
      setLignes((x) => x.map((y) => (y.fichier === l.fichier ? { ...y, etat: 'envoi' } : y)));
      try {
        const lu = await lireFichier(l.fichier);
        await deposerBulletin(slug, l.dossierId!, mois, lu.nom, lu.url);
        setLignes((x) => x.map((y) => (y.fichier === l.fichier ? { ...y, etat: 'fait' } : y)));
      } catch (e) {
        const message = e instanceof ApiError || e instanceof Error ? e.message : 'Dépôt impossible.';
        setLignes((x) => x.map((y) => (y.fichier === l.fichier ? { ...y, etat: 'erreur', message } : y)));
      }
    }
    setEnvoi(false);
    onFait();
  }

  return createPortal(
    <div className="modal-backdrop" onClick={() => !envoi && onClose()}>
      <div className="modal db-modal" role="dialog" aria-modal="true" aria-labelledby="db-titre" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="db-titre">Bulletins du mois</h2>
          <button type="button" className="modal-close" aria-label="Fermer" disabled={envoi} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="modal-body db-corps">
          <div className="db-outils">
            <label className="field">
              <span className="field-label">Mois de paie</span>
              <input className="field-input" type="month" value={mois} disabled={envoi} onChange={(e) => setMois(e.target.value)} />
            </label>
            <label className={`btn-ghost db-choisir${envoi ? ' is-desactive' : ''}`}>
              <FileUp size={16} aria-hidden /> Choisir les fichiers
              <input type="file" accept={FICHIERS_ACCEPTES.rh} multiple className="sr-only" disabled={envoi} onChange={(e) => { ajouter(e.target.files); e.target.value = ''; }} />
            </label>
          </div>
          <p className="dmd-note">
            Nommez chaque fichier avec le matricule (ex. « GH-0005_{mois}.pdf ») : il est rattaché tout seul. Un fichier reconnu par le
            prénom et le nom est « à confirmer » : vérifiez le salarié puis confirmez-le. Chaque salarié est prévenu au dépôt.
          </p>

          {lignes.length > 0 && (
            <>
              <p className="db-bilan">
                {lignes.length} fichier{lignes.length > 1 ? 's' : ''} · {pretes.length} prêt{pretes.length > 1 ? 's' : ''} pour {libelleMois(mois)}
                {nonReconnus > 0 && <span className="db-alerte"> · {nonReconnus} non reconnu{nonReconnus > 1 ? 's' : ''}</span>}
                {nbAConfirmer > 0 && <span className="db-alerte"> · {nbAConfirmer} à confirmer</span>}
              </p>
              <ul className="db-liste">
                {lignes.map((l, i) => (
                  <li key={`${l.fichier.name}-${i}`} className="db-ligne" data-etat={!l.dossierId || doublon(l) || aConfirmer(l) ? 'alerte' : l.etat}>
                    <span className="db-fichier" title={l.fichier.name}>
                      {l.fichier.name}
                    </span>
                    <select
                      className="field-input db-salarie"
                      value={l.dossierId ?? ''}
                      disabled={envoi || l.etat === 'fait'}
                      onChange={(e) => setLignes((x) => x.map((y, j) => (j === i ? { ...y, dossierId: e.target.value || null, par: 'manuel', confirme: true } : y)))}
                      aria-label={`Salarié du fichier ${l.fichier.name}`}
                    >
                      <option value="">— à rattacher —</option>
                      {actifs.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.matricule} · {d.prenom} {d.nom}
                        </option>
                      ))}
                    </select>
                    <span className="db-etat">
                      {l.etat === 'envoi' ? (
                        <LoaderCircle size={15} className="groupe-etat-roue" aria-label="Dépôt en cours" />
                      ) : l.etat === 'fait' ? (
                        <span className="pill pill--succes">
                          <CircleCheck size={12} aria-hidden /> déposé
                        </span>
                      ) : l.etat === 'erreur' ? (
                        <span className="pill pill--risque" title={l.message}>
                          {l.message}
                        </span>
                      ) : !l.dossierId ? (
                        <span className="pill pill--attention">non reconnu</span>
                      ) : doublon(l) ? (
                        <span className="pill pill--risque">
                          <CircleAlert size={12} aria-hidden /> doublon
                        </span>
                      ) : aConfirmer(l) ? (
                        <button type="button" className="btn-ghost btn-ghost--sm" disabled={envoi} onClick={() => confirmer(i)} title="Rattaché par le nom : vérifiez le salarié choisi">
                          Confirmer
                        </button>
                      ) : remplace(l) ? (
                        <span className="pill pill--attention">remplace le bulletin déposé</span>
                      ) : (
                        <span className="pill pill--info">{l.par === 'matricule' ? 'par matricule' : l.par === 'nom' ? 'par nom' : 'choisi'}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-ghost" disabled={envoi} onClick={onClose}>
              {termine ? 'Fermer' : 'Annuler'}
            </button>
            <button type="button" className="btn-primary" disabled={envoi || pretes.length === 0} onClick={deposer}>
              {envoi ? 'Dépôt en cours…' : `Déposer ${pretes.length} bulletin${pretes.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

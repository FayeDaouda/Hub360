'use client';

import { useMemo, useState } from 'react';
import { CircleAlert, CircleCheck, FileUp, LoaderCircle } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { lireFichier, FICHIERS_ACCEPTES } from '@/lib/fichiers';
import { deposerBulletin } from '@/lib/rh';

import type { DossierPersonnel } from '@/lib/types';
import { formatMonthYear, plural, stripAccents } from '@hub/domain';
import { Modal, ModalHeader } from '@/components/ui/dialog';
import { Pill } from '@/components/ui/pill';
import { Field } from '@/components/ui/field';

// `confirme` : un rattachement par le nom (homonymes, fautes) est à confirmer
// ligne par ligne par la RH avant tout dépôt (revue RH validée, 20/10/2026).
type Ligne = {
  fichier: File;
  dossierId: string | null;
  par: 'matricule' | 'nom' | 'manuel' | null;
  confirme: boolean;
  etat: 'attente' | 'envoi' | 'fait' | 'erreur';
  message?: string;
};

// « Kh. SOW » → « kh sow » : comparaison sans accents ni casse.
const normaliser = (x: string) =>
  stripAccents(x)
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
  return candidats.length === 1
    ? { dossierId: candidats[0].id, par: 'nom', confirme: false }
    : { dossierId: null, par: null, confirme: false };
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
  const actifs = useMemo(
    () => dossiers.filter((d) => !d.archiveLe).sort((a, b) => a.matricule.localeCompare(b.matricule)),
    [dossiers],
  );

  function ajouter(fichiers: FileList | null) {
    if (!fichiers) return;
    setLignes((l) => [
      ...l,
      ...[...fichiers].map((f) => ({ fichier: f, ...rattacher(f, actifs), etat: 'attente' as const })),
    ]);
  }

  const parDossier = new Map<string, number>();
  for (const l of lignes) if (l.dossierId) parDossier.set(l.dossierId, (parDossier.get(l.dossierId) ?? 0) + 1);
  const doublon = (l: Ligne) => !!l.dossierId && (parDossier.get(l.dossierId) ?? 0) > 1;
  const remplace = (l: Ligne) =>
    !!l.dossierId && !!actifs.find((d) => d.id === l.dossierId)?.bulletins.some((b) => b.mois === mois);
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

  return (
    <Modal onClose={onClose} busy={envoi} portal className="db-modal" labelledBy="db-titre">
      <ModalHeader title="Bulletins du mois" titleId="db-titre" onClose={onClose} closeDisabled={envoi} />
      <div className="modal-body db-corps">
        <div className="db-outils">
          <Field label="Mois de paie">
            <input
              className="field-input"
              type="month"
              value={mois}
              disabled={envoi}
              onChange={(e) => setMois(e.target.value)}
            />
          </Field>
          <label className={`btn-ghost db-choisir${envoi ? ' is-desactive' : ''}`}>
            <FileUp size={16} aria-hidden /> Choisir les fichiers
            <input
              type="file"
              accept={FICHIERS_ACCEPTES.rh}
              multiple
              className="sr-only"
              disabled={envoi}
              onChange={(e) => {
                ajouter(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <p className="dmd-note">
          Nommez chaque fichier avec le matricule (ex. « GH-0005_{mois}.pdf ») : il est rattaché tout seul. Un fichier
          reconnu par le prénom et le nom est « à confirmer » : vérifiez le salarié puis confirmez-le. Chaque salarié
          est prévenu au dépôt.
        </p>

        {lignes.length > 0 && (
          <>
            <p className="db-bilan">
              {plural(lignes.length, 'fichier')} · {pretes.length} prêt
              {pretes.length > 1 ? 's' : ''} pour {formatMonthYear(mois)}
              {nonReconnus > 0 && (
                <span className="db-alerte">
                  {' '}
                  · {nonReconnus} non reconnu{nonReconnus > 1 ? 's' : ''}
                </span>
              )}
              {nbAConfirmer > 0 && <span className="db-alerte"> · {nbAConfirmer} à confirmer</span>}
            </p>
            <ul className="db-liste">
              {lignes.map((l, i) => (
                <li
                  key={`${l.fichier.name}-${i}`}
                  className="db-ligne"
                  data-etat={!l.dossierId || doublon(l) || aConfirmer(l) ? 'alerte' : l.etat}
                >
                  <span className="db-fichier" title={l.fichier.name}>
                    {l.fichier.name}
                  </span>
                  <select
                    className="field-input db-salarie"
                    value={l.dossierId ?? ''}
                    disabled={envoi || l.etat === 'fait'}
                    onChange={(e) =>
                      setLignes((x) =>
                        x.map((y, j) =>
                          j === i ? { ...y, dossierId: e.target.value || null, par: 'manuel', confirme: true } : y,
                        ),
                      )
                    }
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
                      <Pill tone="succes">
                        <CircleCheck size={12} aria-hidden /> déposé
                      </Pill>
                    ) : l.etat === 'erreur' ? (
                      <Pill tone="risque" title={l.message}>
                        {l.message}
                      </Pill>
                    ) : !l.dossierId ? (
                      <Pill tone="attention">non reconnu</Pill>
                    ) : doublon(l) ? (
                      <Pill tone="risque">
                        <CircleAlert size={12} aria-hidden /> doublon
                      </Pill>
                    ) : aConfirmer(l) ? (
                      <button
                        type="button"
                        className="btn-ghost btn-ghost--sm"
                        disabled={envoi}
                        onClick={() => confirmer(i)}
                        title="Rattaché par le nom : vérifiez le salarié choisi"
                      >
                        Confirmer
                      </button>
                    ) : remplace(l) ? (
                      <Pill tone="attention">remplace le bulletin déposé</Pill>
                    ) : (
                      <Pill tone="info">
                        {l.par === 'matricule' ? 'par matricule' : l.par === 'nom' ? 'par nom' : 'choisi'}
                      </Pill>
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
            {envoi ? 'Dépôt en cours…' : `Déposer ${plural(pretes.length, 'bulletin')}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

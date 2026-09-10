'use client';

import { useEffect, useState } from 'react';
import { enregistrerPermis, getPermis, ajouterEntreeJournal } from '@/lib/permis';
import {
  joursRestantsInstruction,
  niveauDelai,
  PIECES_DOSSIER_PERMIS,
  STATUTS_NICAD,
  STATUTS_PERMIS,
  VOIES_DEPOT,
  type PieceDossierPermis,
  type Permis,
  type StatutNicad,
  type StatutPermis,
  type VoieDepot,
} from '@/lib/types';
import { formatDateCourte } from '@/lib/format';
import { SectionCollabShell } from '@/components/collab/section-collab-shell';
import { BlocLecture, Champ, Champs } from '@/components/collab/lecture';

type Props = { params: { slug: string; projetId: string } };

export default function Page({ params }: Props) {
  return (
    <SectionCollabShell slug={params.slug} projetId={params.projetId} section="permis">
      {() => <Vue slug={params.slug} projetId={params.projetId} />}
    </SectionCollabShell>
  );
}

function Vue({ slug, projetId }: { slug: string; projetId: string }) {
  const [permis, setPermis] = useState<Permis | null>(null);
  const [entree, setEntree] = useState('');
  const [ajout, setAjout] = useState(false);

  useEffect(() => {
    getPermis(slug, projetId).then(setPermis).catch(() => setPermis(null));
  }, [slug, projetId]);

  async function maj(patch: Partial<Omit<Permis, 'projetId' | 'journal'>>) {
    setPermis(await enregistrerPermis(slug, projetId, patch));
  }

  async function ajouterEntree() {
    const t = entree.trim();
    if (!t || ajout) return;
    setAjout(true);
    try {
      setPermis(await ajouterEntreeJournal(slug, projetId, t, ''));
      setEntree('');
    } finally {
      setAjout(false);
    }
  }

  if (!permis) {
    return <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />;
  }

  const jours = joursRestantsInstruction(permis);
  const niveau = niveauDelai(jours);

  return (
    <>
      <BlocLecture titre="Permis de construire">
        <Champs>
          <Champ label="NICAD">
            <select
              className="field-input"
              value={permis.nicad}
              onChange={(e) => maj({ nicad: e.target.value as StatutNicad })}
            >
              {(Object.keys(STATUTS_NICAD) as StatutNicad[]).map((s) => (
                <option key={s} value={s}>
                  {STATUTS_NICAD[s]}
                </option>
              ))}
            </select>
          </Champ>
          <Champ label="Numéro NICAD">
            <input
              className="field-input"
              defaultValue={permis.nicadNumero}
              onBlur={(e) => {
                if (e.target.value !== permis.nicadNumero) maj({ nicadNumero: e.target.value });
              }}
            />
          </Champ>
          <Champ label="Plan de bornage">
            <label className="lecture-inline-check">
              <input
                type="checkbox"
                checked={permis.planBornage}
                onChange={(e) => maj({ planBornage: e.target.checked })}
              />
              <span>Joint</span>
            </label>
          </Champ>
          <Champ label="Statut">
            <select
              className="field-input"
              value={permis.statut}
              onChange={(e) => maj({ statut: e.target.value as StatutPermis })}
            >
              {(Object.keys(STATUTS_PERMIS) as StatutPermis[]).map((s) => (
                <option key={s} value={s}>
                  {STATUTS_PERMIS[s]}
                </option>
              ))}
            </select>
          </Champ>
          <Champ label="Voie de dépôt">
            <select
              className="field-input"
              value={permis.voie ?? ''}
              onChange={(e) => maj({ voie: (e.target.value || null) as VoieDepot | null })}
            >
              <option value="">—</option>
              {(Object.keys(VOIES_DEPOT) as VoieDepot[]).map((v) => (
                <option key={v} value={v}>
                  {VOIES_DEPOT[v]}
                </option>
              ))}
            </select>
          </Champ>
          <Champ label="N° récépissé">
            <input
              className="field-input"
              defaultValue={permis.numeroRecepisse}
              onBlur={(e) => {
                if (e.target.value !== permis.numeroRecepisse)
                  maj({ numeroRecepisse: e.target.value });
              }}
            />
          </Champ>
          <Champ label="Date de dépôt">
            <input
              type="date"
              className="field-input"
              value={permis.dateDepot?.slice(0, 10) ?? ''}
              onChange={(e) => maj({ dateDepot: e.target.value || null })}
            />
          </Champ>
          <Champ label="Date d'obtention">
            <input
              type="date"
              className="field-input"
              value={permis.dateObtention?.slice(0, 10) ?? ''}
              onChange={(e) => maj({ dateObtention: e.target.value || null })}
            />
          </Champ>
          <Champ label="Certificat de conformité">
            <label className="lecture-inline-check">
              <input
                type="checkbox"
                checked={permis.certificatConformite}
                onChange={(e) => maj({ certificatConformite: e.target.checked })}
              />
              <span>Obtenu</span>
            </label>
          </Champ>
        </Champs>

        {jours !== null && (
          <p className={`permis-delai permis-delai--${niveau}`}>
            {jours >= 0
              ? `${jours} j restants sur les 90 j d'instruction.`
              : `Délai d'instruction dépassé de ${-jours} j.`}
          </p>
        )}
      </BlocLecture>

      <BlocLecture titre="Dossier">
        <div className="lecture-coches">
          {PIECES_DOSSIER_PERMIS.map((p) => (
            <label key={p.cle} className="ap-souscheck-fait">
              <input
                type="checkbox"
                checked={permis.dossier[p.cle]}
                onChange={(e) =>
                  maj({
                    dossier: {
                      ...permis.dossier,
                      [p.cle as PieceDossierPermis]: e.target.checked,
                    },
                  })
                }
              />
              <span>{p.libelle}</span>
            </label>
          ))}
        </div>
      </BlocLecture>

      <BlocLecture titre="Journal">
        <div className="permis-journal-ajout">
          <input
            className="field-input"
            placeholder="Nouvelle entrée…"
            value={entree}
            onChange={(e) => setEntree(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ajouterEntree();
            }}
          />
          <button
            type="button"
            className="btn-primary btn-ghost--sm"
            onClick={ajouterEntree}
            disabled={!entree.trim() || ajout}
          >
            Ajouter
          </button>
        </div>
        {permis.journal.length === 0 ? (
          <p className="empty-state">Aucune entrée.</p>
        ) : (
          <ul className="lecture-journal">
            {permis.journal.map((e) => (
              <li key={e.id}>
                <span className="lecture-journal-date">{formatDateCourte(e.date)}</span>
                <span className="lecture-journal-txt">{e.texte}</span>
                <span className="lecture-journal-auteur">{e.auteur}</span>
              </li>
            ))}
          </ul>
        )}
      </BlocLecture>
    </>
  );
}

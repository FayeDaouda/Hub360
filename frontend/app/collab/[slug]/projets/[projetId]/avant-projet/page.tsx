'use client';

import { useEffect, useState } from 'react';
import { getAvantProjet, majLigneChecklistAvp } from '@/lib/projets';
import {
  avancementChecklistAvp,
  checklistAvantProjet,
  type AvantProjet,
  type ProjetExecution,
} from '@/lib/types';
import { formatDateCourte } from '@/lib/format';
import { SectionCollabShell } from '@/components/collab/section-collab-shell';
import { BlocLecture, Coche, ListeCoches } from '@/components/collab/lecture';

type Props = { params: { slug: string; projetId: string } };

export default function Page({ params }: Props) {
  return (
    <SectionCollabShell
      slug={params.slug}
      projetId={params.projetId}
      section="avant-projet"
    >
      {(projet) => (
        <Vue slug={params.slug} projetId={params.projetId} projet={projet} />
      )}
    </SectionCollabShell>
  );
}

function Vue({
  slug,
  projetId,
  projet,
}: {
  slug: string;
  projetId: string;
  projet: ProjetExecution;
}) {
  const [ap, setAp] = useState<AvantProjet | null>(null);

  useEffect(() => {
    getAvantProjet(slug, projetId).then(setAp).catch(() => setAp(null));
  }, [slug, projetId]);

  async function majItem(
    ligneId: string,
    patch: { fait?: boolean; nonRequis?: boolean; note?: string },
  ) {
    try {
      setAp(await majLigneChecklistAvp(slug, projetId, ligneId, patch));
    } catch {
      /* échec silencieux — l'état reste celui affiché */
    }
  }

  if (!ap) {
    return <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />;
  }

  const macro = checklistAvantProjet(projet.categorie, projet.nature);

  return (
    <>
      {ap.valideLe && (
        <div className="ap-bandeau" role="status">
          Avant-projet validé le {formatDateCourte(ap.valideLe)}
          {ap.validePar ? ` par ${ap.validePar}` : ''}.
        </div>
      )}

      <BlocLecture
        titre="Suivi opérationnel"
        portee={ap.valideLe ? 'Avant-projet validé — checklists figées.' : undefined}
      >
        {!ap.valideLe && (
          <p className="lecture-para" style={{ marginTop: 0 }}>
            Coche au fil de l’avancement. « N/A » pour un point sans objet sur ce projet.
          </p>
        )}
        <div className="lecture-groupes">
          {ap.checklists.map((g) => {
            const av = avancementChecklistAvp(g.items);
            return (
              <div key={g.groupe} className="lecture-groupe">
                <h4>
                  {g.libelle} <span className="lecture-compteur">{av.faits}/{av.total}</span>
                </h4>
                {ap.valideLe ? (
                  <ListeCoches>
                    {g.items.map((it) => (
                      <Coche key={it.id} ok={it.fait || it.nonRequis}>
                        {it.libelle}
                        {it.nonRequis && !it.fait ? ' (N/A)' : ''}
                        {it.note ? ` — ${it.note}` : ''}
                      </Coche>
                    ))}
                  </ListeCoches>
                ) : (
                  <ul className="ap-souscheck-groupe-liste">
                    {g.items.map((it) => (
                      <li
                        key={it.id}
                        className={`ap-souscheck-item${it.nonRequis ? ' is-na' : ''}`}
                      >
                        <label className="ap-souscheck-fait">
                          <input
                            type="checkbox"
                            disabled={it.nonRequis}
                            checked={it.fait}
                            onChange={(e) => majItem(it.id, { fait: e.target.checked })}
                          />
                          <span>{it.libelle}</span>
                        </label>
                        <label className="ap-souscheck-na" title="Non requise sur ce projet">
                          <input
                            type="checkbox"
                            checked={it.nonRequis}
                            onChange={(e) => majItem(it.id, { nonRequis: e.target.checked })}
                          />
                          <span>N/A</span>
                        </label>
                        <input
                          className="field-input ap-souscheck-note"
                          defaultValue={it.note}
                          placeholder="note…"
                          onBlur={(e) => {
                            if (e.target.value !== it.note) {
                              majItem(it.id, { note: e.target.value });
                            }
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </BlocLecture>

      <BlocLecture titre="Validation" portee="Repère d’avancement — modifiable par l’administration.">
        <ListeCoches>
          {macro.map((m) => (
            <Coche key={m.cle} ok={ap.checklist[m.cle]}>
              {m.libelle}
            </Coche>
          ))}
        </ListeCoches>
        {ap.pieceValidation && (
          <p className="lecture-para">
            <strong>Pièce de validation.</strong> {ap.pieceValidation}
          </p>
        )}
      </BlocLecture>
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { getAvantProjet, getPreBilan, majLigneChecklistAvp } from '@/lib/projets';
import {
  avancementChecklistAvp,
  checklistAvantProjet,
  ETAPES_PRE_BILAN,
  LIGNES_PRE_BILAN,
  NIVEAUX_FINITION,
  type AvantProjet,
  type PreBilan,
  type ProjetExecution,
} from '@/lib/types';
import { formatDateCourte, formatMontant } from '@/lib/format';
import { SectionCollabShell } from '@/components/collab/section-collab-shell';
import {
  BlocLecture,
  Champ,
  Champs,
  Coche,
  ListeCoches,
} from '@/components/collab/lecture';

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
  const [pb, setPb] = useState<PreBilan | null>(null);

  useEffect(() => {
    getAvantProjet(slug, projetId).then(setAp).catch(() => setAp(null));
    getPreBilan(slug, projetId).then(setPb).catch(() => setPb(null));
  }, [slug, projetId]);

  async function majItem(
    cle: string,
    patch: { fait?: boolean; nonRequis?: boolean; note?: string },
  ) {
    try {
      setAp(await majLigneChecklistAvp(slug, projetId, cle, patch));
    } catch {
      /* échec silencieux — l'état reste celui affiché */
    }
  }

  if (!ap) {
    return <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />;
  }

  const macro = checklistAvantProjet(projet.categorie, projet.nature);
  const etapes = ETAPES_PRE_BILAN[projet.categorie];
  const lignes = LIGNES_PRE_BILAN[projet.categorie];

  return (
    <>
      {ap.valideLe && (
        <div className="ap-bandeau" role="status">
          Avant-projet validé le {formatDateCourte(ap.valideLe)}
          {ap.validePar ? ` par ${ap.validePar}` : ''}.
        </div>
      )}

      <BlocLecture titre="Programme">
        <Champs>
          <Champ label="Surface (m²)">{ap.besoinSurface}</Champ>
          <Champ label="Pièces / lots">{ap.nbLots}</Champ>
          <Champ label="Usages">{ap.usages}</Champ>
          <Champ label="Niveau de finition">{NIVEAUX_FINITION[ap.niveauFinition]}</Champ>
          <Champ label="Budget cible client">
            {ap.budgetCibleClient != null ? formatMontant(ap.budgetCibleClient) : null}
          </Champ>
          <Champ label="Délai souhaité">{ap.delaiSouhaite}</Champ>
          <Champ label="Dessinateur">{ap.dessinateur?.nom}</Champ>
          <Champ label="Responsable 3D">{ap.responsable3d?.nom}</Champ>
          <Champ label="Début avant-projet">
            {ap.dateDebut ? formatDateCourte(ap.dateDebut) : null}
          </Champ>
          <Champ label="Fin avant-projet">
            {ap.dateFin ? formatDateCourte(ap.dateFin) : null}
          </Champ>
        </Champs>
        {ap.contraintes && (
          <p className="lecture-para">
            <strong>Contraintes.</strong> {ap.contraintes}
          </p>
        )}
        {ap.references && (
          <p className="lecture-para">
            <strong>Références.</strong> {ap.references}
          </p>
        )}
      </BlocLecture>

      <BlocLecture titre="Suivi opérationnel">
        {ap.valideLe ? (
          <p className="lecture-para" style={{ marginTop: 0 }}>
            Avant-projet validé — les checklists sont figées.
          </p>
        ) : (
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
                      <Coche key={it.cle} ok={it.fait || it.nonRequis}>
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
                        key={it.cle}
                        className={`ap-souscheck-item${it.nonRequis ? ' is-na' : ''}`}
                      >
                        <label className="ap-souscheck-fait">
                          <input
                            type="checkbox"
                            disabled={it.nonRequis}
                            checked={it.fait}
                            onChange={(e) => majItem(it.cle, { fait: e.target.checked })}
                          />
                          <span>{it.libelle}</span>
                        </label>
                        <label className="ap-souscheck-na" title="Non requise sur ce projet">
                          <input
                            type="checkbox"
                            checked={it.nonRequis}
                            onChange={(e) => majItem(it.cle, { nonRequis: e.target.checked })}
                          />
                          <span>N/A</span>
                        </label>
                        <input
                          className="field-input ap-souscheck-note"
                          defaultValue={it.note}
                          placeholder="note…"
                          onBlur={(e) => {
                            if (e.target.value !== it.note) {
                              majItem(it.cle, { note: e.target.value });
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

      <BlocLecture titre="Validation">
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

      {pb && pb.versions.length > 0 && (
        <BlocLecture titre="Pré-bilan de faisabilité">
          <div className="lecture-table-wrap">
            <table className="prebilan-table">
              <thead>
                <tr>
                  <th>Poste</th>
                  {pb.versions.map((v) => (
                    <th key={v.etape}>
                      {etapes.find((e) => e.cle === v.etape)?.libelle ?? v.etape}
                      {v.figeeLe ? ' ·figée' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.cle}>
                    <td>{l.libelle}</td>
                    {pb.versions.map((v) => (
                      <td key={v.etape}>
                        {v.couts[l.cle] != null ? formatMontant(v.couts[l.cle]!) : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="prebilan-total">
                  <td>Total</td>
                  {pb.versions.map((v) => {
                    const t = Object.values(v.couts).reduce<number>(
                      (s, n) => s + (n ?? 0),
                      0,
                    );
                    return <td key={v.etape}>{formatMontant(t)}</td>;
                  })}
                </tr>
                {pb.versions.some((v) => v.prixVenteEstime != null) && (
                  <tr>
                    <td>Prix de vente estimé</td>
                    {pb.versions.map((v) => (
                      <td key={v.etape}>
                        {v.prixVenteEstime != null ? formatMontant(v.prixVenteEstime) : '—'}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </BlocLecture>
      )}
    </>
  );
}

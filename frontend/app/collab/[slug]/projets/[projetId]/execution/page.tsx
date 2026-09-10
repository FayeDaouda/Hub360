'use client';

import { useEffect, useState } from 'react';
import {
  ajouterCrChantier,
  ajouterReserve,
  getExecution,
  majLotSuivi,
  majReception,
  majReserve,
} from '@/lib/execution';
import {
  STATUTS_LOT,
  TYPES_LOT,
  verseSurLot,
  type Execution,
  type ProjetExecution,
  type StatutLot,
  type TypeLot,
} from '@/lib/types';
import { formatDateCourte, formatMontant } from '@/lib/format';
import { SectionCollabShell } from '@/components/collab/section-collab-shell';
import { BlocLecture, Champ, Champs } from '@/components/collab/lecture';

type Props = { params: { slug: string; projetId: string } };

export default function Page({ params }: Props) {
  return (
    <SectionCollabShell slug={params.slug} projetId={params.projetId} section="execution">
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
  const [exec, setExec] = useState<Execution | null>(null);
  const [cr, setCr] = useState('');
  const [reserve, setReserve] = useState('');

  useEffect(() => {
    getExecution(slug, projetId, projet.categorie)
      .then(setExec)
      .catch(() => setExec(null));
  }, [slug, projetId, projet.categorie]);

  async function suivi(
    type: TypeLot,
    patch: { statut?: StatutLot; avancement?: number },
  ) {
    setExec(await majLotSuivi(slug, projetId, type, patch));
  }
  async function reception(patch: Partial<Execution['reception']>) {
    setExec(await majReception(slug, projetId, patch));
  }
  async function ajCr() {
    const t = cr.trim();
    if (!t) return;
    setExec(await ajouterCrChantier(slug, projetId, t, ''));
    setCr('');
  }
  async function ajReserve() {
    const t = reserve.trim();
    if (!t) return;
    setExec(await ajouterReserve(slug, projetId, t));
    setReserve('');
  }
  async function toggleReserve(id: string, levee: boolean) {
    setExec(
      await majReserve(slug, projetId, id, {
        statut: levee ? 'levee' : 'ouverte',
        dateLevee: levee ? new Date().toISOString().slice(0, 10) : null,
      }),
    );
  }

  if (!exec) {
    return <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />;
  }

  const totalMarches = exec.lots.reduce((s, l) => s + (l.montantMarche || 0), 0);
  const r = exec.reception;

  return (
    <>
      <BlocLecture
        titre="Lots"
        aside={
          totalMarches > 0 ? (
            <span className="pill pill--info">Marchés {formatMontant(totalMarches)}</span>
          ) : undefined
        }
      >
        <p className="lecture-para" style={{ marginTop: 0 }}>
          Statut et avancement modifiables. Entreprise, montant de marché et
          situations de paiement sont gérés par l’administration.
        </p>
        {exec.lots.length === 0 ? (
          <p className="empty-state">Aucun lot.</p>
        ) : (
          <div className="lecture-table-wrap">
            <table className="etude-table">
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Statut</th>
                  <th>Avancement</th>
                  <th>Entreprise</th>
                  <th>Marché</th>
                  <th>Versé</th>
                </tr>
              </thead>
              <tbody>
                {exec.lots.map((l) => (
                  <tr key={l.type}>
                    <td>{TYPES_LOT[l.type]}</td>
                    <td>
                      <select
                        className="field-input"
                        value={l.statut}
                        onChange={(e) =>
                          suivi(l.type, { statut: e.target.value as StatutLot })
                        }
                      >
                        {(Object.keys(STATUTS_LOT) as StatutLot[]).map((s) => (
                          <option key={s} value={s}>
                            {STATUTS_LOT[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        className="field-input"
                        style={{ width: '5rem' }}
                        defaultValue={l.avancement}
                        onBlur={(e) => {
                          const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                          if (v !== l.avancement) suivi(l.type, { avancement: v });
                        }}
                      />
                    </td>
                    <td className="ro">{l.entrepriseRetenue || '—'}</td>
                    <td className="ro">{l.montantMarche ? formatMontant(l.montantMarche) : '—'}</td>
                    <td className="ro">{formatMontant(verseSurLot(l))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {exec.lots.some((l) => l.situations.length > 0) && (
          <div className="lecture-notes">
            {exec.lots
              .filter((l) => l.situations.length > 0)
              .map((l) => (
                <div key={l.type} className="lecture-groupe">
                  <h4>{TYPES_LOT[l.type]} — situations de paiement (lecture)</h4>
                  <div className="lecture-table-wrap">
                    <table className="etude-table">
                      <thead>
                        <tr>
                          <th>N°</th>
                          <th>Date</th>
                          <th>Avct cumulé</th>
                          <th>Montant</th>
                          <th>Retenue</th>
                          <th>Net versé</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.situations.map((s) => (
                          <tr key={s.id}>
                            <td>{s.numero}</td>
                            <td>{formatDateCourte(s.date)}</td>
                            <td>{s.avancementCumule}%</td>
                            <td>{formatMontant(s.montantSituation)}</td>
                            <td>{formatMontant(s.retenueGarantie)}</td>
                            <td>{formatMontant(s.montantVerse)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
          </div>
        )}
      </BlocLecture>

      <BlocLecture titre="Réception">
        <Champs>
          <Champ label="Réception provisoire">
            <input
              type="date"
              className="field-input"
              value={r.receptionProvisoire?.slice(0, 10) ?? ''}
              onChange={(e) => reception({ receptionProvisoire: e.target.value || null })}
            />
          </Champ>
          <Champ label="Levée des réserves">
            <input
              type="date"
              className="field-input"
              value={r.leveeReserves?.slice(0, 10) ?? ''}
              onChange={(e) => reception({ leveeReserves: e.target.value || null })}
            />
          </Champ>
          <Champ label="Réception définitive">
            <input
              type="date"
              className="field-input"
              value={r.receptionDefinitive?.slice(0, 10) ?? ''}
              onChange={(e) => reception({ receptionDefinitive: e.target.value || null })}
            />
          </Champ>
          <Champ label="Validation client">
            <label className="lecture-inline-check">
              <input
                type="checkbox"
                checked={r.validationClient}
                onChange={(e) => reception({ validationClient: e.target.checked })}
              />
              <span>Validé</span>
            </label>
          </Champ>
        </Champs>

        <div className="permis-journal-ajout">
          <input
            className="field-input"
            placeholder="Nouvelle réserve…"
            value={reserve}
            onChange={(e) => setReserve(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ajReserve();
            }}
          />
          <button
            type="button"
            className="btn-primary btn-ghost--sm"
            onClick={ajReserve}
            disabled={!reserve.trim()}
          >
            Ajouter
          </button>
        </div>
        {r.reserves.length > 0 && (
          <div className="lecture-coches">
            {r.reserves.map((res) => (
              <label key={res.id} className="ap-souscheck-fait">
                <input
                  type="checkbox"
                  checked={res.statut === 'levee'}
                  onChange={(e) => toggleReserve(res.id, e.target.checked)}
                />
                <span>
                  {res.description}
                  {res.statut === 'levee' && res.dateLevee
                    ? ` — levée le ${formatDateCourte(res.dateLevee)}`
                    : ''}
                </span>
              </label>
            ))}
          </div>
        )}
      </BlocLecture>

      <BlocLecture titre="Comptes-rendus de chantier">
        <div className="permis-journal-ajout">
          <input
            className="field-input"
            placeholder="Nouveau compte-rendu…"
            value={cr}
            onChange={(e) => setCr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ajCr();
            }}
          />
          <button
            type="button"
            className="btn-primary btn-ghost--sm"
            onClick={ajCr}
            disabled={!cr.trim()}
          >
            Ajouter
          </button>
        </div>
        {exec.crChantier.length === 0 ? (
          <p className="empty-state">Aucun compte-rendu.</p>
        ) : (
          <ul className="lecture-journal">
            {exec.crChantier.map((e) => (
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

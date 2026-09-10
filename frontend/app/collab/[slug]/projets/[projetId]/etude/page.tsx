'use client';

import { useEffect, useState } from 'react';
import { annulerDce, constituerDce, getEtudes, majLigneEtude } from '@/lib/etudes';
import {
  STATUTS_ETUDE,
  TYPES_ETUDE,
  type Etudes,
  type StatutEtude,
  type TypeEtude,
} from '@/lib/types';
import { formatDateCourte } from '@/lib/format';
import { SectionCollabShell } from '@/components/collab/section-collab-shell';
import { BlocLecture } from '@/components/collab/lecture';

type Props = { params: { slug: string; projetId: string } };

export default function Page({ params }: Props) {
  return (
    <SectionCollabShell slug={params.slug} projetId={params.projetId} section="etude">
      {() => <Vue slug={params.slug} projetId={params.projetId} />}
    </SectionCollabShell>
  );
}

function Vue({ slug, projetId }: { slug: string; projetId: string }) {
  const [etudes, setEtudes] = useState<Etudes | null>(null);

  useEffect(() => {
    getEtudes(slug, projetId).then(setEtudes).catch(() => setEtudes(null));
  }, [slug, projetId]);

  async function majLigne(
    type: TypeEtude,
    patch: {
      statut?: StatutEtude;
      bet?: string;
      dateRemisePrevue?: string | null;
      dateRemiseReelle?: string | null;
      note?: string;
    },
  ) {
    setEtudes(await majLigneEtude(slug, projetId, type, patch));
  }

  async function basculerDce() {
    if (!etudes) return;
    setEtudes(
      etudes.dceConstitue
        ? await annulerDce(slug, projetId)
        : await constituerDce(slug, projetId),
    );
  }

  if (!etudes) {
    return <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />;
  }

  const complet = etudes.lignes.every(
    (l) => l.statut === 'validee' || l.statut === 'non_requise',
  );

  return (
    <BlocLecture
      titre="Études techniques"
      aside={
        <button
          type="button"
          className={etudes.dceConstitue ? 'btn-ghost btn-ghost--sm' : 'btn-primary btn-ghost--sm'}
          onClick={basculerDce}
          disabled={!etudes.dceConstitue && !complet}
          title={
            !etudes.dceConstitue && !complet
              ? 'Chaque étude doit être validée ou non requise'
              : undefined
          }
        >
          {etudes.dceConstitue
            ? `DCE constitué${etudes.dceLe ? ` le ${formatDateCourte(etudes.dceLe)}` : ''} — annuler`
            : 'Constituer le DCE'}
        </button>
      }
    >
      <div className="lecture-table-wrap">
        <table className="etude-table">
          <thead>
            <tr>
              <th>Étude</th>
              <th>Statut</th>
              <th>BET</th>
              <th>Remise prévue</th>
              <th>Remise réelle</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {etudes.lignes.map((l) => (
              <tr key={l.type}>
                <td>{TYPES_ETUDE[l.type]}</td>
                <td>
                  <select
                    className="field-input"
                    value={l.statut}
                    onChange={(e) => majLigne(l.type, { statut: e.target.value as StatutEtude })}
                  >
                    {(Object.keys(STATUTS_ETUDE) as StatutEtude[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUTS_ETUDE[s]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="field-input"
                    defaultValue={l.bet}
                    onBlur={(e) => {
                      if (e.target.value !== l.bet) majLigne(l.type, { bet: e.target.value });
                    }}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    className="field-input"
                    value={l.dateRemisePrevue?.slice(0, 10) ?? ''}
                    onChange={(e) =>
                      majLigne(l.type, { dateRemisePrevue: e.target.value || null })
                    }
                  />
                </td>
                <td>
                  <input
                    type="date"
                    className="field-input"
                    value={l.dateRemiseReelle?.slice(0, 10) ?? ''}
                    onChange={(e) =>
                      majLigne(l.type, { dateRemiseReelle: e.target.value || null })
                    }
                  />
                </td>
                <td>
                  <input
                    className="field-input"
                    defaultValue={l.note}
                    onBlur={(e) => {
                      if (e.target.value !== l.note) majLigne(l.type, { note: e.target.value });
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BlocLecture>
  );
}

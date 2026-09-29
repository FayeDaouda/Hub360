'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ApiError } from '@/lib/client-api';
import { deciderTache, getTachesAValider } from '@/lib/mon-espace';
import { LIBELLE_SECTION } from '@/lib/temps';
import type { TacheAValider } from '@/lib/types';
import { AbsencesADecider } from '@/components/absences/absences-a-decider';

const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const SECTION_URL = { avant_projet: 'avant-projet', permis: 'permis', execution: 'execution' } as const;

// « Mon espace » · À valider (RH lot 5c) : ce qui attend la décision du N+1 —
// les tâches remises par son équipe et les demandes d'absence (lot 2).
export function AValider({ slug, onCompte }: { slug: string; onCompte: (n: number) => void }) {
  const [taches, setTaches] = useState<TacheAValider[] | null>(null);
  const [absences, setAbsences] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    getTachesAValider(slug)
      .then(setTaches)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Impossible de charger les tâches à valider.'));
  }, [slug]);
  useEffect(charger, [charger]);
  useEffect(() => {
    if (taches) onCompte(taches.length + absences);
  }, [taches, absences, onCompte]);

  if (!taches) {
    return erreur ? (
      <p className="empty-state">{erreur}</p>
    ) : (
      <div className="admin-skeleton" aria-hidden>
        <div className="skeleton admin-skeleton-panel" />
      </div>
    );
  }

  return (
    <>
      <AbsencesADecider slug={slug} onCompte={setAbsences} />
      <section className="panel glass-panel dmd-section">
        <h2 className="dmd-titre">Tâches remises à valider · {taches.length}</h2>
        {erreur && <p className="field-erreur">{erreur}</p>}
        {taches.length === 0 ? (
          <p className="empty-state">Aucune tâche remise n’attend ta validation.</p>
        ) : (
          <ul className="dmd-liste">
            {taches.map((t) => (
              <LigneAValider key={t.id} slug={slug} t={t} onDecide={setTaches} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function LigneAValider({ slug, t, onDecide }: { slug: string; t: TacheAValider; onDecide: (l: TacheAValider[]) => void }) {
  const base = usePathname().split('/mon-espace')[0];
  const [renvoi, setRenvoi] = useState(false);
  const [motif, setMotif] = useState('');
  const [etat, setEtat] = useState<{ envoi: boolean; erreur: string | null }>({ envoi: false, erreur: null });
  const enRetard = !!t.echeance && t.remisLe.slice(0, 10) > t.echeance;

  async function decider(decision: 'valider' | 'renvoyer') {
    setEtat({ envoi: true, erreur: null });
    try {
      onDecide(await deciderTache(slug, t, decision, decision === 'renvoyer' ? motif : undefined));
    } catch (e) {
      setEtat({ envoi: false, erreur: e instanceof ApiError ? e.message : 'Décision non enregistrée.' });
    }
  }

  return (
    <li className="dmd-ligne">
      <span>
        <strong>
          {t.responsable} · {t.libelle}
        </strong>
        <span className="cell-sub">
          <Link className="lien-inline" href={`${base}/projets/${t.projetId}/${SECTION_URL[t.section]}`}>
            {t.projetCode}
          </Link>{' '}
          · {LIBELLE_SECTION[t.section]} · remis le {jjmmaaaa(t.remisLe)}
          {t.echeance && ` · échéance ${jjmmaaaa(t.echeance)}`}
        </span>
        {enRetard && <span className="cell-sub temps-alerte">Remis après l’échéance</span>}
        {renvoi && (
          <label className="field">
            <span className="field-label">Motif du renvoi</span>
            <textarea className="field-input" rows={2} maxLength={1000} value={motif} onChange={(e) => setMotif(e.target.value)} />
          </label>
        )}
        {etat.erreur && <span className="field-erreur">{etat.erreur}</span>}
      </span>
      <span className="dmd-actions">
        {renvoi ? (
          <>
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setRenvoi(false)}>
              Annuler
            </button>
            <button type="button" className="btn-primary btn-primary--sm" disabled={etat.envoi || !motif.trim()} onClick={() => decider('renvoyer')}>
              Renvoyer
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-ghost btn-ghost--sm" disabled={etat.envoi} onClick={() => setRenvoi(true)}>
              Renvoyer…
            </button>
            <button type="button" className="btn-primary btn-primary--sm" disabled={etat.envoi} onClick={() => decider('valider')}>
              Valider
            </button>
          </>
        )}
      </span>
    </li>
  );
}

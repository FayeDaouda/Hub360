'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlarmClock, ChevronDown, KeyRound, MailWarning, MessageSquareWarning, ShieldAlert, UserX, UsersRound, type LucideIcon } from 'lucide-react';
import { getATraiterAdministration, type ElementAdministration } from '@/lib/roles';

const VISIBLES = 6;
const RANG_TON: Record<ElementAdministration['ton'], number> = { risque: 0, attention: 1, info: 2 };
const TYPE: Record<ElementAdministration['type'], { icone: LucideIcon; action: string; rang: number }> = {
  double_facteur: { icone: ShieldAlert, action: 'Comptes', rang: 0 },
  signalement: { icone: MessageSquareWarning, action: 'Traiter', rang: 1 },
  invitation: { icone: MailWarning, action: 'Comptes', rang: 2 },
  chef_sans_compte: { icone: UserX, action: 'Comptes', rang: 3 },
  salarie_sans_compte: { icone: UsersRound, action: 'Comptes', rang: 4 },
  droit_cio: { icone: KeyRound, action: 'Matrice', rang: 5 },
};

// « À traiter aujourd'hui » du CIO (revue CIO, 22/10/2026), en tête de
// Réglages : comptes, accès et retours des utilisateurs en attente.
export function ATraiterAdministration({ slug, onSection }: { slug: string; onSection: (s: 'signalements' | 'administration') => void }) {
  const router = useRouter();
  const [elements, setElements] = useState<ElementAdministration[] | null>(null);
  const [tout, setTout] = useState(false);

  useEffect(() => {
    getATraiterAdministration(slug)
      .then(setElements)
      .catch(() => setElements(null));
  }, [slug]);

  if (!elements) return null;
  const tries = [...elements].sort((a, b) => RANG_TON[a.ton] - RANG_TON[b.ton] || TYPE[a.type].rang - TYPE[b.type].rang || (a.le ?? '').localeCompare(b.le ?? ''));
  const urgents = tries.filter((e) => e.ton === 'risque').length;
  const visibles = tout ? tries : tries.slice(0, VISIBLES);
  const ouvrir = (e: ElementAdministration) =>
    e.type === 'signalement' ? onSection('signalements') : e.type === 'droit_cio' ? onSection('administration') : router.push('/groupe');

  return (
    <section className="panel glass-panel at-rh" aria-label="À traiter aujourd’hui">
      <div className="at-rh-tete">
        <h2 className="dmd-titre">
          <AlarmClock size={17} aria-hidden /> À traiter aujourd’hui · {tries.length}
        </h2>
        {urgents > 0 && <span className="pill pill--risque">{urgents} urgent{urgents > 1 ? 's' : ''}</span>}
      </div>
      {tries.length === 0 ? (
        <p className="dmd-note">Rien en attente : comptes, accès et signalements sont à jour.</p>
      ) : (
        <ul className="at-rh-liste">
          {visibles.map((e) => {
            const t = TYPE[e.type];
            return (
              <li key={e.cle} className="at-rh-ligne" data-ton={e.ton}>
                <span className="at-rh-icone" aria-hidden>
                  <t.icone size={16} strokeWidth={2} />
                </span>
                <span className="at-rh-corps">
                  <strong>{e.titre}</strong>
                  <span className="cell-sub">{e.detail}</span>
                </span>
                <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => ouvrir(e)}>
                  {t.action}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {tries.length > VISIBLES && (
        <button type="button" className="at-rh-plus" aria-expanded={tout} onClick={() => setTout((x) => !x)}>
          <ChevronDown size={15} aria-hidden className={tout ? 'is-ouvert' : undefined} />
          {tout ? 'Réduire' : `Voir les ${tries.length - VISIBLES} autres`}
        </button>
      )}
    </section>
  );
}

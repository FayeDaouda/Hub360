'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getDecisionsRattachees, type DecisionRattachee } from '@/lib/pilotage';

const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const PILL: Record<DecisionRattachee['statut'], string> = { ouverte: 'pill--azur', echeance_depassee: 'pill--risque', close: 'pill--succes' };
const LIBELLE: Record<DecisionRattachee['statut'], string> = { ouverte: 'Ouverte', echeance_depassee: 'Échéance dépassée', close: 'Close' };

// Décisions du registre rattachées à une fiche — projet, cellule ou client
// (revue CTO, 21/10/2026). Rien à afficher, ou pas d'accès au Pilotage : rien.
export function DecisionsFiche({ slug, cible }: { slug: string; cible: { projet?: string; cellule?: string; client?: string } }) {
  const [decisions, setDecisions] = useState<DecisionRattachee[]>([]);
  const cle = cible.projet ?? cible.cellule ?? cible.client ?? '';

  useEffect(() => {
    if (!cle) return;
    getDecisionsRattachees(slug, cible)
      .then(setDecisions)
      .catch(() => setDecisions([]));
    // `cible` est recréé à chaque rendu : la clé suffit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, cle]);

  if (!decisions.length) return null;
  return (
    <section className="dec-fiche" aria-label="Décisions du registre">
      <p className="dec-fiche-titre">
        Décisions du registre · {decisions.length}
        <Link href={`/admin/${slug}?onglet=registre`} className="dec-fiche-lien">
          Registre
        </Link>
      </p>
      <ul>
        {decisions.map((d) => (
          <li key={d.id}>
            <span className="po-code">{d.numero}</span>
            <span className="dec-fiche-texte">
              {d.texte}
              <small>
                {d.responsable}
                {d.echeance ? ` · échéance ${jjmm(d.echeance)}` : ''}
              </small>
            </span>
            <span className={`pill ${PILL[d.statut]}`}>{LIBELLE[d.statut]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

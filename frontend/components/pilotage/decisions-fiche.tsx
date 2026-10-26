'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getDecisionsRattachees, type DecisionRattachee } from '@/lib/pilotage';
import { niveauSuffisant } from '@/lib/auth';
import { useSessionCourante } from '@/lib/layout-contexte';
import { formatDayMonth } from '@/lib/dates';
import { Pill } from '@/components/ui/pill';

const PILL: Record<DecisionRattachee['statut'], string> = {
  proposee: 'pill--attention',
  ouverte: 'pill--azur',
  echeance_depassee: 'pill--risque',
  close: 'pill--succes',
};
const LIBELLE: Record<DecisionRattachee['statut'], string> = {
  proposee: 'Proposée au CEO',
  ouverte: 'Ouverte',
  echeance_depassee: 'Échéance dépassée',
  close: 'Close',
};

// Décisions du registre rattachées à une fiche — projet, cellule ou client
// (revue CTO, 21/10/2026). Rien à afficher, ou pas d'accès au Pilotage : rien.
export function DecisionsFiche({
  slug,
  cible,
}: {
  slug: string;
  cible: { projet?: string; cellule?: string; client?: string };
}) {
  const [decisions, setDecisions] = useState<DecisionRattachee[]>([]);
  const cle = cible.projet ?? cible.cellule ?? cible.client ?? '';
  // Sans le Pilotage (Salarié), pas d'appel voué au refus.
  const voit = niveauSuffisant(useSessionCourante(), 'pilotage', 'lecture');

  useEffect(() => {
    if (!cle || !voit) return;
    getDecisionsRattachees(slug, cible)
      .then(setDecisions)
      .catch(() => setDecisions([]));
    // `cible` est recréé à chaque rendu : la clé suffit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, cle, voit]);

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
                {d.echeance ? ` · échéance ${formatDayMonth(d.echeance)}` : ''}
              </small>
            </span>
            <Pill className={PILL[d.statut]}>{LIBELLE[d.statut]}</Pill>
          </li>
        ))}
      </ul>
    </section>
  );
}

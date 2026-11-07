'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/client-api';
import { getCatalogueModules, type CatalogueModules } from '@/lib/interrupteurs';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { Pill } from '@/components/ui/pill';

const STATUT = {
  en_service: { libelle: 'En service', tone: 'succes' },
  en_partie: { libelle: 'En partie', tone: 'attention' },
  a_venir: { libelle: 'À venir', tone: 'neutre' },
} as const;

// Administration du HUB › Modules (lot 10, 31/10/2026) : tous les modules du
// HUB, rangés par famille, avec leur statut. Pour ceux qui existent, l'état
// dans la société (activé ou coupé) — on le change dans « Interrupteurs ».
// Un module « à venir » n'a pas encore de case dans la matrice.
export function ModulesPanel({ slug, societe }: { slug: string; societe: string }) {
  const [catalogue, setCatalogue] = useState<CatalogueModules | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [essai, setEssai] = useState(0);

  useEffect(() => {
    let annule = false;
    getCatalogueModules(slug)
      .then((c) => !annule && setCatalogue(c))
      .catch(
        (e) =>
          !annule &&
          setErreur(
            e instanceof ApiError
              ? e.message
              : 'Impossible de charger les modules. Vérifiez votre connexion, puis réessayez.',
          ),
      );
    return () => {
      annule = true;
    };
  }, [slug, essai]);

  const reessayer = () => {
    setErreur(null);
    setEssai((n) => n + 1);
  };
  if (erreur) return <ErrorState onRetry={reessayer}>{erreur}</ErrorState>;
  if (!catalogue) return <Skeleton size="sm" />;
  const tous = catalogue.familles.flatMap((f) => f.modules);
  const compte = (s: keyof typeof STATUT) => tous.filter((m) => m.statut === s).length;

  return (
    <section className="panel glass-panel modules">
      <p className="modules-intro">
        {tous.length} modules : {compte('en_service')} en service, {compte('en_partie')} en partie, {compte('a_venir')}{' '}
        à venir. L’état « activé » ou « coupé » vaut pour {societe} ; il se change dans la section Interrupteurs.
      </p>
      {catalogue.familles.map((f) => (
        <div key={f.nom} className="modules-famille">
          <h3>{f.nom}</h3>
          <ul>
            {f.modules.map((m) => (
              <li key={m.nom} className={`modules-ligne modules-ligne--${m.statut}`}>
                <span className="modules-nom">
                  {m.nom}
                  {m.note && <span className="modules-note">{m.note}</span>}
                </span>
                <span className="modules-etat">
                  <Pill tone={STATUT[m.statut].tone}>{STATUT[m.statut].libelle}</Pill>
                  {m.module && (
                    <Pill tone={m.module.actif ? 'info' : 'risque'}>{m.module.actif ? 'Activé' : 'Coupé'}</Pill>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

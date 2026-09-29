'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ApiError } from '@/lib/client-api';
import { getMonEspace } from '@/lib/mon-espace';
import { LIBELLE_CONTRAT } from '@/lib/rh';
import type { ProfilMonEspace } from '@/lib/types';
import { CongesAbsences, RemboursementsSante } from './demandes';
import { MesDocuments } from './documents';
import { MesInformations } from './informations';
import { MonTemps } from './mon-temps';

const ONGLETS = [
  { cle: 'temps', libelle: 'Mon temps', dossierRequis: false },
  { cle: 'conges', libelle: 'Congés et absences', dossierRequis: true },
  { cle: 'remboursements', libelle: 'Remboursements santé', dossierRequis: true },
  { cle: 'informations', libelle: 'Mes informations', dossierRequis: true },
  { cle: 'documents', libelle: 'Mes documents', dossierRequis: true },
] as const;
type Onglet = (typeof ONGLETS)[number]['cle'];

const jjmmaaaa = (iso: string) => iso.split('-').reverse().join('/');

// « Mon espace » (RH lot 5) : l'espace personnel de chaque compte, direction
// comprise, monté dans le back-office comme dans l'espace collaborateur.
// L'onglet vit dans l'URL (?onglet=) pour les liens directs.
export function MonEspace({ slug }: { slug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const demande = params.get('onglet');
  const onglet: Onglet = ONGLETS.some((o) => o.cle === demande) ? (demande as Onglet) : ONGLETS[0].cle;

  const [dossier, setDossier] = useState<ProfilMonEspace | null | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);
  const onglets = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMonEspace(slug)
      .then((r) => setDossier(r.dossier))
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Impossible de charger ton espace.'));
  }, [slug]);

  // Barre d'onglets défilante sur mobile : l'onglet actif reste visible.
  useEffect(() => {
    onglets.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [onglet, dossier]);

  if (erreur) return <p className="empty-state">{erreur}</p>;
  if (dossier === undefined) {
    return (
      <div className="admin-skeleton" aria-hidden>
        <div className="skeleton admin-skeleton-panel" />
      </div>
    );
  }

  const courant = ONGLETS.find((o) => o.cle === onglet)!;
  const choisir = (cle: Onglet) => router.replace(`${pathname}?onglet=${cle}`, { scroll: false });

  return (
    <>
      <div className="mes-entete">
        <span className="mes-initiales" aria-hidden>
          {dossier ? `${dossier.prenom.charAt(0)}${dossier.nom.charAt(0)}`.toUpperCase() : '?'}
        </span>
        <div>
          <h2 className="mes-nom">{dossier ? `${dossier.prenom} ${dossier.nom}`.trim() : 'Mon espace'}</h2>
          {dossier && (
            <p className="cell-sub mes-sous-titre">
              {[
                dossier.poste,
                dossier.societe,
                dossier.cellule,
                `${LIBELLE_CONTRAT[dossier.typeContrat]}${dossier.dateEntree ? ` depuis le ${jjmmaaaa(dossier.dateEntree)}` : ''}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
      </div>

      <div ref={onglets} className="vue-toggle rh-onglets" role="tablist" aria-label="Rubrique de Mon espace">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            type="button"
            role="tab"
            aria-selected={onglet === o.cle}
            className={onglet === o.cle ? 'is-active' : ''}
            onClick={() => choisir(o.cle)}
          >
            {o.libelle}
          </button>
        ))}
      </div>

      {courant.dossierRequis && !dossier ? (
        <p className="empty-state">
          Aucun dossier du personnel n’est relié à ton compte : la RH doit l’ouvrir (ou le relier) avant que cette rubrique
          soit disponible.
        </p>
      ) : onglet === 'temps' ? (
        <MonTemps slug={slug} />
      ) : onglet === 'conges' ? (
        <CongesAbsences slug={slug} />
      ) : onglet === 'remboursements' ? (
        <RemboursementsSante slug={slug} />
      ) : onglet === 'informations' ? (
        <MesInformations slug={slug} dossier={dossier!} onMaj={setDossier} />
      ) : (
        <MesDocuments slug={slug} dossier={dossier!} />
      )}
    </>
  );
}

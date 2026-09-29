'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ApiError } from '@/lib/client-api';
import { useSessionCourante } from '@/lib/layout-contexte';
import { getAbsencesAValider } from '@/lib/demandes';
import { getMonEspace, getTachesAValider } from '@/lib/mon-espace';
import { LIBELLE_CONTRAT } from '@/lib/rh';
import type { ProfilMonEspace } from '@/lib/types';
import { AValider } from './a-valider';
import { CongesAbsences, RemboursementsSante } from './demandes';
import { MesDocuments } from './documents';
import { MesInformations } from './informations';
import { MaCellule } from './ma-cellule';
import { MonTemps } from './mon-temps';
import { MesPerformances } from './performances';

const ONGLETS = [
  { cle: 'performances', libelle: 'Mes performances', dossierRequis: false },
  { cle: 'a-valider', libelle: 'À valider', dossierRequis: false },
  { cle: 'temps', libelle: 'Mon temps', dossierRequis: false },
  { cle: 'cellule', libelle: 'Ma cellule', dossierRequis: false },
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
  const { utilisateur } = useSessionCourante();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const demande = params.get('onglet');
  const onglet: Onglet = ONGLETS.some((o) => o.cle === demande) ? (demande as Onglet) : ONGLETS[0].cle;

  const [dossier, setDossier] = useState<ProfilMonEspace | null | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);
  const onglets = useRef<HTMLDivElement>(null);
  // Tâches remises + absences en attente de ma décision (N+1) : l'onglet
  // « À valider » n'apparaît que s'il y a quelque chose (ou s'il est ouvert).
  const [aValider, setAValider] = useState(0);
  const compter = useCallback((n: number) => setAValider(n), []);

  useEffect(() => {
    getMonEspace(slug)
      .then((r) => setDossier(r.dossier))
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Impossible de charger ton espace.'));
    Promise.all([getTachesAValider(slug), getAbsencesAValider(slug)])
      .then(([t, a]) => setAValider(t.length + a.length))
      .catch(() => setAValider(0));
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
  // Sans dossier RH : le nom du compte connecté.
  const prenom = dossier?.prenom ?? utilisateur.prenom;
  const nom = dossier?.nom ?? utilisateur.nom;
  const choisir = (cle: Onglet) => router.replace(`${pathname}?onglet=${cle}`, { scroll: false });

  return (
    <>
      <div className="mes-entete">
        <span className="mes-initiales" aria-hidden>
          {`${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase()}
        </span>
        <div>
          <h2 className="mes-nom">{`${prenom} ${nom}`.trim()}</h2>
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
        {ONGLETS.filter((o) => o.cle !== 'a-valider' || aValider > 0 || onglet === o.cle).map((o) => (
          <button
            key={o.cle}
            type="button"
            role="tab"
            aria-selected={onglet === o.cle}
            className={onglet === o.cle ? 'is-active' : ''}
            onClick={() => choisir(o.cle)}
          >
            {o.cle === 'a-valider' ? `${o.libelle} · ${aValider}` : o.libelle}
          </button>
        ))}
      </div>

      {courant.dossierRequis && !dossier ? (
        <p className="empty-state">
          Aucun dossier du personnel n’est relié à ton compte : la RH doit l’ouvrir (ou le relier) avant que cette rubrique
          soit disponible.
        </p>
      ) : onglet === 'performances' ? (
        <MesPerformances slug={slug} />
      ) : onglet === 'a-valider' ? (
        <AValider slug={slug} onCompte={compter} />
      ) : onglet === 'temps' ? (
        <MonTemps slug={slug} />
      ) : onglet === 'cellule' ? (
        <MaCellule slug={slug} />
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

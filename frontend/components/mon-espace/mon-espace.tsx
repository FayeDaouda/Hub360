'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ROLE_CEO } from '@/lib/acces-back-office';
import { ApiError } from '@/lib/client-api';
import { useEnteteFixe } from '@/lib/entete-fixe';
import { useSessionCourante, useTitrePage } from '@/lib/layout-contexte';
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

// Deux blocs (revue Salarié 19/10/2026) : le travail au quotidien, puis le
// dossier personnel — neuf onglets à plat étaient trop chargés.
const BLOCS = [
  { cle: 'travail', libelle: 'Mon travail' },
  { cle: 'dossier', libelle: 'Mon dossier' },
] as const;
type Bloc = (typeof BLOCS)[number]['cle'];

const ONGLETS = [
  { cle: 'performances', libelle: 'Mes performances', dossierRequis: false, bloc: 'travail' },
  { cle: 'temps', libelle: 'Mon temps', dossierRequis: false, bloc: 'travail' },
  { cle: 'cellule', libelle: 'Ma cellule', dossierRequis: false, bloc: 'travail' },
  { cle: 'a-valider', libelle: 'À valider', dossierRequis: false, bloc: 'travail' },
  { cle: 'mission', libelle: 'Ma carte de mission', dossierRequis: true, bloc: 'travail' },
  { cle: 'conges', libelle: 'Congés et absences', dossierRequis: true, bloc: 'dossier' },
  { cle: 'remboursements', libelle: 'Remboursements santé', dossierRequis: true, bloc: 'dossier' },
  { cle: 'informations', libelle: 'Mes informations', dossierRequis: true, bloc: 'dossier' },
  { cle: 'documents', libelle: 'Mes documents', dossierRequis: true, bloc: 'dossier' },
] as const;
type Onglet = (typeof ONGLETS)[number]['cle'];

const jjmmaaaa = (iso: string) => iso.split('-').reverse().join('/');

// Rôles qui ne valident rien (maquettes RH et Salarié) : « À valider »
// n'apparaît pour eux que si quelque chose les attend.
const SANS_VALIDATION = new Set(['RH', 'Salarié']);
// Salarié pas encore affecté à une équipe : bandeau d'explication (maquette).
const EQUIPE_ATTENDUE = new Set(['Salarié']);
// Rôles hors circuit des tâches (le CEO n'en reçoit jamais) : ni
// performances, ni temps, ni cellule — son espace s'ouvre sur « À valider »
// (N+1 des directeurs) et ses demandes personnelles.
const SANS_TACHES = new Set([ROLE_CEO]);
const ONGLETS_TACHES = new Set<Onglet>(['performances', 'temps', 'cellule']);

// « Mon espace » (RH lot 5) : l'espace personnel de chaque compte, direction
// comprise, monté dans le back-office comme dans l'espace collaborateur.
// L'onglet vit dans l'URL (?onglet=) pour les liens directs.
export function MonEspace({ slug }: { slug: string }) {
  const { utilisateur, role } = useSessionCourante();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const demande = params.get('onglet');
  const demandeOnglet: Onglet = ONGLETS.some((o) => o.cle === demande) ? (demande as Onglet) : ONGLETS[0].cle;

  const [dossier, setDossier] = useState<ProfilMonEspace | null | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);
  const onglets = useRef<HTMLDivElement>(null);
  // Tâches remises + absences en attente de ma décision (N+1) : compteur de
  // l'onglet « À valider » (toujours affiché, maquette du boss).
  const [aValider, setAValider] = useState(0);
  const compter = useCallback((n: number) => setAValider(n), []);

  // Titre (maquette) : « Mon espace · Prénom Nom » — celui du dossier RH, sinon du compte.
  const nomAffiche = dossier ? `${dossier.prenom} ${dossier.nom}`.trim() : `${utilisateur.prenom} ${utilisateur.nom}`.trim();
  useTitrePage(dossier === undefined ? 'Mon espace' : `Mon espace · ${nomAffiche}`);
  useEnteteFixe();

  useEffect(() => {
    getMonEspace(slug)
      .then((r) => setDossier(r.dossier))
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Impossible de charger votre espace.'));
    Promise.all([getTachesAValider(slug), getAbsencesAValider(slug)])
      .then(([t, a]) => setAValider(t.length + a.length))
      .catch(() => setAValider(0));
  }, [slug]);

  // Barre d'onglets défilante sur mobile : l'onglet actif reste visible.
  useEffect(() => {
    onglets.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [demandeOnglet, dossier]);

  if (erreur) return <p className="empty-state">{erreur}</p>;
  if (dossier === undefined) {
    return (
      <div className="admin-skeleton" aria-hidden>
        <div className="skeleton admin-skeleton-panel" />
      </div>
    );
  }

  // Carte de mission : seulement quand la RH l'a rédigée (nouvel arrivant).
  const visibles = ONGLETS.filter(
    (o) =>
      (o.cle !== 'mission' || !!dossier?.mission) &&
      (o.cle !== 'a-valider' || aValider > 0 || !SANS_VALIDATION.has(role)) &&
      !(SANS_TACHES.has(role) && ONGLETS_TACHES.has(o.cle)),
  );
  const onglet: Onglet = visibles.some((o) => o.cle === demandeOnglet) ? demandeOnglet : visibles[0].cle;
  const courant = ONGLETS.find((o) => o.cle === onglet)!;
  const blocs = BLOCS.filter((b) => visibles.some((o) => o.bloc === b.cle));
  const ongletsDuBloc = visibles.filter((o) => o.bloc === courant.bloc);
  // Sans dossier RH : le nom du compte connecté.
  const prenom = dossier?.prenom ?? utilisateur.prenom;
  const nom = dossier?.nom ?? utilisateur.nom;
  const choisir = (cle: Onglet) => router.replace(`${pathname}?onglet=${cle}`, { scroll: false });
  const choisirBloc = (b: Bloc) => b !== courant.bloc && choisir(visibles.find((o) => o.bloc === b)!.cle);

  return (
    <div className="mes-page page-entete-fixe">
      <div className="mes-entete">
        <span className="mes-initiales" aria-hidden>
          {`${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase()}
        </span>
        <p className="mes-sous-titre">
          {dossier
            ? [
                dossier.poste,
                dossier.societe,
                dossier.cellule ?? (SANS_TACHES.has(role) ? null : 'sans cellule'),
                `${LIBELLE_CONTRAT[dossier.typeContrat]}${dossier.dateEntree ? ` depuis le ${jjmmaaaa(dossier.dateEntree)}` : ''}`,
              ]
                .filter(Boolean)
                .join(' · ')
            : 'Aucun dossier du personnel relié à ce compte'}
        </p>
      </div>

      {/* En-tête fixe : blocs et onglets sur une ligne, au-dessus du contenu qui défile. */}
      <div className="entete-fixe mes-navigation">
        {blocs.length > 1 && (
          <div className="vue-toggle mes-blocs" role="tablist" aria-label="Mon espace">
            {blocs.map((b) => (
              <button
                key={b.cle}
                type="button"
                role="tab"
                aria-selected={courant.bloc === b.cle}
                className={courant.bloc === b.cle ? 'is-active' : ''}
                onClick={() => choisirBloc(b.cle)}
              >
                {/* Une décision attend : visible même depuis « Mon dossier ». */}
                {b.cle === 'travail' && aValider > 0 && courant.bloc !== 'travail' ? `${b.libelle} · ${aValider}` : b.libelle}
              </button>
            ))}
          </div>
        )}

        <div ref={onglets} className="vue-toggle rh-onglets" role="tablist" aria-label="Rubrique de Mon espace">
          {ongletsDuBloc.map((o) => (
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
      </div>

      {dossier && !dossier.cellule && EQUIPE_ATTENDUE.has(role) && (
        <p className="mes-bandeau" role="status">
          Votre dossier est créé par la RH. Vous n’êtes pas encore affecté à une équipe : votre responsable de société le fera depuis
          la rubrique Équipes. Vos performances apparaîtront dès votre premier livrable assigné.
        </p>
      )}

      {courant.dossierRequis && !dossier ? (
        <p className="empty-state">
          Aucun dossier du personnel n’est relié à votre compte : la RH doit l’ouvrir (ou le relier) avant que cette
          rubrique soit disponible.
        </p>
      ) : onglet === 'performances' ? (
        <MesPerformances slug={slug} />
      ) : onglet === 'mission' ? (
        <CarteMission mission={dossier!.mission!} />
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
        <MesDocuments slug={slug} dossier={dossier!} onMaj={setDossier} />
      )}
    </div>
  );
}

// Carte de mission du nouvel arrivant (manuel §3.3), rédigée par la RH.
function CarteMission({ mission }: { mission: NonNullable<ProfilMonEspace['mission']> }) {
  const rubriques: [string, string][] = [
    ['Résultat attendu', mission.resultat],
    ['Livrables', mission.livrables],
    ['KPI', mission.kpi],
    ['Signal d’alerte', mission.signalAlerte],
  ];
  return (
    <section className="panel glass-panel pi-fiche">
      <h2>Ma carte de mission</h2>
      <p className="pi-aide">Rédigée par la RH à votre arrivée ; elle sert de repère jusqu’à la confirmation de votre intégration (90 jours).</p>
      <dl className="pi-rubriques">
        {rubriques.map(([libelle, valeur]) => (
          <div key={libelle}>
            <dt>{libelle}</dt>
            <dd>{valeur.trim() || '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Power } from 'lucide-react';
import { addDays, formatDate, formatTime, todayIso } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import {
  basculerMaintenance,
  basculerModule,
  getCatalogueModules,
  getInterrupteurs,
  type CatalogueModules,
  type Interrupteurs,
} from '@/lib/interrupteurs';
import { getMatriceRoles } from '@/lib/roles';
import { getComptesGroupe } from '@/lib/groupe';
import { getJournalAudit, type LigneAudit } from '@/lib/pilotage';
import type { MatriceRoles, SocieteComptes } from '@/lib/types';
import {
  lastModuleToggle,
  moduleCoverage,
  moduleImpact,
  type ModuleImpact,
  type ModuleToggle,
} from '@/components/groupe/modules-insights';
import { Field } from '@/components/ui/field';
import { Modal, ModalHeader } from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Pill, type PillTone } from '@/components/ui/pill';

type Statut = CatalogueModules['familles'][number]['modules'][number]['statut'];
const STATUT: Record<Statut, { libelle: string; tone: PillTone }> = {
  en_service: { libelle: 'En service', tone: 'succes' },
  en_partie: { libelle: 'En partie', tone: 'attention' },
  a_venir: { libelle: 'À venir', tone: 'neutre' },
};
// Message affiché par le serveur quand le HUB est fermé sans message
// (backend/src/switches/switches.service.ts, MAINTENANCE_MESSAGE).
const MESSAGE_MAINTENANCE_PAR_DEFAUT = 'Le HUB est en maintenance. Réessayez plus tard.';

type DemandeBascule =
  | { type: 'module'; cle: string; nom: string; actif: boolean }
  | { type: 'maintenance'; actif: boolean; message: string };

// Ce qui enrichit la page sans la bloquer : si une lecture échoue, la page
// reste utilisable (sans impact, sans historique).
type Contexte = { matrice: MatriceRoles | null; societe: SocieteComptes | null; journal: LigneAudit[] };

// Le texte du serveur n'est montré que pour un refus métier (400, 403, 409…) ;
// une panne (500 et plus) ou une coupure réseau reçoit un message humain.
const message = (e: unknown, repli: string) => (e instanceof ApiError && e.status < 500 ? e.message : repli);
const comptes = (n: number) => `${n} compte${n > 1 ? 's' : ''}`;
const ilYaUnAn = () => addDays(todayIso(), -365);

// Administration du HUB › Modules (refonte du 08/11/2026, ex-« Modules » et
// « Interrupteurs ») : l'état du HUB (maintenance, pour toutes les sociétés),
// les modules de la société avec leur interrupteur — ce qu'ils couvrent, qui
// perd l'accès en les coupant, leur dernière bascule — et le catalogue du HUB
// en feuille de route. Chaque bascule exige un motif et entre au journal.
export function ModulesPanel({ slug, societe }: { slug: string; societe: string }) {
  const [etat, setEtat] = useState<Interrupteurs | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueModules | null>(null);
  const [contexte, setContexte] = useState<Contexte>({ matrice: null, societe: null, journal: [] });
  const [erreur, setErreur] = useState<string | null>(null);
  const [essai, setEssai] = useState(0);
  const [bascule, setBascule] = useState<DemandeBascule | null>(null);
  const [filtre, setFiltre] = useState<Statut | 'tous'>('tous');
  // Lectures du journal (chargement, relecture après une bascule) : seule la
  // dernière demandée compte, quel que soit l'ordre des réponses.
  const lectureJournal = useRef(0);
  // Bouton qui a ouvert la fenêtre : il reprend le focus à sa fermeture.
  const declencheur = useRef<HTMLElement | null>(null);
  // Annonce de la bascule faite, pour les lecteurs d'écran.
  const [annonce, setAnnonce] = useState('');
  const ouvrir = (d: DemandeBascule, bouton: HTMLElement) => {
    declencheur.current = bouton;
    setAnnonce('');
    setBascule(d);
  };
  const fermer = () => {
    setBascule(null);
    requestAnimationFrame(() => declencheur.current?.focus());
  };

  useEffect(() => {
    let annule = false;
    Promise.all([getInterrupteurs(slug), getCatalogueModules(slug)])
      .then(([e, c]) => {
        if (annule) return;
        setEtat(e);
        setCatalogue(c);
      })
      .catch(
        (e) =>
          !annule &&
          setErreur(message(e, 'Les modules n’ont pas pu être chargés. Vérifiez votre connexion, puis réessayez.')),
      );
    // Enrichissements : chacun peut manquer sans gêner la page.
    const lecture = ++lectureJournal.current;
    void Promise.allSettled([getMatriceRoles(slug), getComptesGroupe(), getJournalAudit(slug, ilYaUnAn())]).then(
      ([m, g, j]) => {
        if (annule) return;
        setContexte((c) => ({
          matrice: m.status === 'fulfilled' ? m.value : null,
          societe: g.status === 'fulfilled' ? (g.value.societes.find((s) => s.slug === slug) ?? null) : null,
          journal: lecture !== lectureJournal.current ? c.journal : j.status === 'fulfilled' ? j.value.lignes : [],
        }));
      },
    );
    return () => {
      annule = true;
    };
  }, [slug, essai]);

  if (erreur) {
    return (
      <ErrorState
        onRetry={() => {
          setErreur(null);
          setEssai((n) => n + 1);
        }}
      >
        {erreur}
      </ErrorState>
    );
  }
  if (!etat || !catalogue) {
    return (
      <section className="groupe-panel glass-panel" aria-busy="true" aria-label="Chargement des modules">
        <Skeleton />
      </section>
    );
  }

  const impact = (cle: string): ModuleImpact | null =>
    contexte.matrice && contexte.societe ? moduleImpact(cle, contexte.matrice, contexte.societe) : null;
  const m = etat.maintenance;
  const coupes = etat.modules.filter((x) => !x.actif).length;
  const actifs = etat.modules.length - coupes;
  const tousCatalogue = catalogue.familles.flatMap((f) => f.modules);
  const nombre = (s: Statut) => tousCatalogue.filter((x) => x.statut === s).length;
  const familles = catalogue.familles
    .map((f) => ({ ...f, visibles: f.modules.filter((x) => filtre === 'tous' || x.statut === filtre) }))
    .filter((f) => f.visibles.length > 0);

  return (
    <section className="groupe-panel glass-panel mod" aria-label="Modules">
      <p className="sr-only" role="status" aria-live="polite">
        {annonce}
      </p>
      <EtatHub
        maintenance={m}
        onBasculer={(b) => ouvrir({ type: 'maintenance', actif: !m.actif, message: m.message }, b)}
      />

      <div className="mod-bloc">
        <header className="mod-bloc-entete">
          <h2>Modules de {societe}</h2>
          <span className="mod-compteur">
            {actifs} activé{actifs > 1 ? 's' : ''} · {coupes} coupé{coupes > 1 ? 's' : ''}
          </span>
        </header>
        <p className="mod-aide">
          Un module coupé disparaît des menus et ses pages sont refusées pour tous les comptes de {societe}, quoi que
          dise la matrice des droits. Vous gardez l’accès à tout. Mon espace reste ouvert à chacun : il n’est pas un
          module de la matrice.
        </p>
        <ul className="mod-grille">
          {etat.modules.map((mod) => (
            <CarteModule
              key={mod.cle}
              module={mod}
              couverture={moduleCoverage(mod.cle, catalogue)}
              impact={impact(mod.cle)}
              derniere={lastModuleToggle(mod.cle, contexte.journal)}
              onBasculer={(b) => ouvrir({ type: 'module', cle: mod.cle, nom: mod.nom, actif: !mod.actif }, b)}
            />
          ))}
        </ul>
      </div>

      <div className="mod-bloc">
        <header className="mod-bloc-entete">
          <h2>Catalogue du HUB</h2>
          <div className="fin-filtres mod-filtres" role="group" aria-label="Filtrer le catalogue">
            {(['tous', 'en_service', 'en_partie', 'a_venir'] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={filtre === s ? 'is-active' : ''}
                aria-pressed={filtre === s}
                onClick={() => setFiltre(s)}
              >
                {s === 'tous' ? `Tous (${tousCatalogue.length})` : `${STATUT[s].libelle} (${nombre(s)})`}
              </button>
            ))}
          </div>
        </header>
        <p className="mod-aide">
          Les fonctions du HUB et leur avancement. L’état « coupé » d’un module vaut pour {societe} seulement.
        </p>
        {familles.length === 0 ? (
          <EmptyState>Aucune fonction avec ce statut.</EmptyState>
        ) : (
          <div className="mod-familles">
            {familles.map((f) => (
              <section key={f.nom} className="mod-famille" aria-label={f.nom}>
                <h3>{f.nom}</h3>
                <ul>
                  {f.visibles.map((x) => (
                    <li key={x.nom} className={`mod-fonction mod-fonction--${x.statut}`}>
                      <span className="mod-fonction-nom">
                        {x.nom}
                        {x.note && <span className="mod-fonction-note">{x.note}</span>}
                      </span>
                      <span className="mod-fonction-etat">
                        <Pill tone={STATUT[x.statut].tone}>{STATUT[x.statut].libelle}</Pill>
                        {x.module && !x.module.actif && <Pill tone="risque">Coupé</Pill>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {bascule && (
        <ModaleBascule
          bascule={bascule}
          societe={societe}
          impact={bascule.type === 'module' ? impact(bascule.cle) : null}
          couverture={bascule.type === 'module' ? moduleCoverage(bascule.cle, catalogue) : []}
          onClose={fermer}
          executer={(motif, texte) =>
            bascule.type === 'module'
              ? basculerModule(slug, bascule.cle, bascule.actif, motif)
              : basculerMaintenance(slug, bascule.actif, texte, motif)
          }
          onFait={(maj) => {
            setEtat(maj);
            // Le catalogue montre aussi l'état des modules : il suit la bascule.
            const actif = new Map(maj.modules.map((x) => [x.cle, x.actif]));
            setCatalogue(
              (c) =>
                c && {
                  familles: c.familles.map((f) => ({
                    ...f,
                    modules: f.modules.map((x) => {
                      const v = x.module ? actif.get(x.module.cle) : undefined;
                      return x.module && v !== undefined ? { ...x, module: { ...x.module, actif: v } } : x;
                    }),
                  })),
                },
            );
            setAnnonce(
              bascule.type === 'module'
                ? `Module ${bascule.nom} ${bascule.actif ? 'réactivé' : 'coupé'} pour ${societe}.`
                : bascule.actif
                  ? 'Le HUB est fermé pour maintenance.'
                  : 'Le HUB est rouvert.',
            );
            fermer();
            // Le journal a une ligne de plus : la dernière bascule se relit.
            const lecture = ++lectureJournal.current;
            void getJournalAudit(slug, ilYaUnAn())
              .then((j) => lecture === lectureJournal.current && setContexte((c) => ({ ...c, journal: j.lignes })))
              .catch(() => {});
          }}
        />
      )}
    </section>
  );
}

function quiQuand(b: { le: string; par: string | null }): string {
  return `le ${formatDate(b.le)} à ${formatTime(b.le)}${b.par ? ` par ${b.par}` : ''}`;
}

function EtatHub({
  maintenance,
  onBasculer,
}: {
  maintenance: Interrupteurs['maintenance'];
  onBasculer: (bouton: HTMLElement) => void;
}) {
  const ferme = maintenance.actif;
  return (
    <article className={`mod-etat${ferme ? ' mod-etat--ferme' : ''}`} aria-label="État du HUB">
      <span className="mod-etat-icone" aria-hidden>
        <Power size={22} />
      </span>
      <div className="mod-etat-texte">
        <div className="mod-etat-titre">
          <h2>{ferme ? 'Le HUB est fermé pour maintenance' : 'Le HUB est ouvert'}</h2>
          <Pill tone={ferme ? 'risque' : 'succes'}>{ferme ? 'Fermé' : 'Ouvert'}</Pill>
        </div>
        {ferme && (
          <p className="mod-etat-message">« {maintenance.message.trim() || MESSAGE_MAINTENANCE_PAR_DEFAUT} »</p>
        )}
        <p className="mod-aide">
          {ferme
            ? 'Tous les comptes, de toutes les sociétés, sont refusés, sauf l’Administrateur HUB et le CIO. Les liens publics des clients (offres, contrats) restent ouverts.'
            : 'Une fermeture pour maintenance bloque la connexion de tous les comptes, dans toutes les sociétés, sauf l’Administrateur HUB et le CIO. Les liens publics des clients (offres, contrats) restent ouverts.'}
        </p>
        {maintenance.depuis && (
          <p className="mod-trace">
            {ferme ? 'Fermé' : 'Rouvert'} {quiQuand(maintenance.depuis)}
          </p>
        )}
      </div>
      <button
        type="button"
        className={ferme ? 'btn-primary mod-etat-bouton' : 'btn-ghost mod-etat-bouton'}
        aria-haspopup="dialog"
        onClick={(e) => onBasculer(e.currentTarget)}
      >
        {ferme ? 'Rouvrir le HUB' : 'Fermer pour maintenance'}
      </button>
    </article>
  );
}

function CarteModule({
  module,
  couverture,
  impact,
  derniere,
  onBasculer,
}: {
  module: Interrupteurs['modules'][number];
  couverture: string[];
  impact: ModuleImpact | null;
  derniere: ModuleToggle | null;
  onBasculer: (bouton: HTMLElement) => void;
}) {
  // Trace du journal, seulement si elle mène à l'état actuel.
  const trace = derniere && derniere.coupe === !module.actif ? derniere : null;
  // Ce que couvre le module, sans répéter son nom (« Recrutement » sous « Recrutement »).
  const couvre = couverture.filter((c) => c !== module.nom);
  return (
    <li className={`mod-carte${module.actif ? '' : ' is-coupe'}`}>
      <div className="mod-carte-tete">
        <strong className="mod-carte-nom">{module.nom}</strong>
        <button
          type="button"
          role="switch"
          aria-checked={module.actif}
          aria-label={`Module ${module.nom}`}
          className={`mod-switch${module.actif ? ' is-on' : ''}`}
          onClick={(e) => onBasculer(e.currentTarget)}
        />
      </div>
      {couvre.length > 0 && <p className="mod-carte-couvre">{couvre.join(' · ')}</p>}
      {module.actif ? (
        <>
          {impact && (
            <p className="mod-carte-impact">
              {impact.comptes
                ? `${comptes(impact.comptes)} y ${impact.comptes > 1 ? 'accèdent' : 'accède'}`
                : 'Aucun compte n’y accède par son rôle'}
            </p>
          )}
          {trace && <p className="mod-trace">Réactivé {quiQuand(trace)}</p>}
        </>
      ) : (
        <>
          <p className="mod-carte-coupe">
            <Pill tone="risque">Coupé</Pill>
            {/* Une seule ligne : la trace du journal (heure, auteur), sinon la date de coupure. */}
            <span>{trace ? quiQuand(trace) : module.desactiveLe && `le ${formatDate(module.desactiveLe)}`}</span>
          </p>
          {module.motif && <p className="mod-carte-motif">« {module.motif} »</p>}
        </>
      )}
    </li>
  );
}

function ModaleBascule({
  bascule,
  societe,
  impact,
  couverture,
  onClose,
  onFait,
  executer,
}: {
  bascule: DemandeBascule;
  societe: string;
  impact: ModuleImpact | null;
  couverture: string[];
  onClose: () => void;
  onFait: (etat: Interrupteurs) => void;
  executer: (motif: string, message: string) => Promise<Interrupteurs>;
}) {
  const [motif, setMotif] = useState('');
  const [texte, setTexte] = useState(bascule.type === 'maintenance' ? bascule.message : '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const couper = bascule.type === 'module' && !bascule.actif;
  const fermer = bascule.type === 'maintenance' && bascule.actif;
  const titre =
    bascule.type === 'module'
      ? `${bascule.actif ? 'Réactiver' : 'Couper'} le module ${bascule.nom}`
      : bascule.actif
        ? 'Fermer le HUB pour maintenance'
        : 'Rouvrir le HUB';

  const action =
    bascule.type === 'module'
      ? couper
        ? { libelle: 'Couper le module', envoi: 'Coupure…' }
        : { libelle: 'Réactiver le module', envoi: 'Réactivation…' }
      : fermer
        ? { libelle: 'Fermer le HUB', envoi: 'Fermeture…' }
        : { libelle: 'Rouvrir le HUB', envoi: 'Réouverture…' };

  async function valider(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      onFait(await executer(motif.trim(), texte.trim()));
    } catch (err) {
      setErreur(message(err, 'La modification n’a pas été enregistrée. Rien n’a changé ; réessayez dans un instant.'));
      setEnvoi(false);
    }
  }

  return (
    <Modal onClose={onClose} busy={envoi} portal className="modal--sm" label={titre}>
      <ModalHeader title={titre} onClose={onClose} closeDisabled={envoi} />
      <form className="modal-body deb-modale" onSubmit={valider}>
        {bascule.type === 'module' && (
          <>
            <p>
              {couper
                ? `Le module disparaît des menus et ses pages sont refusées pour tous les comptes de ${societe}, sauf l’Administrateur HUB et le CIO.`
                : `Le module revient pour tous les comptes de ${societe}, selon la matrice des droits.`}
            </p>
            {(impact || couverture.length > 0) && (
              <div className={`mod-impact${couper ? ' mod-impact--coupe' : ''}`}>
                {impact && (
                  <p className="mod-impact-titre">
                    {impact.comptes === 0
                      ? 'Aucun compte n’y accède aujourd’hui par son rôle.'
                      : couper
                        ? `Accès retiré à ${comptes(impact.comptes)} de ${societe}`
                        : `Accès rendu à ${comptes(impact.comptes)} de ${societe}`}
                  </p>
                )}
                {impact && impact.roles.length > 0 && (
                  <ul className="mod-impact-roles">
                    {impact.roles.map((r) => (
                      <li key={r.nom}>
                        {r.nom} · {comptes(r.comptes)}
                      </li>
                    ))}
                  </ul>
                )}
                {couverture.length > 0 && <p className="mod-impact-pages">Concerne : {couverture.join(', ')}</p>}
              </div>
            )}
          </>
        )}
        {bascule.type === 'maintenance' && (
          <p>
            {fermer
              ? 'Tous les comptes, de toutes les sociétés, sont refusés dès maintenant, sauf l’Administrateur HUB et le CIO.'
              : 'Tous les comptes peuvent de nouveau se connecter, dans toutes les sociétés.'}
          </p>
        )}
        {fermer && (
          <>
            <Field label="Message affiché aux comptes">
              <input
                className="field-input"
                autoFocus
                maxLength={300}
                placeholder="ex. Mise à jour en cours, retour vers 14 h."
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
              />
            </Field>
            {/* Ce que verront les comptes : le message sous le formulaire de connexion. */}
            <div className="mod-apercu">
              <span className="mod-apercu-titre">Ce que verront les comptes à la connexion</span>
              <div className="mod-apercu-ecran" aria-hidden>
                <span className="mod-apercu-champ" />
                <span className="mod-apercu-champ" />
                <p className="auth-erreur">{texte.trim() || MESSAGE_MAINTENANCE_PAR_DEFAUT}</p>
              </div>
            </div>
          </>
        )}
        <Field label="Motif">
          <input
            className="field-input"
            autoFocus={!fermer}
            required
            minLength={3}
            maxLength={500}
            aria-describedby="mod-motif-aide"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
          />
        </Field>
        <p id="mod-motif-aide" className="field-hint mod-motif-aide">
          Obligatoire, 3 caractères au moins. Inscrit au journal d’audit.
        </p>
        {erreur && (
          <p className="field-erreur" role="alert">
            {erreur}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={onClose} disabled={envoi}>
            Annuler
          </button>
          <button
            type="submit"
            className={couper || fermer ? 'btn-danger' : 'btn-primary'}
            disabled={envoi || motif.trim().length < 3}
          >
            {envoi ? action.envoi : action.libelle}
          </button>
        </div>
      </form>
    </Modal>
  );
}

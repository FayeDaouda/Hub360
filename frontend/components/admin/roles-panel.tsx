'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { NO_RIGHTS, normalizeRights, RIGHT_LABELS, RIGHTS, type Right, type RightSet } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import { enregistrerDroits, getMatriceRoles, type ChangementDroits } from '@/lib/roles';
import type { EtapeMatrice, MatriceRoles, RoleMatrice } from '@/lib/types';
import { Pill } from '@/components/ui/pill';
import { Skeleton } from '@/components/ui/feedback';
import { useUnsavedChangesGuard } from '@/components/unsaved-changes-guard';

// Ce que veut dire chaque droit, partout (la phrase de l'étape le précise).
const SENS: Record<Right, string> = {
  lecture: 'voir',
  ecriture: 'créer et modifier',
  validation: 'valider, refuser, signer, payer',
  suppression: 'supprimer ou archiver',
};
// Lettre de chaque droit dans la grille (la légende et l'infobulle la disent en entier).
const LETTRE: Record<Right, string> = { lecture: 'L', ecriture: 'E', validation: 'V', suppression: 'S' };

const cleCase = (roleId: string, etapeCle: string) => `${roleId}|${etapeCle}`;
const memes = (a: RightSet, b: RightSet) => RIGHTS.every((r) => a[r] === b[r]);
const applicables = (e: EtapeMatrice): RightSet =>
  Object.fromEntries(RIGHTS.map((r) => [r, e.libelles[r] !== undefined])) as RightSet;
// Cases (droit × rôle × étape) qui diffèrent entre deux jeux de droits.
const ecart = (a: RightSet, b: RightSet) => RIGHTS.filter((r) => a[r] !== b[r]).length;
const casesModifiees = (n: number) =>
  n > 1 ? `${n} cases modifiées, pas encore enregistrées` : `${n} case modifiée, pas encore enregistrée`;

function Lettre({ droit, className = '' }: { droit: Right; className?: string }) {
  return (
    <span className={`droit-lettre droit-lettre--${droit} ${className}`} aria-hidden>
      {LETTRE[droit]}
    </span>
  );
}

// Matrice des droits (31/10/2026 ; refonte du 08/11/2026) : un module à la
// fois, ses étapes en accordéon (une ouverte), et pour chaque rôle les quatre
// droits en cases L/E/V/S. On coche, puis on enregistre : le serveur applique
// tout d'un coup et chaque personne concernée reçoit un seul avis en haut de
// sa page. Quitter avec des cases non enregistrées ouvre une fenêtre (garde).
// Réservée au CIO et à l'Administrateur HUB (le serveur refuse les autres) ;
// aussi affichée dans Réglages › Administration.
export function RolesPanel({ slug }: { slug: string }) {
  const [matrice, setMatrice] = useState<MatriceRoles | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [essai, setEssai] = useState(0);
  const [moduleCle, setModuleCle] = useState<string | null>(null);
  const [etapeOuverte, setEtapeOuverte] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState<Map<string, RightSet>>(new Map());
  const [enregistrement, setEnregistrement] = useState(false);
  const idBase = useId();

  useEffect(() => {
    let annule = false;
    getMatriceRoles(slug)
      .then((donnees) => {
        if (annule) return;
        setMatrice(donnees);
        setModuleCle((c) => c ?? donnees.modules[0]?.cle ?? null);
        setEtapeOuverte((e) => e ?? donnees.modules[0]?.etapes[0]?.cle ?? null);
      })
      .catch((e) => {
        if (!annule) {
          setErreur(e instanceof ApiError ? e.message : 'Impossible de charger les droits — le serveur ne répond pas.');
        }
      });
    return () => {
      annule = true;
    };
  }, [slug, essai]);

  const enregistres = (role: RoleMatrice, etapeCle: string): RightSet => role.droits[etapeCle] ?? NO_RIGHTS;
  const affiches = (role: RoleMatrice, etapeCle: string): RightSet =>
    brouillon.get(cleCase(role.id, etapeCle)) ?? enregistres(role, etapeCle);

  // Cases modifiées, au total et par étape (une case = un droit d'un rôle).
  const modifs = useMemo(() => {
    const parEtape = new Map<string, number>();
    let total = 0;
    if (!matrice) return { total, parEtape };
    for (const [cle, droits] of brouillon) {
      const [roleId, etapeCle] = cle.split('|');
      const role = matrice.roles.find((r) => r.id === roleId);
      const n = role ? ecart(droits, role.droits[etapeCle] ?? NO_RIGHTS) : 0;
      parEtape.set(etapeCle, (parEtape.get(etapeCle) ?? 0) + n);
      total += n;
    }
    return { total, parEtape };
  }, [matrice, brouillon]);

  // true si c'est enregistré, sinon le message d'erreur (repris par la
  // fenêtre de garde).
  async function enregistrer(): Promise<true | string> {
    const changements: ChangementDroits[] = [...brouillon].map(([cle, droits]) => {
      const [roleId, etapeCle] = cle.split('|');
      return { roleId, etapeCle, droits };
    });
    setEnregistrement(true);
    setErreur(null);
    try {
      setMatrice(await enregistrerDroits(slug, changements));
      setBrouillon(new Map());
      setInfo(
        'Enregistré. Les personnes concernées voient le changement tout de suite, avec un avis en haut de leur page.',
      );
      return true;
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'L’enregistrement a échoué. Vos cases cochées sont gardées.';
      setErreur(message);
      return message;
    } finally {
      setEnregistrement(false);
    }
  }

  // Pendant un enregistrement, la garde se tait : pas de second envoi par
  // « Enregistrer et continuer ».
  const fenetreGarde = useUnsavedChangesGuard({
    pending: enregistrement ? 0 : modifs.total,
    description: `${modifs.total} ${modifs.total > 1 ? 'cases modifiées' : 'case modifiée'} dans les droits des rôles`,
    save: enregistrer,
  });

  if (erreur && !matrice) {
    return (
      <div className="dash-erreur" role="alert">
        <p>{erreur}</p>
        <button
          type="button"
          className="btn-ghost btn-ghost--sm"
          onClick={() => {
            setErreur(null);
            setEssai((n) => n + 1);
          }}
        >
          <RefreshCw size={15} aria-hidden />
          <span>Réessayer</span>
        </button>
      </div>
    );
  }
  if (!matrice) {
    return (
      <div className="admin-skeleton" aria-hidden>
        <Skeleton />
      </div>
    );
  }

  function basculer(role: RoleMatrice, etape: EtapeMatrice, droit: Right) {
    const actuels = affiches(role, etape.cle);
    // Retirer la lecture retire tout : on n'agit pas sur ce qu'on ne voit pas.
    const suivants =
      droit === 'lecture' && actuels.lecture
        ? NO_RIGHTS
        : normalizeRights({ ...actuels, [droit]: !actuels[droit] }, applicables(etape));
    setInfo(null);
    setBrouillon((b) => {
      const n = new Map(b);
      const cle = cleCase(role.id, etape.cle);
      if (memes(suivants, enregistres(role, etape.cle))) n.delete(cle);
      else n.set(cle, suivants);
      return n;
    });
  }

  const moduleActif = matrice.modules.find((m) => m.cle === moduleCle) ?? matrice.modules[0];
  const rolesReglables = matrice.roles.filter((r) => !r.carteBlanche);
  const modifsModule = (cles: string[]) => cles.reduce((n, c) => n + (modifs.parEtape.get(c) ?? 0), 0);

  return (
    <section className="panel glass-panel droits" aria-label="Droits des rôles">
      <div className="droits-legende">
        <p className="droits-intro">
          Chaque étape d’un module se règle avec quatre droits, indépendants les uns des autres. Cocher Écriture,
          Validation ou Suppression coche aussi Lecture ; retirer Lecture retire tout.
        </p>
        <dl className="droits-sens">
          {RIGHTS.map((r) => (
            <div key={r}>
              <dt>
                <Lettre droit={r} className="droit-lettre--plein" />
                {RIGHT_LABELS[r]}
              </dt>
              <dd>{SENS[r]}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="droits-modules" role="group" aria-label="Module">
        {matrice.modules.map((m) => {
          const n = modifsModule(m.etapes.map((e) => e.cle));
          const actif = m.cle === moduleActif?.cle;
          return (
            <button
              key={m.cle}
              type="button"
              aria-pressed={actif}
              className={`droits-module${actif ? ' is-active' : ''}`}
              onClick={() => {
                setModuleCle(m.cle);
                setEtapeOuverte(m.etapes[0]?.cle ?? null);
              }}
            >
              {m.nom}
              {n > 0 && (
                <span className="droits-module-compte" title={casesModifiees(n)}>
                  {n}
                  <span className="sr-only"> {casesModifiees(n)}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="droits-etapes">
        {moduleActif?.etapes.map((etape) => {
          const ouverte = etape.cle === etapeOuverte;
          const idCorps = `${idBase}-${etape.cle}`;
          const avecDroit = rolesReglables.filter((r) => RIGHTS.some((d) => affiches(r, etape.cle)[d])).length;
          const nModifs = modifs.parEtape.get(etape.cle) ?? 0;
          return (
            <article key={etape.cle} className={`droits-etape${ouverte ? ' is-ouverte' : ''}`}>
              <h3 className="droits-etape-titre">
                <button
                  type="button"
                  className="droits-etape-entete"
                  aria-expanded={ouverte}
                  aria-controls={ouverte ? idCorps : undefined}
                  onClick={() => setEtapeOuverte(ouverte ? null : etape.cle)}
                >
                  <ChevronRight size={16} aria-hidden className="droits-etape-chevron" />
                  <span className="droits-etape-texte">
                    <span className="droits-etape-nom">{etape.nom}</span>
                    <span className="droits-etape-resume">
                      {avecDroit === 0
                        ? 'Aucun rôle n’a de droit sur cette étape'
                        : `${avecDroit} rôle${avecDroit > 1 ? 's' : ''} sur ${rolesReglables.length} avec au moins un droit`}
                    </span>
                  </span>
                  <span className="droits-etape-applicables">
                    {RIGHTS.filter((r) => etape.libelles[r] !== undefined).map((r) => (
                      <Lettre key={r} droit={r} className="droit-lettre--mini" />
                    ))}
                    <span className="sr-only">
                      Droits possibles :{' '}
                      {RIGHTS.filter((r) => etape.libelles[r] !== undefined)
                        .map((r) => RIGHT_LABELS[r])
                        .join(', ')}
                    </span>
                  </span>
                  {nModifs > 0 && (
                    <span className="droits-module-compte" title={casesModifiees(nModifs)}>
                      {nModifs}
                      <span className="sr-only"> {casesModifiees(nModifs)}</span>
                    </span>
                  )}
                </button>
              </h3>

              {ouverte && (
                <div id={idCorps} className="droits-etape-corps">
                  <dl className="droits-phrases">
                    {RIGHTS.map((r) => (
                      <div key={r} className={etape.libelles[r] === undefined ? 'is-sans-objet' : ''}>
                        <dt>
                          <Lettre droit={r} className="droit-lettre--mini" />
                          {RIGHT_LABELS[r]}
                        </dt>
                        <dd>{etape.libelles[r] ?? 'Sans objet pour cette étape'}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="droits-grille">
                    <table className="droits-table">
                      <thead>
                        <tr>
                          <th scope="col">Rôle</th>
                          {RIGHTS.map((r) => (
                            <th key={r} scope="col" title={RIGHT_LABELS[r]}>
                              <Lettre
                                droit={r}
                                className={`droit-lettre--mini${etape.libelles[r] === undefined ? ' is-sans-objet' : ''}`}
                              />
                              <span className="sr-only">{RIGHT_LABELS[r]}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {matrice.roles.map((role) => (
                          <tr key={role.id}>
                            <th scope="row" className="droits-role">
                              <span>{role.nom}</span>
                              {role.transverse && <Pill tone="neutre">Transverse</Pill>}
                            </th>
                            {role.carteBlanche ? (
                              <td colSpan={RIGHTS.length} className="droits-carte-blanche">
                                Carte blanche : les quatre droits, partout
                              </td>
                            ) : (
                              RIGHTS.map((r) => {
                                const sansObjet = etape.libelles[r] === undefined;
                                const valeur = affiches(role, etape.cle)[r];
                                const change = valeur !== enregistres(role, etape.cle)[r];
                                const nom = `${role.nom} · ${RIGHT_LABELS[r]} · ${moduleActif.nom} › ${etape.nom}`;
                                return (
                                  <td key={r} className={change ? 'is-modifie' : undefined}>
                                    {sansObjet ? (
                                      <span
                                        className="droits-case is-sans-objet"
                                        title={`${RIGHT_LABELS[r]} : sans objet`}
                                      >
                                        —<span className="sr-only">{RIGHT_LABELS[r]} sans objet</span>
                                      </span>
                                    ) : (
                                      <label className="droits-case" title={`${RIGHT_LABELS[r]} — ${SENS[r]}`}>
                                        <input
                                          type="checkbox"
                                          checked={valeur}
                                          disabled={enregistrement}
                                          onChange={() => basculer(role, etape, r)}
                                          aria-label={change ? `${nom}, modifiée, pas encore enregistrée` : nom}
                                        />
                                        <Lettre droit={r} />
                                      </label>
                                    )}
                                  </td>
                                );
                              })
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className={`droits-barre${modifs.total ? ' is-visible' : ''}`} aria-live="polite">
        {erreur && (
          <p className="field-erreur" role="alert">
            {erreur}
          </p>
        )}
        {info && !modifs.total && (
          <p className="pi-aide" role="status">
            {info}
          </p>
        )}
        {modifs.total > 0 && (
          <div className="droits-barre-actions">
            <span className="droits-barre-point" aria-hidden />
            <span className="droits-barre-texte">
              {casesModifiees(modifs.total)}. Les personnes concernées recevront un avis en haut de leur page.
            </span>
            <button
              type="button"
              className="btn-ghost btn-ghost--sm"
              disabled={enregistrement}
              onClick={() => {
                setBrouillon(new Map());
                setErreur(null);
              }}
            >
              Annuler les modifications
            </button>
            <button
              type="button"
              className="btn-primary btn-primary--sm"
              disabled={enregistrement}
              onClick={() => void enregistrer()}
            >
              {enregistrement
                ? 'Enregistrement…'
                : `Enregistrer ${modifs.total > 1 ? `les ${modifs.total} changements` : 'le changement'}`}
            </button>
          </div>
        )}
      </div>
      {fenetreGarde}
    </section>
  );
}

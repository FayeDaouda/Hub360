'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { NO_RIGHTS, normalizeRights, RIGHT_LABELS, RIGHTS, type Right, type RightSet } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import { enregistrerDroits, getMatriceRoles, type ChangementDroits } from '@/lib/roles';
import type { EtapeMatrice, MatriceRoles, RoleMatrice } from '@/lib/types';
import { Pill } from '@/components/ui/pill';
import { Skeleton } from '@/components/ui/feedback';

// Ce que veut dire chaque droit, partout (la phrase de l'étape le précise).
const SENS: Record<Right, string> = {
  lecture: 'voir',
  ecriture: 'créer et modifier',
  validation: 'valider, refuser, signer, payer',
  suppression: 'supprimer ou archiver',
};

const cleCase = (roleId: string, etapeCle: string) => `${roleId}|${etapeCle}`;
const memes = (a: RightSet, b: RightSet) => RIGHTS.every((r) => a[r] === b[r]);
const applicables = (e: EtapeMatrice): RightSet =>
  Object.fromEntries(RIGHTS.map((r) => [r, e.libelles[r] !== undefined])) as RightSet;

// Matrice des droits (31/10/2026) : un module à la fois, ses étapes, et pour
// chaque rôle les quatre droits en toutes lettres. On coche, puis on
// enregistre : le serveur applique tout d'un coup et chaque personne
// concernée reçoit un seul avis en haut de sa page. Réservée au CIO et à
// l'Administrateur HUB (le serveur refuse les autres).
export function RolesPanel({ slug }: { slug: string }) {
  const [matrice, setMatrice] = useState<MatriceRoles | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [essai, setEssai] = useState(0);
  const [moduleCle, setModuleCle] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState<Map<string, RightSet>>(new Map());
  const [enregistrement, setEnregistrement] = useState(false);

  useEffect(() => {
    let annule = false;
    setMatrice(null);
    setErreur(null);
    getMatriceRoles(slug)
      .then((donnees) => {
        if (annule) return;
        setMatrice(donnees);
        setModuleCle((c) => c ?? donnees.modules[0]?.cle ?? null);
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

  // Modifications non enregistrées : on prévient avant de quitter la page.
  useEffect(() => {
    if (!brouillon.size) return;
    const retenir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', retenir);
    return () => window.removeEventListener('beforeunload', retenir);
  }, [brouillon.size]);

  const enAttenteParModule = useMemo(() => {
    const compte = new Map<string, number>();
    if (!matrice) return compte;
    for (const m of matrice.modules) {
      const cles = new Set(m.etapes.map((e) => e.cle));
      compte.set(m.cle, [...brouillon.keys()].filter((k) => cles.has(k.split('|')[1])).length);
    }
    return compte;
  }, [matrice, brouillon]);

  if (erreur && !matrice) {
    return (
      <div className="dash-erreur" role="alert">
        <p>{erreur}</p>
        <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setEssai((n) => n + 1)}>
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

  const enregistres = (role: RoleMatrice, etapeCle: string): RightSet => role.droits[etapeCle] ?? NO_RIGHTS;
  const affiches = (role: RoleMatrice, etapeCle: string): RightSet =>
    brouillon.get(cleCase(role.id, etapeCle)) ?? enregistres(role, etapeCle);

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

  async function enregistrer() {
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
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'L’enregistrement a échoué. Vos cases cochées sont gardées.');
    } finally {
      setEnregistrement(false);
    }
  }

  const moduleActif = matrice.modules.find((m) => m.cle === moduleCle) ?? matrice.modules[0];

  return (
    <section className="panel glass-panel droits">
      <div className="droits-legende">
        <p className="droits-intro">
          Chaque étape d’un module se règle avec quatre droits, indépendants les uns des autres. Cocher Écriture,
          Validation ou Suppression coche aussi Lecture.
        </p>
        <dl className="droits-sens">
          {RIGHTS.map((r) => (
            <div key={r}>
              <dt>{RIGHT_LABELS[r]}</dt>
              <dd>{SENS[r]}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="droits-modules" role="tablist" aria-label="Module">
        {matrice.modules.map((m) => {
          const n = enAttenteParModule.get(m.cle) ?? 0;
          return (
            <button
              key={m.cle}
              type="button"
              role="tab"
              aria-selected={m.cle === moduleActif?.cle}
              className={`droits-module${m.cle === moduleActif?.cle ? ' is-active' : ''}`}
              onClick={() => setModuleCle(m.cle)}
            >
              {m.nom}
              {n > 0 && <span className="droits-module-compte">{n}</span>}
            </button>
          );
        })}
      </div>

      {moduleActif?.etapes.map((etape) => (
        <article key={etape.cle} className="droits-etape" aria-label={`${moduleActif.nom} · ${etape.nom}`}>
          <header className="droits-etape-tete">
            <h3>{moduleActif.nom}</h3>
            <span className="droits-etape-nom">{etape.nom}</span>
          </header>
          <dl className="droits-phrases">
            {RIGHTS.map((r) => (
              <div key={r} className={etape.libelles[r] === undefined ? 'is-sans-objet' : ''}>
                <dt>{RIGHT_LABELS[r]}</dt>
                <dd>{etape.libelles[r] ?? 'Sans objet pour cette étape'}</dd>
              </div>
            ))}
          </dl>
          <table className="droits-table">
            <thead>
              <tr>
                <th scope="col">Rôle</th>
                {RIGHTS.map((r) => (
                  <th key={r} scope="col">
                    {RIGHT_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrice.roles.map((role) => (
                <tr key={role.id}>
                  <th scope="row" className="droits-role">
                    {role.nom}
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
                      return (
                        <td key={r} className={change ? 'is-modifie' : undefined}>
                          {sansObjet ? (
                            <span className="droits-case is-sans-objet" aria-label={`${RIGHT_LABELS[r]} sans objet`}>
                              —
                            </span>
                          ) : (
                            <label className="droits-case">
                              <input
                                type="checkbox"
                                checked={valeur}
                                disabled={enregistrement}
                                onChange={() => basculer(role, etape, r)}
                                aria-label={`${role.nom} · ${RIGHT_LABELS[r]} · ${moduleActif.nom} › ${etape.nom}`}
                              />
                              <span className="droits-case-mot">{RIGHT_LABELS[r]}</span>
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
        </article>
      ))}

      <div className={`droits-barre${brouillon.size ? ' is-visible' : ''}`} aria-live="polite">
        {erreur && (
          <p className="field-erreur" role="alert">
            {erreur}
          </p>
        )}
        {info && !brouillon.size && (
          <p className="pi-aide" role="status">
            {info}
          </p>
        )}
        {brouillon.size > 0 && (
          <div className="droits-barre-actions">
            <span>
              {brouillon.size} {brouillon.size > 1 ? 'cases modifiées' : 'case modifiée'}, pas encore enregistrée
              {brouillon.size > 1 ? 's' : ''}
            </span>
            <button
              type="button"
              className="btn-ghost btn-ghost--sm"
              disabled={enregistrement}
              onClick={() => setBrouillon(new Map())}
            >
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary btn-primary--sm"
              disabled={enregistrement}
              onClick={enregistrer}
            >
              {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

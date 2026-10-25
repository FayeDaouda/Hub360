'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { getMatriceRoles, majPermissionRole } from '@/lib/roles';
import type { MatriceRoles, NiveauPermission } from '@/lib/types';

const NIVEAUX: { cle: NiveauPermission; libelle: string }[] = [
  { cle: 'aucun', libelle: 'Aucun' },
  { cle: 'lecture', libelle: 'Lecture' },
  { cle: 'ecriture', libelle: 'Écriture' },
  { cle: 'validation', libelle: 'Validation' },
];

// Matrice des rôles × modules d'une société. Chaque ligne s'édite si le
// serveur la déclare `modifiable` pour l'appelant : l'admin société édite
// les rôles de sa société ; le CIO (super admin du HUB) aussi, plus les
// rôles transverses (CEO/CTO/CIO) ; les rôles socles restent en lecture.
export function RolesPanel({ slug }: { slug: string }) {
  const [matrice, setMatrice] = useState<MatriceRoles | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [essai, setEssai] = useState(0);
  const [enCours, setEnCours] = useState<string | null>(null); // `${roleId}:${cle}` en vol
  // Rôle CIO (revue CIO, 22/10/2026) : la case attend la validation du CEO.
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    setMatrice(null);
    setErreur(null);
    getMatriceRoles(slug)
      .then((donnees) => {
        if (!annule) setMatrice(donnees);
      })
      .catch((e) => {
        if (!annule) {
          setErreur(e instanceof ApiError ? e.message : 'Impossible de charger les rôles — le serveur ne répond pas.');
        }
      });
    return () => {
      annule = true;
    };
  }, [slug, essai]);

  async function changerNiveau(roleId: string, moduleCle: string, niveau: NiveauPermission) {
    if (!matrice) return;
    const cleEnCours = `${roleId}:${moduleCle}`;
    const precedent = matrice.roles.find((r) => r.id === roleId)?.permissions[moduleCle];
    setMatrice({
      ...matrice,
      roles: matrice.roles.map((r) =>
        r.id === roleId ? { ...r, permissions: { ...r.permissions, [moduleCle]: niveau } } : r,
      ),
    });
    setEnCours(cleEnCours);
    setInfo(null);
    const revenir = () =>
      setMatrice((m) =>
        m
          ? {
              ...m,
              roles: m.roles.map((r) =>
                r.id === roleId ? { ...r, permissions: { ...r.permissions, [moduleCle]: precedent } } : r,
              ),
            }
          : m,
      );
    try {
      const r = await majPermissionRole(slug, roleId, moduleCle, niveau);
      if (r.enAttente) {
        revenir();
        setInfo('Les droits du CIO ne changent qu’après validation du CEO : la demande lui est envoyée.');
      }
    } catch (e) {
      setMatrice((m) =>
        m
          ? {
              ...m,
              roles: m.roles.map((r) =>
                r.id === roleId ? { ...r, permissions: { ...r.permissions, [moduleCle]: precedent } } : r,
              ),
            }
          : m,
      );
      setErreur(e instanceof ApiError ? e.message : 'La mise à jour a échoué.');
    } finally {
      setEnCours(null);
    }
  }

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
        <div className="skeleton admin-skeleton-panel" />
      </div>
    );
  }

  return (
    <section className="panel glass-panel">
      {erreur && (
        <p className="field-erreur" role="alert">
          {erreur}
        </p>
      )}
      {info && (
        <p className="pi-aide" role="status">
          {info}
        </p>
      )}
      <div className="admin-table-wrap admin-table-wrap--fixe">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Rôle</th>
              {matrice.modules.map((m) => (
                <th key={m.cle}>{m.nom}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrice.roles.map((role) => (
              <tr key={role.id}>
                <td data-label="Rôle">
                  {role.nom}
                  {role.transverse && (
                    <span className="pill pill--neutre" style={{ marginLeft: '0.5rem' }}>
                      Transverse
                    </span>
                  )}
                </td>
                {matrice.modules.map((m) => {
                  const niveau = role.permissions[m.cle] ?? 'aucun';
                  if (!role.modifiable) {
                    return (
                      <td data-label={m.nom} key={m.cle}>
                        <span className={`pill pill--${niveau}`}>{NIVEAUX.find((n) => n.cle === niveau)?.libelle}</span>
                      </td>
                    );
                  }
                  return (
                    <td data-label={m.nom} key={m.cle}>
                      <select
                        className={`statut-select statut-select--${niveau}`}
                        aria-label={`${role.nom} — ${m.nom}`}
                        value={niveau}
                        disabled={enCours === `${role.id}:${m.cle}`}
                        onChange={(e) => changerNiveau(role.id, m.cle, e.target.value as NiveauPermission)}
                      >
                        {NIVEAUX.map((n) => (
                          <option key={n.cle} value={n.cle} className={`statut-select--${n.cle}`}>
                            {n.libelle}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

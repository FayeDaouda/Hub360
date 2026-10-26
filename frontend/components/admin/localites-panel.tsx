'use client';

import { useEffect, useMemo, useState } from 'react';
import { Lock, Pencil, Plus, RefreshCw, Search } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { creerLocalite, getLocalites, modifierLocalite, normaliserRecherche } from '@/lib/localites';
import {
  LIBELLE_REGION_LOCALITE,
  ZONES_LOCALITE,
  type Localite,
  type NouvelleLocalitePayload,
  type ZoneLocalite,
} from '@/lib/types';
import { LocaliteModal } from './localite-modal';

// Référentiel des localités — partagé par toutes les sociétés du HUB, géré
// par la direction (societe_admin ou CIO). Un onglet par zone du fichier
// source, groupé par département / région / zone géographique.
export function LocalitesPanel({ slug }: { slug: string }) {
  const [localites, setLocalites] = useState<Localite[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [essai, setEssai] = useState(0);
  const [zone, setZone] = useState<ZoneLocalite>('dakar');
  const [recherche, setRecherche] = useState('');
  // undefined = fermée ; null = création ; Localite = modification.
  const [edition, setEdition] = useState<Localite | null | undefined>(undefined);

  useEffect(() => {
    let annule = false;
    setLocalites(null);
    setErreur(null);
    getLocalites(slug)
      .then((d) => {
        if (!annule) setLocalites(d);
      })
      .catch((e) => {
        if (!annule) {
          setErreur(e instanceof ApiError ? e.message : 'Impossible de charger les localités.');
        }
      });
    return () => {
      annule = true;
    };
  }, [slug, essai]);

  const groupes = useMemo(() => {
    const terme = normaliserRecherche(recherche.trim());
    const map = new Map<string, Localite[]>();
    for (const l of localites ?? []) {
      if (l.zone !== zone) continue;
      if (
        terme &&
        !normaliserRecherche([l.nom, l.code, l.region, l.arrondissement ?? '', l.commune ?? ''].join(' ')).includes(
          terme,
        )
      ) {
        continue;
      }
      map.set(l.region, [...(map.get(l.region) ?? []), l]);
    }
    return [...map.entries()];
  }, [localites, zone, recherche]);

  async function enregistrer(payload: NouvelleLocalitePayload) {
    try {
      if (edition) {
        const { zone: _zone, ...champs } = payload;
        const maj = await modifierLocalite(slug, edition.id, champs);
        setLocalites((ls) => (ls ? ls.map((l) => (l.id === maj.id ? maj : l)) : ls));
      } else {
        const creee = await creerLocalite(slug, payload);
        setLocalites((ls) => (ls ? [...ls, creee] : [creee]));
        setZone(creee.zone);
      }
      setEdition(undefined);
    } catch (e) {
      // Remonté à la modale, qui reste ouverte avec le message du serveur.
      throw new Error(e instanceof ApiError ? e.message : 'Enregistrement impossible.');
    }
  }

  if (erreur && !localites) {
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
  if (!localites) {
    return (
      <div className="admin-skeleton" aria-hidden>
        <div className="skeleton admin-skeleton-panel" />
      </div>
    );
  }

  const parZone = (z: ZoneLocalite) => localites.filter((l) => l.zone === z).length;

  return (
    <>
      <div className="localites-barre">
        <div className="admin-periode-toggle" role="group" aria-label="Onglet du référentiel">
          {(Object.keys(ZONES_LOCALITE) as ZoneLocalite[]).map((z) => (
            <button
              key={z}
              type="button"
              className={z === zone ? 'is-active' : ''}
              aria-pressed={z === zone}
              onClick={() => setZone(z)}
            >
              {ZONES_LOCALITE[z]} · {parZone(z)}
            </button>
          ))}
        </div>
        <div className="champ-recherche localites-recherche">
          <Search size={15} aria-hidden />
          <input
            type="search"
            className="field-input"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Nom, code, arrondissement…"
            aria-label="Rechercher une localité"
          />
        </div>
        <button type="button" className="btn-primary" onClick={() => setEdition(null)}>
          <Plus size={15} aria-hidden />
          Ajouter une localité
        </button>
      </div>

      <p className="localites-intro">
        Partagé par toutes les sociétés du HUB. Chaque code est unique sur les trois onglets ; un code déjà utilisé par
        un dossier est figé <Lock size={11} aria-label="(verrou)" /> : seul le nom reste modifiable.
      </p>

      {groupes.length === 0 && <p className="empty-state">Aucune localité ne correspond à cette recherche.</p>}

      {groupes.map(([region, ls]) => (
        <section className="panel glass-panel localites-groupe" key={region}>
          <h3 className="panel-title">
            <span className="localites-groupe-niveau">{LIBELLE_REGION_LOCALITE[zone]}</span> {region}
          </h3>
          <ul className="localites-liste">
            {ls.map((l) => (
              <li key={l.id} className="localites-ligne">
                <span className="localites-code">
                  {l.code}
                  {l.codeVerrouille && <Lock size={11} aria-label="code figé (déjà utilisé)" />}
                </span>
                <span className="localites-nom">
                  {l.nom}
                  {(l.arrondissement || l.commune) && (
                    <span className="cell-sub">
                      {[l.arrondissement && `Arr. ${l.arrondissement}`, l.commune && `Commune ${l.commune}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="doc-icone"
                  onClick={() => setEdition(l)}
                  aria-label={`Modifier « ${l.nom} »`}
                  title="Modifier"
                >
                  <Pencil size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {edition !== undefined && (
        <LocaliteModal
          localites={localites}
          localite={edition ?? undefined}
          zoneInitiale={zone}
          onSubmit={enregistrer}
          onClose={() => setEdition(undefined)}
        />
      )}
    </>
  );
}

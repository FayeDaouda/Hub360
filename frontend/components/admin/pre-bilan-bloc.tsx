'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import {
  ajouterVersionPreBilan,
  enregistrerVersionPreBilan,
  getPreBilan,
} from '@/lib/projets';
import {
  ETAPES_PRE_BILAN,
  LIGNES_PRE_BILAN,
  type LignePreBilan,
  type PreBilan,
  type ProjetExecution,
  type VersionPreBilan,
} from '@/lib/types';
import { formatEcartMontant, formatMontantCompact, formatVariation } from '@/lib/format';

type Props = {
  slug: string;
  projet: ProjetExecution;
  verrouille: boolean; // avant-projet validé -> tout en lecture seule
  // Remonte l'état du pré-bilan à la page (pour verrouiller la checklist de
  // validation tant qu'il n'est pas complet).
  onEtat?: (pb: PreBilan) => void;
};

function totalVersion(v: VersionPreBilan): number {
  return Object.values(v.couts).reduce<number>((s, n) => s + (n ?? 0), 0);
}

function margeVersion(v: VersionPreBilan): number {
  return (v.prixVenteEstime ?? 0) - totalVersion(v);
}

function Delta({
  ecart,
  base,
  mauvaisSiHausse,
}: {
  ecart: number;
  base: number;
  mauvaisSiHausse: boolean;
}) {
  if (ecart === 0) return null;
  const pct = base !== 0 ? (ecart / base) * 100 : null;
  const mauvais = mauvaisSiHausse ? ecart > 0 : ecart < 0;
  return (
    <span className={`prebilan-delta prebilan-delta--${mauvais ? 'mauvais' : 'bon'}`}>
      {formatEcartMontant(ecart)}
      {pct !== null && ` (${formatVariation(Number(pct.toFixed(1)), 'pourcent')})`}
    </span>
  );
}

export function PreBilanBloc({ slug, projet, verrouille, onEtat }: Props) {
  const [pb, setPb] = useState<PreBilan | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [enregistre, setEnregistre] = useState(false);
  // Version affichée dans la vue mobile (null = suit la dernière).
  const [idxMobile, setIdxMobile] = useState<number | null>(null);

  const etapes = ETAPES_PRE_BILAN[projet.categorie];
  const lignes = LIGNES_PRE_BILAN[projet.categorie];
  const promotion = projet.nature === 'promotion_interne';

  useEffect(() => {
    getPreBilan(slug, projet.id).then(setPb);
  }, [slug, projet.id]);

  useEffect(() => {
    if (pb) onEtat?.(pb);
  }, [pb, onEtat]);

  if (!pb) {
    return (
      <section className="panel">
        <h3 className="panel-title">Pré-bilan de faisabilité</h3>
        <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />
      </section>
    );
  }

  const versions = pb.versions;
  const derniere = versions[versions.length - 1] as VersionPreBilan | undefined;
  const etapeSuivante = etapes[versions.length]; // undefined quand tout est créé
  const editable = (v: VersionPreBilan) => !verrouille && !v.figeeLe;
  const libelleEtape = (cle: string) => etapes.find((e) => e.cle === cle)?.libelle ?? cle;

  function patchDerniere(maj: (v: VersionPreBilan) => VersionPreBilan) {
    setPb((cur) =>
      cur
        ? {
            ...cur,
            versions: cur.versions.map((v, i) =>
              i === cur.versions.length - 1 ? maj(v) : v,
            ),
          }
        : cur,
    );
    setEnregistre(false);
  }

  function setCout(ligne: LignePreBilan, valeur: string) {
    patchDerniere((v) => ({
      ...v,
      couts: { ...v.couts, [ligne]: valeur === '' ? undefined : Number(valeur) },
    }));
  }

  function setPrixVente(valeur: string) {
    patchDerniere((v) => ({ ...v, prixVenteEstime: valeur === '' ? null : Number(valeur) }));
  }

  async function persisterDerniere() {
    if (!derniere) return;
    await enregistrerVersionPreBilan(slug, projet.id, derniere.etape, {
      couts: derniere.couts,
      prixVenteEstime: derniere.prixVenteEstime,
    });
  }

  async function enregistrer() {
    setEnCours(true);
    await persisterDerniere();
    setPb(await getPreBilan(slug, projet.id));
    setEnCours(false);
    setEnregistre(true);
  }

  async function versionSuivante() {
    setEnCours(true);
    if (derniere) await persisterDerniere();
    setPb(await ajouterVersionPreBilan(slug, projet.id, projet.categorie));
    setEnCours(false);
    setEnregistre(false);
  }

  return (
    <section className="panel">
      <h3 className="panel-title">Pré-bilan de faisabilité</h3>

      {versions.length === 0 ? (
        <div className="prebilan-vide">
          <p className="empty-state">
            Pas encore de pré-bilan. Démarre par la première version pour caler l&apos;enveloppe.
          </p>
          {!verrouille && (
            <button
              type="button"
              className="btn-primary"
              onClick={versionSuivante}
              disabled={enCours}
            >
              <Plus size={16} strokeWidth={2} aria-hidden />
              <span>Démarrer — {etapes[0].libelle}</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="prebilan-wrap">
            <table className="prebilan-table">
              <thead>
                <tr>
                  <th>Poste</th>
                  {versions.map((v) => (
                    <th key={v.etape}>
                      {libelleEtape(v.etape)}
                      {v.figeeLe && <span className="prebilan-fige"> · figée</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne) => (
                  <tr key={ligne.cle}>
                    <td>{ligne.libelle}</td>
                    {versions.map((v, i) => {
                      const val = v.couts[ligne.cle] ?? 0;
                      const prev = i > 0 ? versions[i - 1].couts[ligne.cle] ?? 0 : null;
                      return (
                        <td key={v.etape}>
                          {editable(v) ? (
                            <input
                              className="prebilan-input"
                              type="number"
                              min="0"
                              value={v.couts[ligne.cle] ?? ''}
                              onChange={(e) => setCout(ligne.cle, e.target.value)}
                            />
                          ) : (
                            formatMontantCompact(val)
                          )}
                          {prev !== null && (
                            <Delta ecart={val - prev} base={prev} mauvaisSiHausse />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                <tr className="prebilan-ligne-forte">
                  <td>Total</td>
                  {versions.map((v, i) => {
                    const t = totalVersion(v);
                    const prev = i > 0 ? totalVersion(versions[i - 1]) : null;
                    return (
                      <td key={v.etape}>
                        {formatMontantCompact(t)}
                        {prev !== null && <Delta ecart={t - prev} base={prev} mauvaisSiHausse />}
                      </td>
                    );
                  })}
                </tr>

                {promotion && (
                  <>
                    <tr>
                      <td>Prix de vente estimé</td>
                      {versions.map((v) => (
                        <td key={v.etape}>
                          {editable(v) ? (
                            <input
                              className="prebilan-input"
                              type="number"
                              min="0"
                              value={v.prixVenteEstime ?? ''}
                              onChange={(e) => setPrixVente(e.target.value)}
                            />
                          ) : v.prixVenteEstime != null ? (
                            formatMontantCompact(v.prixVenteEstime)
                          ) : (
                            '—'
                          )}
                        </td>
                      ))}
                    </tr>
                    <tr className="prebilan-ligne-forte">
                      <td>Marge</td>
                      {versions.map((v, i) => {
                        const m = margeVersion(v);
                        const prev = i > 0 ? margeVersion(versions[i - 1]) : null;
                        return (
                          <td key={v.etape}>
                            {formatMontantCompact(m)}
                            {prev !== null && (
                              <Delta ecart={m - prev} base={Math.abs(prev)} mauvaisSiHausse={false} />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Vue mobile — un bloc par version (charte responsive §3.1) */}
          {(() => {
            const idxM = Math.min(
              idxMobile ?? versions.length - 1,
              versions.length - 1,
            );
            const v = versions[idxM];
            const prevV = idxM > 0 ? versions[idxM - 1] : null;
            const editV = idxM === versions.length - 1 && editable(v);
            const ligneMobile = (
              libelle: string,
              val: number,
              prev: number | null,
              forte: boolean,
              champ?: ReactNode,
              mauvaisSiHausse = true,
            ) => (
              <div key={libelle} className={forte ? 'prebilan-mobile-forte' : undefined}>
                <dt>{libelle}</dt>
                <dd>
                  {champ ?? formatMontantCompact(val)}
                  {prev !== null && (
                    <Delta ecart={val - prev} base={Math.abs(prev)} mauvaisSiHausse={mauvaisSiHausse} />
                  )}
                </dd>
              </div>
            );
            return (
              <div className="prebilan-mobile">
                {versions.length > 1 && (
                  <div className="prebilan-mobile-onglets" role="tablist">
                    {versions.map((ver, i) => (
                      <button
                        key={ver.etape}
                        type="button"
                        className={i === idxM ? 'is-active' : ''}
                        onClick={() => setIdxMobile(i)}
                      >
                        {libelleEtape(ver.etape)}
                        {ver.figeeLe ? ' ·' : ''}
                      </button>
                    ))}
                  </div>
                )}
                <dl className="prebilan-mobile-liste">
                  {lignes.map((ligne) =>
                    ligneMobile(
                      ligne.libelle,
                      v.couts[ligne.cle] ?? 0,
                      prevV ? prevV.couts[ligne.cle] ?? 0 : null,
                      false,
                      editV ? (
                        <input
                          className="prebilan-mobile-input"
                          type="number"
                          min="0"
                          value={v.couts[ligne.cle] ?? ''}
                          onChange={(e) => setCout(ligne.cle, e.target.value)}
                        />
                      ) : undefined,
                    ),
                  )}
                  {ligneMobile(
                    'Total',
                    totalVersion(v),
                    prevV ? totalVersion(prevV) : null,
                    true,
                  )}
                  {promotion &&
                    ligneMobile(
                      'Prix de vente estimé',
                      v.prixVenteEstime ?? 0,
                      null,
                      false,
                      editV ? (
                        <input
                          className="prebilan-mobile-input"
                          type="number"
                          min="0"
                          value={v.prixVenteEstime ?? ''}
                          onChange={(e) => setPrixVente(e.target.value)}
                        />
                      ) : v.prixVenteEstime != null ? undefined : (
                        <span>—</span>
                      ),
                    )}
                  {promotion &&
                    ligneMobile(
                      'Marge',
                      margeVersion(v),
                      prevV ? margeVersion(prevV) : null,
                      true,
                      undefined,
                      false,
                    )}
                </dl>
              </div>
            );
          })()}

          {!verrouille && (
            <div className="prebilan-actions">
              {derniere && !derniere.figeeLe && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={enregistrer}
                  disabled={enCours}
                >
                  {enregistre ? 'Enregistré' : 'Enregistrer'}
                </button>
              )}
              {etapeSuivante && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={versionSuivante}
                  disabled={enCours}
                >
                  <Plus size={16} strokeWidth={2} aria-hidden />
                  <span>Version suivante — {etapeSuivante.libelle}</span>
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

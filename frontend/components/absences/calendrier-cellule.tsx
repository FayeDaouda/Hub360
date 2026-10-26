'use client';

import { useEffect, useRef, useState } from 'react';
import { getCalendrierCellule, LIBELLE_TYPE_ABSENCE, type CalendrierCellule as Donnees } from '@/lib/demandes';
import { toIsoDay } from '@/lib/dates';

const JOURS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const jours = (debut: string, fin: string) => {
  const l: string[] = [];
  for (let d = new Date(`${debut}T00:00:00Z`); d <= new Date(`${fin}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1))
    l.push(toIsoDay(d));
  return l;
};

// Calendrier de la cellule (revue RH 20/10/2026) : au moment de valider un
// congé, la RH et le N+1 voient qui d'autre est absent les mêmes jours —
// sans ça, on peut valider trois absences le même jour dans une équipe de
// quatre. Le demandeur en tête ; la période demandée est encadrée.
export function CalendrierCellule({
  slug,
  demandeId,
  source,
}: {
  slug: string;
  demandeId: string;
  source: 'rh' | 'decideur';
}) {
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState(false);
  const defile = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCalendrierCellule(slug, demandeId, source)
      .then(setDonnees)
      .catch(() => setErreur(true));
  }, [slug, demandeId, source]);

  // Écran étroit : la période demandée est amenée à l'écran (sinon on ne
  // voit que la semaine d'avant).
  useEffect(() => {
    const el = defile.current;
    const debut = el?.querySelector<HTMLElement>('thead th.is-periode');
    const nom = el?.querySelector<HTMLElement>('thead th.cal-nom');
    if (el && debut && el.scrollWidth > el.clientWidth)
      el.scrollLeft = Math.max(0, debut.offsetLeft - (nom?.offsetWidth ?? 0) - 24);
  }, [donnees]);

  if (erreur) return null;
  if (!donnees) return <div className="skeleton cal-cellule-squelette" aria-hidden />;
  if (!donnees.cellule) return <p className="dmd-note">Pas de cellule : aucun collègue d’équipe à comparer.</p>;

  const liste = jours(donnees.fenetre.debut, donnees.fenetre.fin);
  const dansPeriode = (j: string) => j >= donnees.periode.debut && j <= donnees.periode.fin;
  const autres = donnees.membres.filter((m) => !m.estDemandeur);
  const absentsPeriode = autres.filter((m) =>
    m.absences.some((a) => a.debut <= donnees.periode.fin && a.fin >= donnees.periode.debut),
  );
  const total = donnees.membres.length;
  // Plus de la moitié de la cellule absente en même temps : signal rouge.
  const tendu = total > 0 && (absentsPeriode.length + 1) / total >= 0.5;

  return (
    <div className="cal-cellule">
      <p className={tendu ? 'field-erreur' : 'dmd-note'}>
        <strong>{donnees.cellule}</strong> · {absentsPeriode.length} autre{absentsPeriode.length > 1 ? 's' : ''} absent
        {absentsPeriode.length > 1 ? 's' : ''} sur la période ({total} membre{total > 1 ? 's' : ''})
        {tendu && ' — plus de la moitié de l’équipe serait absente'}
      </p>
      <div className="cal-cellule-defile" ref={defile}>
        <table className="cal-cellule-table">
          <thead>
            <tr>
              <th scope="col" className="cal-nom" />
              {liste.map((j) => {
                const js = new Date(`${j}T00:00:00Z`).getUTCDay();
                return (
                  <th
                    key={j}
                    scope="col"
                    className={`${dansPeriode(j) ? 'is-periode' : ''}${js === 0 || js === 6 ? ' is-weekend' : ''}`}
                  >
                    <span>{JOURS[js]}</span>
                    {Number(j.slice(8, 10))}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {donnees.membres.map((m) => (
              <tr key={m.nom} className={m.estDemandeur ? 'is-demandeur' : undefined}>
                <th scope="row" className="cal-nom">
                  {m.nom}
                  {m.estDemandeur && <small> · demande</small>}
                </th>
                {liste.map((j) => {
                  const a = m.absences.find((x) => x.debut <= j && x.fin >= j);
                  const js = new Date(`${j}T00:00:00Z`).getUTCDay();
                  return (
                    <td
                      key={j}
                      className={`${dansPeriode(j) ? 'is-periode' : ''}${js === 0 || js === 6 ? ' is-weekend' : ''}${a ? ` cal-${a.etat}` : ''}`}
                      title={
                        a
                          ? `${m.nom} · ${a.type ? LIBELLE_TYPE_ABSENCE[a.type] : 'Absent'} · ${a.etat === 'validee' ? 'validée' : a.etat === 'demande' ? 'cette demande' : 'en attente'}`
                          : undefined
                      }
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cal-legende">
        <span className="cal-puce cal-demande" /> cette demande <span className="cal-puce cal-validee" /> absence
        validée <span className="cal-puce cal-en_attente" /> en attente de décision
      </p>
    </div>
  );
}

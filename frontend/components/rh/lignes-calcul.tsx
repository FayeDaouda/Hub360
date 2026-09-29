import { formatHeures, LIBELLE_MANQUE, LIBELLE_SECTION } from '@/lib/temps';
import type { LigneCalculTemps } from '@/lib/types';

const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Détail du calcul d'une feuille de temps (RH et Mon temps) : un bloc assigné
// par ligne, sa fenêtre, sa durée standard et la part tombant dans le mois.
export function LignesCalcul({ lignes }: { lignes: LigneCalculTemps[] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table temps-table">
        <thead>
          <tr>
            <th>Projet</th>
            <th>Bloc</th>
            <th>Fenêtre</th>
            <th className="num">Durée std</th>
            <th className="num">Ce mois</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.id}>
              <td className="rh-matricule">{l.projetCode}</td>
              <td data-label="Bloc">
                {l.libelle}
                <span className="cell-sub">
                  {LIBELLE_SECTION[l.section]} · {l.projetProgramme}
                </span>
              </td>
              <td data-label="Fenêtre">
                du {jjmm(l.debut)} au {jjmm(l.echeance)}
              </td>
              <td data-label="Durée std" className="num">{l.dureeStandard == null ? '—' : formatHeures(l.dureeStandard)}</td>
              <td data-label="Ce mois" className="num">
                {l.manque ? <span className="pill pill--attention">{LIBELLE_MANQUE[l.manque]}</span> : formatHeures(l.heures)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

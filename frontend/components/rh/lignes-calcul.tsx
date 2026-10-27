import { LIBELLE_MANQUE, LIBELLE_SECTION } from '@/lib/temps';
import type { LigneCalculTemps } from '@/lib/types';
import { formatDayMonth, formatHours } from '@hub/domain';
import { Pill } from '@/components/ui/pill';

// Détail du calcul d'une feuille de temps (RH et Mon temps) : un bloc assigné
// par ligne, sa fenêtre, sa durée standard et la part tombant dans le mois.
// Variante « salarie » (maquette Mon espace) : Projet, Tâche, Durée std,
// Jours, Heures — en-têtes toujours visibles, message dans le tableau vide.
export function LignesCalcul({ lignes, variante = 'rh' }: { lignes: LigneCalculTemps[]; variante?: 'rh' | 'salarie' }) {
  if (variante === 'salarie') return <LignesSalarie lignes={lignes} />;
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
                  {l.etape ?? (l.section ? LIBELLE_SECTION[l.section] : '')} · {l.projetProgramme}
                </span>
              </td>
              <td data-label="Fenêtre">
                du {formatDayMonth(l.debut)} au {formatDayMonth(l.echeance)}
              </td>
              <td data-label="Durée std" className="num">
                {l.dureeStandard == null ? '—' : formatHours(l.dureeStandard)}
              </td>
              <td data-label="Ce mois" className="num">
                {l.manque ? <Pill tone="attention">{LIBELLE_MANQUE[l.manque]}</Pill> : formatHours(l.heures)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LignesSalarie({ lignes }: { lignes: LigneCalculTemps[] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table temps-table">
        <thead>
          <tr>
            <th>Projet</th>
            <th>Tâche</th>
            <th className="num">Durée std</th>
            <th className="num">Jours</th>
            <th className="num">Heures</th>
          </tr>
        </thead>
        <tbody>
          {lignes.length === 0 && (
            <tr>
              <td colSpan={5} className="me-vide">
                Aucune assignation sur ce mois.
              </td>
            </tr>
          )}
          {lignes.map((l) => (
            <tr key={l.id}>
              <td className="rh-matricule">{l.projetCode}</td>
              <td data-label="Tâche">
                {l.libelle}
                <span className="cell-sub">
                  du {formatDayMonth(l.debut)} au {formatDayMonth(l.echeance)} ·{' '}
                  {l.etape ?? (l.section ? LIBELLE_SECTION[l.section] : '')}
                </span>
              </td>
              <td data-label="Durée std" className="num">
                {l.dureeStandard == null ? '—' : formatHours(l.dureeStandard)}
              </td>
              <td data-label="Jours" className="num">
                {l.jours ?? '—'}
              </td>
              <td data-label="Heures" className="num">
                {l.manque ? <Pill tone="attention">{LIBELLE_MANQUE[l.manque]}</Pill> : formatHours(l.heures)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

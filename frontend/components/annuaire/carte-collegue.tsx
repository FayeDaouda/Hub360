'use client';

import { formatDayLongMonth } from '@hub/domain';
import { nomDe, type CollegueAnnuaire } from '@/lib/annuaire';
import { PersonAvatar } from '@/components/ui/avatar';
import { ActionsCollegue } from './actions-collegue';

// Un collègue dans l'annuaire (22/11/2026) : en carte (grille) ou en ligne
// (liste). Toute la carte ouvre sa fiche ; les actions directes restent à
// portée (écrire, appeler, e-mail, agenda).
export function CarteCollegue({
  c,
  vue,
  moi,
  avecSociete,
  onOuvrir,
  onEcrire,
  agendaHref,
}: {
  c: CollegueAnnuaire;
  vue: 'cartes' | 'liste';
  moi: boolean;
  avecSociete: boolean;
  onOuvrir: () => void;
  onEcrire?: () => void;
  agendaHref?: string | null;
}) {
  const nom = nomDe(c);
  return (
    <li className={`annuaire-carte annuaire-carte--${vue}${c.absentJusquau ? ' is-absent' : ''}`}>
      <button type="button" className="annuaire-carte-ouvrir" onClick={onOuvrir} aria-label={`Fiche de ${nom}`}>
        <PersonAvatar
          name={nom}
          photo={c.photoUrl}
          colorKey={c.utilisateurId}
          size={vue === 'cartes' ? 'lg' : 'md'}
          absent={!!c.absentJusquau}
        />
        <span className="annuaire-carte-texte">
          <strong>
            {nom}
            {moi && <span className="annuaire-badge annuaire-badge--moi">Vous</span>}
          </strong>
          <span className="annuaire-carte-poste">{c.poste ?? 'Poste non renseigné'}</span>
          <span className="annuaire-carte-meta">
            {c.cellule && (
              <span className="annuaire-badge">
                {c.cellule}
                {c.estChef ? ' · chef' : ''}
              </span>
            )}
            {avecSociete && <span className="annuaire-detail">{c.societe.nom}</span>}
            {c.absentJusquau && (
              <span className="annuaire-badge annuaire-badge--absent">
                Absent · {formatDayLongMonth(c.absentJusquau)}
              </span>
            )}
          </span>
        </span>
      </button>
      {vue === 'liste' && (
        <span className="annuaire-carte-coordonnees">
          <span>{c.telephone ?? '—'}</span>
          <span className="annuaire-detail">{c.email}</span>
        </span>
      )}
      {!moi && (
        <ActionsCollegue
          nom={nom}
          telephone={c.telephone}
          email={c.email}
          onEcrire={onEcrire}
          agendaHref={agendaHref}
          compact
        />
      )}
    </li>
  );
}

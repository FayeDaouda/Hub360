'use client';

import { Building2, Mail, Phone, Users } from 'lucide-react';
import { formatDayLongMonth } from '@hub/domain';
import { lienEmail, lienTelephone } from '@/lib/annuaire';
import { PersonAvatar } from '@/components/ui/avatar';
import { ActionsCollegue } from './actions-collegue';

export type PersonneFiche = {
  utilisateurId: string;
  prenom: string;
  nom: string;
  nomAffiche?: string | null;
  photoUrl?: string | null;
  poste: string | null;
  cellule: string | null;
  chef: string | null;
  estChef: boolean;
  telephone: string | null;
  email: string;
  societe?: { nom: string } | null; // en vue groupe
  absentJusquau?: string | null;
};

// Fiche d'un collègue (22/11/2026) : la même partout — l'annuaire (panneau,
// feuille sur téléphone), la recherche Ctrl+K et la messagerie. Seulement
// les champs d'annuaire ; une absence du jour, jamais son motif.
export function FicheCollegue({
  p,
  titreId,
  moi = false,
  onEcrire,
  agendaHref,
  cellule,
  onOuvrir,
}: {
  p: PersonneFiche;
  titreId: string;
  moi?: boolean;
  onEcrire?: () => void;
  agendaHref?: string | null;
  // Les autres membres de sa cellule (annuaire seulement).
  cellule?: { utilisateurId: string; nom: string; photoUrl: string | null; estChef: boolean }[];
  onOuvrir?: (utilisateurId: string) => void;
}) {
  const nom = p.nomAffiche?.trim() || `${p.prenom} ${p.nom}`.trim();
  const officiel = `${p.prenom} ${p.nom}`.trim();
  const tel = lienTelephone(p.telephone);
  const mail = lienEmail(p.email);
  return (
    <div className="annuaire-fiche">
      <header className="annuaire-fiche-tete">
        <PersonAvatar name={nom} photo={p.photoUrl} colorKey={p.utilisateurId} size="xl" absent={!!p.absentJusquau} />
        <div className="annuaire-fiche-identite">
          <h2 id={titreId}>{nom}</h2>
          {nom !== officiel && <span className="annuaire-detail">{officiel}</span>}
          <span className="annuaire-fiche-poste">{p.poste ?? 'Poste non renseigné'}</span>
          <span className="annuaire-badges">
            {moi && <span className="annuaire-badge annuaire-badge--moi">Vous</span>}
            {p.estChef && <span className="annuaire-badge">Chef d’équipe</span>}
            {p.absentJusquau && (
              <span className="annuaire-badge annuaire-badge--absent">
                Absent jusqu’au {formatDayLongMonth(p.absentJusquau)}
              </span>
            )}
          </span>
        </div>
      </header>

      {!moi && (
        <ActionsCollegue
          nom={nom}
          telephone={p.telephone}
          email={p.email}
          onEcrire={onEcrire}
          agendaHref={agendaHref}
        />
      )}

      <section className="annuaire-fiche-section" aria-label="Coordonnées">
        <h3>Coordonnées</h3>
        <p className="annuaire-fiche-ligne">
          <Phone size={16} aria-hidden />
          {p.telephone && tel ? (
            <a href={tel}>{p.telephone}</a>
          ) : p.telephone ? (
            <span>{p.telephone}</span>
          ) : (
            <span className="annuaire-detail">Téléphone non renseigné</span>
          )}
        </p>
        <p className="annuaire-fiche-ligne">
          <Mail size={16} aria-hidden />
          {mail ? <a href={mail}>{p.email}</a> : <span>{p.email}</span>}
        </p>
        {p.societe && (
          <p className="annuaire-fiche-ligne">
            <Building2 size={16} aria-hidden />
            <span>{p.societe.nom}</span>
          </p>
        )}
      </section>

      <section className="annuaire-fiche-section" aria-label="Équipe">
        <h3>Équipe</h3>
        <p className="annuaire-fiche-ligne">
          <Users size={16} aria-hidden />
          <span>
            {p.cellule ?? 'Sans cellule'}
            {p.chef && <span className="annuaire-detail"> · chef d’équipe : {p.chef}</span>}
          </span>
        </p>
        {cellule && cellule.length > 0 && (
          <ul className="annuaire-fiche-cellule">
            {cellule.map((m) => (
              <li key={m.utilisateurId}>
                <button type="button" onClick={() => onOuvrir?.(m.utilisateurId)}>
                  <PersonAvatar name={m.nom} photo={m.photoUrl} colorKey={m.utilisateurId} size="xs" />
                  <span>{m.nom}</span>
                  {m.estChef && <span className="annuaire-detail">chef d’équipe</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

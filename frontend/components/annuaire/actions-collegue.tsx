'use client';

import Link from 'next/link';
import { CalendarDays, Mail, MessageCircle, Phone } from 'lucide-react';
import { lienEmail, lienTelephone } from '@/lib/annuaire';

// Les actions directes sur un collègue (annuaire, fiche, 22/11/2026) :
// écrire (messagerie de la société), appeler, écrire un e-mail, voir son
// agenda (avec le droit). Rien n'est proposé qui ne marcherait pas.
export function ActionsCollegue({
  nom,
  telephone,
  email,
  onEcrire,
  agendaHref,
  compact = false,
}: {
  nom: string;
  telephone: string | null;
  email: string;
  onEcrire?: () => void; // absent : pas de conversation possible (soi, autre société)
  agendaHref?: string | null;
  compact?: boolean; // icônes seules (cartes) ; sinon icône + libellé (fiche)
}) {
  const classe = compact ? 'annuaire-action annuaire-action--icone' : 'annuaire-action';
  const libelle = (texte: string) => (compact ? <span className="sr-only">{texte}</span> : <span>{texte}</span>);
  const tel = lienTelephone(telephone);
  const mail = lienEmail(email);
  return (
    <div className="annuaire-actions" role="group" aria-label={`Contacter ${nom}`}>
      {onEcrire && (
        <button type="button" className={classe} onClick={onEcrire} title={`Écrire à ${nom}`}>
          <MessageCircle size={16} aria-hidden />
          {libelle('Écrire')}
        </button>
      )}
      {tel && (
        <a className={classe} href={tel} title={`Appeler ${nom}`}>
          <Phone size={16} aria-hidden />
          {libelle('Appeler')}
        </a>
      )}
      {mail && (
        <a className={classe} href={mail} title={`Écrire un e-mail à ${nom}`}>
          <Mail size={16} aria-hidden />
          {libelle('E-mail')}
        </a>
      )}
      {agendaHref && (
        <Link className={classe} href={agendaHref} title={`Voir l’agenda de ${nom}`}>
          <CalendarDays size={16} aria-hidden />
          {libelle('Agenda')}
        </Link>
      )}
    </div>
  );
}

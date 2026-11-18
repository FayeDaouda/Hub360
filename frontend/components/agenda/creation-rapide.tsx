'use client';

import { useState, type FormEvent } from 'react';
import { Clock } from 'lucide-react';
import { dakarInstant, formatWeekdayDayMonth } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import { creerRendezVous } from '@/lib/agenda';
import type { Rect } from '@/lib/agenda-placement';
import { CloseButton } from '@/components/ui/dialog';
import { FieldError } from '@/components/ui/field';
import { FenetreAncree } from './fenetre-ancree';

export type Creneau = { jour: string; debut: string; fin: string }; // HH:MM, heure de Dakar

const capitale = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Création rapide (18/11/2026), comme Google Agenda : un créneau cliqué ou
// tracé dans la grille ouvre une petite carte à côté — un titre, Entrée, c'est
// créé. « Plus d'options » ouvre le formulaire complet (invités, lieu,
// répétition…) avec ce qui a déjà été saisi.
export function CreationRapide({
  slug,
  creneau,
  ancre,
  onClose,
  onCree,
  onPlusOptions,
}: {
  slug: string;
  creneau: Creneau;
  ancre: Rect | null;
  onClose: () => void;
  onCree: () => void;
  onPlusOptions: (titre: string) => void;
}) {
  const [titre, setTitre] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function enregistrer(ev: FormEvent) {
    ev.preventDefault();
    const t = titre.trim();
    if (t.length < 2) {
      setErreur('Un titre de deux caractères au moins.');
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      await creerRendezVous(slug, {
        titre: t,
        debut: dakarInstant(creneau.jour, creneau.debut),
        fin: dakarInstant(creneau.jour, creneau.fin),
        inviteIds: [],
      });
      onCree();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Le rendez-vous n’a pas été créé.');
      setEnvoi(false);
    }
  }

  return (
    <FenetreAncree
      ancre={ancre}
      etroit={false}
      onClose={onClose}
      busy={envoi}
      labelledBy="creation-rapide-titre"
      className="agenda-creation-rapide"
    >
      <div className="agenda-fiche-outils">
        <CloseButton onClick={onClose} disabled={envoi} />
      </div>
      <form className="agenda-fiche" onSubmit={enregistrer}>
        <h2 id="creation-rapide-titre" className="sr-only">
          Nouveau rendez-vous
        </h2>
        <input
          className="agenda-creation-titre"
          placeholder="Ajouter un titre"
          aria-label="Titre du rendez-vous"
          value={titre}
          maxLength={160}
          onChange={(e) => setTitre(e.target.value)}
          autoFocus
        />
        <p className="agenda-fiche-ligne">
          <Clock size={18} aria-hidden />
          <span>
            {capitale(formatWeekdayDayMonth(creneau.jour))} · {creneau.debut} – {creneau.fin}
          </span>
        </p>
        {erreur && <FieldError>{erreur}</FieldError>}
        <div className="agenda-fiche-actions">
          <button type="button" className="btn-ghost" onClick={() => onPlusOptions(titre)} disabled={envoi}>
            Plus d’options
          </button>
          <button type="submit" className="btn-primary" disabled={envoi}>
            {envoi ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </FenetreAncree>
  );
}

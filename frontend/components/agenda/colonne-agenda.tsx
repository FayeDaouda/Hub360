'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, addMonths, daysBetween, formatMonthYear, formatWeekdayDayMonth } from '@hub/domain';
import type { ElementAgenda } from '@/lib/agenda';
import { VUES, type Vue } from '@/lib/agenda-periode';
import { LIBELLES } from './fiche-element';
import { TONS } from './grille-horaire';

const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
// Couleurs des agendas de collègues superposés, dans l'ordre de leur choix.
// (Ni le turquoise ni l'ocre : trop proches des rendez-vous et des échéances.)
export const COULEURS_CALQUES = ['azur', 'mandarine', 'jade', 'fuchsia', 'corail'] as const;
export const CALQUES_MAX = COULEURS_CALQUES.length;
const TYPES: ElementAgenda['type'][] = ['rendez_vous', 'echeance', 'conge', 'demande', 'externe'];

// Colonne de gauche de l'Agenda (12/11/2026), façon Google Agenda : un
// mini-calendrier pour sauter à une date, ses agendas à afficher ou masquer,
// et — avec la Lecture de « Agenda des autres » — les agendas de collègues
// superposés, chacun dans sa couleur. Sur téléphone, elle s'ouvre d'un bouton.
export function ColonneAgenda({
  ancre,
  du,
  au,
  aujourdhui,
  onJour,
  masques,
  onMasques,
  personnes,
  collegues,
  onCollegues,
  vue,
  onVue,
}: {
  ancre: string;
  du: string;
  au: string;
  aujourdhui: string;
  onJour: (jour: string) => void;
  masques: ElementAgenda['type'][];
  onMasques: (m: ElementAgenda['type'][]) => void;
  // Collègues que l'on peut superposer (vide : pas le droit).
  personnes: { id: string; nom: string }[];
  collegues: string[];
  onCollegues: (ids: string[]) => void;
  // Téléphone (tiroir) : les vues en tête, comme Google Agenda.
  vue?: Vue;
  onVue?: (v: Vue) => void;
}) {
  const [filtre, setFiltre] = useState('');
  const basculerType = (t: ElementAgenda['type']) =>
    onMasques(masques.includes(t) ? masques.filter((x) => x !== t) : [...masques, t]);
  const basculerCollegue = (id: string) =>
    onCollegues(collegues.includes(id) ? collegues.filter((x) => x !== id) : [...collegues, id]);
  const visibles = personnes.filter((p) => p.nom.toLowerCase().includes(filtre.trim().toLowerCase()));

  return (
    <div className="agenda-cote" id="agenda-colonne">
      {vue && onVue && (
        <nav className="agenda-cote-vues" aria-label="Vue">
          {VUES.map((v) => (
            <button
              key={v.cle}
              type="button"
              className={`agenda-cote-vue${vue === v.cle ? ' is-active' : ''}`}
              aria-current={vue === v.cle ? 'true' : undefined}
              onClick={() => onVue(v.cle)}
            >
              {v.libelle}
            </button>
          ))}
        </nav>
      )}
      <MiniCalendrier key={ancre.slice(0, 7)} ancre={ancre} du={du} au={au} aujourdhui={aujourdhui} onJour={onJour} />

      <fieldset className="agenda-cote-groupe">
        <legend>Mes agendas</legend>
        {TYPES.map((t) => (
          <label key={t} className="agenda-cote-choix">
            <input type="checkbox" checked={!masques.includes(t)} onChange={() => basculerType(t)} />
            <span className={`agenda-cote-pastille agenda-puce--${TONS[t]}`} aria-hidden />
            {LIBELLES[t]}
          </label>
        ))}
      </fieldset>

      {personnes.length > 0 && (
        <fieldset className="agenda-cote-groupe">
          <legend>Agendas de collègues</legend>
          {personnes.length > 8 && (
            <input
              className="field-input"
              type="search"
              placeholder="Chercher un collègue"
              aria-label="Chercher un collègue"
              value={filtre}
              onChange={(e) => setFiltre(e.target.value)}
            />
          )}
          <div className="agenda-cote-liste">
            {visibles.map((p) => {
              const rang = collegues.indexOf(p.id);
              const plein = rang < 0 && collegues.length >= CALQUES_MAX;
              return (
                <label key={p.id} className={`agenda-cote-choix${plein ? ' is-desactive' : ''}`}>
                  <input type="checkbox" checked={rang >= 0} disabled={plein} onChange={() => basculerCollegue(p.id)} />
                  <span
                    className="agenda-cote-pastille"
                    style={rang >= 0 ? { ['--ton' as string]: `var(--${COULEURS_CALQUES[rang]})` } : undefined}
                    aria-hidden
                  />
                  {p.nom}
                </label>
              );
            })}
          </div>
          {collegues.length >= CALQUES_MAX && (
            <p className="agenda-detail">{CALQUES_MAX} agendas au plus en même temps.</p>
          )}
        </fieldset>
      )}
    </div>
  );
}

// Mini-calendrier : un mois, la période affichée surlignée ; un jour cliqué
// y amène l'Agenda. Il se feuillette sans changer la période affichée.
export function MiniCalendrier({
  ancre,
  du,
  au,
  aujourdhui,
  onJour,
}: {
  ancre: string;
  du: string;
  au: string;
  aujourdhui: string;
  onJour: (jour: string) => void;
}) {
  const [decalage, setDecalage] = useState(0);
  const bande = daysBetween(du, au) <= 6;
  const mois = addMonths(ancre.slice(0, 7), decalage);
  const premier = `${mois}-01`;
  const lundi = addDays(premier, -((new Date(`${premier}T12:00:00Z`).getUTCDay() + 6) % 7));
  return (
    <div className="agenda-mini">
      <div className="agenda-mini-tete">
        <strong className="agenda-titre">{formatMonthYear(mois)}</strong>
        <button
          type="button"
          className="btn-ghost btn-ghost--sm"
          aria-label="Mois précédent"
          onClick={() => setDecalage((d) => d - 1)}
        >
          <ChevronLeft size={14} aria-hidden />
        </button>
        <button
          type="button"
          className="btn-ghost btn-ghost--sm"
          aria-label="Mois suivant"
          onClick={() => setDecalage((d) => d + 1)}
        >
          <ChevronRight size={14} aria-hidden />
        </button>
      </div>
      <div className="agenda-mini-grille">
        {JOURS_COURTS.map((j, i) => (
          <span key={i} className="agenda-mini-entete" aria-hidden>
            {j}
          </span>
        ))}
        {Array.from({ length: 42 }, (_, i) => addDays(lundi, i)).map((j, i) => (
          <button
            key={j}
            type="button"
            className={[
              'agenda-mini-jour',
              j.slice(0, 7) !== mois && 'is-hors-mois',
              // La période affichée en bande continue (jour, 3 jours, semaine).
              bande && j >= du && j <= au && 'is-periode',
              bande && j >= du && j <= au && (j === du || i % 7 === 0) && 'is-periode-debut',
              bande && j >= du && j <= au && (j === au || i % 7 === 6) && 'is-periode-fin',
              j === aujourdhui && 'is-aujourdhui',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              setDecalage(0);
              onJour(j);
            }}
            aria-label={formatWeekdayDayMonth(j)}
            aria-current={j === aujourdhui ? 'date' : undefined}
          >
            {Number(j.slice(8))}
          </button>
        ))}
      </div>
    </div>
  );
}

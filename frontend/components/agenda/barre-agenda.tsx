'use client';

import {
  CalendarPlus,
  CalendarSync,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu as IconeMenu,
  MoreHorizontal,
  Plus,
} from 'lucide-react';
import { LIBELLES_FLECHES, titrePeriode, VUES, type Vue } from '@/lib/agenda-periode';
import { Menu, type ElementMenu } from '@/components/ui/menu';

// Barre de l'Agenda (18/11/2026), façon Google Agenda.
// Ordinateur, une ligne : Aujourd'hui, ‹ ›, la période ; à droite la vue,
// « ⋯ » (lien d'abonnement, agendas connectés) et « Créer ».
// Téléphone : ☰ (vues, mini-calendrier, agendas), le mois (ouvre le
// mini-calendrier), Aujourd'hui et « ⋯ » ; on change de période en glissant,
// on crée avec le bouton flottant.
export function BarreAgenda({
  vue,
  ancre,
  aujourdhui,
  etroit,
  peutCreer,
  colonneOuverte,
  miniOuvert,
  onVue,
  onAujourdhui,
  onDecaler,
  onColonne,
  onMini,
  onCreer,
  onAbonnement,
  onConnectes,
}: {
  vue: Vue;
  ancre: string;
  aujourdhui: string;
  etroit: boolean;
  peutCreer: boolean;
  colonneOuverte: boolean;
  miniOuvert: boolean;
  onVue: (v: Vue) => void;
  onAujourdhui: () => void;
  onDecaler: (sens: 1 | -1) => void;
  onColonne: () => void;
  onMini: () => void;
  onCreer: () => void;
  onAbonnement: () => void;
  onConnectes: () => void;
}) {
  const [precedent, suivant] = LIBELLES_FLECHES[vue];
  const actions: ElementMenu[] = [
    {
      cle: 'abonnement',
      libelle: 'Ajouter à mon agenda',
      icone: <CalendarPlus size={16} />,
      onChoisir: onAbonnement,
    },
    { cle: 'connectes', libelle: 'Agendas connectés', icone: <CalendarSync size={16} />, onChoisir: onConnectes },
  ];
  const plus = (
    <Menu
      libelle="Plus d’options"
      className="agenda-icone-bouton"
      declencheur={<MoreHorizontal size={18} aria-hidden />}
      elements={actions}
    />
  );

  if (etroit) {
    return (
      <div className="agenda-barre is-etroite">
        <button
          type="button"
          className="agenda-icone-bouton"
          aria-label="Vues et agendas"
          aria-expanded={colonneOuverte}
          onClick={onColonne}
        >
          <IconeMenu size={20} aria-hidden />
        </button>
        <button
          type="button"
          className="agenda-titre-bouton"
          aria-expanded={miniOuvert}
          aria-controls="agenda-mini-deroulant"
          onClick={onMini}
        >
          <span className="agenda-titre" aria-live="polite">
            {titrePeriode(vue, ancre, true)}
          </span>
          <ChevronDown size={16} aria-hidden className="agenda-titre-chevron" />
        </button>
        <span className="agenda-barre-espace" />
        <button
          type="button"
          className="agenda-icone-bouton agenda-aujourdhui-icone"
          aria-label="Aujourd’hui"
          title="Aujourd’hui"
          onClick={onAujourdhui}
        >
          <span aria-hidden>{Number(aujourdhui.slice(8))}</span>
        </button>
        {plus}
      </div>
    );
  }

  return (
    <div className="agenda-barre">
      <div className="agenda-barre-gauche">
        <button
          type="button"
          className="agenda-icone-bouton agenda-bouton-colonne"
          aria-label="Agendas"
          aria-expanded={colonneOuverte}
          onClick={onColonne}
        >
          <IconeMenu size={18} aria-hidden />
        </button>
        <button type="button" className="btn-ghost agenda-aujourdhui" onClick={onAujourdhui}>
          Aujourd’hui
        </button>
        <span className="agenda-fleches">
          <button
            type="button"
            className="agenda-icone-bouton"
            aria-label={precedent}
            title={precedent}
            onClick={() => onDecaler(-1)}
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button
            type="button"
            className="agenda-icone-bouton"
            aria-label={suivant}
            title={suivant}
            onClick={() => onDecaler(1)}
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </span>
        <h2 className="agenda-titre" aria-live="polite">
          {titrePeriode(vue, ancre)}
        </h2>
      </div>
      <div className="agenda-barre-droite">
        <div className="vue-toggle agenda-vues" role="radiogroup" aria-label="Vue">
          {VUES.filter((v) => v.cle !== '3jours').map((v) => (
            <button
              key={v.cle}
              type="button"
              role="radio"
              aria-checked={vue === v.cle}
              className={vue === v.cle ? 'is-active' : ''}
              title={`${v.libelle} (${v.raccourci})`}
              onClick={() => onVue(v.cle)}
            >
              {v.libelle}
            </button>
          ))}
        </div>
        {plus}
        {peutCreer && (
          <button type="button" className="btn-primary agenda-creer" onClick={onCreer}>
            <Plus size={18} aria-hidden /> Créer
          </button>
        )}
      </div>
    </div>
  );
}

// Le bouton flottant du téléphone : créer, au-dessus de la navigation du bas.
export function BoutonCreerFlottant({ onCreer }: { onCreer: () => void }) {
  return (
    <button type="button" className="agenda-fab" aria-label="Nouveau rendez-vous" onClick={onCreer}>
      <Plus size={26} aria-hidden />
    </button>
  );
}

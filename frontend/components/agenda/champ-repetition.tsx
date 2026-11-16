'use client';

import { useState } from 'react';
import {
  describeRecurrence,
  formatRRule,
  parseRRule,
  recurrencePresets,
  WEEKDAYS,
  weekdayOf,
  type Frequency,
  type Recurrence,
  type Weekday,
} from '@hub/domain';
import { Field } from '@/components/ui/field';

const JOURS: Record<Weekday, string> = { MO: 'L', TU: 'M', WE: 'M', TH: 'J', FR: 'V', SA: 'S', SU: 'D' };
const NOMS: Record<Weekday, string> = {
  MO: 'lundi',
  TU: 'mardi',
  WE: 'mercredi',
  TH: 'jeudi',
  FR: 'vendredi',
  SA: 'samedi',
  SU: 'dimanche',
};
const UNITES: { freq: Frequency; libelle: string }[] = [
  { freq: 'DAILY', libelle: 'jour(s)' },
  { freq: 'WEEKLY', libelle: 'semaine(s)' },
  { freq: 'MONTHLY', libelle: 'mois' },
  { freq: 'YEARLY', libelle: 'an(s)' },
];
const SUR_MESURE = '__sur-mesure__';

const lire = (regle: string | null): Recurrence | null => {
  if (!regle) return null;
  try {
    return parseRRule(regle);
  } catch {
    return null;
  }
};

// Répétition d'un rendez-vous (16/11/2026), comme Google Agenda : les choix
// courants pour la date du premier rendez-vous, ou une règle personnalisée
// (fréquence, intervalle, jours, fin). La règle est celle de @hub/domain.
export function ChampRepetition({
  regle,
  premier,
  onChange,
}: {
  regle: string | null;
  premier: string | null; // ISO du premier rendez-vous (sa date et son heure)
  onChange: (regle: string | null) => void;
}) {
  const [surMesure, setSurMesure] = useState(false);
  if (!premier) return null;
  const presets = recurrencePresets(premier).map((p) => ({ ...p, rrule: formatRRule(p.recurrence) }));
  const actuelle = lire(regle);
  const parmiPresets = presets.some((p) => p.rrule === regle);
  const valeur = surMesure ? SUR_MESURE : !regle ? '' : parmiPresets ? regle : 'actuelle';

  return (
    <div className="agenda-repetition">
      <Field label="Répétition">
        <select
          className="field-input"
          value={valeur}
          onChange={(e) => {
            const x = e.target.value;
            if (x === SUR_MESURE) {
              setSurMesure(true);
              if (!regle) onChange(formatRRule({ freq: 'WEEKLY', interval: 1, byDay: [weekdayOf(premier)] }));
              return;
            }
            setSurMesure(false);
            if (x !== 'actuelle') onChange(x || null);
          }}
        >
          <option value="">Ne se répète pas</option>
          {presets.map((p) => (
            <option key={p.key} value={p.rrule}>
              {p.label}
            </option>
          ))}
          {actuelle && !parmiPresets && <option value="actuelle">{describeRecurrence(actuelle, premier)}</option>}
          <option value={SUR_MESURE}>Personnalisée…</option>
        </select>
      </Field>
      {surMesure && actuelle && <SurMesure r={actuelle} premier={premier} onChange={(r) => onChange(formatRRule(r))} />}
      {actuelle && <p className="agenda-detail">{describeRecurrence(actuelle, premier)}</p>}
    </div>
  );
}

function SurMesure({ r, premier, onChange }: { r: Recurrence; premier: string; onChange: (r: Recurrence) => void }) {
  const fin = r.until ? 'date' : r.count ? 'nombre' : 'jamais';
  const jours = r.byDay?.length ? r.byDay : [weekdayOf(premier)];
  return (
    <div className="agenda-sur-mesure">
      <div className="agenda-sur-mesure-ligne">
        <span>Toutes les</span>
        <input
          className="field-input agenda-nombre"
          type="number"
          min={1}
          max={99}
          aria-label="Intervalle"
          value={r.interval}
          onChange={(e) => onChange({ ...r, interval: Math.min(99, Math.max(1, Number(e.target.value) || 1)) })}
        />
        <select
          className="field-input"
          aria-label="Unité"
          value={r.freq}
          onChange={(e) => {
            const freq = e.target.value as Frequency;
            onChange({
              freq,
              interval: r.interval,
              until: r.until,
              count: r.count,
              ...(freq === 'WEEKLY' && { byDay: [weekdayOf(premier)] }),
            });
          }}
        >
          {UNITES.map((u) => (
            <option key={u.freq} value={u.freq}>
              {u.libelle}
            </option>
          ))}
        </select>
      </div>
      {r.freq === 'WEEKLY' && (
        <div className="agenda-sur-mesure-jours" role="group" aria-label="Jours de la semaine">
          {WEEKDAYS.map((j) => {
            const coche = jours.includes(j);
            // Le jour du premier rendez-vous reste coché : il est toujours la
            // première occurrence de la série.
            const premierJour = j === weekdayOf(premier);
            return (
              <button
                key={j}
                type="button"
                className={`agenda-jour-choix${coche ? ' is-actif' : ''}`}
                aria-pressed={coche}
                aria-label={NOMS[j]}
                disabled={premierJour}
                title={premierJour ? 'Le jour du premier rendez-vous' : undefined}
                onClick={() => {
                  const suivants = coche ? jours.filter((x) => x !== j) : [...jours, j];
                  if (suivants.length) onChange({ ...r, byDay: WEEKDAYS.filter((x) => suivants.includes(x)) });
                }}
              >
                {JOURS[j]}
              </button>
            );
          })}
        </div>
      )}
      <fieldset className="agenda-sur-mesure-fin">
        <legend className="field-label">Se termine</legend>
        <label className="agenda-invite">
          <input
            type="radio"
            name="fin-repetition"
            checked={fin === 'jamais'}
            onChange={() => onChange({ ...r, until: undefined, count: undefined })}
          />
          Jamais
        </label>
        <label className="agenda-invite">
          <input
            type="radio"
            name="fin-repetition"
            checked={fin === 'date'}
            onChange={() => onChange({ ...r, count: undefined, until: r.until ?? premier.slice(0, 10) })}
          />
          Le
          <input
            className="field-input"
            type="date"
            aria-label="Date de fin"
            min={premier.slice(0, 10)}
            value={r.until ?? ''}
            disabled={fin !== 'date'}
            onChange={(e) => e.target.value && onChange({ ...r, count: undefined, until: e.target.value })}
          />
        </label>
        <label className="agenda-invite">
          <input
            type="radio"
            name="fin-repetition"
            checked={fin === 'nombre'}
            onChange={() => onChange({ ...r, until: undefined, count: r.count ?? 10 })}
          />
          Après
          <input
            className="field-input agenda-nombre"
            type="number"
            min={1}
            max={730}
            aria-label="Nombre de fois"
            value={r.count ?? 10}
            disabled={fin !== 'nombre'}
            onChange={(e) =>
              onChange({ ...r, until: undefined, count: Math.min(730, Math.max(1, Number(e.target.value) || 1)) })
            }
          />
          fois
        </label>
      </fieldset>
    </div>
  );
}

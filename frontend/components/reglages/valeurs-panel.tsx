'use client';

import { useState } from 'react';
import { afficher, enregistrerValeurs, type Reglage, type Reglages } from '@/lib/reglages';
import { BarreMotif } from './barre-motif';

// Saisie « formulaire » d'une valeur (chaînes), convertie à l'envoi.
type Saisie = string | Record<string, string>;

const iso = (jjmmaaaa: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(jjmmaaaa.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

function versSaisie(r: Reglage): Saisie {
  const v = r.enService;
  const t = r.valeur;
  if (t.type === 'parts' || t.type === 'heures') return Object.fromEntries(t.cles.map((k) => [k, String((v as Record<string, number>)[k])]));
  if (t.type === 'zone') return v ? { de: String((v as { de: number }).de), a: String((v as { a: number }).a) } : { de: '', a: '' };
  if (t.type === 'dates') return (v as string[]).map((d) => d.split('-').reverse().join('/')).join(', ');
  return v === null || v === undefined ? '' : String(v);
}

// Valeur à envoyer, ou une erreur de saisie lisible (le serveur revalide tout).
function versValeur(r: Reglage, s: Saisie): { valeur: unknown } | { erreur: string } {
  const n = (x: string) => Number(x.replace(',', '.').replace(/\s/g, ''));
  const t = r.valeur;
  switch (t.type) {
    case 'parts':
    case 'heures': {
      const o = s as Record<string, string>;
      if (t.cles.some((k) => o[k].trim() === '' || !Number.isFinite(n(o[k])))) return { erreur: 'nombre attendu dans chaque case' };
      return { valeur: Object.fromEntries(t.cles.map((k) => [k, n(o[k])])) };
    }
    case 'zone': {
      const o = s as Record<string, string>;
      if (!o.de.trim() && !o.a.trim()) return { valeur: null };
      if (!Number.isFinite(n(o.de)) || !Number.isFinite(n(o.a)) || !o.de.trim() || !o.a.trim()) return { erreur: 'renseigner « de » et « à »' };
      return { valeur: { de: n(o.de), a: n(o.a) } };
    }
    case 'dates': {
      const brut = (s as string).split(',').map((x) => x.trim()).filter(Boolean);
      const dates = brut.map(iso);
      if (dates.some((d) => !d)) return { erreur: 'dates au format JJ/MM/AAAA, séparées par des virgules' };
      return { valeur: [...new Set(dates as string[])].sort() };
    }
    case 'pourcentage':
      if (!(s as string).trim()) return { valeur: null };
      return Number.isFinite(n(s as string)) ? { valeur: n(s as string) } : { erreur: 'nombre attendu' };
    case 'entier':
      return (s as string).trim() && Number.isFinite(n(s as string)) ? { valeur: n(s as string) } : { erreur: 'nombre entier attendu' };
    default:
      return { valeur: (s as string).trim() };
  }
}

// Réglages · Règles et délais / Objectifs des indicateurs (maquette du boss).
export function ValeursPanel({
  slug,
  section,
  titre,
  description,
  reglages,
  placeholderMotif,
  onEnregistre,
}: {
  slug: string;
  section: 'regles' | 'objectifs';
  titre: string;
  description: string;
  reglages: Reglage[];
  placeholderMotif?: string;
  onEnregistre: (r: Reglages) => void;
}) {
  const [saisies, setSaisies] = useState<Record<string, Saisie>>({});
  const saisieDe = (r: Reglage) => saisies[r.cle] ?? versSaisie(r);
  const majSaisie = (r: Reglage, s: Saisie) => setSaisies((x) => ({ ...x, [r.cle]: s }));

  const lecture = reglages.map((r) => ({ r, res: r.cle in saisies ? versValeur(r, saisies[r.cle]) : null }));
  const erreurs = lecture.filter((x) => x.res && 'erreur' in x.res);
  const modifiees = lecture.filter(
    (x) => x.res && 'valeur' in x.res && JSON.stringify(x.res.valeur) !== JSON.stringify(x.r.enService ?? null),
  );

  const champ = (r: Reglage) => {
    const s = saisieDe(r);
    const t = r.valeur;
    const texte = (props: { valeur: string; onChange: (v: string) => void; placeholder?: string; large?: boolean; label: string }) => (
      <input
        className={`field-input reg-num${props.large ? ' reg-num--large' : ''}`}
        aria-label={props.label}
        placeholder={props.placeholder}
        value={props.valeur}
        onChange={(e) => props.onChange(e.target.value)}
      />
    );
    if (t.type === 'parts' || t.type === 'heures') {
      const o = s as Record<string, string>;
      return (
        <span className="reg-multi">
          {t.cles.map((k) => (
            <label key={k}>
              <span>{k}</span>
              {texte({ valeur: o[k], onChange: (v) => majSaisie(r, { ...o, [k]: v }), label: `${r.libelle} · ${k}` })}
            </label>
          ))}
        </span>
      );
    }
    if (t.type === 'zone') {
      const o = s as Record<string, string>;
      const [de, a] = (r.propose ?? '').split(' à ');
      return (
        <span className="reg-multi">
          <label>
            <span>de</span>
            {texte({ valeur: o.de, placeholder: de, onChange: (v) => majSaisie(r, { ...o, de: v }), label: `${r.libelle} · de` })}
          </label>
          <label>
            <span>à</span>
            {texte({ valeur: o.a, placeholder: a, onChange: (v) => majSaisie(r, { ...o, a: v }), label: `${r.libelle} · à` })}
          </label>
        </span>
      );
    }
    if (t.type === 'choix') {
      return (
        <select className="field-input reg-choix" aria-label={r.libelle} value={s as string} onChange={(e) => majSaisie(r, e.target.value)}>
          {t.options.map((o) => (
            <option key={o.valeur} value={o.valeur}>
              {o.libelle}
            </option>
          ))}
        </select>
      );
    }
    return texte({
      valeur: s as string,
      onChange: (v) => majSaisie(r, v),
      label: r.libelle,
      large: t.type === 'dates' || t.type === 'texte' || (t.type === 'entier' && t.max > 99_999),
      placeholder: t.type === 'dates' ? 'JJ/MM/AAAA, JJ/MM/AAAA' : t.type === 'pourcentage' ? (r.propose ? `proposé ${r.propose}` : 'à fixer') : undefined,
    });
  };

  return (
    <section className="panel glass-panel dmd-section reg-panel">
      <h2 className="dmd-titre">{titre}</h2>
      <p className="dmd-note">{description}</p>
      <ul className="dmd-liste">
        {lecture.map(({ r, res }) => (
          <li key={r.cle} className="reg-valeur">
            <span className="reg-valeur-libelle">
              <strong>{r.libelle}</strong>
              <span className="cell-sub">En service : {afficher(r, r.enService)}</span>
              {!r.appliquee && <span className="pill pill--neutre reg-pas-appliquee">pas encore appliquée par le HUB</span>}
            </span>
            <span className="reg-valeur-champ">
              {champ(r)}
              {res && 'erreur' in res && <span className="field-erreur">{res.erreur}</span>}
            </span>
            <span className={`dmd-note${r.cle === 'jours_feries' ? ' temps-alerte' : ''}`}>{r.aide}</span>
          </li>
        ))}
      </ul>
      <BarreMotif
        nombre={erreurs.length ? 0 : modifiees.length}
        placeholder={placeholderMotif}
        onAnnuler={() => setSaisies({})}
        onEnregistrer={async (motif) => {
          const valeurs = Object.fromEntries(modifiees.map((x) => [x.r.cle, (x.res as { valeur: unknown }).valeur]));
          onEnregistre(await enregistrerValeurs(slug, section, { motif, valeurs }));
          setSaisies({});
        }}
      />
    </section>
  );
}

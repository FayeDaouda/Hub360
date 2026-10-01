import {
  STATUTS_DEVIS,
  type Devis,
  type FactureCentrale,
} from './types';

// -----------------------------------------------------------------------------
// Finances · Devis et factures (maquette du boss, oct. 2026) : statuts, filtres,
// regroupement par mois et tuiles — calculés sur les listes déjà chargées.
// -----------------------------------------------------------------------------

export type Ton = 'succes' | 'attention' | 'risque' | 'info' | 'neutre';
export type Etiquette = { libelle: string; ton: Ton };

// --- Devis ---------------------------------------------------------------------
export type FiltreDevis = 'tout' | 'en_cours' | 'acceptes' | 'brouillons' | 'refuses';

// Offre soumise : brouillon tant que le CFO ne l'a pas validée (lead « En validation »).
export const enValidationCfo = (d: Devis) => d.statut === 'brouillon' && d.dossierCrm?.statut === 'en_validation';

export function filtreDevis(d: Devis): Exclude<FiltreDevis, 'tout'> {
  if (enValidationCfo(d) || d.statutEffectif === 'envoye') return 'en_cours';
  if (d.statutEffectif === 'accepte' || d.statutEffectif === 'transforme') return 'acceptes';
  if (d.statutEffectif === 'brouillon') return 'brouillons';
  return 'refuses'; // refusé ou expiré sans réponse : clos sans accord
}

export function statutDevis(d: Devis): Etiquette {
  if (enValidationCfo(d)) return { libelle: 'En validation CFO', ton: 'attention' };
  const ton: Record<Devis['statutEffectif'], Ton> = {
    brouillon: 'neutre',
    envoye: 'info',
    accepte: 'succes',
    transforme: 'succes',
    refuse: 'risque',
    expire: 'risque',
  };
  return { libelle: d.statutEffectif === 'envoye' ? 'Envoyé' : STATUTS_DEVIS[d.statutEffectif], ton: ton[d.statutEffectif] };
}

// --- Factures ------------------------------------------------------------------
export type FiltreFacture = 'tout' | 'non_payees' | 'en_retard' | 'encaissees';

export const aValiderCfo = (f: FactureCentrale) => f.statut === 'brouillon' && !!f.dossierCrm;

// Liste Factures (maquette) : les documents émis et les factures directes à
// valider. Une tranche d'échéancier pas encore émise n'est pas une facture :
// elle se prépare et s'émet depuis la facturation du projet.
export const dansListeFactures = (f: FactureCentrale) => f.statut !== 'brouillon' || !!f.dossierCrm;

export function statutFacture(f: FactureCentrale): Etiquette {
  if (f.estAvoir) return { libelle: 'Avoir', ton: 'neutre' };
  if (aValiderCfo(f)) return { libelle: 'À valider CFO', ton: 'attention' };
  switch (f.statutEffectif) {
    case 'brouillon':
      return { libelle: 'Brouillon', ton: 'neutre' };
    case 'emise':
      return { libelle: 'Créée', ton: 'info' };
    case 'partiellement_payee':
      return { libelle: 'Partiellement payée', ton: 'attention' };
    case 'en_retard':
      return { libelle: 'En retard', ton: 'risque' };
    case 'payee':
      return { libelle: 'Payée', ton: 'succes' };
    default:
      return { libelle: 'Annulée', ton: 'neutre' };
  }
}

export function dansFiltreFacture(f: FactureCentrale, filtre: FiltreFacture): boolean {
  if (filtre === 'tout') return true;
  if (f.estAvoir || f.statut !== 'emise') return false;
  if (filtre === 'encaissees') return f.statutEffectif === 'payee';
  if (filtre === 'en_retard') return f.statutEffectif === 'en_retard';
  return f.statutEffectif !== 'payee';
}

// Date à laquelle la facture a été soldée (dernier encaissement), sinon null.
export function payeeLe(f: FactureCentrale): string | null {
  if (f.statutEffectif !== 'payee' || !f.paiements.length) return null;
  return f.paiements[f.paiements.length - 1].date;
}

// --- Regroupement par mois (création) ----------------------------------------------
const mois = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
export const libelleMois = (iso: string) => {
  const t = mois.format(new Date(`${iso.slice(0, 7)}-01T00:00:00`));
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function parMois<T extends { creeLe: string }>(liste: T[]): { mois: string; elements: T[] }[] {
  const groupes = new Map<string, T[]>();
  for (const x of [...liste].sort((a, b) => b.creeLe.localeCompare(a.creeLe))) {
    const cle = x.creeLe.slice(0, 7);
    groupes.set(cle, [...(groupes.get(cle) ?? []), x]);
  }
  return [...groupes.entries()].map(([m, elements]) => ({ mois: m, elements }));
}

export const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

// --- Tuiles ------------------------------------------------------------------------
export function indicateursFinances(devis: Devis[], factures: FactureCentrale[]) {
  const enCours = devis.filter((d) => filtreDevis(d) === 'en_cours');
  const acceptes = devis.filter((d) => filtreDevis(d) === 'acceptes').length;
  const refuses = devis.filter((d) => d.statutEffectif === 'refuse').length;
  const emises = factures.filter((f) => f.statut === 'emise');
  const factureTtc = emises.reduce((s, f) => s + f.montantTtc, 0);
  const encaisse = factures.reduce((s, f) => s + (f.estAvoir ? 0 : f.montantPaye), 0);
  return {
    offresEnCours: { montant: enCours.reduce((s, d) => s + d.montantTtc, 0), nombre: enCours.length },
    transformation: { pct: acceptes + refuses ? Math.round((acceptes / (acceptes + refuses)) * 100) : null, acceptes, refuses },
    facture: { montant: factureTtc, emises: emises.filter((f) => !f.estAvoir).length, aValider: factures.filter(aValiderCfo).length },
    encaisse: { montant: encaisse, pct: factureTtc > 0 ? Math.round((encaisse / factureTtc) * 100) : null },
    resteAEncaisser: {
      montant: emises.filter((f) => !f.estAvoir).reduce((s, f) => s + Math.max(0, f.resteAPayer), 0),
      enRetard: factures.filter((f) => f.statutEffectif === 'en_retard').length,
    },
  };
}

// --- Renseignements société (pied de documents) --------------------------------------
// Lus dans les mentions légales (« RAISON — NINEA x — COFI y — RCCM z — Capital w »)
// et les coordonnées (« adresse, ville, pays · téléphone · e-mail ») de la société.
export function identiteSociete(mentions: string | null | undefined, coordonnees: string | null | undefined) {
  const parties = (mentions ?? '').split(' — ').map((x) => x.trim()).filter(Boolean);
  const champ = (prefixe: string) => parties.find((p) => p.toUpperCase().startsWith(prefixe))?.slice(prefixe.length).trim() ?? null;
  const [adresseComplete, ...contacts] = (coordonnees ?? '').split(' · ').map((x) => x.trim());
  const morceaux = (adresseComplete ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const ville = morceaux.length > 2 ? morceaux.slice(-2).join(', ') : null;
  return {
    raisonSociale: parties[0] && !/^(NINEA|COFI|RCCM|CAPITAL)/i.test(parties[0]) ? parties[0] : null,
    adresse: ville ? morceaux.slice(0, -2).join(', ') : adresseComplete || null,
    ville,
    ninea: champ('NINEA'),
    cofi: champ('COFI'),
    rccm: champ('RCCM'),
    capital: champ('CAPITAL'),
    telephone: contacts.find((c) => /^\+?\d[\d\s]+$/.test(c)) ?? null,
    email: contacts.find((c) => c.includes('@')) ?? null,
  };
}

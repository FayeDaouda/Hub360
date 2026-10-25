import { STATUTS_DEVIS, type Devis, type FactureCentrale, type ProduitService } from './types';

// -----------------------------------------------------------------------------
// Finances · Devis et factures (maquette du boss, oct. 2026) : statuts, filtres,
// regroupement par mois et tuiles — calculés sur les listes déjà chargées.
// -----------------------------------------------------------------------------

// Frais de coordination des études refacturées (CGV art. 5) — miroir de
// TAUX_COORDINATION_ET (backend, projets/domaine/refacturation-etudes.ts).
export const TAUX_COORDINATION_ET = 10; // %

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
  return {
    libelle: d.statutEffectif === 'envoye' ? 'Envoyé' : STATUTS_DEVIS[d.statutEffectif],
    ton: ton[d.statutEffectif],
  };
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
// Libellés et périodes harmonisés (23/10/2026, décision du user) : les cumuls
// « Facturé » et « Encaissé » portent sur l'année civile en cours (= exercice
// SYSCOHADA), donc sur la même période — « % du facturé » a un sens. Le reste
// à encaisser n'a pas de période : une facture ouverte reste due, quelle que
// soit sa date ; il se scinde en « en retard » (échu) et « à échoir ».
export function indicateursFinances(devis: Devis[], factures: FactureCentrale[], maintenant = new Date()) {
  const annee = String(maintenant.getFullYear());
  const enCours = devis.filter((d) => filtreDevis(d) === 'en_cours');
  const acceptes = devis.filter((d) => filtreDevis(d) === 'acceptes').length;
  const refuses = devis.filter((d) => d.statutEffectif === 'refuse').length;
  // Facturé net de l'année : tout document émis dans l'année, avoirs
  // (négatifs) compris — une facture annulée et son avoir s'annulent.
  const emises = factures.filter((f) => estEmise(f) && f.emiseLe?.startsWith(annee));
  const factureTtc = emises.reduce((s, f) => s + f.montantTtc, 0);
  // Encaissé de l'année : paiements datés de l'année, quelle que soit l'année
  // de la facture (une facture de décembre payée en janvier compte en janvier).
  const encaisse = factures.reduce(
    (s, f) =>
      s + (f.estAvoir ? 0 : f.paiements.filter((p) => p.date.startsWith(annee)).reduce((t, p) => t + p.montant, 0)),
    0,
  );
  const ouvertes = factures.filter(estOuverte);
  const enRetard = ouvertes.filter((f) => f.statutEffectif === 'en_retard');
  const montantRetard = enRetard.reduce((s, f) => s + f.resteAPayer, 0);
  const montantOuvert = ouvertes.reduce((s, f) => s + f.resteAPayer, 0);
  return {
    annee,
    offresEnCours: { montant: enCours.reduce((s, d) => s + d.montantTtc, 0), nombre: enCours.length },
    transformation: {
      pct: acceptes + refuses ? Math.round((acceptes / (acceptes + refuses)) * 100) : null,
      acceptes,
      refuses,
    },
    facture: {
      montant: factureTtc,
      emises: emises.filter((f) => !f.estAvoir).length,
      aValider: factures.filter(aValiderCfo).length,
    },
    encaisse: { montant: encaisse, pct: factureTtc > 0 ? Math.round((encaisse / factureTtc) * 100) : null },
    resteAEncaisser: {
      montant: montantOuvert,
      enRetard: { montant: montantRetard, nombre: enRetard.length },
      aEchoir: { montant: montantOuvert - montantRetard, nombre: ouvertes.length - enRetard.length },
    },
  };
}

// --- Tableau de bord ----------------------------------------------------------------
export const estEmise = (f: FactureCentrale) => f.statut !== 'brouillon';
// Facture ouverte : émise, pas un avoir, pas soldée.
export const estOuverte = (f: FactureCentrale) => f.statut === 'emise' && !f.estAvoir && f.resteAPayer > 0;

export type Tranche = { nombre: number; montant: number };

// Factures ouvertes par ancienneté de l'échéance (montants restant dus).
export function facturesOuvertes(factures: FactureCentrale[]) {
  const vide = (): Tranche => ({ nombre: 0, montant: 0 });
  const r = { nonEchues: vide(), retardMoins30: vide(), retardPlus30: vide(), total: vide() };
  for (const f of factures.filter(estOuverte)) {
    const t = f.statutEffectif !== 'en_retard' ? r.nonEchues : f.joursRetard < 30 ? r.retardMoins30 : r.retardPlus30;
    for (const x of [t, r.total]) {
      x.nombre++;
      x.montant += f.resteAPayer;
    }
  }
  return r;
}

// Les 12 derniers mois (AAAA-MM), du plus ancien au mois courant.
export function douzeDerniersMois(maintenant = new Date()): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - 11 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

// Documents émis sur les 12 derniers mois (mois d'émission).
function emisesDouzeMois(factures: FactureCentrale[], mois: string[]) {
  const debut = mois[0];
  return factures.filter((f) => estEmise(f) && f.emiseLe && f.emiseLe.slice(0, 7) >= debut);
}

// `detail` : précision sous le libellé (désignation d'un produit dont le
// libellé est un code catalogue, ex. « CO2 »).
export type Barre = { cle: string; libelle: string; detail?: string; facture: number; encaisse: number };

// Ventes : facturé TTC par mois d'émission, et ce qui en est encaissé.
export function ventesMensuelles(factures: FactureCentrale[], maintenant = new Date()): Barre[] {
  const mois = douzeDerniersMois(maintenant);
  const parMois = new Map(mois.map((m) => [m, { facture: 0, encaisse: 0 }]));
  for (const f of emisesDouzeMois(factures, mois)) {
    const m = parMois.get(f.emiseLe!.slice(0, 7));
    if (!m) continue;
    m.facture += f.montantTtc;
    m.encaisse += f.estAvoir ? 0 : f.montantPaye;
  }
  return mois.map((m) => ({ cle: m, libelle: libelleMois(m), ...parMois.get(m)! }));
}

const premiers = (barres: Barre[], n: number) =>
  barres
    .filter((b) => b.facture > 0)
    .sort((a, b) => b.facture - a.facture)
    .slice(0, n);

// Clients principaux : facturé TTC et part encaissée, 12 derniers mois.
export function clientsPrincipaux(factures: FactureCentrale[], n = 5, maintenant = new Date()): Barre[] {
  const parClient = new Map<string, Barre>();
  for (const f of emisesDouzeMois(factures, douzeDerniersMois(maintenant))) {
    if (!f.client) continue;
    const b = parClient.get(f.client.id) ?? { cle: f.client.id, libelle: f.client.nom, facture: 0, encaisse: 0 };
    b.facture += f.montantTtc;
    b.encaisse += f.estAvoir ? 0 : f.montantPaye;
    parClient.set(f.client.id, b);
  }
  return premiers([...parClient.values()], n);
}

export const HORS_DEVIS = 'Hors devis';

// Produits principaux : facturé HT par prestation, 12 derniers mois. Chaque
// facture se répartit sur les lignes de l'offre acceptée dont elle vient, au
// prorata de leur HT (une tranche couvre la même part de chaque ligne) ; une
// mensualité va à sa ligne ; un avoir suit la facture qu'il annule ; une
// facture sans offre est « hors devis ».
export function produitsPrincipaux(
  factures: FactureCentrale[],
  devis: Devis[],
  catalogue: ProduitService[],
  n = 5,
  maintenant = new Date(),
): Barre[] {
  const offres = new Map(devis.map((d) => [d.id, d]));
  const lignes = new Map(devis.flatMap((d) => d.lignes.map((l) => [l.id, l] as const)));
  const codes = new Map(catalogue.map((p) => [p.id, p.code ?? p.designation]));
  // Désignation du catalogue, affichée sous le code (« CO2 » seul ne dit rien).
  // La désignation reprend parfois le code en tête (« CO2 — Conception… ») :
  // retiré, le code est déjà le libellé.
  const sansCode = (code: string, designation: string) =>
    designation.startsWith(code) ? designation.slice(code.length).replace(/^[\s—–:·-]+/, '') : designation;
  const designations = new Map(catalogue.filter((p) => p.code).map((p) => [p.code!, sansCode(p.code!, p.designation)]));
  const parId = new Map(factures.map((f) => [f.id, f]));
  const libelle = (l: Devis['lignes'][number]) =>
    (l.produitServiceId && codes.get(l.produitServiceId)) || l.designation;
  const parProduit = new Map<string, Barre>();
  const ajouter = (cle: string, ht: number, encaisseHt: number) => {
    const b = parProduit.get(cle) ?? { cle, libelle: cle, detail: designations.get(cle), facture: 0, encaisse: 0 };
    b.facture += ht;
    b.encaisse += encaisseHt;
    parProduit.set(cle, b);
  };
  for (const f of emisesDouzeMois(factures, douzeDerniersMois(maintenant))) {
    const source = (f.estAvoir && f.factureOrigineId && parId.get(f.factureOrigineId)) || f;
    const partEncaissee = !f.estAvoir && f.montantTtc > 0 ? Math.min(1, f.montantPaye / f.montantTtc) : 0;
    const ligne = source.ligneDevisId ? lignes.get(source.ligneDevisId) : undefined;
    const offre = offres.get(source.devisEcheancierId ?? source.devisOrigineId ?? '');
    if (ligne) {
      ajouter(libelle(ligne), f.montantHt, f.montantHt * partEncaissee);
    } else if (offre && offre.montantHt > 0) {
      for (const l of offre.lignes) {
        const ht = (f.montantHt * l.montantHt) / offre.montantHt;
        ajouter(libelle(l), ht, ht * partEncaissee);
      }
    } else {
      ajouter(HORS_DEVIS, f.montantHt, f.montantHt * partEncaissee);
    }
  }
  return premiers([...parProduit.values()], n);
}

// --- Renseignements société (pied de documents) --------------------------------------
// Lus dans les mentions légales (« RAISON — NINEA x — COFI y — RCCM z — Capital w »)
// et les coordonnées (« adresse, ville, pays · téléphone · e-mail ») de la société.
export function identiteSociete(mentions: string | null | undefined, coordonnees: string | null | undefined) {
  const parties = (mentions ?? '')
    .split(' — ')
    .map((x) => x.trim())
    .filter(Boolean);
  const champ = (prefixe: string) =>
    parties
      .find((p) => p.toUpperCase().startsWith(prefixe))
      ?.slice(prefixe.length)
      .trim() ?? null;
  const [adresseComplete, ...contacts] = (coordonnees ?? '').split(' · ').map((x) => x.trim());
  const morceaux = (adresseComplete ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
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

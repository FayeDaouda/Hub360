import type {
  Cellule,
  Client,
  Collaborateur,
  Devis,
  DossierCrm,
  LigneDevis,
  Localite,
  Projet,
  ProjetCellule,
} from '@prisma/client';
import { ficheModifiable } from '../crm/cycle';
import { montantTtcLignes, refDevis, relanceAFaire, statutDevisEffectif } from '../devis/domaine';

// Formatage des lignes Prisma vers les types partagés de frontend/lib/types.ts.
// L'API est la source de vérité du contrat : on émet exactement la forme que le
// front attend — renommages (creeLe, origineCrmId, celluleAssignee,
// collaborateurs), checklist ré-imbriquée — et on retire les champs techniques
// (societeId, *Id de jointure, updatedAt). Les `Date` deviennent des ISO via
// SerialisationInterceptor.

// Référence client « CL-0009 » (maquette Finances) ; null = client sans rang.
export const refClient = (numero: number | null) => (numero == null ? null : `CL-${String(numero).padStart(4, '0')}`);

export function versClient(c: Client) {
  return {
    id: c.id,
    reference: refClient(c.numero),
    nom: c.nom,
    type: c.type,
    sigle: c.sigle ?? undefined,
    contact: c.contact ?? undefined,
    email: c.email ?? undefined,
    telephone: c.telephone ?? undefined,
    adresse: c.adresse,
  };
}

// Ligne du CRM (frontend/lib/types.ts::Projet).
type PersonneRef = { id: string; prenom: string; nom: string } | null;
const versPersonne = (u: PersonneRef) => (u ? { id: u.id, nom: `${u.prenom} ${u.nom}` } : null);

export function versDossierCrm(
  d: DossierCrm & {
    client: Client;
    localite: Localite | null;
    creePar: PersonneRef;
    apporteurUtilisateur: PersonneRef;
    proprietaire: PersonneRef;
    archivePar: PersonneRef;
    offres: (Devis & { lignes: LigneDevis[] })[];
    transitions?: { creeLe: Date; de?: string | null; vers?: string; commentaire?: string | null }[];
  },
  // Offre (finances_devis) : absente de la réponse (clé omise, pas null) pour
  // qui n'a pas le droit en lecture.
  opts: { voitOffre: boolean },
) {
  return {
    id: d.id,
    code: d.code,
    nature: d.nature,
    categorie: d.categorie,
    localisation: d.localisation,
    // null = dossier antérieur au référentiel, pas encore rattaché.
    localite: d.localite
      ? { id: d.localite.id, code: d.localite.code, nom: d.localite.nom }
      : null,
    type: d.type,
    nbPlanches: d.nbPlanches,
    surfaceTerrain: d.surfaceTerrain,
    client: versClient(d.client),
    standing: d.standing,
    gamme: d.gamme,
    programme: d.programme,
    // Fiche Programme dynamique (crm/fiche-programme.ts) ; null = pas commencée.
    ficheProgramme: d.ficheProgramme,
    statut: d.statut,
    // Contenu figé dès la soumission à la DAF (propriétaire excepté).
    verrouillee: !ficheModifiable(d.statut),
    creeLe: d.createdAt,
    creePar: versPersonne(d.creePar),
    // null = aucun apporteur (affaire directe), ou dossier antérieur à la
    // fiche apporteur.
    apporteur:
      d.apporteurType === 'interne'
        ? { type: 'interne' as const, utilisateur: versPersonne(d.apporteurUtilisateur) }
        : d.apporteurType === 'externe'
          ? {
              type: 'externe' as const,
              nom: d.apporteurNom ?? '',
              structure: d.apporteurStructure ?? undefined,
              telephone: d.apporteurTelephone ?? undefined,
              email: d.apporteurEmail ?? undefined,
            }
          : null,
    // % attribué — partie de la fiche apporteur, lue par les rôles CRM
    // (maquette « Nouveau projet », oct. 2026). null = aucun.
    commissionApporteur:
      d.commissionApporteur === null ? null : Number(d.commissionApporteur),
    // null = « à assigner ».
    proprietaire: versPersonne(d.proprietaire),
    // null = lead actif ; sinon figé, consultable dans « Archivés ».
    archive: d.archiveLe ? { le: d.archiveLe, par: versPersonne(d.archivePar) } : null,
    // CO1/CO2/CO3 fixée à l'envoi de l'offre — null tant qu'aucune offre avec
    // ligne de conception n'est partie.
    categorieConception: d.categorieConception,
    // null = pas encore d'offre préparée.
    ...(opts.voitOffre && { offre: d.offres[0] ? versResumeOffre(d.offres[0]) : null }),
    // Offre envoyée restée sans réponse au-delà de sa validité (« Expirée »
    // du registre) : le seul statut, visible sans droit Finances — ni montant
    // ni contenu de l'offre.
    // Soumis au CFO le… (en validation seulement) : délai de 48 h.
    soumisLe: d.statut === 'en_validation' ? (d.transitions?.[0]?.creeLe ?? null) : null,
    // Renvoyé par le CFO (retour en « Nouveau projet ») : quand et pourquoi.
    renvoi:
      d.statut === 'nouveau_projet' && d.transitions?.[0]?.de === 'en_validation'
        ? { le: d.transitions[0].creeLe, commentaire: d.transitions[0].commentaire ?? '' }
        : null,
    offreExpiree:
      d.statut === 'offre_envoyee' &&
      !!d.offres[0] &&
      statutDevisEffectif(d.offres[0], new Date().toISOString().slice(0, 10)) === 'expire',
  };
}

// Résumé de l'offre en cours d'un dossier (frontend/lib/types.ts::OffreDossier).
function versResumeOffre(o: Devis & { lignes: LigneDevis[] }) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  return {
    id: o.id,
    reference: refDevis(o),
    statutEffectif: statutDevisEffectif(o, aujourdhui),
    objet: o.objet,
    nbLignes: o.lignes.length,
    // Rappel non bloquant (équipe + DAF) : typiquement un forfait « prix à
    // fixer » du catalogue (DPC/SPC) resté vide. Constat, pas une règle.
    lignesAZero: o.lignes.filter((l) => Number(l.prixUnitaire) === 0).length,
    montantTtc: montantTtcLignes(o.lignes),
    dateEnvoi: o.dateEnvoi,
    dateValidite: o.dateValidite,
    dateReponse: o.dateReponse,
    relancesEnvoyees: o.relancesEnvoyees,
    relanceAFaire: relanceAFaire(o, aujourdhui),
  };
}

// Projet d'exécution (frontend/lib/types.ts::ProjetExecution).
export function versProjetExecution(
  p: Projet & { client: Client; cellules: ProjetCellule[] },
) {
  return {
    id: p.id,
    code: p.code,
    nature: p.nature,
    categorie: p.categorie,
    programme: p.programme,
    localisation: p.localisation,
    latitude: p.latitude,
    longitude: p.longitude,
    type: p.type,
    client: versClient(p.client),
    origineCrmId: p.dossierCrmId,
    // Plusieurs équipes par projet (décision boss, sept. 2026) — remplace
    // l'ancien champ singulier celluleAssignee.
    cellules: p.cellules.map((c) => c.celluleId),
    statut: p.statut,
    phase: p.phase,
    creeLe: p.createdAt,
  };
}

// Compte lié à un collaborateur — on ne sélectionne QUE ces champs, jamais
// motDePasseHash (§ Sécurité des accès). `aMotDePasse` porte l'info sans le hash.
export type CompteMini = {
  email: string;
  actif: boolean;
  aMotDePasse: boolean;
} | null;

export type StatutCompte = 'sans_compte' | 'invite' | 'actif' | 'desactive';

function statutCompte(u: CompteMini): StatutCompte {
  if (!u) return 'sans_compte';
  if (!u.aMotDePasse) return 'invite';
  return u.actif ? 'actif' : 'desactive';
}

// Collaborateur (frontend/lib/types.ts::Collaborateur). `photoUrl` = la clé
// telle quelle en transition (data URI), URL signée quand S3 sera branché.
export function versCollaborateur(c: Collaborateur & { compte?: CompteMini }) {
  const compte = c.compte ?? null;
  return {
    id: c.id,
    prenom: c.prenom,
    nom: c.nom,
    role: c.role,
    niveau: c.niveau,
    photoUrl: c.photoCle,
    celluleId: c.celluleId,
    dateArrivee: c.dateArrivee, // AAAA-MM-JJ, saisie admin ; null si non renseignée
    email: compte?.email ?? null,
    statutCompte: statutCompte(compte),
  };
}

// Cellule (frontend/lib/types.ts::Cellule) avec ses membres.
export function versCellule(
  cel: Cellule & { membres: (Collaborateur & { compte?: CompteMini })[] },
) {
  return {
    id: cel.id,
    nom: cel.nom,
    code: cel.code, // « GC-ARC-01 » (nomenclature ISO 9001)
    processus: cel.processus,
    clientele: cel.clientele,
    statut: cel.statut,
    // Désigné par l'admin — habilité à répartir les tâches à ses coéquipiers
    // (décision boss, sept. 2026) ; pilote de la cellule (§5.3).
    dispatcherId: cel.dispatcherId,
    collaborateurs: cel.membres.map(versCollaborateur),
  };
}


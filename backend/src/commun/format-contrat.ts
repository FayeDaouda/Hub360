import type {
  AvantProjet,
  Cellule,
  Client,
  Collaborateur,
  DossierCrm,
  LigneChecklistAvp,
  Projet,
} from '@prisma/client';
import { CHECKLISTS_AVANT_PROJET } from '../projets/domaine/config';

// Formatage des lignes Prisma vers les types partagés de frontend/lib/types.ts.
// L'API est la source de vérité du contrat : on émet exactement la forme que le
// front attend — renommages (creeLe, origineCrmId, celluleAssignee,
// collaborateurs), checklist ré-imbriquée — et on retire les champs techniques
// (societeId, *Id de jointure, updatedAt). Les `Date` deviennent des ISO via
// SerialisationInterceptor.

type RefNommee = { prenom: string; nom: string } | null;
const nomComplet = (r: RefNommee) => (r ? `${r.prenom} ${r.nom}`.trim() : null);

export function versClient(c: Client) {
  return {
    id: c.id,
    nom: c.nom,
    type: c.type,
    contact: c.contact ?? undefined,
    email: c.email ?? undefined,
    telephone: c.telephone ?? undefined,
  };
}

// Ligne du CRM (frontend/lib/types.ts::Projet).
export function versDossierCrm(d: DossierCrm & { client: Client }) {
  return {
    id: d.id,
    code: d.code,
    nature: d.nature,
    categorie: d.categorie,
    localisation: d.localisation,
    type: d.type,
    nbPlanches: d.nbPlanches,
    surfaceTerrain: d.surfaceTerrain,
    client: versClient(d.client),
    standing: d.standing,
    gamme: d.gamme,
    programme: d.programme,
    statut: d.statut,
    creeLe: d.createdAt,
  };
}

// Projet d'exécution (frontend/lib/types.ts::ProjetExecution).
export function versProjetExecution(p: Projet & { client: Client }) {
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
    celluleAssignee: p.celluleId,
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
    collaborateurs: cel.membres.map(versCollaborateur),
  };
}

// Avant-projet (frontend/lib/types.ts::AvantProjet) : les 4 booléens de la
// checklist macro sont ré-imbriqués, les sous-checklists opérationnelles sont
// regroupées + libellées selon CHECKLISTS_AVANT_PROJET (le front n'a qu'à
// afficher), `validePar` est résolu en « Prénom Nom ».
export function versAvantProjet(
  ap: AvantProjet & {
    validateur: { prenom: string; nom: string } | null;
    dessinateur: (Collaborateur | { id: string; prenom: string; nom: string }) | null;
    responsable3d: (Collaborateur | { id: string; prenom: string; nom: string }) | null;
    lignesChecklist: LigneChecklistAvp[];
  },
) {
  const parCle = new Map(ap.lignesChecklist.map((l) => [l.cle, l]));
  const ref = (c: { id: string; prenom: string; nom: string } | null) =>
    c ? { id: c.id, nom: `${c.prenom} ${c.nom}`.trim() } : null;
  return {
    projetId: ap.projetId,
    besoinSurface: ap.besoinSurface,
    nbLots: ap.nbLots,
    usages: ap.usages,
    niveauFinition: ap.niveauFinition,
    budgetCibleClient: ap.budgetCibleClient,
    delaiSouhaite: ap.delaiSouhaite,
    contraintes: ap.contraintes,
    references: ap.references,
    dessinateur: ref(ap.dessinateur),
    responsable3d: ref(ap.responsable3d),
    dateDebut: ap.dateDebut,
    dateFin: ap.dateFin,
    checklist: {
      programmeValide: ap.programmeValide,
      budgetValide: ap.budgetValide,
      esquisseValidee: ap.esquisseValidee,
      engagementValide: ap.engagementValide,
    },
    checklists: CHECKLISTS_AVANT_PROJET.map((g) => ({
      groupe: g.groupe,
      libelle: g.libelle,
      items: g.items.map((i) => {
        const l = parCle.get(i.cle);
        return {
          cle: i.cle,
          libelle: i.libelle,
          fait: l?.fait ?? false,
          nonRequis: l?.nonRequis ?? false,
          note: l?.note ?? '',
        };
      }),
    })),
    pieceValidation: ap.pieceValidation,
    valideLe: ap.valideLe,
    validePar: ap.validateur
      ? `${ap.validateur.prenom} ${ap.validateur.nom}`.trim()
      : null,
  };
}

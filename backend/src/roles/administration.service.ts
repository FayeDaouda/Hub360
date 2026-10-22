import { Injectable } from '@nestjs/common';
import { doubleFacteurExige } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

export type ElementAdministration = {
  type: 'signalement' | 'droit_cio' | 'invitation' | 'chef_sans_compte' | 'double_facteur' | 'salarie_sans_compte';
  cle: string;
  titre: string;
  detail: string;
  ton: 'risque' | 'attention' | 'info';
  le: string | null; // tri : le plus ancien d'abord
};

const nomDe = (p: { prenom: string; nom: string }) => `${p.prenom} ${p.nom}`.trim();
const jjmm = (d: Date) => d.toISOString().slice(0, 10).split('-').slice(1).reverse().join('/');
const JOUR = 86_400_000;
// Arrivée récente : compte HUB à créer en priorité.
const ARRIVEE_RECENTE_JOURS = 60;

// « À traiter aujourd'hui » du CIO (revue CIO, 22/10/2026) : comptes, accès
// et retours des utilisateurs qui attendent une action de l'administration.
@Injectable()
export class AdministrationService {
  constructor(private prisma: PrismaService) {}

  async aTraiter(societeId: string): Promise<ElementAdministration[]> {
    const maintenant = Date.now();
    const [signalements, demandes, membres, cellules, dossiers] = await Promise.all([
      this.prisma.signalement.findMany({ where: { societeId, statut: { in: ['a_traiter', 'en_cours'] } }, orderBy: { creeLe: 'asc' }, select: { id: true, description: true, statut: true, role: true, creeLe: true } }),
      this.prisma.demandeDroit.findMany({ where: { societeId, statut: 'en_attente' }, orderBy: { createdAt: 'asc' } }),
      this.prisma.utilisateurSocieteRole.findMany({
        where: { societeId, utilisateur: { actif: true } },
        select: {
          role: { select: { nom: true } },
          utilisateur: {
            select: {
              id: true,
              prenom: true,
              nom: true,
              email: true,
              motDePasseHash: true,
              totpActifLe: true,
              invitations: { where: { type: 'invitation' }, orderBy: { createdAt: 'desc' }, take: 1, select: { expiresAt: true, usedAt: true, createdAt: true } },
            },
          },
        },
      }),
      this.prisma.cellule.findMany({
        where: { societeId, dispatcherId: { not: null } },
        select: {
          code: true,
          dispatcher: {
            select: { id: true, prenom: true, nom: true, utilisateurId: true, utilisateur: { select: { actif: true } }, dossierPersonnel: { select: { utilisateur: { select: { actif: true } } } } },
          },
        },
      }),
      this.prisma.dossierPersonnel.findMany({
        where: { societeId, archiveLe: null, utilisateurId: null, OR: [{ collaborateurId: null }, { collaborateur: { utilisateurId: null } }] },
        orderBy: { dateEntree: 'asc' },
        select: { id: true, prenom: true, nom: true, poste: true, dateEntree: true, createdAt: true, collaborateurId: true },
      }),
    ]);

    const elements: ElementAdministration[] = [];
    for (const s of signalements) {
      const jours = Math.floor((maintenant - s.creeLe.getTime()) / JOUR);
      elements.push({
        type: 'signalement',
        cle: `signalement-${s.id}`,
        titre: `Signalement ${s.statut === 'en_cours' ? 'en cours' : 'à traiter'} · ${s.role}`,
        detail: s.description.length > 90 ? `${s.description.slice(0, 89)}…` : s.description,
        ton: jours > 3 ? 'risque' : 'attention',
        le: s.creeLe.toISOString(),
      });
    }
    for (const d of demandes) {
      elements.push({ type: 'droit_cio', cle: `droit-${d.id}`, titre: `Droits du CIO · ${d.module} → ${d.apres}`, detail: `en attente de la validation du CEO depuis le ${jjmm(d.createdAt)}`, ton: 'info', le: d.createdAt.toISOString() });
    }
    // Un compte par personne (un compte peut porter plusieurs rôles).
    const comptes = new Map<string, { u: (typeof membres)[number]['utilisateur']; roles: string[] }>();
    for (const m of membres) comptes.set(m.utilisateur.id, { u: m.utilisateur, roles: [...(comptes.get(m.utilisateur.id)?.roles ?? []), m.role.nom] });
    const chefs = new Set(cellules.map((c) => c.dispatcher?.utilisateurId).filter((x): x is string => !!x));
    const sansDoubleFacteur: string[] = [];
    for (const { u, roles } of comptes.values()) {
      if (!u.motDePasseHash) {
        const inv = u.invitations[0];
        const expiree = !inv || inv.expiresAt.getTime() < maintenant;
        elements.push({
          type: 'invitation',
          cle: `invitation-${u.id}`,
          titre: `Compte jamais activé · ${nomDe(u)}`,
          detail: !inv ? `${u.email} · aucune invitation envoyée` : expiree ? `${u.email} · invitation expirée le ${jjmm(inv.expiresAt)}, à renvoyer` : `${u.email} · invitation envoyée le ${jjmm(inv.createdAt)}, valable jusqu’au ${jjmm(inv.expiresAt)}`,
          ton: expiree ? 'risque' : 'info',
          le: (inv?.createdAt ?? new Date(0)).toISOString(),
        });
        continue;
      }
      // Règle de production (auth.service) : direction et chefs de cellule.
      if (!u.totpActifLe && roles.some((r) => doubleFacteurExige(r, { NODE_ENV: 'production' }, chefs.has(u.id)))) sansDoubleFacteur.push(nomDe(u));
    }
    if (sansDoubleFacteur.length) {
      elements.push({
        type: 'double_facteur',
        cle: 'double-facteur',
        titre: `Double authentification non activée · ${sansDoubleFacteur.length} compte${sansDoubleFacteur.length > 1 ? 's' : ''}`,
        detail: `exigée pour la direction et les chefs de cellule : ${sansDoubleFacteur.join(', ')}`,
        ton: 'risque',
        le: null,
      });
    }
    for (const c of cellules) {
      const d = c.dispatcher!;
      if (d.utilisateur?.actif || d.dossierPersonnel?.utilisateur?.actif) continue;
      elements.push({ type: 'chef_sans_compte', cle: `chef-${c.code}`, titre: `Chef de cellule sans compte HUB · ${nomDe(d)}`, detail: `${c.code} : ses remises et demandes remontent au Dir. GC`, ton: 'attention', le: null });
    }
    // Salariés sans compte : les arrivées récentes une par une (compte à
    // créer), les autres en une ligne ; les chefs de cellule sont déjà au-dessus.
    const chefsSansCompte = new Set(cellules.filter((c) => !c.dispatcher?.utilisateur?.actif && !c.dispatcher?.dossierPersonnel?.utilisateur?.actif).map((c) => c.dispatcher!.id));
    const depuis = new Date(maintenant - ARRIVEE_RECENTE_JOURS * JOUR).toISOString().slice(0, 10);
    const autres: string[] = [];
    for (const d of dossiers) {
      if (d.collaborateurId && chefsSansCompte.has(d.collaborateurId)) continue;
      if (!d.dateEntree || d.dateEntree < depuis) {
        autres.push(nomDe(d));
        continue;
      }
      elements.push({
        type: 'salarie_sans_compte',
        cle: `salarie-${d.id}`,
        titre: `Nouvel arrivant sans compte HUB · ${nomDe(d)}`,
        detail: `${d.poste || 'poste non renseigné'} · entré le ${d.dateEntree.split('-').reverse().join('/')} · dossier RH ouvert, compte à créer`,
        ton: 'attention',
        le: d.createdAt.toISOString(),
      });
    }
    if (autres.length) {
      elements.push({
        type: 'salarie_sans_compte',
        cle: 'salaries-sans-compte',
        titre: `${autres.length} salarié${autres.length > 1 ? 's' : ''} sans compte HUB`,
        detail: autres.join(', '),
        ton: 'info',
        le: null,
      });
    }
    return elements;
  }
}

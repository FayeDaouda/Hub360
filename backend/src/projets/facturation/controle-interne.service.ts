import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { MotifAvoir } from '@prisma/client';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReglagesService } from '../../reglages/reglages.service';
import { refFacture } from '../domaine/config';
import { ventilationTva } from '../domaine/gardes';
import { moisClos } from './cloture';
import { FacturationService } from './facturation.service';
import { avecDelegataire, contresigne } from '../../commun/delegation-ceo';
import { formatAmount, formatMonthYear, ROLE_CEO, ROLE_CFO } from '@hub/domain';

export const LIBELLE_MOTIF_AVOIR: Record<MotifAvoir, string> = {
  erreur_facturation: 'erreur de facturation',
  remise_commerciale: 'remise commerciale',
  litige_client: 'litige client',
  annulation_prestation: 'annulation de prestation',
  autre: 'autre',
};

const moisDe = (d: Date) => d.toISOString().slice(0, 7);
const nomDe = (u: { prenom: string; nom: string }) => `${u.prenom} ${u.nom}`.trim();

type Acteur = { userId: string; role: string; permissions?: Record<string, string>; fullAccess?: boolean };

// Contrôle interne (revue CFO validée 20/10/2026) : avoirs motivés et
// contrôlés par le CEO, clôture mensuelle des paiements.
@Injectable()
export class ControleInterneService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
    private notifications: NotificationsService,
    private facturation: FacturationService,
  ) {}

  // --- Avoirs ------------------------------------------------------------------

  // Toute demande d'avoir : motif obligatoire, CEO prévenu. En deçà du seuil,
  // l'avoir est émis aussitôt ; au-delà, il attend la validation du CEO (la
  // facture reste émise d'ici là).
  async demanderAvoir(
    societeId: string,
    projetId: string,
    factureId: string,
    p: { motif: MotifAvoir; commentaire: string },
    acteur: Acteur,
  ) {
    const commentaire = p.commentaire.trim();
    if (commentaire.length < 5) throw new BadRequestException('Précisez le motif de l’avoir (5 caractères au moins).');
    const f = await this.prisma.facture.findFirst({
      where: { id: factureId, projetId, societeId },
      select: {
        id: true,
        numero: true,
        reference: true,
        emiseLe: true,
        estAvoir: true,
        statut: true,
        montantHt: true,
        tauxTva: true,
        projet: { select: { code: true } },
      },
    });
    if (!f) throw new NotFoundException('Facture introuvable');
    if (f.estAvoir) throw new ConflictException("Un avoir ne s'annule pas par un autre avoir.");
    if (f.statut !== 'emise') throw new ConflictException('Seule une facture émise peut être annulée par un avoir.');
    if (await this.prisma.demandeAvoir.count({ where: { factureId, statut: 'a_valider' } })) {
      throw new ConflictException('Un avoir sur cette facture attend déjà la validation du CEO.');
    }
    const montantTtc = ventilationTva(f.montantHt.toNumber(), f.tauxTva.toNumber()).montantTtc;
    const seuil = await this.reglages.regle<number>(societeId, 'seuil_validation_avoir_ceo');
    const ref = refFacture(f) ?? 'facture';
    const libelle = `${ref} (${f.projet?.code ?? 'sans projet'}) · ${formatAmount(montantTtc)} TTC · ${LIBELLE_MOTIF_AVOIR[p.motif]}`;
    const ceo = await this.notifications.titulairesRole(societeId, ROLE_CEO);

    if (montantTtc > seuil) {
      await this.prisma.demandeAvoir.create({
        data: { societeId, factureId, motif: p.motif, commentaire, montantTtc, demandeParId: acteur.userId },
      });
      // Le délégataire du CEO en fonction aussi, sauf s'il est le demandeur.
      const valideurs = await avecDelegataire(this.prisma, societeId, ceo, acteur.userId);
      await this.notifications.envoyer({
        societeId,
        type: 'avoir_a_valider',
        titre: `Avoir à valider · ${libelle}`,
        destinataireIds: valideurs,
        parId: acteur.userId,
        factureId,
      });
      return { emis: false, seuil };
    }
    const demande = await this.prisma.demandeAvoir.create({
      data: {
        societeId,
        factureId,
        motif: p.motif,
        commentaire,
        montantTtc,
        demandeParId: acteur.userId,
        statut: 'valide',
        decideLe: new Date(),
      },
    });
    await this.emettre(societeId, projetId, factureId, demande.id, acteur.userId);
    await this.notifications.envoyer({
      societeId,
      type: 'avoir_emis',
      titre: `Avoir émis · ${libelle}`,
      destinataireIds: ceo,
      parId: acteur.userId,
      factureId,
    });
    return { emis: true, seuil };
  }

  private async emettre(societeId: string, projetId: string, factureId: string, demandeId: string, acteurId: string) {
    await this.facturation.creerAvoir(societeId, projetId, factureId, acteurId);
    const avoir = await this.prisma.facture.findFirst({
      where: { factureOrigineId: factureId, estAvoir: true },
      orderBy: { creeLe: 'desc' },
      select: { id: true },
    });
    await this.prisma.demandeAvoir.update({ where: { id: demandeId }, data: { avoirId: avoir?.id ?? null } });
  }

  // Avoirs au-delà du seuil en attente : le CEO seulement.
  async avoirsAValider(societeId: string, acteur: Acteur) {
    // Le CEO, ou son délégataire en fonction (revue CEO) — jamais sa propre demande.
    if (!(await contresigne(this.prisma, { ...acteur, societeId }))) return [];
    const demandes = await this.prisma.demandeAvoir.findMany({
      where: { societeId, statut: 'a_valider', OR: [{ demandeParId: null }, { demandeParId: { not: acteur.userId } }] },
      orderBy: { demandeLe: 'asc' },
      include: {
        facture: {
          select: {
            id: true,
            numero: true,
            reference: true,
            emiseLe: true,
            estAvoir: true,
            libelle: true,
            projetId: true,
            projet: { select: { code: true, client: { select: { nom: true } } } },
          },
        },
      },
    });
    const noms = await this.noms(demandes.map((d) => d.demandeParId));
    return demandes.map((d) => ({
      id: d.id,
      factureId: d.factureId,
      reference: refFacture(d.facture),
      libelle: d.facture.libelle,
      projet: d.facture.projet?.code ?? null,
      client: d.facture.projet?.client.nom ?? null,
      montantTtc: d.montantTtc.toNumber(),
      motif: d.motif,
      commentaire: d.commentaire,
      demandeLe: d.demandeLe,
      demandePar: d.demandeParId ? (noms.get(d.demandeParId) ?? null) : null,
      peutDecider: d.demandeParId !== acteur.userId,
    }));
  }

  async deciderAvoir(societeId: string, demandeId: string, acteur: Acteur, valide: boolean, motifRefus?: string) {
    if (!(await contresigne(this.prisma, { ...acteur, societeId })))
      throw new ForbiddenException('Un avoir au-delà du seuil est validé par le CEO (ou son délégataire).');
    const d = await this.prisma.demandeAvoir.findFirst({
      where: { id: demandeId, societeId },
      include: {
        facture: { select: { id: true, numero: true, reference: true, emiseLe: true, estAvoir: true, projetId: true } },
      },
    });
    if (!d) throw new NotFoundException('Demande introuvable');
    if (d.statut !== 'a_valider') throw new ConflictException('Cette demande a déjà été décidée.');
    if (d.demandeParId === acteur.userId)
      throw new ForbiddenException('Vous ne pouvez pas valider votre propre demande d’avoir.');
    if (!valide && !motifRefus?.trim()) throw new BadRequestException('Le motif du refus est obligatoire.');
    const maj = await this.prisma.demandeAvoir.updateMany({
      where: { id: d.id, statut: 'a_valider' },
      data: {
        statut: valide ? 'valide' : 'refuse',
        decideParId: acteur.userId,
        decideLe: new Date(),
        motifRefus: valide ? '' : motifRefus!.trim(),
      },
    });
    if (!maj.count) throw new ConflictException('Cette demande a déjà été décidée.');
    if (valide && d.facture.projetId)
      await this.emettre(societeId, d.facture.projetId, d.factureId, d.id, acteur.userId);
    const ref = refFacture(d.facture) ?? 'facture';
    await this.notifications.envoyer({
      societeId,
      type: 'avoir_decide',
      titre: valide
        ? `Avoir validé par le CEO · ${ref} · émis`
        : `Avoir refusé par le CEO · ${ref} · ${motifRefus!.trim()}`,
      destinataireIds: [d.demandeParId],
      parId: acteur.userId,
      factureId: d.factureId,
    });
    return this.avoirsAValider(societeId, acteur);
  }

  // --- Clôture mensuelle -------------------------------------------------------

  // Mois de la société, du premier document au mois précédent : état et
  // chiffres du mois (ce que la clôture fige).
  async clotures(societeId: string) {
    const [premiere, premierPaiement, clos, evenements] = await Promise.all([
      this.prisma.facture.findFirst({
        where: { societeId, emiseLe: { not: null } },
        orderBy: { emiseLe: 'asc' },
        select: { emiseLe: true },
      }),
      this.prisma.paiement.findFirst({
        where: { facture: { societeId } },
        orderBy: { date: 'asc' },
        select: { date: true },
      }),
      moisClos(this.prisma, societeId),
      this.prisma.journalCloture.findMany({ where: { societeId }, orderBy: { createdAt: 'desc' } }),
    ]);
    const courant = moisDe(new Date());
    const debut = [premiere?.emiseLe ? moisDe(premiere.emiseLe) : null, premierPaiement?.date.slice(0, 7) ?? null]
      .filter((m): m is string => !!m)
      .sort()[0];
    if (!debut) return [];
    const mois: string[] = [];
    for (let m = debut; m < courant; m = suivant(m)) mois.push(m);
    const noms = await this.noms(evenements.map((e) => e.parId));
    return Promise.all(
      mois.reverse().map(async (m) => {
        const dernier = evenements.find((e) => e.mois === m) ?? null;
        return {
          mois: m,
          periode: formatMonthYear(m),
          clos: clos.has(m),
          le: dernier?.createdAt ?? null,
          par: dernier?.parId ? (noms.get(dernier.parId) ?? null) : null,
          derniereReouverture: evenements.find((e) => e.mois === m && e.action === 'reouverture')?.motif ?? null,
          chiffres: await this.chiffresDuMois(societeId, m),
        };
      }),
    );
  }

  private async chiffresDuMois(societeId: string, mois: string) {
    const de = new Date(`${mois}-01T00:00:00Z`);
    const a = new Date(`${suivant(mois)}-01T00:00:00Z`);
    const [emises, paiements] = await Promise.all([
      this.prisma.facture.findMany({
        where: { societeId, emiseLe: { gte: de, lt: a } },
        select: { montantHt: true, tauxTva: true, estAvoir: true },
      }),
      this.prisma.paiement.aggregate({
        where: { facture: { societeId }, date: { startsWith: mois } },
        _sum: { montant: true },
        _count: true,
      }),
    ]);
    const ttc = (f: (typeof emises)[number]) => ventilationTva(f.montantHt.toNumber(), f.tauxTva.toNumber()).montantTtc;
    return {
      factures: emises.filter((f) => !f.estAvoir).length,
      factureTtc: emises.filter((f) => !f.estAvoir).reduce((t, f) => t + ttc(f), 0),
      avoirs: emises.filter((f) => f.estAvoir).length,
      avoirsTtc: emises.filter((f) => f.estAvoir).reduce((t, f) => t + ttc(f), 0),
      paiements: paiements._count,
      encaisse: paiements._sum.montant?.toNumber() ?? 0,
    };
  }

  async cloturer(societeId: string, mois: string, acteur: Acteur) {
    if (!/^\d{4}-\d{2}$/.test(mois)) throw new BadRequestException('Mois invalide (AAAA-MM).');
    if (mois >= moisDe(new Date())) throw new ConflictException('Seul un mois terminé se clôture.');
    if ((await moisClos(this.prisma, societeId)).has(mois))
      throw new ConflictException(`${formatMonthYear(mois)} est déjà clôturé.`);
    await this.prisma.journalCloture.create({ data: { societeId, mois, action: 'cloture', parId: acteur.userId } });
    return this.clotures(societeId);
  }

  // Réouverture : la Suppression de « Clôture du mois » (route ; au départ le
  // CEO seul), motif obligatoire ; le CFO est prévenu.
  async rouvrir(societeId: string, mois: string, acteur: Acteur, motif: string) {
    if (motif.trim().length < 5)
      throw new BadRequestException('Le motif de la réouverture est obligatoire (5 caractères au moins).');
    if (!(await moisClos(this.prisma, societeId)).has(mois))
      throw new ConflictException(`${formatMonthYear(mois)} n'est pas clôturé.`);
    await this.prisma.journalCloture.create({
      data: { societeId, mois, action: 'reouverture', motif: motif.trim(), parId: acteur.userId },
    });
    await this.notifications.envoyer({
      societeId,
      type: 'cloture_a_faire',
      titre: `${formatMonthYear(mois)} rouvert par le CEO · ${motif.trim()} · à clôturer de nouveau`,
      destinataireIds: await this.notifications.titulairesRole(societeId, ROLE_CFO),
      parId: acteur.userId,
    });
    return this.clotures(societeId);
  }

  private async noms(ids: (string | null)[]) {
    const uniques = [...new Set(ids.filter((x): x is string => !!x))];
    const u = uniques.length
      ? await this.prisma.utilisateur.findMany({
          where: { id: { in: uniques } },
          select: { id: true, prenom: true, nom: true },
        })
      : [];
    return new Map(u.map((x) => [x.id, nomDe(x)]));
  }
}

function suivant(mois: string) {
  const [a, m] = mois.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

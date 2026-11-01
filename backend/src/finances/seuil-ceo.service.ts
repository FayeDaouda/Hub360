import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { signataireRequis } from '../contrats/domaine';
import { montantTtcLignes } from '../devis/domaine';
import { ventilationTva } from '../projets/domaine/gardes';
import { PrismaService } from '../prisma/prisma.service';
import { agitPourCeo, estContresignataire } from '../commun/delegation-ceo';
import { ReglagesService } from '../reglages/reglages.service';
import { formatAmount, ROLE_COMPANY_ADMIN } from '@hub/domain';

// Validation financière du CEO au-delà du seuil (décision du 12/10/2026) : le
// CEO voit toutes les Finances, mais ne valide (envoi d'une offre, émission,
// avoir, encaissements) que les affaires qu'il contresigne — offre au-delà du
// seuil de contresignature (Réglages · Règles et délais, TTC ; même règle que
// contrats/domaine.ts::signataireRequis). En deçà, la validation revient au
// CFO, qui garde la validation de tout.
//
// Montant de l'affaire d'une facture : TTC de l'offre dont elle provient
// (tranche d'échéancier ou devis converti), sinon de l'offre acceptée de son
// dossier, sinon de la facture elle-même (facture directe sans offre).

const LIGNES_TTC = { select: { quantite: true, prixUnitaire: true, tauxTva: true } } as const;

type FactureAffaire = {
  id: string;
  montantHt: Prisma.Decimal;
  tauxTva: Prisma.Decimal;
  devisEcheancierId: string | null;
  devisOrigineId: string | null;
  dossierCrmId: string | null;
  projetId: string | null;
};

export type ActeurSeuil = { userId: string; role: string; permissions?: Record<string, string>; fullAccess?: boolean };

@Injectable()
export class SeuilCeoService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
  ) {}

  seuil(societeId: string): Promise<number> {
    return this.reglages.regle<number>(societeId, 'seuil_contresignature_ceo');
  }

  // Montant de l'affaire (TTC) de chaque facture, par id — en deux requêtes
  // quel que soit le nombre de factures.
  async montantsAffaire(factures: FactureAffaire[]): Promise<Map<string, number>> {
    const sansDossier = factures.filter(
      (f) => !f.devisEcheancierId && !f.devisOrigineId && !f.dossierCrmId && f.projetId,
    );
    const projets = sansDossier.length
      ? await this.prisma.projet.findMany({
          where: { id: { in: [...new Set(sansDossier.map((f) => f.projetId!))] } },
          select: { id: true, dossierCrmId: true },
        })
      : [];
    const dossierDuProjet = new Map(projets.map((p) => [p.id, p.dossierCrmId]));
    const devisDe = (f: FactureAffaire) => f.devisEcheancierId ?? f.devisOrigineId;
    const dossierDe = (f: FactureAffaire) =>
      f.dossierCrmId ?? (f.projetId ? (dossierDuProjet.get(f.projetId) ?? null) : null);

    const devisIds = [...new Set(factures.map(devisDe).filter((x): x is string => !!x))];
    const dossierIds = [
      ...new Set(
        factures
          .filter((f) => !devisDe(f))
          .map(dossierDe)
          .filter((x): x is string => !!x),
      ),
    ];
    const offres =
      devisIds.length || dossierIds.length
        ? await this.prisma.devis.findMany({
            where: { OR: [{ id: { in: devisIds } }, { dossierCrmId: { in: dossierIds }, statut: 'accepte' }] },
            select: { id: true, dossierCrmId: true, statut: true, lignes: LIGNES_TTC },
          })
        : [];
    const ttcDevis = new Map(offres.map((o) => [o.id, montantTtcLignes(o.lignes)]));
    const ttcDossier = new Map(
      offres
        .filter((o) => o.statut === 'accepte' && o.dossierCrmId)
        .map((o) => [o.dossierCrmId!, montantTtcLignes(o.lignes)]),
    );

    return new Map(
      factures.map((f) => {
        const devisId = devisDe(f);
        const dossierId = dossierDe(f);
        const propre = ventilationTva(f.montantHt.toNumber(), f.tauxTva.toNumber()).montantTtc;
        const ttc = devisId ? ttcDevis.get(devisId) : dossierId ? ttcDossier.get(dossierId) : undefined;
        return [f.id, ttc ?? propre];
      }),
    );
  }

  // --- Contrôles ---------------------------------------------------------------
  // Le CEO ne valide qu'au-delà du seuil. Contresignature exclusive (revue
  // CEO, 22/10/2026) : au-delà du seuil, envoyer une offre ou un devis et
  // émettre une facture reviennent au CEO seul — ou à son délégataire (CFO)
  // en fonction ; le compte de secours (administration) passe, tracé. Les
  // encaissements et les avoirs (circuit propre) ne sont pas exclusifs.

  async verifierDevis(acteur: ActeurSeuil, societeId: string, devisId: string, exclusif = false) {
    if (!estContresignataire(acteur) && !exclusif) return;
    const devis = await this.prisma.devis.findFirst({
      where: { id: devisId, societeId },
      select: { lignes: LIGNES_TTC },
    });
    if (!devis) throw new NotFoundException('Devis introuvable');
    await this.controler(acteur, societeId, montantTtcLignes(devis.lignes), exclusif);
  }

  // Offre d'un dossier soumise au CFO (brouillon le plus récent, celle que
  // « Valider » envoie — cf. DevisService.emettreOffre) : exclusive.
  async verifierOffreDossier(acteur: ActeurSeuil, societeId: string, dossierId: string) {
    const offre = await this.prisma.devis.findFirst({
      where: { societeId, dossierCrmId: dossierId, statut: 'brouillon' },
      select: { lignes: LIGNES_TTC },
      orderBy: { creeLe: 'desc' },
    });
    if (offre) await this.controler(acteur, societeId, montantTtcLignes(offre.lignes), true);
  }

  // Montant TTC de l'offre soumise d'un dossier si elle dépasse le seuil de
  // contresignature (validation par le CEO), sinon null.
  async offreAuDelaDuSeuil(societeId: string, dossierId: string): Promise<number | null> {
    const offre = await this.prisma.devis.findFirst({
      where: { societeId, dossierCrmId: dossierId, statut: 'brouillon' },
      select: { lignes: LIGNES_TTC },
      orderBy: { creeLe: 'desc' },
    });
    if (!offre) return null;
    const montant = montantTtcLignes(offre.lignes);
    return signataireRequis(montant, await this.seuil(societeId)) === 'ceo' ? montant : null;
  }

  async verifierFacture(acteur: ActeurSeuil, societeId: string, factureId: string, exclusif = false) {
    if (!estContresignataire(acteur) && !exclusif) return;
    const f = await this.prisma.facture.findFirst({
      where: { id: factureId, societeId },
      select: {
        id: true,
        montantHt: true,
        tauxTva: true,
        devisEcheancierId: true,
        devisOrigineId: true,
        dossierCrmId: true,
        projetId: true,
      },
    });
    if (!f) throw new NotFoundException('Facture introuvable');
    await this.controler(acteur, societeId, (await this.montantsAffaire([f])).get(f.id)!, exclusif);
  }

  private async controler(acteur: ActeurSeuil, societeId: string, montantTtc: number, exclusif: boolean) {
    // Carte blanche : aucune limite ; titulaire de la contresignature : au-delà
    // du seuil seulement.
    if (acteur.fullAccess) return;
    if (estContresignataire(acteur)) return this.exigerAuDela(societeId, montantTtc);
    if (!exclusif || acteur.role === ROLE_COMPANY_ADMIN) return;
    const seuil = await this.seuil(societeId);
    if (signataireRequis(montantTtc, seuil) !== 'ceo') return;
    if (await agitPourCeo(this.prisma, { ...acteur, societeId })) return;
    throw new ForbiddenException(
      `Affaire de ${formatAmount(montantTtc)} TTC, au-delà du seuil de contresignature (${formatAmount(seuil)}) : elle revient au CEO (ou à son délégataire).`,
    );
  }

  private async exigerAuDela(societeId: string, montantTtc: number) {
    const seuil = await this.seuil(societeId);
    if (signataireRequis(montantTtc, seuil) === 'ceo') return;
    throw new ForbiddenException(
      `Affaire de ${formatAmount(montantTtc)} TTC, en deçà du seuil de contresignature (${formatAmount(seuil)}) : la validation revient au CFO.`,
    );
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PHASES_PAR_CATEGORIE } from '../projets/domaine/config';
import { versProjetExecution } from '../commun/format-contrat';
import { FacturationService } from '../projets/facturation/facturation.service';

// Commentaire du journal quand l'Onboard suit l'acceptation de l'offre.
export const COMMENT_ONBOARD_ACCEPTANCE = 'offre acceptée par le client';

// Onboard d'un dossier CRM (décision du 29/10/2026) : l'offre acceptée suffit
// pour commencer — le contrat se régularise ensuite, sans bloquer. Appelé
// dans la transaction de l'acceptation (DevisService) ou d'un déblocage
// (Administrateur HUB, via CrmService). Module à part : le CRM dépend déjà
// des devis, les devis ne peuvent pas dépendre du CRM.
@Injectable()
export class OnboardingService {
  constructor(private facturation: FacturationService) {}

  // Bascule offre_envoyee → onboard + journal, puis transaction pivot : le
  // projet d'exécution, l'offre acceptée rattachée et transformée en
  // factures brouillon (échéanciers CGV, étape H2) — « transformée » : plus
  // de conversion « 1 devis → 1 facture » possible sur elle. TOUT OU RIEN
  // avec la transaction fournie.
  async onboard(
    tx: Prisma.TransactionClient,
    companyId: string,
    dossierId: string,
    actorId: string | null,
    comment: string,
  ) {
    const dossier = await tx.dossierCrm.findFirst({
      where: { id: dossierId, societeId: companyId },
      include: { projet: { select: { id: true } } },
    });
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    if (dossier.statut !== 'offre_envoyee' || dossier.projet) {
      throw new ConflictException('Ce dossier n’attend plus son Onboard.');
    }
    const offer = await tx.devis.findFirst({
      where: { dossierCrmId: dossierId, statut: 'accepte' },
      select: { id: true },
    });
    if (!offer) {
      throw new ConflictException(
        'L’Onboard exige une offre acceptée par le client (via son lien, ou réponse saisie).',
      );
    }
    // Soumis complet (crm/fiche.ts), un dossier a sa catégorie et son type ;
    // garde pour un dossier antérieur resté incomplet (annule la transaction).
    const { categorie, type } = dossier;
    if (!categorie || !type) {
      throw new ConflictException('Fiche incomplète : catégorie et type de projet requis pour ouvrir le projet.');
    }

    // Garde de concurrence : ne bascule que si le statut n'a pas changé.
    const { count } = await tx.dossierCrm.updateMany({
      where: { id: dossierId, statut: 'offre_envoyee' },
      data: { statut: 'onboard' },
    });
    if (count === 0) throw new ConflictException('Le dossier vient de changer de statut.');
    await tx.dossierCrmTransition.create({
      data: { dossierId, de: 'offre_envoyee', vers: 'onboard', parId: actorId, commentaire: comment },
    });

    const p = await tx.projet.create({
      data: {
        societeId: companyId,
        dossierCrmId: dossier.id,
        code: dossier.code,
        nature: dossier.nature,
        categorie,
        programme: dossier.programme,
        localisation: dossier.localisation,
        latitude: dossier.latitude,
        longitude: dossier.longitude,
        type,
        clientId: dossier.clientId,
        phase: PHASES_PAR_CATEGORIE[categorie][0],
      },
      include: { client: true, cellules: true },
    });
    // Factures directes du lead (sans offre) : rattachées au projet ouvert.
    await tx.facture.updateMany({ where: { dossierCrmId: dossier.id, projetId: null }, data: { projetId: p.id } });
    await tx.devis.update({ where: { id: offer.id }, data: { projetId: p.id, statut: 'transforme' } });
    const facturesPreparees = await this.facturation.preparerDepuisOffre(
      tx,
      companyId,
      { id: p.id, nature: dossier.nature },
      offer.id,
    );
    return { projet: versProjetExecution(p), facturesPreparees };
  }
}

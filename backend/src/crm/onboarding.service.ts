import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { todayIso } from '@hub/domain';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectOpeningService } from '../projects/project-opening.service';
import { ReglagesService } from '../reglages/reglages.service';
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
  private readonly log = new Logger('Onboarding');

  constructor(
    private prisma: PrismaService,
    private facturation: FacturationService,
    private opening: ProjectOpeningService,
    private reglages: ReglagesService,
  ) {}

  // Ouverture du projet à l'Onboard (Réglages · « Ouverture du projet », à
  // l'acceptation de l'offre par défaut, 30/10/2026) : le gabarit est recopié
  // en étapes, cartes et tâches, J1 = aujourd'hui, et le projet apparaît dans
  // Projets. Après la transaction de l'Onboard (le projet doit être écrit) ;
  // un échec n'annule pas l'acceptation du client — F1 ou l'Administrateur
  // HUB ouvriront le projet ensuite. Rien pour une catégorie sans gabarit.
  async openIfDue(companyId: string, projectId: string): Promise<boolean> {
    try {
      if ((await this.reglages.regle<string>(companyId, 'ouverture_projet')) !== 'onboard') return false;
      const plan = await this.opening.prepare(projectId, todayIso());
      if (!plan) return false;
      return await this.prisma.$transaction((tx) => this.opening.save(tx, plan));
    } catch (e) {
      this.log.error(`Projet ${projectId} non ouvert à l'Onboard : ${(e as Error).message}`);
      return false;
    }
  }

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
    // Soumis complet (crm/fiche.ts), un dossier a sa catégorie ; garde pour
    // un dossier antérieur resté incomplet (annule la transaction). Le type
    // de projet n'est plus demandé (09/11/2026) : repris s'il existe.
    const { categorie } = dossier;
    if (!categorie) {
      throw new ConflictException('Fiche incomplète : catégorie requise pour ouvrir le projet.');
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
        type: dossier.type,
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

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { enSuivi, JALONS, type Jalon, statutPoint } from './regles-integration';
import { addDays, todayIso } from '@hub/domain';

type Acteur = { userId: string };

const INCLUDE = {
  societe: { select: { nom: true } },
  pointsIntegration: true,
} satisfies Prisma.DossierPersonnelInclude;
type DossierSuivi = Prisma.DossierPersonnelGetPayload<{ include: typeof INCLUDE }>;

// RH · Intégration des nouveaux arrivants (lot 3) : points J30/J60/J90 puis
// confirmation. Périmètre groupe, comme les dossiers du personnel.
@Injectable()
export class IntegrationService {
  constructor(private prisma: PrismaService) {}

  async liste() {
    const dossiers = await this.prisma.dossierPersonnel.findMany({
      where: { archiveLe: null, confirmeLe: null, dateEntree: { not: null } },
      include: INCLUDE,
      orderBy: { dateEntree: 'desc' },
    });
    const jour = todayIso();
    return dossiers.filter(enSuivi).map((d) => versIntegration(d, jour));
  }

  async enregistrerPoint(
    a: Acteur,
    dossierId: string,
    jalon: number,
    corps: { realiseLe: string; compteRendu: string },
  ) {
    if (!(JALONS as readonly number[]).includes(jalon)) throw new BadRequestException('Jalon inconnu (30, 60 ou 90).');
    if (!corps.compteRendu.trim()) throw new BadRequestException('Compte rendu obligatoire.');
    if (corps.realiseLe > todayIso()) throw new BadRequestException('Un point ne peut pas être daté dans le futur.');
    await this.dossierSuivi(dossierId);
    const data = { realiseLe: corps.realiseLe, compteRendu: corps.compteRendu.trim(), enregistreParId: a.userId };
    await this.prisma.pointIntegration.upsert({
      where: { dossierId_jalon: { dossierId, jalon } },
      create: { dossierId, jalon, ...data },
      update: data,
    });
    return versIntegration(await this.dossierSuivi(dossierId), todayIso());
  }

  async confirmer(a: Acteur, dossierId: string) {
    const d = await this.dossierSuivi(dossierId);
    if (!d.pointsIntegration.some((p) => p.jalon === 90)) {
      throw new ConflictException('Le point J90 doit être enregistré avant la confirmation.');
    }
    const maj = await this.prisma.dossierPersonnel.update({
      where: { id: dossierId },
      data: { confirmeLe: todayIso(), confirmeParId: a.userId },
      select: { id: true, confirmeLe: true },
    });
    return maj;
  }

  private async dossierSuivi(id: string): Promise<DossierSuivi> {
    const d = await this.prisma.dossierPersonnel.findUnique({ where: { id }, include: INCLUDE });
    if (!d) throw new NotFoundException('Dossier introuvable');
    if (!enSuivi(d)) throw new ConflictException("Ce salarié n'est pas en période d'intégration.");
    return d;
  }
}

function versIntegration(d: DossierSuivi, jour: string) {
  const points = JALONS.map((jalon: Jalon) => {
    const p = d.pointsIntegration.find((x) => x.jalon === jalon);
    const datePrevue = addDays(d.dateEntree!, jalon);
    return {
      jalon,
      datePrevue,
      statut: statutPoint(datePrevue, !!p, jour),
      realiseLe: p?.realiseLe ?? null,
      compteRendu: p?.compteRendu ?? null,
    };
  });
  return {
    id: d.id,
    matricule: d.matricule,
    prenom: d.prenom,
    nom: d.nom,
    poste: d.poste,
    societe: d.societe.nom,
    typeContrat: d.typeContrat,
    dateEntree: d.dateEntree,
    mission: {
      resultat: d.missionResultat,
      livrables: d.missionLivrables,
      kpi: d.missionKpi,
      signalAlerte: d.missionSignalAlerte,
    },
    points,
    aTraiter: points.filter((p) => p.statut === 'a_faire').length,
  };
}

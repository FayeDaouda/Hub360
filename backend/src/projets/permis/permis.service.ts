import { ConflictException, Injectable } from '@nestjs/common';
import { Permis, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { dossierPermisComplet } from '../domaine/gardes';
import { chargerProjet } from '../projet-acces';
import { PatchPermisDto } from './dto';

// Correspondance clé front (snake_case, cf. PieceDossierPermis) ↔ colonne Prisma.
const PIECE_COLONNE = {
  titre_propriete: 'titrePropriete',
  plan_cadastral_vise: 'planCadastralVise',
  plans_apd: 'plansApd',
  devis: 'devis',
  timbre_fiscal: 'timbreFiscal',
} as const;

type CleFront = keyof typeof PIECE_COLONNE;

@Injectable()
export class PermisService {
  constructor(private prisma: PrismaService) {}

  async get(societeId: string, projetId: string) {
    await chargerProjet(this.prisma, societeId, projetId, 'conception');
    const permis = await this.coquille(projetId);
    return this.formater(permis, await this.journal(projetId));
  }

  async patch(societeId: string, projetId: string, dto: PatchPermisDto) {
    await chargerProjet(this.prisma, societeId, projetId, 'conception');
    const actuel = await this.coquille(projetId);

    const dossierSuivant = this.dossierColonnes({
      ...this.dossierFront(actuel),
      ...(dto.dossier ?? {}),
    });
    const statutSuivant = dto.statut ?? actuel.statut;
    const nicadSuivant = dto.nicad ?? actuel.nicad;

    // GARDE MIROIR de frontend/lib/types.ts (enregistrerPermis) : on ne quitte
    // « à déposer » que si le NICAD est obtenu ET le dossier complet.
    if (actuel.statut === 'a_deposer' && statutSuivant !== 'a_deposer') {
      if (nicadSuivant !== 'obtenu') {
        throw new ConflictException('Le NICAD doit être obtenu avant le dépôt.');
      }
      if (!dossierPermisComplet(dossierSuivant)) {
        throw new ConflictException('Le dossier doit être complet avant le dépôt.');
      }
    }

    const data: Prisma.PermisUpdateInput = {};
    if (dto.nicad !== undefined) data.nicad = dto.nicad;
    if (dto.nicadNumero !== undefined) data.nicadNumero = dto.nicadNumero;
    if (dto.planBornage !== undefined) data.planBornage = dto.planBornage;
    if (dto.dossier) Object.assign(data, this.dossierColonnes(dto.dossier));
    if (dto.statut !== undefined) data.statut = dto.statut;
    if (dto.voie !== undefined) data.voie = dto.voie;
    if (dto.dateDepot !== undefined) {
      data.dateDepot = dto.dateDepot ? new Date(dto.dateDepot) : null;
    }
    if (dto.numeroRecepisse !== undefined) data.numeroRecepisse = dto.numeroRecepisse;
    if (dto.dateObtention !== undefined) {
      data.dateObtention = dto.dateObtention ? new Date(dto.dateObtention) : null;
    }
    if (dto.dateRefus !== undefined) {
      data.dateRefus = dto.dateRefus ? new Date(dto.dateRefus) : null;
    }
    if (dto.certificatConformite !== undefined) {
      data.certificatConformite = dto.certificatConformite;
    }
    if (dto.dateCertificat !== undefined) {
      data.dateCertificat = dto.dateCertificat ? new Date(dto.dateCertificat) : null;
    }

    // Horodatages posés d'office s'ils manquent (miroir du mock).
    if (
      actuel.statut === 'a_deposer' &&
      statutSuivant !== 'a_deposer' &&
      !actuel.dateDepot &&
      data.dateDepot == null
    ) {
      data.dateDepot = new Date();
    }
    if (statutSuivant === 'obtenu' && !actuel.dateObtention && data.dateObtention == null) {
      data.dateObtention = new Date();
    }
    if (statutSuivant === 'refuse' && !actuel.dateRefus && data.dateRefus == null) {
      data.dateRefus = new Date();
    }

    const maj = await this.prisma.permis.update({ where: { projetId }, data });
    return this.formater(maj, await this.journal(projetId));
  }

  async ajouterEntreeJournal(
    societeId: string,
    projetId: string,
    texte: string,
    auteurId: string,
  ) {
    await chargerProjet(this.prisma, societeId, projetId, 'conception');
    await this.coquille(projetId);
    await this.prisma.entreeJournal.create({
      data: { projetId, contexte: 'permis', texte: texte.trim(), auteurId },
    });
    const permis = await this.prisma.permis.findUniqueOrThrow({ where: { projetId } });
    return this.formater(permis, await this.journal(projetId));
  }

  // -- Internes ------------------------------------------------------------

  private coquille(projetId: string) {
    return this.prisma.permis.upsert({
      where: { projetId },
      update: {},
      create: { projetId },
    });
  }

  private async journal(projetId: string) {
    const entrees = await this.prisma.entreeJournal.findMany({
      where: { projetId, contexte: 'permis' },
      orderBy: { date: 'desc' },
      include: { auteur: { select: { prenom: true, nom: true } } },
    });
    return entrees.map((e) => ({
      id: e.id,
      date: e.date,
      texte: e.texte,
      auteur: e.auteur ? `${e.auteur.prenom} ${e.auteur.nom}`.trim() : '',
    }));
  }

  private dossierFront(p: Permis): Record<CleFront, boolean> {
    return {
      titre_propriete: p.titrePropriete,
      plan_cadastral_vise: p.planCadastralVise,
      plans_apd: p.plansApd,
      devis: p.devis,
      timbre_fiscal: p.timbreFiscal,
    };
  }

  private dossierColonnes(dossier: Record<string, boolean>) {
    const cols: Record<string, boolean> = {};
    for (const [cle, colonne] of Object.entries(PIECE_COLONNE)) {
      if (dossier[cle] !== undefined) cols[colonne] = dossier[cle];
    }
    return cols;
  }

  private formater(
    p: Permis,
    journal: { id: string; date: Date; texte: string; auteur: string }[],
  ) {
    const {
      titrePropriete,
      planCadastralVise,
      plansApd,
      devis,
      timbreFiscal,
      ...reste
    } = p;
    return {
      ...reste,
      dossier: {
        titre_propriete: titrePropriete,
        plan_cadastral_vise: planCadastralVise,
        plans_apd: plansApd,
        devis,
        timbre_fiscal: timbreFiscal,
      },
      journal,
    };
  }
}

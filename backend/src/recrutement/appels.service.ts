import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { ETAPE, todayIso } from '@hub/domain';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AppelDto, CandidaterDto, ClePiece } from './recrutement.dto';
import { referenceCandidature, titulaires } from './titulaires';

type Acteur = { userId: string; societeId: string };
export type PieceDemandee = { cle: ClePiece; libelle: string; obligatoire: boolean };
export type QuestionAppel = { id: string; libelle: string; obligatoire: boolean };

// Libellés des pièces qu'un appel peut demander ; le CV l'est toujours.
export const LIBELLES_PIECES: Record<ClePiece, string> = {
  cv: 'CV',
  lettre: 'Lettre de motivation',
  diplomes: 'Diplômes et attestations',
  portfolio: 'Portfolio',
  references: 'Références',
  autre: 'Autre document',
};
const REPONSE_MAX = 3000;

// « Architecte junior » → « architecte-junior » (adresse lisible du lien).
export function versSlug(texte: string): string {
  return (
    texte
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'poste'
  );
}

// Ouvert aux candidats : appel ouvert, poste ouvert, date limite (incluse)
// pas dépassée, à l'heure de Dakar.
export function appelOuvert(
  a: { ouvert: boolean; dateLimite: string | null },
  statutPoste: string,
  jour = todayIso(),
): boolean {
  return a.ouvert && statutPoste === 'ouvert' && (!a.dateLimite || a.dateLimite >= jour);
}

// Pièces demandées, nettoyées : le CV en tête et obligatoire, une seule fois
// chaque pièce, « autre » nommée par la RH.
export function piecesDemandees(pieces: AppelDto['pieces']): PieceDemandee[] {
  const vues = new Map<ClePiece, PieceDemandee>([
    ['cv', { cle: 'cv', libelle: LIBELLES_PIECES.cv, obligatoire: true }],
  ]);
  for (const p of pieces) {
    if (p.cle === 'cv' || vues.has(p.cle)) continue;
    const libelle = p.cle === 'autre' ? p.libelle?.trim() || LIBELLES_PIECES.autre : LIBELLES_PIECES[p.cle];
    vues.set(p.cle, { cle: p.cle, libelle, obligatoire: p.obligatoire });
  }
  return [...vues.values()];
}

// Appels à candidatures (01/11/2026) : la RH publie un appel sur un poste
// ouvert ; le lien externe et la page Carrières de la société laissent chaque
// candidat déposer ses informations, son CV et les pièces demandées, sans
// compte. La candidature arrive dans le circuit (colonne « Candidatures »),
// la RH et le demandeur du poste sont prévenus, le candidat reçoit un accusé
// de réception. Les routes publiques passent par le périmètre de la société
// de l'appel (ADR 0001, AppelPublicGuard).
@Injectable()
export class AppelsService {
  private readonly log = new Logger('Appels');

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private email: EmailService,
  ) {}

  // Crée l'appel d'un poste ouvert, ou le met à jour (son lien ne change pas).
  async enregistrer(a: Acteur, posteId: string, dto: AppelDto) {
    const poste = await this.prisma.posteRecrutement.findFirst({
      where: { id: posteId, societeId: a.societeId },
      include: { appel: { select: { id: true } } },
    });
    if (!poste) throw new NotFoundException('Poste introuvable');
    if (poste.statut !== 'ouvert')
      throw new ConflictException('Un appel à candidatures se publie sur un poste ouvert.');
    if (dto.dateLimite && dto.dateLimite < todayIso()) {
      throw new BadRequestException('La date limite est déjà passée.');
    }
    const questions: QuestionAppel[] = dto.questions.map((q, i) => ({
      id: q.id?.trim() || `q${i + 1}-${randomBytes(3).toString('hex')}`,
      libelle: q.libelle.trim(),
      obligatoire: q.obligatoire,
    }));
    const contenu = {
      presentation: dto.presentation.trim(),
      lieu: dto.lieu?.trim() || null,
      typeContrat: dto.typeContrat?.trim() || null,
      dateLimite: dto.dateLimite ?? null,
      pieces: piecesDemandees(dto.pieces) as unknown as Prisma.InputJsonValue,
      questions: questions as unknown as Prisma.InputJsonValue,
    };
    if (poste.appel) {
      const maj = await this.prisma.appelCandidature.update({ where: { id: poste.appel.id }, data: contenu });
      return { slug: maj.slug };
    }
    // Adresse lisible + 32 bits d'aléa : unique (index), réessayée en cas de collision.
    for (let essai = 0; essai < 3; essai++) {
      try {
        const cree = await this.prisma.appelCandidature.create({
          data: {
            ...contenu,
            societeId: a.societeId,
            posteId: poste.id,
            slug: `${versSlug(poste.intitule)}-${randomBytes(4).toString('hex')}`,
            creeParId: a.userId,
          },
        });
        return { slug: cree.slug };
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    throw new ConflictException('Lien indisponible — réessayez.');
  }

  async changerEtat(a: Acteur, posteId: string, ouvert: boolean) {
    const appel = await this.prisma.appelCandidature.findFirst({
      where: { posteId, societeId: a.societeId },
      include: { poste: { select: { statut: true } } },
    });
    if (!appel) throw new NotFoundException('Aucun appel à candidatures pour ce poste.');
    if (ouvert && appel.poste.statut !== 'ouvert') {
      throw new ConflictException('Le poste n’est plus ouvert : rouvrez d’abord le poste.');
    }
    await this.prisma.appelCandidature.update({ where: { id: appel.id }, data: { ouvert } });
    return { ok: true };
  }

  // --- Public (sans compte) -------------------------------------------------

  async publicAppel(slug: string) {
    const appel = await this.prisma.appelCandidature.findUnique({
      where: { slug },
      include: {
        poste: { select: { intitule: true, statut: true, celluleId: true } },
        societe: {
          select: { nom: true, slug: true, logoUrl: true, logoUrlSombre: true, couleurMarque: true, icone: true },
        },
      },
    });
    if (!appel) throw new NotFoundException('Appel introuvable');
    const equipe = appel.poste.celluleId
      ? await this.prisma.cellule.findUnique({ where: { id: appel.poste.celluleId }, select: { nom: true } })
      : null;
    return {
      societe: appel.societe,
      poste: appel.poste.intitule,
      equipe: equipe?.nom ?? null,
      presentation: appel.presentation,
      lieu: appel.lieu,
      typeContrat: appel.typeContrat,
      dateLimite: appel.dateLimite,
      publieLe: appel.createdAt.toISOString(),
      pieces: appel.pieces as unknown as PieceDemandee[],
      questions: appel.questions as unknown as QuestionAppel[],
      ouvert: appelOuvert(appel, appel.poste.statut),
    };
  }

  // Page Carrières : les appels ouverts de la société.
  async carrieres(societeSlug: string) {
    const societe = await this.prisma.societe.findUnique({
      where: { slug: societeSlug },
      select: { id: true, nom: true, slug: true, logoUrl: true, logoUrlSombre: true, couleurMarque: true, icone: true },
    });
    if (!societe) throw new NotFoundException('Société introuvable');
    const appels = await this.prisma.appelCandidature.findMany({
      where: { societeId: societe.id, ouvert: true, poste: { statut: 'ouvert' } },
      include: { poste: { select: { intitule: true, statut: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      societe: {
        nom: societe.nom,
        slug: societe.slug,
        logoUrl: societe.logoUrl,
        logoUrlSombre: societe.logoUrlSombre,
        couleurMarque: societe.couleurMarque,
        icone: societe.icone,
      },
      appels: appels
        .filter((x) => appelOuvert(x, x.poste.statut))
        .map((x) => ({
          slug: x.slug,
          poste: x.poste.intitule,
          lieu: x.lieu,
          typeContrat: x.typeContrat,
          dateLimite: x.dateLimite,
          publieLe: x.createdAt.toISOString(),
        })),
    };
  }

  async candidater(slug: string, dto: CandidaterDto) {
    const appel = await this.prisma.appelCandidature.findUnique({
      where: { slug },
      include: {
        poste: { select: { id: true, intitule: true, statut: true, demandeParId: true } },
        societe: { select: { nom: true } },
      },
    });
    if (!appel) throw new NotFoundException('Appel introuvable');
    // Robot (champ caché rempli) : même réponse qu'un envoi réussi, rien n'est gardé.
    if (dto.siteWeb?.trim()) return { reference: referenceCandidature(randomBytes(8).toString('hex')) };
    if (!appelOuvert(appel, appel.poste.statut)) {
      throw new ConflictException('Cet appel à candidatures est clos.');
    }

    const demandees = appel.pieces as unknown as PieceDemandee[];
    const parCle = new Map(demandees.map((p) => [p.cle, p]));
    const deposees = new Map<ClePiece, CandidaterDto['pieces'][number]>();
    for (const p of dto.pieces) {
      if (!parCle.has(p.cle)) throw new BadRequestException('Pièce non demandée par cet appel.');
      if (deposees.has(p.cle)) throw new BadRequestException(`Une seule pièce « ${parCle.get(p.cle)!.libelle} ».`);
      deposees.set(p.cle, p);
    }
    const manquante = demandees.find((p) => p.obligatoire && !deposees.has(p.cle));
    if (manquante) throw new BadRequestException(`Pièce obligatoire manquante : ${manquante.libelle}.`);

    const questions = appel.questions as unknown as QuestionAppel[];
    const reponses: Record<string, string> = {};
    for (const q of questions) {
      const r = typeof dto.reponses?.[q.id] === 'string' ? dto.reponses[q.id].trim() : '';
      if (q.obligatoire && !r) throw new BadRequestException(`Réponse obligatoire : « ${q.libelle} ».`);
      if (r.length > REPONSE_MAX) throw new BadRequestException('Réponse trop longue (3 000 caractères au plus).');
      if (r) reponses[q.id] = r;
    }

    const email = dto.email.trim().toLowerCase();
    const deja = await this.prisma.candidature.findFirst({
      where: { posteId: appel.poste.id, email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (deja) throw new ConflictException('Vous avez déjà postulé à ce poste avec cette adresse e-mail.');

    const prenom = dto.prenom.trim();
    const nom = dto.nom.trim();
    const c = await this.prisma.candidature.create({
      data: {
        posteId: appel.poste.id,
        prenom,
        nom,
        email,
        telephone: dto.telephone.trim(),
        source: 'lien',
        reponses,
        consentementLe: new Date(),
        // Pas de compte derrière un dépôt public : le demandeur du poste en tient lieu.
        creeParId: appel.poste.demandeParId,
        pieces: {
          create: [...deposees.values()].map((p) => ({
            cle: p.cle,
            libelle: parCle.get(p.cle)!.libelle,
            nom: p.nom.trim(),
            url: p.url,
            taille: Math.floor((p.url.length - p.url.indexOf(',') - 1) * 0.75),
          })),
        },
      },
      select: { id: true },
    });
    const reference = referenceCandidature(c.id);

    await this.notifications.envoyer({
      societeId: appel.societeId,
      type: 'candidature_recue',
      titre: `Nouvelle candidature · ${prenom} ${nom} · ${appel.poste.intitule}`,
      destinataireIds: [
        ...(await titulaires(this.prisma, appel.societeId, ETAPE.recrutementCandidatures, 'ecriture')),
        appel.poste.demandeParId,
      ],
    });
    // Accusé de réception : un échec d'envoi n'annule pas la candidature.
    const envoi = await this.email.envoyerCandidat({
      type: 'accuse',
      email,
      prenom,
      societeNom: appel.societe.nom,
      poste: appel.poste.intitule,
      reference,
    });
    if (!envoi.envoye) this.log.warn(`accusé de réception non envoyé (${reference})`);
    return { reference };
  }
}

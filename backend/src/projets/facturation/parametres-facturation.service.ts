import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { AnnexeCgv } from '@prisma/client';
import { ConfirmationIdentiteService } from '../../auth/confirmation-identite.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { formaterNumero, PREFIXE_TEST, refusFormat, type FormatNumero } from './numerotation';
import { formatEnVigueur, prochainNumeroLegal } from './numerotation-base';

const ROLE_CFO = 'CFO';
type Acteur = { userId: string; societeId: string; role: string };

export type Profil = {
  raisonSociale: string;
  adresse: string;
  ninea: string;
  rccm: string;
  cofi: string;
  capital: string;
  telephone: string;
  email: string;
  banque: string;
  rib: string;
  wave: string;
  orangeMoney: string;
  conditionsPaiement: string;
  mentionsPied: string;
};
const CHAMPS_PROFIL: (keyof Profil)[] = ['raisonSociale', 'adresse', 'ninea', 'rccm', 'cofi', 'capital', 'telephone', 'email', 'banque', 'rib', 'wave', 'orangeMoney', 'conditionsPaiement', 'mentionsPied'];
// Coordonnées de paiement : leur changement est confirmé à l'écran, notifié
// au CEO et tracé — une fraude au RIB passe par là.
const CHAMPS_PAIEMENT: (keyof Profil)[] = ['banque', 'rib', 'wave', 'orangeMoney'];
const LIBELLE_PAIEMENT: Record<string, string> = { banque: 'banque', rib: 'RIB', wave: 'Wave', orangeMoney: 'Orange Money' };
// Logo des documents : SVG ou PNG en data URI, 600 Ko au plus.
const LOGO = /^data:image\/(svg\+xml|png);base64,[A-Za-z0-9+/=]+$/;
const LOGO_MAX = 600 * 1024;
const nomDe = (u: { prenom: string; nom: string }) => `${u.prenom} ${u.nom}`.trim();

// Paramètres de facturation (lot 6, à la manière de Zervant) : numérotation
// et profil imprimé sur les factures. Lecture pour qui lit les factures ;
// modification par le CFO seul, chaque changement gardé (historique = audit).
@Injectable()
export class ParametresFacturationService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private confirmation: ConfirmationIdentiteService,
  ) {}

  async lire(a: Acteur) {
    const annee = new Date().getUTCFullYear();
    const [format, prochain, historique, prefixesEmis, vraies, societe, profil, modeConfirmation] = await Promise.all([
      formatEnVigueur(this.prisma, a.societeId),
      prochainNumeroLegal(this.prisma, a.societeId),
      this.prisma.numerotationFactures.findMany({ where: { societeId: a.societeId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.facture.findMany({ where: { societeId: a.societeId, refPrefixe: { not: null } }, distinct: ['refPrefixe'], select: { refPrefixe: true } }),
      this.prisma.facture.count({ where: { societeId: a.societeId, refAnnee: annee, refPrefixe: { not: PREFIXE_TEST } } }),
      this.prisma.societe.findUniqueOrThrow({ where: { id: a.societeId }, select: { nom: true, coordonnees: true, mentionsLegales: true, penaliteRetardMensuelle: true } }),
      this.prisma.profilFacturation.findFirst({ where: { societeId: a.societeId }, orderBy: { createdAt: 'desc' } }),
      this.confirmation.mode(a.userId),
    ]);
    const auteurs = await this.prisma.utilisateur.findMany({
      where: { id: { in: [...new Set(historique.map((h) => h.parId).filter((x): x is string => !!x))] } },
      select: { id: true, prenom: true, nom: true },
    });
    const noms = new Map(auteurs.map((u) => [u.id, nomDe(u)]));
    return {
      peutModifier: a.role === ROLE_CFO,
      // Ce que l'écran demande pour confirmer un changement de coordonnées de paiement.
      confirmation: modeConfirmation,
      annee,
      format,
      parDefaut: historique.length === 0,
      verrouille: vraies > 0,
      prochain: prochain.reference,
      prefixes: [...new Set([...historique.map((h) => h.prefixe), ...prefixesEmis.map((p) => p.refPrefixe!)])].filter(Boolean),
      historique: historique.map((h) => ({
        le: h.createdAt,
        par: h.parId ? (noms.get(h.parId) ?? null) : null,
        motif: h.motif,
        exemple: formaterNumero({ prefixe: h.prefixe, formatAnnee: h.formatAnnee as FormatNumero['formatAnnee'], separateur: h.separateur, chiffres: h.chiffres, numeroDepart: h.numeroDepart }, annee, h.numeroDepart),
      })),
      // Sans profil saisi : ce que la société affiche déjà (nom, coordonnées,
      // mentions légales reprises des CGV), à compléter par le CFO.
      profil: profil
        ? { ...Object.fromEntries(CHAMPS_PROFIL.map((c) => [c, profil[c]])), logoDocument: profil.logoDocument, cgvAnnexe: profil.cgvAnnexe, parDefaut: false }
        : {
            ...Object.fromEntries(CHAMPS_PROFIL.map((c) => [c, ''])),
            logoDocument: null,
            cgvAnnexe: 'premiere_facture',
            raisonSociale: societe.nom,
            adresse: societe.coordonnees ?? '',
            mentionsPied: societe.mentionsLegales ?? '',
            parDefaut: true,
          },
      penaliteRetardMensuelle: societe.penaliteRetardMensuelle?.toNumber() ?? null,
    };
  }

  async modifierFormat(a: Acteur, f: FormatNumero & { motif: string }) {
    if (a.role !== ROLE_CFO) throw new ForbiddenException('Seul le CFO règle la numérotation des factures.');
    if (f.motif.trim().length < 3) throw new BadRequestException('Le motif est obligatoire.');
    const annee = new Date().getUTCFullYear();
    const vraies = await this.prisma.facture.count({ where: { societeId: a.societeId, refAnnee: annee, refPrefixe: { not: PREFIXE_TEST } } });
    const format = { prefixe: f.prefixe.trim().toUpperCase(), formatAnnee: f.formatAnnee, separateur: f.separateur, chiffres: f.chiffres, numeroDepart: f.numeroDepart };
    const refus = refusFormat(format, vraies > 0, annee);
    if (refus) throw new BadRequestException(refus);
    await this.prisma.numerotationFactures.create({ data: { societeId: a.societeId, ...format, motif: f.motif.trim(), parId: a.userId } });
    return this.lire(a);
  }

  async modifierProfil(a: Acteur, p: Profil & { logoDocument?: string | null; cgvAnnexe?: AnnexeCgv; confirmation?: string }) {
    if (a.role !== ROLE_CFO) throw new ForbiddenException('Seul le CFO règle le profil de facturation.');
    if (!p.raisonSociale?.trim()) throw new BadRequestException('La raison sociale est obligatoire.');
    if (p.logoDocument && (!LOGO.test(p.logoDocument) || p.logoDocument.length > LOGO_MAX * 1.37)) {
      throw new BadRequestException('Logo : un fichier SVG ou PNG de 600 Ko au plus.');
    }
    const avant = await this.prisma.profilFacturation.findFirst({ where: { societeId: a.societeId }, orderBy: { createdAt: 'desc' } });
    const valeurs = Object.fromEntries(CHAMPS_PROFIL.map((c) => [c, (p[c] ?? '').trim()])) as Profil;
    // Coordonnées de paiement changées : identité confirmée d'abord (mot de
    // passe ou code), sinon rien n'est enregistré.
    const changes = CHAMPS_PAIEMENT.filter((c) => (avant?.[c] ?? '') !== valeurs[c]);
    const confirmePar = changes.length ? await this.confirmation.verifier(a.userId, p.confirmation) : null;
    await this.prisma.profilFacturation.create({
      data: {
        societeId: a.societeId,
        ...valeurs,
        logoDocument: p.logoDocument === undefined ? (avant?.logoDocument ?? null) : p.logoDocument,
        cgvAnnexe: p.cgvAnnexe ?? avant?.cgvAnnexe ?? 'premiere_facture',
        confirmation: confirmePar,
        parId: a.userId,
      },
    });
    // Coordonnées de paiement changées : le CEO est prévenu (sans les numéros).
    if (changes.length) {
      await this.notifications.envoyer({
        societeId: a.societeId,
        type: 'coordonnees_paiement_modifiees',
        titre: `Coordonnées de paiement des factures modifiées par le CFO : ${changes.map((c) => LIBELLE_PAIEMENT[c]).join(', ')} · confirmé par ${confirmePar === 'code' ? 'code de double authentification' : 'mot de passe'}`,
        destinataireIds: await this.notifications.titulairesRole(a.societeId, 'CEO (transverse)'),
        parId: a.userId,
      });
    }
    return this.lire(a);
  }
}

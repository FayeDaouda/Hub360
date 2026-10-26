import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { cheminPhoto, lirePhoto, normaliserNomAffiche } from './profil';
import { ouDossierDuCompte } from '../rh/mon-compte';
import { todayIso } from '../shared/dates';

// Profil de la personne connectée (menu du compte) : nom affiché, photo,
// connexions, absence en cours ; et la coupure de toutes ses sessions.
@Injectable()
export class ProfilService {
  constructor(private prisma: PrismaService) {}

  async lire(utilisateurId: string) {
    const jour = todayIso();
    const u = await this.prisma.utilisateur.findUnique({
      where: { id: utilisateurId },
      select: {
        prenom: true,
        nom: true,
        nomAffiche: true,
        photoCle: true,
        derniereConnexionLe: true,
        connexionPrecedenteLe: true,
      },
    });
    if (!u) throw new NotFoundException('Compte introuvable');
    // Absence validée par la RH qui couvre aujourd'hui (la plus longue) — sur
    // le dossier du compte, rattaché directement ou par la fiche d'équipe.
    const absence = await this.prisma.demandeAbsence.findFirst({
      where: {
        statut: 'validee',
        dateDebut: { lte: jour },
        dateFin: { gte: jour },
        dossier: ouDossierDuCompte(utilisateurId),
      },
      orderBy: { dateFin: 'desc' },
      select: { dateFin: true, type: true },
    });
    return {
      nomOfficiel: `${u.prenom} ${u.nom}`.trim(),
      nomAffiche: u.nomAffiche,
      photoUrl: cheminPhoto(u.photoCle),
      derniereConnexionLe: u.derniereConnexionLe,
      connexionPrecedenteLe: u.connexionPrecedenteLe,
      absence: absence ? { jusquau: absence.dateFin, type: absence.type } : null,
    };
  }

  async changerNomAffiche(utilisateurId: string, saisie: string | null) {
    await this.prisma.utilisateur.update({
      where: { id: utilisateurId },
      data: { nomAffiche: normaliserNomAffiche(saisie) },
    });
    return this.lire(utilisateurId);
  }

  // Nouvelle clé à chaque photo : l'ancienne adresse cesse de répondre et le
  // cache des navigateurs prend la nouvelle.
  async changerPhoto(utilisateurId: string, dataUrl: string) {
    const { type, octets } = lirePhoto(dataUrl);
    await this.prisma.utilisateur.update({
      where: { id: utilisateurId },
      data: { photo: octets, photoType: type, photoCle: randomUUID() },
    });
    return this.lire(utilisateurId);
  }

  async retirerPhoto(utilisateurId: string) {
    await this.prisma.utilisateur.update({
      where: { id: utilisateurId },
      data: { photo: null, photoType: null, photoCle: null },
    });
    return this.lire(utilisateurId);
  }

  // Coupe toutes les sessions, celle-ci comprise (téléphone perdu…) : le
  // contrôle du jeton (jwt.strategy) refuse tout jeton émis avant.
  async deconnecterPartout(utilisateurId: string) {
    await this.prisma.$transaction([
      this.prisma.utilisateur.update({ where: { id: utilisateurId }, data: { sessionsValidesDepuis: new Date() } }),
      this.prisma.evenementCompte.create({
        data: {
          utilisateurId,
          type: 'deconnexion_partout',
          parId: utilisateurId,
          detail: 'Toutes les sessions coupées par le titulaire',
        },
      }),
    ]);
    return { ok: true };
  }

  // Photo publique par sa clé (non devinable) — balise <img>, sans jeton.
  async photo(cle: string) {
    const u = await this.prisma.utilisateur.findUnique({
      where: { photoCle: cle },
      select: { photo: true, photoType: true },
    });
    if (!u?.photo || !u.photoType) throw new NotFoundException('Photo introuvable');
    return { type: u.photoType, octets: Buffer.from(u.photo) };
  }
}

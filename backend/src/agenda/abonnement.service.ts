import { Injectable, NotFoundException } from '@nestjs/common';
import { addDays, ETAPE, hasRight, todayIso } from '@hub/domain';
import { genererJeton } from '../auth/jetons';
import { PrismaService } from '../prisma/prisma.service';
import { hasFullAccess, RightsService } from '../rights/rights.service';
import { SwitchesService } from '../switches/switches.service';
import type { Acteur } from './agenda.service';
import { acteurAgenda } from './acteur';
import { AgendaService } from './agenda.service';
import type { ElementAgendaDto } from './agenda.dto';
import { emailsReels } from '../email/email.service';
import { calendrierIcal, type EvenementIcal } from './ical';
import { lienAgendaHub, TITRE_ENTRETIEN, uidEvenement, urlFlux } from './liens';

// Fenêtre relue par l'agenda de la personne : trois mois passés et neuf mois
// à venir (365 jours en tout ; la lecture de l'agenda s'arrête à 366).
const JOURS_PASSES = 90;
const JOURS_FENETRE = 365;
// Trace de la dernière relecture : au plus une écriture toutes les 10 minutes.
const TRACE_MS = 10 * 60_000;

// L'abonnement trouvé par son jeton (AbonnementAgendaGuard).
export type AbonnementLu = {
  id: string;
  societeId: string;
  utilisateurId: string;
  jetonHash: string;
  creeLe: Date;
  dernierAccesLe: Date | null;
};

// Abonnement à son agenda depuis Google Agenda, Apple Calendrier ou Outlook
// (12/11/2026). Le lien secret porte la lecture de SON agenda dans UNE
// société ; à chaque relecture, tout est revérifié comme pour une session :
// compte actif, accès à la société, Lecture de « Mon agenda », maintenance.
// Ce qui sort (choix du 12/11/2026) : rendez-vous et réunions (titre, lieu,
// participants), échéances de ses tâches, absences validées sans leur type ;
// jamais les demandes d'absence à trancher.
@Injectable()
export class AbonnementAgendaService {
  constructor(
    private prisma: PrismaService,
    private agenda: AgendaService,
    private rights: RightsService,
    private switches: SwitchesService,
  ) {}

  async etat(a: Acteur) {
    const ab = await this.prisma.abonnementAgenda.findUnique({
      where: { societeId_utilisateurId: { societeId: a.societeId, utilisateurId: a.userId } },
      select: { creeLe: true, dernierAccesLe: true, utilisateur: { select: { sessionsValidesDepuis: true } } },
    });
    // Un lien coupé avec les sessions (« déconnecter partout », nouveau mot de
    // passe) ne marche plus : il n'est pas présenté comme actif.
    const coupe = !!ab?.utilisateur.sessionsValidesDepuis && ab.utilisateur.sessionsValidesDepuis > ab.creeLe;
    if (!ab || coupe) return { actif: false, creeLe: null, dernierAccesLe: null };
    return {
      actif: true,
      creeLe: ab.creeLe.toISOString(),
      dernierAccesLe: ab.dernierAccesLe?.toISOString() ?? null,
    };
  }

  // Crée le lien, ou le remplace : l'ancien cesse aussitôt de fonctionner. Le
  // lien clair n'est rendu qu'ici, une fois (seule son empreinte est gardée).
  async creer(a: Acteur) {
    const { clair, hash } = genererJeton();
    await this.prisma.abonnementAgenda.upsert({
      where: { societeId_utilisateurId: { societeId: a.societeId, utilisateurId: a.userId } },
      create: { societeId: a.societeId, utilisateurId: a.userId, jetonHash: hash },
      update: { jetonHash: hash, creeLe: new Date(), dernierAccesLe: null },
    });
    return { url: urlFlux(clair) };
  }

  async supprimer(a: Acteur) {
    await this.prisma.abonnementAgenda.deleteMany({ where: { societeId: a.societeId, utilisateurId: a.userId } });
    return { ok: true };
  }

  // Le calendrier relu par l'agenda de la personne. L'abonnement est déjà
  // trouvé par son jeton (AbonnementAgendaGuard), la requête limitée à sa
  // société. Toute perte d'accès répond « introuvable », comme un jeton faux.
  async flux(ab: AbonnementLu) {
    const introuvable = new NotFoundException('Agenda introuvable');
    const lu = await acteurAgenda(this.prisma, this.rights, ab.utilisateurId, ab.societeId);
    if (!lu) throw introuvable;
    // « Déconnecter partout », nouveau mot de passe, désactivation : toutes
    // les sessions coupées le sont aussi pour un lien créé avant.
    if (lu.sessionsValidesDepuis && lu.sessionsValidesDepuis > ab.creeLe) throw introuvable;
    const { acteur, societe } = lu;
    await this.switches.refuseDuringMaintenance(hasFullAccess({ adminHub: lu.adminHub, role: acteur.role }));
    if (!hasRight(acteur.permissions, ETAPE.agenda, 'lecture')) throw introuvable;

    const du = addDays(todayIso(), -JOURS_PASSES);
    const periode = await this.agenda.semaine(acteur, du, undefined, addDays(du, JOURS_FENETRE), {
      sansDemandes: true,
    });

    const maintenant = new Date();
    if (!ab.dernierAccesLe || maintenant.getTime() - ab.dernierAccesLe.getTime() > TRACE_MS) {
      // Pour ce jeton seulement : une relecture de l'ancien lien, en cours
      // pendant sa régénération, ne marque pas le nouveau comme lu.
      await this.prisma.abonnementAgenda.updateMany({
        where: { id: ab.id, jetonHash: ab.jetonHash },
        data: { dernierAccesLe: maintenant },
      });
    }
    return calendrierIcal({
      nom: `HUB · ${societe.nom}`,
      methode: 'PUBLISH',
      evenements: evenementsDuFlux(periode.elements, lienAgendaHub(societe.slug), { sansInvitations: emailsReels() }),
      maintenant,
    });
  }
}

// Éléments de l'agenda → événements du calendrier. Un congé arrive jour par
// jour : regroupé en un seul événement, du premier au dernier jour.
// `sansInvitations` (décision du 12/11/2026) : les réunions où la personne
// est seulement invitée lui arrivent par e-mail, dans son agenda principal ;
// les publier aussi ici les montrerait deux fois. Seulement quand les e-mails
// partent vraiment. Un entretien sort sans le nom du candidat.
export function evenementsDuFlux(
  elements: ElementAgendaDto[],
  lienHub: string,
  options: { sansInvitations?: boolean } = {},
): EvenementIcal[] {
  const conges = new Map<string, { du: string; au: string }>();
  const evenements: EvenementIcal[] = [];
  for (const e of elements) {
    if (e.type === 'rendez_vous' && e.debut && e.fin) {
      if (options.sansInvitations && !e.jeSuisOrganisateur) continue;
      const avec = e.invites.length ? `Avec ${e.invites.join(', ')}` : null;
      const par = e.organisateur ? `Organisé par ${e.organisateur}` : null;
      evenements.push({
        uid: uidEvenement('rdv', e.id),
        titre: e.entretien ? TITRE_ENTRETIEN : e.titre,
        debut: new Date(e.debut),
        fin: new Date(e.fin),
        lieu: e.lieu ?? e.lienVisio,
        rappelMinutes: e.rappelMinutes,
        description: [
          e.lienVisio ? `Visio : ${e.lienVisio}` : null,
          e.entretien ? null : e.detail,
          avec,
          par,
          `Dans le HUB : ${lienHub}`,
        ]
          .filter(Boolean)
          .join('\n'),
        url: lienHub,
      });
    } else if (e.type === 'echeance') {
      evenements.push({
        uid: uidEvenement('echeance', e.id),
        titre: `${e.detail ?? 'Échéance'} · ${e.titre}`,
        debut: e.jour,
        fin: e.jour,
        description: `Échéance d’une tâche du HUB : ${lienHub}`,
        url: lienHub,
        libre: true,
      });
    } else if (e.type === 'conge') {
      const id = e.id.split(':')[0];
      const c = conges.get(id);
      if (!c) conges.set(id, { du: e.jour, au: e.jour });
      else {
        if (e.jour < c.du) c.du = e.jour;
        if (e.jour > c.au) c.au = e.jour;
      }
    }
    // Les demandes d'absence à trancher ne sortent jamais du HUB.
  }
  for (const [id, c] of conges) {
    evenements.push({ uid: uidEvenement('absence', id), titre: 'Absence', debut: c.du, fin: c.au });
  }
  return evenements;
}

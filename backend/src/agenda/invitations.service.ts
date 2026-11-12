import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { calendrierIcal } from './ical';
import { lienAgendaHub, nomDe, uidEvenement } from './liens';

// Invitations par e-mail aux réunions de l'Agenda (12/11/2026) : chaque invité
// actif reçoit le calendrier de la réunion (REQUEST), puis son annulation
// (CANCEL, même UID : la réunion disparaît de son agenda). L'abonnement
// (abonnement.service.ts) est un agenda à part : une réunion acceptée par
// e-mail y figure aussi, en lecture seule.
// Ne lève jamais : un e-mail qui échoue n'annule ni la réunion ni son
// annulation (les notifications du HUB sont déjà parties).
@Injectable()
export class InvitationsAgendaService {
  private readonly log = new Logger('InvitationsAgenda');

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  async envoyer(rendezVousId: string, methode: 'REQUEST' | 'CANCEL'): Promise<number> {
    try {
      return await this.envoyerSansFilet(rendezVousId, methode);
    } catch (e) {
      this.log.error(`invitations ${methode} du rendez-vous ${rendezVousId} : ${e instanceof Error ? e.message : e}`);
      return 0;
    }
  }

  private async envoyerSansFilet(rendezVousId: string, methode: 'REQUEST' | 'CANCEL'): Promise<number> {
    const r = await this.prisma.rendezVous.findUnique({
      where: { id: rendezVousId },
      include: { invites: true, societe: { select: { nom: true, slug: true } } },
    });
    if (!r || !r.invites.length) return 0;
    const comptes = await this.prisma.utilisateur.findMany({
      where: { id: { in: [r.organisateurId, ...r.invites.map((i) => i.utilisateurId)] } },
      select: { id: true, email: true, prenom: true, nom: true, actif: true },
    });
    const organisateur = comptes.find((c) => c.id === r.organisateurId);
    const invites = comptes.filter((c) => c.id !== r.organisateurId && c.actif);
    if (!organisateur || !invites.length) return 0;

    const lien = lienAgendaHub(r.societe.slug);
    const ics = calendrierIcal({
      nom: `HUB · ${r.societe.nom}`,
      methode,
      evenements: [
        {
          uid: uidEvenement('rdv', r.id),
          titre: r.titre,
          debut: r.debut,
          fin: r.fin,
          lieu: r.lieu,
          description: [r.description, `Dans le HUB : ${lien}`].filter(Boolean).join('\n'),
          url: lien,
          // Une réunion ne se modifie pas encore : l'annulation est la
          // seule nouvelle version.
          sequence: methode === 'CANCEL' ? 1 : 0,
          organisateur: { nom: nomDe(organisateur), email: organisateur.email },
          invites: invites.map((i) => ({ nom: nomDe(i), email: i.email })),
        },
      ],
    });
    const envois = await Promise.all(
      invites.map((i) =>
        this.email.envoyerInvitationAgenda({
          email: i.email,
          prenom: i.prenom,
          societeNom: r.societe.nom,
          methode,
          titre: r.titre,
          debut: r.debut,
          fin: r.fin,
          lieu: r.lieu,
          organisateurNom: nomDe(organisateur),
          lien,
          ics,
        }),
      ),
    );
    return envois.filter((e) => e.envoye).length;
  }
}

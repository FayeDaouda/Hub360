import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { calendrierIcal } from './ical';
import { surcharge } from './series';
import { lienAgendaHub, nomDe, TITRE_ENTRETIEN, uidEvenement } from './liens';

// Invitations par e-mail aux réunions de l'Agenda (12/11/2026) : chaque invité
// actif reçoit le calendrier de la réunion (REQUEST), puis son annulation
// (CANCEL, même UID : la réunion disparaît de son agenda). L'abonnement
// (abonnement.service.ts) est un agenda à part : une réunion acceptée par
// e-mail y figure aussi, en lecture seule.
// Une modification renvoie la réunion à jour (même UID, version suivante) ;
// `destinataires` limite l'envoi (l'annulation aux seuls invités retirés).
// Ne lève jamais : un e-mail qui échoue n'annule ni la réunion ni son
// annulation (les notifications du HUB sont déjà parties).
@Injectable()
export class InvitationsAgendaService {
  private readonly log = new Logger('InvitationsAgenda');

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  async envoyer(
    rendezVousId: string,
    methode: 'REQUEST' | 'CANCEL',
    options: { destinataires?: string[] } = {},
  ): Promise<number> {
    try {
      return await this.envoyerSansFilet(rendezVousId, methode, options.destinataires);
    } catch (e) {
      this.log.error(`invitations ${methode} du rendez-vous ${rendezVousId} : ${e instanceof Error ? e.message : e}`);
      return 0;
    }
  }

  private async envoyerSansFilet(
    rendezVousId: string,
    methode: 'REQUEST' | 'CANCEL',
    destinataires?: string[],
  ): Promise<number> {
    const r = await this.prisma.rendezVous.findUnique({
      where: { id: rendezVousId },
      include: { invites: true, exceptions: true, societe: { select: { nom: true, slug: true } } },
    });
    if (!r) return 0;
    const pour = destinataires ?? r.invites.map((i) => i.utilisateurId);
    if (!pour.length) return 0;
    const comptes = await this.prisma.utilisateur.findMany({
      where: { id: { in: [r.organisateurId, ...pour] } },
      select: { id: true, email: true, prenom: true, nom: true, actif: true },
    });
    // Qui a connecté son agenda (Google, Apple) reçoit la réunion directement
    // dans son agenda, sans e-mail (décision du 16/11/2026) — tant que la
    // synchronisation marche : déjà passée, sans erreur, et autorisée après
    // la dernière coupure des sessions (« déconnecter partout » : la tournée
    // suivante la supprimera). Sinon, l'e-mail part.
    const connectes = new Set(
      (
        await this.prisma.connexionAgenda.findMany({
          where: {
            societeId: r.societeId,
            utilisateurId: { in: pour },
            erreur: null,
            derniereSynchroLe: { not: null },
            agendas: { some: { cible: true } },
          },
          select: { utilisateurId: true, autoriseLe: true, utilisateur: { select: { sessionsValidesDepuis: true } } },
        })
      )
        .filter((c) => !c.utilisateur.sessionsValidesDepuis || c.utilisateur.sessionsValidesDepuis <= c.autoriseLe)
        .map((c) => c.utilisateurId),
    );
    const organisateur = comptes.find((c) => c.id === r.organisateurId);
    const invites = comptes.filter((c) => c.id !== r.organisateurId && c.actif);
    const parEmail = invites.filter((c) => !connectes.has(c.id));
    if (!organisateur || !invites.length) return 0;

    // Un entretien sort sans le nom du candidat (décision du 12/11/2026).
    const entretien = (await this.prisma.candidature.count({ where: { rendezVousId: r.id } })) > 0;
    const titre = entretien ? TITRE_ENTRETIEN : r.titre;
    const lien = lienAgendaHub(r.societe.slug);
    // Un événement : la réunion (ou la série, avec sa règle et ses dates
    // annulées), puis chaque occurrence modifiée seule (même UID).
    const base = {
      uid: uidEvenement('rdv', r.id),
      url: lien,
      sequence: r.sequence,
      rappelMinutes: r.rappelMinutes,
      organisateur: { nom: nomDe(organisateur), email: organisateur.email },
      invites: invites.map((i) => ({ nom: nomDe(i), email: i.email })),
    };
    const contenu = (c: {
      titre: string;
      lieu: string | null;
      description: string | null;
      lienVisio: string | null;
    }) => ({
      titre: entretien ? titre : c.titre,
      // Sans lieu, la visio en tient lieu (Google et Outlook en font un lien).
      lieu: c.lieu ?? c.lienVisio,
      description: [
        c.lienVisio ? `Visio : ${c.lienVisio}` : null,
        entretien ? null : c.description,
        `Dans le HUB : ${lien}`,
      ]
        .filter(Boolean)
        .join('\n'),
    });
    const exceptions = r.regle ? r.exceptions : [];
    const ics = calendrierIcal({
      nom: `HUB · ${r.societe.nom}`,
      methode,
      evenements: [
        {
          ...base,
          ...contenu(r),
          debut: r.debut,
          fin: r.fin,
          regle: r.regle,
          exdates: exceptions.filter((e) => e.annulee).map((e) => e.occurrence),
        },
        ...(methode === 'CANCEL'
          ? []
          : exceptions
              .filter((e) => !e.annulee)
              .map((e) => ({
                ...base,
                ...contenu({
                  titre: e.titre || r.titre,
                  lieu: surcharge(e.lieu, r.lieu),
                  description: surcharge(e.description, r.description),
                  lienVisio: surcharge(e.lienVisio, r.lienVisio),
                }),
                debut: e.debut ?? e.occurrence,
                fin: e.fin ?? new Date(+e.occurrence + (+r.fin - +r.debut)),
                recurrenceId: e.occurrence,
              }))),
      ],
    });
    if (!parEmail.length) return 0;
    const envois = await Promise.all(
      parEmail.map((i) =>
        this.email.envoyerInvitationAgenda({
          email: i.email,
          prenom: i.prenom,
          societeNom: r.societe.nom,
          methode,
          titre,
          debut: r.debut,
          fin: r.fin,
          lieu: r.lieu,
          lienVisio: r.lienVisio,
          organisateurNom: nomDe(organisateur),
          lien,
          ics,
        }),
      ),
    );
    return envois.filter((e) => e.envoye).length;
  }
}

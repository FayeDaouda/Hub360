import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import {
  AlerteEmail,
  AvisSecurite,
  CandidatEmail,
  ContratEmail,
  DevisEmail,
  EmailService,
  InvitationAgendaEmail,
  LienCompte,
  RelanceDevisEmail,
  RelanceFactureEmail,
} from './email.service';
import { contenuLienCompte } from './contenu-lien-compte';
import { contenuDevis } from './contenu-devis';
import { contenuRelanceFacture } from './contenu-relance-facture';
import { contenuRelanceDevis } from './contenu-relance-devis';
import { contenuContrat } from './contenu-contrat';
import { contenuAvisSecurite } from './contenu-avis-securite';
import { contenuCandidat } from './contenu-candidat';
import { contenuInvitationAgenda } from './contenu-invitation-agenda';

// Transport SMTP (nodemailer). Instancié uniquement quand EMAIL_TRANSPORT=smtp
// ET SMTP_HOST est renseigné (cf. email.module.ts) — donc jamais actif sans
// configuration. Un échec d'envoi est loggé et renvoie `{ envoye: false }` :
// l'invitation garde son repli (lien à recopier), « mot de passe oublié » reste
// une réponse constante.
@Injectable()
export class SmtpEmailService extends EmailService {
  private readonly log = new Logger('Email');
  private readonly from = process.env.MAIL_FROM || 'hub360° <no-reply@localhost>';
  private readonly transport: nodemailer.Transporter;

  constructor() {
    super();
    const port = Number(process.env.SMTP_PORT) || 587;
    this.transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // 465 = TLS implicite ; 587/25 = STARTTLS. Surchargable via SMTP_SECURE.
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth:
        process.env.SMTP_USER || process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
  }

  async envoyerLienCompte(l: LienCompte): Promise<{ envoye: boolean }> {
    const { sujet, texte, html } = contenuLienCompte(l);
    try {
      await this.transport.sendMail({
        from: this.from,
        to: l.email,
        subject: sujet,
        text: texte,
        html,
      });
      this.log.log(`[smtp] ${l.type} envoyé à ${l.email}`);
      return { envoye: true };
    } catch (e) {
      this.log.error(`[smtp] échec d'envoi ${l.type} à ${l.email} : ${e instanceof Error ? e.message : e}`);
      return { envoye: false };
    }
  }

  async envoyerDevis(d: DevisEmail): Promise<{ envoye: boolean }> {
    const { sujet, texte, html } = contenuDevis(d);
    try {
      await this.transport.sendMail({
        from: this.from,
        to: d.email,
        subject: sujet,
        text: texte,
        html,
      });
      this.log.log(`[smtp] devis ${d.reference} envoyé à ${d.email}`);
      return { envoye: true };
    } catch (e) {
      this.log.error(`[smtp] échec d'envoi devis ${d.reference} à ${d.email} : ${e instanceof Error ? e.message : e}`);
      return { envoye: false };
    }
  }

  async envoyerRelanceFacture(r: RelanceFactureEmail): Promise<{ envoye: boolean }> {
    const { sujet, texte, html } = contenuRelanceFacture(r);
    try {
      await this.transport.sendMail({
        from: this.from,
        to: r.email,
        subject: sujet,
        text: texte,
        html,
      });
      this.log.log(`[smtp] relance facture ${r.reference} envoyée à ${r.email}`);
      return { envoye: true };
    } catch (e) {
      this.log.error(
        `[smtp] échec d'envoi relance ${r.reference} à ${r.email} : ${e instanceof Error ? e.message : e}`,
      );
      return { envoye: false };
    }
  }

  async envoyerRelanceDevis(r: RelanceDevisEmail): Promise<{ envoye: boolean }> {
    const { sujet, texte, html } = contenuRelanceDevis(r);
    try {
      await this.transport.sendMail({
        from: this.from,
        to: r.email,
        subject: sujet,
        text: texte,
        html,
      });
      this.log.log(`[smtp] relance devis ${r.reference} envoyée à ${r.email}`);
      return { envoye: true };
    } catch (e) {
      this.log.error(
        `[smtp] échec d'envoi relance devis ${r.reference} à ${r.email} : ${e instanceof Error ? e.message : e}`,
      );
      return { envoye: false };
    }
  }

  async envoyerCandidat(c: CandidatEmail): Promise<{ envoye: boolean }> {
    const { sujet, texte, html } = contenuCandidat(c);
    try {
      await this.transport.sendMail({
        from: this.from,
        to: c.email,
        subject: sujet,
        text: texte,
        html,
      });
      this.log.log(`[smtp] candidat ${c.reference} (${c.type}) envoyé à ${c.email}`);
      return { envoye: true };
    } catch (e) {
      this.log.error(
        `[smtp] échec d'envoi candidat ${c.reference} (${c.type}) à ${c.email} : ${e instanceof Error ? e.message : e}`,
      );
      return { envoye: false };
    }
  }

  // Le calendrier part en partie « text/calendar » (icalEvent) : c'est elle
  // que Gmail et Outlook lisent pour proposer « Oui / Non ».
  async envoyerInvitationAgenda(i: InvitationAgendaEmail): Promise<{ envoye: boolean }> {
    const { sujet, texte, html } = contenuInvitationAgenda(i);
    try {
      await this.transport.sendMail({
        from: this.from,
        to: i.email,
        subject: sujet,
        text: texte,
        html,
        icalEvent: { method: i.methode, filename: 'invitation.ics', content: i.ics },
      });
      this.log.log(`[smtp] invitation agenda (${i.methode}) envoyée à ${i.email}`);
      return { envoye: true };
    } catch (e) {
      this.log.error(
        `[smtp] échec d'envoi invitation agenda (${i.methode}) à ${i.email} : ${e instanceof Error ? e.message : e}`,
      );
      return { envoye: false };
    }
  }

  async envoyerContrat(c: ContratEmail): Promise<{ envoye: boolean }> {
    const { sujet, texte, html } = contenuContrat(c);
    try {
      await this.transport.sendMail({ from: this.from, to: c.email, subject: sujet, text: texte, html });
      this.log.log(`[smtp] contrat ${c.codeDossier} envoyé à ${c.email}`);
      return { envoye: true };
    } catch (e) {
      this.log.error(
        `[smtp] échec d'envoi contrat ${c.codeDossier} à ${c.email} : ${e instanceof Error ? e.message : e}`,
      );
      return { envoye: false };
    }
  }

  async envoyerAlerte(a: AlerteEmail): Promise<{ envoye: boolean }> {
    try {
      await this.transport.sendMail({ from: this.from, to: a.email, subject: a.sujet, text: a.texte });
      this.log.log(`[smtp] alerte envoyée à ${a.email}`);
      return { envoye: true };
    } catch (e) {
      this.log.error(`[smtp] échec d'envoi de l'alerte à ${a.email} : ${e instanceof Error ? e.message : e}`);
      return { envoye: false };
    }
  }

  async envoyerAvisSecurite(a: AvisSecurite): Promise<{ envoye: boolean }> {
    const { sujet, texte, html } = contenuAvisSecurite(a);
    try {
      await this.transport.sendMail({ from: this.from, to: a.email, subject: sujet, text: texte, html });
      this.log.log(`[smtp] avis de sécurité ${a.evenement} envoyé à ${a.email}`);
      return { envoye: true };
    } catch (e) {
      this.log.error(
        `[smtp] échec d'envoi de l'avis ${a.evenement} à ${a.email} : ${e instanceof Error ? e.message : e}`,
      );
      return { envoye: false };
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import {
  ContratEmail,
  DevisEmail,
  EmailService,
  LienCompte,
  RelanceDevisEmail,
  RelanceFactureEmail,
} from './email.service';
import { contenuLienCompte } from './contenu-lien-compte';
import { contenuDevis } from './contenu-devis';
import { contenuRelanceFacture } from './contenu-relance-facture';
import { contenuRelanceDevis } from './contenu-relance-devis';
import { contenuContrat } from './contenu-contrat';

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
}

import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EmailService, LienCompte } from './email.service';
import { contenuLienCompte } from './contenu-lien-compte';

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
      secure: process.env.SMTP_SECURE
        ? process.env.SMTP_SECURE === 'true'
        : port === 465,
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
      this.log.error(
        `[smtp] échec d'envoi ${l.type} à ${l.email} : ${
          e instanceof Error ? e.message : e
        }`,
      );
      return { envoye: false };
    }
  }
}

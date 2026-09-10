// Seam d'envoi d'email. Un seul besoin aujourd'hui : transmettre un lien de
// compte (activation d'invitation, réinitialisation de mot de passe). L'impl.
// concrète est choisie au démarrage selon EMAIL_TRANSPORT (cf. email.module.ts) :
//   - 'log'  (défaut) : LogEmailService — écrit le lien dans les logs, rien n'est
//                       réellement envoyé (`envoye: false`), l'admin recopie le lien.
//   - 'smtp'          : SmtpEmailService — nodemailer, dormant tant que SMTP_HOST
//                       n'est pas renseigné.
export type TypeLienCompte = 'invitation' | 'reset';

export type LienCompte = {
  type: TypeLienCompte;
  email: string;
  lien: string;
  prenom: string;
};

export abstract class EmailService {
  // Ne lève jamais : un échec de transport renvoie `{ envoye: false }` pour que
  // l'appelant garde son repli (afficher le lien à recopier) et que la réponse
  // « mot de passe oublié » reste constante.
  abstract envoyerLienCompte(lien: LienCompte): Promise<{ envoye: boolean }>;
}

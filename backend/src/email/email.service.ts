// Seam d'envoi d'email. Deux besoins aujourd'hui : transmettre un lien de
// compte (activation d'invitation, réinitialisation de mot de passe) et
// notifier un client d'un devis à consulter (cf. cadrage « Devis »). L'impl.
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

// Notification devis — destinataire EXTERNE (client du CRM, jamais un compte
// hub) : contrairement à LienCompte, pas de mot de passe à définir au bout du
// lien, juste une consultation + réponse (cf. app/devis/[token]). Ajouté
// plutôt que d'élargir LienCompte : deux contextes/audiences trop différents
// pour partager un seul type sans devenir un fourre-tout.
export type DevisEmail = {
  email: string;
  clientNom: string;
  societeNom: string;
  reference: string | null;
  montantTtc: number;
  lien: string;
};

// Relance manuelle d'une facture en retard — cf. cadrage « Devis » §Zervant :
// pas de scheduler dans ce backend (statuts dérivés à la lecture, jamais un
// job planifié qui tourne seul), donc pas de relance automatique non plus.
// L'admin déclenche lui-même, au moment qu'il juge utile. Pas de lien : ni
// page publique de facture, ni portail de paiement — un simple rappel.
export type RelanceFactureEmail = {
  email: string;
  clientNom: string;
  societeNom: string;
  reference: string | null;
  resteAPayer: number;
  echeanceLe: string | null;
  joursRetard: number;
};

// Relance d'une offre en attente de réponse (étape F, J+3 / J+6) —
// déclenchée à la main, comme les relances de factures. Porte un NOUVEAU lien
// (le jeton est régénéré à chaque relance, l'ancien cesse de fonctionner).
export type RelanceDevisEmail = {
  email: string;
  clientNom: string;
  societeNom: string;
  reference: string | null;
  montantTtc: number;
  dateValidite: string | null; // AAAA-MM-JJ
  lien: string;
};

// Alerte d'exploitation (suivi des erreurs) : destinataire technique, texte
// brut, pas de lien.
export type AlerteEmail = {
  email: string;
  sujet: string;
  texte: string;
};

// Contrat à signer (étape G) — lien public : consultation, annexes, signature
// (« J'accepte » ou signature tracée), sans compte.
export type ContratEmail = {
  email: string;
  clientNom: string;
  societeNom: string;
  codeDossier: string;
  lien: string;
};

export abstract class EmailService {
  // Ne lève jamais : un échec de transport renvoie `{ envoye: false }` pour que
  // l'appelant garde son repli (afficher le lien à recopier) et que la réponse
  // « mot de passe oublié » reste constante.
  abstract envoyerLienCompte(lien: LienCompte): Promise<{ envoye: boolean }>;
  abstract envoyerDevis(d: DevisEmail): Promise<{ envoye: boolean }>;
  abstract envoyerRelanceFacture(r: RelanceFactureEmail): Promise<{ envoye: boolean }>;
  abstract envoyerRelanceDevis(r: RelanceDevisEmail): Promise<{ envoye: boolean }>;
  abstract envoyerContrat(c: ContratEmail): Promise<{ envoye: boolean }>;
  abstract envoyerAlerte(a: AlerteEmail): Promise<{ envoye: boolean }>;
}

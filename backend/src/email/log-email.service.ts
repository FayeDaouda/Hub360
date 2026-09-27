import { Injectable, Logger } from '@nestjs/common';
import { DevisEmail, EmailService, LienCompte, RelanceDevisEmail, RelanceFactureEmail } from './email.service';

// Transport par défaut : rien n'est envoyé, le lien est écrit dans les logs.
// `envoye: false` -> l'appelant affiche le lien à recopier (fallback manuel).
@Injectable()
export class LogEmailService extends EmailService {
  private readonly log = new Logger('Email');

  async envoyerLienCompte(l: LienCompte): Promise<{ envoye: boolean }> {
    this.log.log(`[log] lien ${l.type} pour ${l.email} : ${l.lien}`);
    return { envoye: false };
  }

  async envoyerDevis(d: DevisEmail): Promise<{ envoye: boolean }> {
    this.log.log(`[log] devis ${d.reference} pour ${d.email} : ${d.lien}`);
    return { envoye: false };
  }

  async envoyerRelanceFacture(r: RelanceFactureEmail): Promise<{ envoye: boolean }> {
    this.log.log(`[log] relance facture ${r.reference} pour ${r.email}`);
    return { envoye: false };
  }

  async envoyerRelanceDevis(r: RelanceDevisEmail): Promise<{ envoye: boolean }> {
    this.log.log(`[log] relance devis ${r.reference} pour ${r.email} → ${r.lien}`);
    return { envoye: false };
  }
}

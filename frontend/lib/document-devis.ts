import { addDays, formatLongDate, VALIDITE_OFFRE_JOURS } from '@hub/domain';
import type { DocumentFacturationProps } from '@/components/document-facturation';
import { statutDevis } from './finances';
import type { Devis, Societe } from './types';

// Document d'un devis tel que l'imprime le HUB — une seule construction pour
// le panneau Finances et l'aperçu du CFO dans la fiche CRM, rendu par le même
// DocumentFacturation que la page de réponse du client (app/devis/[token]).
export function documentDevis(d: Devis, societe: Societe): DocumentFacturationProps {
  const s = statutDevis(d);
  return {
    typeDocument: 'Devis',
    societe,
    reference: d.reference,
    statutLabel: s.libelle,
    statutClasse: `pill--${s.ton}`,
    dateEmission: formatLongDate(d.dateEnvoi ?? d.creeLe),
    dateValidite: d.dateValidite ? formatLongDate(d.dateValidite) : null,
    clientNom: d.client.nom,
    objet: d.objet,
    lignes: d.lignes,
    montantHt: d.montantHt,
    montantTva: d.montantTva,
    montantTtc: d.montantTtc,
  };
}

// Aperçu AVANT envoi (validation du CFO, 09/11/2026) : l'offre telle que le
// client la recevra si elle part aujourd'hui — date du jour et validité qui
// court à partir de l'envoi. La référence reste celle du devis (une offre
// CRM a la sienne, CODE-OFn, dès sa création).
export function documentApercuOffre(d: Devis, societe: Societe, aujourdhui: string): DocumentFacturationProps {
  return {
    ...documentDevis(d, societe),
    statutLabel: 'Aperçu avant envoi',
    statutClasse: 'pill--attention',
    dateEmission: formatLongDate(aujourdhui),
    dateValidite: formatLongDate(addDays(aujourdhui, VALIDITE_OFFRE_JOURS)),
  };
}

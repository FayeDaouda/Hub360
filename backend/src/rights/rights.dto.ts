// Avis « Vos droits ont changé » (bandeau en haut de page, 31/10/2026).
export class RightsNoticeDto {
  id: string;
  message: string;
  createdAt: Date;
}

// Droits du moment de la personne connectée : étape → lettres « LEVS ».
export class DroitsCourantsDto {
  permissions: Record<string, string>;
}

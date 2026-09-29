import { BadRequestException } from '@nestjs/common';

// Fenêtre d'un bloc assigné (RH · Temps, lot 4) : sa durée standard se
// répartit du début à l'échéance (cf. rh/regles-temps.ts), le début ne peut
// donc pas suivre l'échéance. Contrôlé sur les valeurs APRÈS mise à jour.
export function verifierFenetreBloc(debut: string | null, echeance: string | null) {
  if (debut && echeance && debut > echeance) {
    throw new BadRequestException("La date de début doit précéder l'échéance du bloc.");
  }
}

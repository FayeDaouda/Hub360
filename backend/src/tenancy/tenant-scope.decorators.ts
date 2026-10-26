import { SetMetadata } from '@nestjs/common';

export const GROUP_SCOPE = 'tenancy:group-scope';
export const SYSTEM_SCOPE = 'tenancy:system-scope';

// Route ou contrôleur dont les lectures couvrent tout le groupe (ADR 0001) :
// l'isolation automatique par société ne s'y applique pas. Le périmètre de
// chaque module transverse reste à confirmer par la direction.
export const GroupScope = () => SetMetadata(GROUP_SCOPE, true);

// Route sans session de société (connexion, activation, mot de passe oublié) :
// déclarée, avec la raison, plutôt qu'ouverte par défaut.
export const SystemScope = (reason: string) => SetMetadata(SYSTEM_SCOPE, reason);

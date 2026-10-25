import { chargerEnvironnement } from './environnement';

// Importé en premier par main.ts : la configuration est chargée et vérifiée
// avant que les modules (JwtModule, e-mail…) ne lisent process.env.
chargerEnvironnement();

# ADR 0005 — Contrat d'API : description OpenAPI générée, types du front générés

- Statut : accepté (27/10/2026)
- Contexte de décision : décision n° 8 du chantier de structuration
  (25/10/2026, « OpenAPI généré depuis le back + client typé généré pour le
  front ») ; accord du user du 27/10/2026 pour `@nestjs/swagger` et
  `openapi-typescript`, avec deux conditions : Swagger désactivé en
  production, et une CI qui régénère les types et échoue s'ils diffèrent.
  Mise en œuvre : PR S0c, seconde partie.

## Contexte

Le front décrivait l'API à la main (`frontend/lib/types.ts`, 1 926 lignes) :
rien ne signalait un écart avec le back. Les applications macOS, Windows et
iOS prévues auront besoin du même contrat, dans un format indépendant du
langage.

## Décision

1. **Description tirée du code** : `@nestjs/swagger` et son plugin de
   compilation (`nest-cli.json`) lisent les routes des contrôleurs et les DTO
   des fichiers `*dto.ts`, contraintes de class-validator comprises. Les DTO
   déclarés dans des contrôleurs ont été déplacés dans des fichiers `*.dto.ts`
   voisins ; deux classes portaient le même nom (`DelegationDto`), celle des
   RH s'appelle désormais `DelegationLivrableDto`.
2. **Générée sans base de données** : `npm run openapi` (`src/openapi.ts`,
   après `npm run build`) assemble l'application en mode « aperçu », sans
   créer les services, puis écrit `backend/openapi.json`, versionné. La
   génération est stable : deux passages donnent le même fichier.
3. **Deux compléments** (`src/documentation.ts`) : chaque paramètre de chemin
   est déclaré sur chaque route (le plugin ne voit que ceux que la méthode
   lit) ; une réponse « objet » sans propriétés, type deviné et non décrit,
   devient « inconnue » plutôt qu'un objet vide.
4. **Types du front générés** : `npm run api:types` (`openapi-typescript`, en
   développement seulement) écrit `frontend/lib/api/schema.d.ts`, versionné.
   `frontend/lib/api/types.ts` en tire les types d'usage (`CorpsRequete`,
   `ParametresChemin`, `ReponseApi`, `SchemaApi`), vérifiés par des tests de
   types. Le client existant (`lib/client-api.ts`) les reçoit : aucune
   bibliothèque cliente en plus.
5. **Vérifiés partout** : la CI et le crochet `pre-push` régénèrent la
   description et les types, et échouent s'ils diffèrent des fichiers
   versionnés.
6. **Swagger en développement seulement** : la page `/api/docs` n'existe pas
   quand `NODE_ENV=production` (images Docker, pré-production, production).
7. **Réponses décrites module par module** : aujourd'hui, seuls les corps
   reçus et les paramètres sont décrits ; chaque module de la structuration
   (S1 à S7) décrit ses réponses par des DTO et type ses appels avec ces
   types, à la place des types écrits à la main.

## Alternatives écartées

- **Types écrits à la main** (situation de départ) : ils dérivent dès qu'on
  oublie de les mettre à jour, et ne servent pas aux applications natives.
- **tRPC** : impose TypeScript aux deux bouts, incompatible avec les clients
  natifs.
- **Bibliothèque cliente générée** (`openapi-fetch` ou équivalent) : une
  dépendance de production de plus au front, alors que le client existant
  gère déjà la session, les erreurs et le 401.

## Conséquences

- Après un changement de route ou de DTO : `npm run build && npm run openapi`
  au back, puis `npm run api:types` au front, et versionner les deux fichiers.
- Les DTO vivent dans des fichiers `*dto.ts` (sinon ils ne sont pas décrits),
  avec des noms de classe uniques.
- `@nestjs/swagger` 11.4.7 fige `js-yaml` 5.3.0, visé par un avis « modéré » :
  `overrides` du back le remplace par la version corrective 5.4.1, pour ce
  paquet seulement (le hub ne lit pas de YAML).
- Le JavaScript compilé des DTO gagne les métadonnées du plugin : la
  validation des requêtes n'en dépend pas.

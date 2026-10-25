# ADR 0001 — Isolation entre sociétés centralisée

- Statut : accepté (25/10/2026)
- Contexte de décision : audit du 24/10/2026 (constat E1), décision n° 2 du
  user le 25/10/2026.

## Contexte

hub360° sert plusieurs sociétés (Grey Concrete aujourd'hui ; CODE'D Group,
Grey Holding et Extra ensuite). Chaque session est ouverte pour une société :
le jeton porte `societeId`, et les gardes vérifient que le slug de la route
est bien celui du jeton.

Ensuite, chaque service filtre lui-même par `societeId`, requête par requête :
753 appels Prisma, dont 76 lectures ou écritures par `id` seul. Rien ne
garantit qu'un oubli n'expose pas les données d'une autre société, et aucun
test ne le prouve. Une seule société active aujourd'hui masque le risque.

Certaines lectures sont volontairement transverses : tout le module RH
(`src/rh` : dossiers du personnel, intégration, feuilles de temps, alertes,
mais aussi Mon espace et Mes tâches, qui suivent la société du dossier du
salarié, pas forcément celle de sa session), la recherche de salariés,
l'espace `/groupe` (comptes et rôles) et le référentiel des localités,
partagé par toutes les sociétés.

## Décision

1. **Isolation stricte par défaut, appliquée à un seul endroit.** Une
   extension Prisma, installée dans `PrismaService`, ajoute la société active
   au filtre de toute opération sur un modèle qui porte un `societeId`
   obligatoire (liste lue dans le schéma, pas maintenue à la main) :
   - lectures, comptages, agrégats, mises à jour et suppressions : la
     condition `societeId = société active` est ajoutée au `where` (y compris
     pour `findUnique` et `update` par `id`) ;
   - créations : une ligne destinée à une autre société est refusée.
2. **Contexte de requête.** Après l'authentification, un intercepteur global
   place la société du jeton dans un `AsyncLocalStorage` (Node, sans
   dépendance) pour toute la durée de la requête, transactions comprises.
3. **Périmètre groupe explicite.** Les routes transverses portent le
   décorateur `@GroupScope()` ; un traitement ponctuel peut aussi s'exécuter
   dans `runInGroupScope()`, qui attend le travail à l'intérieur du
   contexte : une requête Prisma ne s'exécute qu'à son `await`. Hors requête (tâches planifiées, scripts, seed)
   et sur les liens publics (jeton de devis ou de contrat), aucun filtre
   n'est appliqué : ces chemins ne servent pas une session de société.
4. **Preuve par les tests.** Tests unitaires de l'extension, et tests e2e
   d'API avec une seconde société : un compte d'une société ne lit, ne
   modifie ni ne liste aucune donnée de l'autre.

Le périmètre groupe actuel est conservé tel quel en attendant la décision de
la direction (RH commune aux quatre sociétés ou propre à chacune) ; la
permission explicite « vue groupe » en lecture, avec journal des accès,
viendra avec cette décision.

## Alternatives écartées

- **Continuer à filtrer à la main, avec des tests.** Les tests ne couvrent
  que ce qu'on pense à tester ; chaque nouvelle requête reste un risque.
- **Row Level Security PostgreSQL.** La garantie la plus forte, mais elle
  impose de passer la société à chaque connexion (variable de session dans
  une transaction par requête avec Prisma), complique les migrations et les
  scripts, et ne sait rien du périmètre groupe applicatif. À reconsidérer si
  l'API est un jour ouverte à des tiers.
- **Un client Prisma par société.** Multiplie les connexions et ne règle pas
  les lectures transverses.

## Conséquences

- Mesure faite à la mise en place : les 15 tentatives d'accès inter-sociétés
  des tests e2e échouaient déjà grâce aux filtres écrits dans les services ;
  aucune fuite n'existait sur ce périmètre. L'extension est la seconde
  barrière, prouvée séparément sur la base (le client de l'application ne
  rend rien d'une autre société, même par identifiant).
- Les gardes s'exécutent avant l'intercepteur, donc sans contexte : elles
  continuent de vérifier la société elles-mêmes.

- Un oubli de filtre dans un service n'expose plus de données : la requête
  ne trouve rien (404) au lieu de renvoyer la ligne d'une autre société.
- Les modèles enfants sans `societeId` (lignes de facture, tâches, pièces…)
  restent protégés par leur parent : on y accède par un parent déjà filtré.
  Les routes qui les atteignent par leur seul `id` doivent continuer à
  vérifier le parent ; les tests e2e d'isolation les couvrent.
- `Role` et `UtilisateurSocieteRole` (société facultative : rôles du socle
  communs au groupe) ne sont pas filtrés automatiquement.
- Les requêtes SQL brutes ne passent pas par l'extension (aucune aujourd'hui) :
  toute requête brute future doit filtrer elle-même et être revue.

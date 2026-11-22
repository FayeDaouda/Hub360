# ADR 0001 — Isolation entre sociétés centralisée

- Statut : accepté (25/10/2026), renforcé le 25/10/2026 (refus par défaut,
  références, requêtes brutes)
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
   extension Prisma, installée dans `PrismaService`
   (`src/tenancy/tenant-isolation.extension.ts`), s'applique à toute
   opération (listes lues dans le schéma, rien à maintenir à la main) :
   - sur les 33 modèles qui portent un `societeId` obligatoire, la condition
     `societeId = société active` est ajoutée au `where` des lectures,
     comptages, agrégats, mises à jour et suppressions, y compris par `id` ;
     une ligne créée pour une autre société est refusée ;
   - sur tout modèle, une écriture qui référence (clé étrangère ou `connect`)
     une ligne existante d'une autre société est refusée. Seules les lignes
     d'une AUTRE société sont recherchées : une ligne créée plus tôt dans la
     même transaction, pas encore visible, n'est pas confondue avec elle ;
   - les requêtes SQL brutes (`$queryRaw`, `$executeRaw` et leurs variantes
     `Unsafe`) ne passent qu'en périmètre système déclaré : elles échappent
     au filtre. Il n'en existe aucune aujourd'hui.
2. **Refus par défaut.** Une opération sur une donnée de société sans
   contexte d'isolation, ou dans une requête dont la société n'est pas encore
   identifiée, lève une erreur. Tout traitement doit déclarer son périmètre :
   - `company` : société de la session ;
   - `group` : lecture transverse assumée (`@GroupScope()`,
     `runInGroupScope()`) ;
   - `system` : traitement sans session de société, nommé
     (`@SystemScope(raison)`, `runAsSystem(raison, …)`).
3. **Contexte de requête dès l'entrée.** Un middleware ouvre le contexte de
   chaque requête HTTP (`AsyncLocalStorage`, Node, sans dépendance) avant les
   gardes ; un garde global fixe le périmètre d'après la route ; la société
   est identifiée par l'authentification elle-même : stratégie JWT, ticket du
   flux de chat, jeton d'un lien public (recherché en périmètre système, puis
   la requête est limitée à la société du devis ou du contrat). Les gardes
   lisent donc déjà dans le seul périmètre de la société.
4. **Tâches planifiées.** Chacune déclare son contexte : découverte des
   sociétés concernées en périmètre système, puis travail de chaque société
   dans son seul périmètre (commissions, synthèses mensuelles, relances du
   CEO). La tournée des rappels, globale, est déclarée système en entier ;
   la découper par société est un suivi prévu.
5. **Périmètre groupe actuel conservé** en attendant la décision de la
   direction (RH commune aux quatre sociétés ou propre à chacune) : tout
   `src/rh`, l'espace `/groupe` et la recherche de salariés. La permission
   explicite « vue groupe » en lecture, avec journal des accès, viendra avec
   cette décision. La connexion et la gestion des comptes
   (`AuthController`) sont en périmètre système.
   **Annuaire (22/11/2026)** : lecture transverse déclarée
   (`runInGroupScope`) des seuls champs d'annuaire des autres sociétés
   (`selectContact` : nom, nom affiché, photo, poste, cellule, téléphone et
   e-mail pro) et de la date de fin d'une absence du jour, seulement quand
   le périmètre réglé pour la société par le CIO ou l'Administrateur HUB
   l'ouvre (journal d'audit). La liste des champs renvoyés est figée par des
   tests (unitaire et e2e) : tout champ ajouté doit les modifier.
6. **Preuve par les tests.** Tests unitaires de l'extension ; tests e2e
   d'API avec une seconde société (lectures, écritures et listes refusées,
   relation vers une donnée de l'autre société refusée, refus hors contexte,
   requête brute refusée, transaction acceptée, contexte présent dès les
   gardes) ; tests des quatre tâches planifiées lancées hors requête. Tous
   tournent en CI.

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

- Un oubli de filtre dans un service n'expose plus de données : la requête
  ne trouve rien (404) au lieu de renvoyer la ligne d'une autre société.
- Les modèles enfants sans `societeId` (lignes de facture, tâches, pièces…)
  restent protégés par leur parent : on y accède par un parent déjà filtré.
  Les routes qui les atteignent par leur seul `id` doivent continuer à
  vérifier le parent ; les tests e2e d'isolation les couvrent.
- `Role` et `UtilisateurSocieteRole` (société facultative : rôles du socle
  communs au groupe) ne sont pas filtrés automatiquement.
- Une requête SQL brute future devra s'exécuter dans `runAsSystem` et
  filtrer elle-même par société : la revue de code doit le vérifier.
- Les écritures imbriquées (`create` d'une relation à l'intérieur d'une autre
  écriture) ne sont pas inspectées en profondeur : leur racine l'est.
- Coût : une requête de vérification par modèle référencé, à chaque écriture
  qui référence une donnée de société.

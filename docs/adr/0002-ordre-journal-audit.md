# ADR 0002 — Ordre des événements du journal d'audit : séquence et déclencheurs PostgreSQL

- Statut : accepté (26/10/2026)
- Contexte de décision : revue de la PR #2 (25/10/2026). Mise en œuvre :
  migration `backend/prisma/migrations/20261026090000_ordre_journal`.

## Contexte

Le journal d'audit (Pilotage › Journal, `src/audit/journal-audit.service.ts`)
n'a pas de table propre : il est reconstruit à la lecture à partir de 17 types
d'événements portés par 15 tables métier (comptes, droits, factures, paiements,
avoirs, reportings, clôtures, réglages, paie…), chacun daté par sa propre
colonne (`created_at`, `emise_le`, `decide_le`, `repondu_le`, `archive_le`…).

Deux événements au même instant (à la milliseconde près, ou dates fixées par
le seed) n'avaient aucun ordre garanti : la base les rendait dans un ordre
variable d'une lecture à l'autre. Les identifiants sont des UUID aléatoires,
donc inutilisables pour départager, et plusieurs événements sont des mises à
jour d'une ligne existante (émission d'une facture, décision sur un avoir,
réponse à une question, archivage d'un dossier) : l'ordre de création de la
ligne n'est pas celui de l'événement.

Décision du user : l'ordre doit refléter la chronologie réelle des événements,
pas leur contenu.

## Décision

1. **Une séquence PostgreSQL commune** à tous les événements du journal,
   `journal_ordre_seq` : deux événements de tables différentes au même
   instant sont aussi départagés.
2. **Une colonne d'ordre par type d'événement** (17 colonnes `BIGINT`,
   `ordre_journal`, `ordre_emission`, `ordre_decision`, `ordre_reponse`,
   `ordre_archivage`, `ordre_demande`), exposée par Prisma en lecture seule de
   fait (`ordreJournal`, `ordreEmission`…).
3. **Un déclencheur générique, `journal_numeroter(colonne_horodatage,
colonne_ordre)`**, posé `BEFORE INSERT OR UPDATE OF <horodatage>` sur
   chaque table : quand l'horodatage de l'événement est posé ou change, la
   colonne d'ordre reçoit `nextval('journal_ordre_seq')`. Le déclencheur
   n'agit pas quand une autre colonne change : une facture modifiée après son
   émission garde son ordre d'émission.
4. **Historique** : la migration numérote les événements existants dans
   l'ordre chronologique (à horodatage égal, l'ordre réel est perdu : table
   puis identifiant, de façon stable), puis place la séquence après eux.
5. **Lecture** : le journal trie par horodatage décroissant, puis par ordre
   décroissant ; l'ordre n'est pas exposé par l'API.

## Alternatives écartées

- **Départage par contenu** (référence, libellé) : stable et lisible, mais ne
  reflète pas la chronologie réelle — refusé à la revue.
- **Horodatage en microsecondes** posé par la base (`clock_timestamp()`) :
  JavaScript ne lit les dates qu'à la milliseconde, la comparaison devrait se
  faire en SQL ; et deux transactions peuvent encore obtenir le même instant.
- **Ordre posé par l'application** : chaque écriture concernée (17 types,
  dans plusieurs modules) devrait penser à le renseigner, et `nextval` exige
  une requête SQL brute, réservée au périmètre système (ADR 0001).
- **Une séquence par table** : ne départage pas deux événements de tables
  différentes au même instant.

## Conséquences

- Aucune écriture de l'application n'a à s'en soucier ; un nouvel événement
  du journal doit en revanche recevoir sa colonne d'ordre et son déclencheur
  dans la migration qui l'ajoute.
- Les déclencheurs ne sont pas décrits dans `schema.prisma` : `prisma migrate
diff` ne les voit pas. Ils vivent dans la migration, référencée en
  commentaire des champs d'ordre.
- Une séquence PostgreSQL ne revient jamais en arrière : une transaction
  annulée laisse un trou dans les numéros d'ordre. C'est sans effet : l'ordre
  sert à trier, pas à numéroter des pièces (la numérotation légale des
  factures, elle, est sans trou, cf. `facturation.service.ts`).
- Ce mécanisme reste une reconstruction à partir des tables métier. Un vrai
  journal d'événements en ajout seul est proposé pour la structuration
  (`docs/feuille-de-route.md`).
- Tests : `backend/test/e2e/journal-audit.e2e-spec.ts` (ordre d'insertion,
  numérotation au moment de l'émission, ordre servi par l'API).

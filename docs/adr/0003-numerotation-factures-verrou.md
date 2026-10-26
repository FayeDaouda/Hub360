# ADR 0003 — Numérotation des factures : émissions sérialisées par société et par année

- Statut : accepté (26/10/2026)
- Contexte de décision : vérification demandée à la revue (26/10/2026),
  défaut avéré, correction autorisée par le user. Mise en œuvre : migration
  `backend/prisma/migrations/20261026120000_verrou_numerotation`.

## Contexte

La numérotation légale des factures (lot 6 CFO, à la manière de Zervant) est
attribuée à l'émission : une suite par société, préfixe et année, partagée
par les factures et les avoirs ; numéro = plus grand émis + 1 (ou numéro de
départ) ; date d'émission posée dans la même écriture. Deux contraintes
d'unicité excluent le doublon : `(société, numero)` et `(société, préfixe,
année, séquence)`.

Deux émissions simultanées lisaient le même plus grand numéro ; la seconde
butait sur la contrainte d'unicité et recommençait, 5 fois au plus. Au-delà
de 5 émissions simultanées pour une même société, l'une pouvait échouer
(409 ; la facture restait en brouillon, sans trou ni doublon). Mesuré :
8 émissions simultanées, un échec à chaque essai.

## Décision

**Une ligne de verrou par société et par année** (`verrous_numerotation`,
modèle `VerrouNumerotation`), mise à jour (`upsert`) en tête de chaque
transaction d'émission, avant toute lecture de numéro. Le verrou de ligne pris
par PostgreSQL sur cette mise à jour tient jusqu'à la fin de la transaction :
une autre émission de la même société attend, puis lit le plus grand numéro
après celle-ci. Les numéros sont donc attribués un par un, dans l'ordre
d'émission, sans course perdue, quel que soit le nombre d'émissions.

- Le numéro légal reste **dérivé des factures émises** (plus grand + 1) : la
  ligne de verrou ne porte aucun compteur, seulement la date de la dernière
  émission.
- Les contraintes d'unicité restent la garantie « sans doublon » ; les
  nouvelles tentatives sur collision sont gardées pour les deux seuls cas
  restants : la création de la ligne de l'année (première émission de
  l'année, si deux arrivent ensemble) et le passage d'une année à l'autre (le
  numéro interne `numero` est continu sur toutes les années).
- L'année du verrou et celle du numéro légal sont calculées une seule fois par
  transaction.

## Alternatives écartées

- **Verrou consultatif PostgreSQL** (`pg_advisory_xact_lock`) : aucune table à
  ajouter, mais il exige une requête SQL brute, que l'ADR 0001 réserve au
  périmètre système ; et sa clé (un entier dérivé de la société) n'apparaît
  nulle part dans le schéma.
- **Vrai compteur** (la ligne porte le dernier numéro et l'incrémente) : une
  seconde source de vérité du numéro, qui devrait suivre les changements de
  format, de préfixe et de numéro de départ du CFO et les avoirs ; le
  « plus grand émis + 1 » sous verrou donne le même résultat sans la dupliquer.
- **Davantage de nouvelles tentatives** : repousse la limite sans la supprimer,
  et l'ordre d'attribution dépendrait du hasard des tentatives.
- **Transaction `SERIALIZABLE`** : les conflits deviendraient des échecs à
  retenter, le même problème sous une autre forme.

## Conséquences

- Les émissions d'une même société sont sérialisées : chacune dure quelques
  millisecondes, l'attente est négligeable pour l'usage réel (studio de
  quatre personnes) ; les émissions de sociétés différentes ne s'attendent pas.
- La ligne de verrou est une donnée de société : couverte par l'isolation
  (ADR 0001) comme les autres.
- Tests : `backend/test/e2e/numerotation.e2e-spec.ts` émet 20 factures
  simultanément et vérifie des numéros consécutifs, uniques, dans l'ordre
  d'émission, et toute la séquence légale de la société sans trou ni doublon
  (10 passages sur 10 ; le même test échouait en 409 sans le verrou) ; un test
  unitaire vérifie que le verrou est pris avant la lecture du plus grand
  numéro.

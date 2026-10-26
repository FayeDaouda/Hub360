# Audit initial du code — 24/10/2026

Point de départ du chantier « nettoyage et structuration » : filet de sécurité
(phase 0) et audit mesuré (phase 1), sans aucune modification du code
applicatif. Les chiffres ci-dessous sont la référence « avant » des phases
suivantes. Révision auditée : `7a50b81` (main).

## Phase 0 — filet de sécurité

### État des vérifications sur la révision auditée

| Vérification | Résultat |
|---|---|
| Front `tsc --noEmit` | vert (2,6 s) |
| Front `next lint` | vert, 0 avertissement |
| Front `next build` | vert (31 s), page la plus lourde 167 kB (Finances) |
| Back `tsc` (tsconfig.build) | vert |
| Back `nest build` (sortie isolée) | vert |
| Back tests unitaires (Jest) | 95 suites, 717 tests verts (22 s) |
| Back tests e2e API (`npm run test:e2e`) | **5 échecs sur 12** à l'arrivée : attentes périmées (voir ci-dessous) ; 12/12 après mise à jour |
| `npm audit --omit=dev` | back : 14 vulnérabilités (2 critiques, 6 élevées) ; front : 3 (1 critique, 2 élevées) |

Les 5 échecs e2e venaient de tests restés en arrière de changements voulus :
numérotation des factures façon Zervant (`5b90a6d`, références `GC-2026-NNNN`
au lieu de `F2026-NNNN`) et lot F de Mes tâches (`72b1c2d` : fichier
obligatoire, renommage automatique). Seules les attentes des tests ont changé.

### Outillage ajouté : `e2e/`

Paquet isolé à la racine (dépendance unique : `@playwright/test` 1.62.0 —
demandé par le chantier, sans effet sur les bundles front et back).

- `scripts/reference-env.sh up [révision]` : copie du code (arbre de travail
  ou révision git), base dédiée `hub_ref` recréée (migrations + seed), API de
  production sur :3101 et front de production sur :3100. Ne touche ni à la
  base de développement, ni aux serveurs de dev, ni à leurs dossiers `.next/`
  et `dist/`.
- `scripts/reference-scenario.mjs` : amène la base au point où chaque écran a
  du contenu, uniquement par l'API (projet ouvert à l'émission de F1, trois
  tâches assignées au Salarié, contrat envoyé non signé, devis envoyé) et
  prépare les sessions des rôles.
- `visual/pages.spec.ts` : captures de référence de 58 écrans (public, CEO,
  Salarié, CIO, avec chaque onglet de premier niveau) × 2 thèmes × 2 formats
  (1440 px, 390 px) = 232 captures dans `e2e/.reference/` (non versionnées).
- `smoke/critical-paths.spec.ts` : 8 tests de fumée — choix de société et
  connexion, mot de passe refusé, tâches du Salarié, dépôt d'une tâche avec
  fichier, demande de délai, facture directe du CFO retrouvée dans la liste,
  devis public (et lien inconnu).

Le seed de démonstration n'ouvre aucun dossier RH : l'environnement de
référence lance aussi le script officiel `prisma/rh-dossiers-init.ts`, sinon
les écrans RH et Mon espace resteraient vides.

Méthode de comparaison : référence prise sur la révision de début de phase,
puis comparaison du code modifié, le même jour (les données de démo sont
relatives à la date du seed). Ce qui change légitimement d'un seed à l'autre
est neutralisé : heures des horodatages ramenées à minuit dans les réponses
de l'API, horloge du navigateur fixée à midi, couleurs d'avatars (dérivées
d'identifiants aléatoires) uniformisées. Les captures s'exécutent sur un seul
worker, car certaines visites modifient l'état du serveur (accusés de
lecture, journal).

## Phase 1 — audit

Volume : front 225 fichiers TS/TSX (38 988 lignes) + 18 020 lignes de CSS ;
back 216 fichiers (26 130 lignes) + 95 fichiers de tests (8 882 lignes) ;
schéma Prisma 2 749 lignes, 75 modèles, 135 migrations.

### Constats par gravité

#### Critique

| # | Constat | Mesure | Fichiers |
|---|---|---|---|
| C1 | **Corrigé le 24/10/2026** (voir « Correction C1 »). XSS stockée par fichier joint : 6 points d'entrée enregistrent l'URL du fichier sans vérifier son schéma, et le front ouvre les fichiers par `a.href = url; a.click()`. **Rejoué sur l'environnement de référence** : un compte Salarié dépose un justificatif d'absence `javascript:…` (201), l'API le restitue tel quel à la RH, et le clic exécute le code dans la session RH (dont le jeton est en `localStorage`). | 6 points d'entrée sans contrôle (4 le font : remise de tâche, bulletin, pièce RH, attestation) | back `rh/demandes.service.ts` (justificatifs d'absence l. 145 et de remboursement l. 232), `contrats/contrats.service.ts` (document l. 210, annexe l. 233, scan signé l. 298), `projets/facturation/facturation.service.ts` (facture du bureau d'études l. 869) ; front `lib/demandes.ts`, `lib/mon-espace.ts`, `lib/projets-ouverts.ts`, `lib/signalements.ts` |
| C2 | Dépendances vulnérables en production | back 2 critiques + 6 élevées (`npm audit`), front 1 critique + 2 élevées | `backend/package-lock.json`, `frontend/package-lock.json` |

#### Élevée

| # | Constat | Mesure | Fichiers |
|---|---|---|---|
| E1 | Isolation entre sociétés faite à la main dans chaque requête, sans mécanisme central ni test prouvant qu'un compte d'une société ne lit pas une autre. Les gardes vérifient le slug du jeton, puis chaque service filtre (ou non) par `societeId`. | 753 appels Prisma ; 76 lectures/écritures par `id` seul | `backend/src/**/*.service.ts`, `commun/*.guard.ts` |
| E2 | Aucun en-tête de sécurité sur les pages du front (CSP, X-Frame-Options, HSTS, Referrer-Policy) : `helmet` ne couvre que l'API. | 0 en-tête | `frontend/next.config.js`, `deploy/Caddyfile` |
| E3 | Configuration non validée au démarrage : seul `JWT_SECRET` est contrôlé, et seulement en production. 6 variables utilisées absentes de `backend/.env.example`, 4 présentes mais inutilisées (S3). La clé de chiffrement TOTP est dérivée de `JWT_SECRET`. | 19 variables back, 2 front | `backend/src/main.ts`, `backend/.env.example`, `auth/totp.ts` |
| E4 | Règles métier recopiées entre front et back (« miroir ») : nomenclature, fiche programme, nommage des fichiers, statuts effectifs de facture et de devis, règles de salaire. Le front recalcule au lieu d'afficher. | 9 blocs dupliqués front/back (jscpd), 86 lignes pour le plus gros | `frontend/lib/{nomenclature,fiche-programme,nom-fichier,types,rh}.ts` ↔ `backend/src/crm/*`, `projets/gabarit/nom-fichier.ts` |
| E5 | Aucun linter ni formateur côté back ; aucun Prettier ni Stylelint nulle part ; `strict` incomplet côté back (`strictPropertyInitialization` et `strictBindCallApply` désactivés). | 0 règle ESLint back | `backend/tsconfig.json` |
| E6 | Front sans aucun test. Back : couverture 58,7 % des instructions, 50,1 % des branches. Tests e2e back et tests navigateur absents de la CI. | 0 test front | `.github/workflows/ci.yml` |

#### Moyenne

| # | Constat | Mesure | Fichiers |
|---|---|---|---|
| M1 | Fichiers géants | 26 composants > 300 lignes (35 > 250), 19 fichiers back > 300 lignes. Plus gros : `facturation/projets/[projetId]/page.tsx` 1 238, `mes-taches.tsx` 1 074, `rh/page.tsx` 1 066, `projets-ouverts.tsx` 980 ; back `facturation.service.ts` 1 320, `devis.service.ts` 982, `pilotage.service.ts` 942 ; `lib/types.ts` 1 899 | voir liste en annexe |
| M2 | Petites fonctions recopiées, parfois divergentes sous le même nom | `jjmmaaaa` 32 définitions (5 variantes), `jjmm` 20, `aujourdhui` 34 (UTC via `toISOString`), `fcfa`/`formatMontant` 11, `dateFr` 6 (dont une qui rend « jj/mm » au lieu de « jj/mm/aaaa »), `libelleMois` 7, `joursDepuis` 4 | front et back |
| M3 | Primitives d'interface réimplémentées à chaque écran | 37 fenêtres (`role="dialog"`), 36 gestionnaires de touche Échap, 23 `modal-backdrop` + 8 `fiche-crm-fond` à la main ; 2 implémentations d'avatar (`avatar-personne.tsx`, `equipes/cellule-carte.tsx`) | `frontend/components/**` |
| M4 | Clés étrangères sans index | 118 sur 202, dont des colonnes filtrées en permanence : `Notification.societeId`, `Projet.societeId`, `Contrat.societeId`, `Collaborateur.societeId`, `UtilisateurSocieteRole.societeId`, `Canal.societeId`, `Facture.dossierCrmId`, `ValidationTache.projetId`, `CommentaireProjet.projetId`, `DemandeTs.projetId` | `backend/prisma/schema.prisma` |
| M5 | Listes sans pagination | 255 `findMany`, 39 `take` | `backend/src/**` |
| M6 | Requêtes en boucle (N+1 possibles) | 18 `await prisma…` dans une boucle ; la plupart légitimes (reprises de numérotation, créations dans une transaction), 5 lectures à revoir (`commissions.service`, `synthese.service`, `relances-ceo.service`, `rappels.service`, `facturation.service:1041`) | `backend/src/**` |
| M7 | Montants : stockage correct (`Decimal(14,0)` ou `Int` FCFA, aucun `Float`), mais les DTO acceptent des décimales (`@IsNumber`) que PostgreSQL arrondit en silence ; calculs en `number` après 159 conversions `Number()`/`toNumber()` et 62 `Math.round`. Le front recalcule la TVA d'affichage. | 9 champs de montant en `@IsNumber` | `devis/dto.ts`, `produits-services.dto.ts`, `projets/facturation/dto.ts`, `nouvelle-facture-directe.tsx` |
| M8 | Liens publics (devis, contrat) sans expiration propre : le jeton de 256 bits reste valable tant que le document existe (seul le statut métier borne l'action). Limitation de débit présente (20/min devis, contrats). | 2 types de liens | `devis/devis-public.guard.ts`, `contrats/contrats-public.controller.ts` |
| M9 | Deux clients d'API côté front (`lib/api.ts`, `lib/client-api.ts`) et l'URL de base définie 3 fois (avec `lib/chat.ts`) | 3 définitions | `frontend/lib/*` |
| M10 | Front presque entièrement client : 150 fichiers `'use client'`, 16 pages sur 24 ; 2 `loading.tsx`, aucun `error.tsx` ni `not-found.tsx` | — | `frontend/app/**` |
| M11 | CSS : déjà découpé (`00-jetons.css` + 25 fichiers), mais 207 couleurs hexadécimales et 111 `rgb()/hsl()` hors jetons, 418 tailles de police, 188 rayons et 26 ombres en dur, 21 `!important`, 64 `style={}` en ligne, 9 couleurs en dur dans le TSX | — | `frontend/app/styles/*.css` |
| M12 | Logs non structurés (`Logger` Nest en texte, 2 `console.log` au démarrage) ; pas de corrélation de requête | 13 loggers | `backend/src/**` |

#### Faible

| # | Constat | Mesure | Fichiers |
|---|---|---|---|
| F1 | Code mort front (knip) | 1 fichier orphelin (`components/actions-rapides.tsx` + son CSS), 3 dépendances inutilisées (`leaflet`, `react-leaflet`, `@types/leaflet` : aucun import), 39 exports et 30 types exportés jamais importés | `frontend/**` |
| F2 | Exports inutiles back (knip) | 56 constantes et 69 types exportés utilisés seulement dans leur fichier ; `@nestjs/schematics` référencé mais non déclaré (les 4 fichiers e2e signalés sont de faux positifs) | `backend/src/**` |
| F3 | Dépendances circulaires (madge) | 2 : `lib/crm.ts ↔ lib/cycle-crm.ts` (front), `chat/chat.bus.ts ↔ chat/chat.service.ts` (back) | — |
| F4 | `eslint-disable` | 10 au front (6 `react-hooks/exhaustive-deps`, 4 `no-img-element` redondants avec la règle déjà coupée dans `.eslintrc.json`), 0 au back | — |
| F5 | Promesses ignorées sans trace | 16 `.catch(() => undefined)` au front | — |
| F6 | Langue et nommage mêlés | identifiants, fichiers, modèles Prisma et routes en français ; quelques anglicismes (`getSession`, `handleLogout`) ; classes CSS en français | partout |

Points sains, mesurés : 0 `any`, 0 `@ts-ignore`, 0 `TODO`, 0 `console.log` au
front, 0 `catch` vide ; toutes les routes ont des gardes au niveau de la
classe et tous les corps de requête passent par un DTO ; `ValidationPipe`
global avec `whitelist`, filtre d'exceptions global à format unique ; CORS en
liste blanche ; `helmet` sur l'API ; limitation de débit sur la connexion
(5/min) ; aucun secret dans le dépôt ; duplication textuelle globale faible
(1,31 %, 69 clones) ; contrôleurs fins (2 sur 40 accèdent directement à Prisma).

## Correction C1 (validée par le user, 24/10/2026)

- Back : règle unique `commun/fichier-joint.ts` (`@UrlFichierJoint`), appliquée
  aux 5 DTO de fichiers ; tout ce qui n'est pas une data URI base64 est refusé
  en 400 « Fichier invalide. ». Les types de fichiers ne sont pas filtrés
  (liste blanche = décision métier encore ouverte).
- Front : une seule fonction `telechargerFichier` (`lib/fichiers.ts`) remplace
  les 6 copies et refuse tout autre schéma, y compris pour d'anciennes données.
- Vérifié : 729 tests unitaires, 14 tests e2e API (dont l'attaque rejouée), 232
  captures identiques avant/après sur deux environnements neufs, 8 tests de
  fumée, et l'attaque rejouée sur l'application refusée (400).

## Plan proposé (à valider)

Chaque phase : petits commits Conventional Commits, puis `tsc`, lint, tests
unitaires et e2e back, build, tests de fumée et comparaison des 232 captures
avec la référence prise au début de la phase. Toute capture qui change sans
raison est corrigée avant de continuer.

| Phase | Contenu | Changement de comportement |
|---|---|---|
| 2 — Outillage | ESLint + Prettier (back et front, configuration calée sur le style actuel pour limiter le diff), Stylelint en signalement, `strict` complet au back, CI : tests e2e back + tests de fumée (PostgreSQL de service), `.env.example` complets | aucun |
| 3 — Sécurité et intégrité | validateur de fichiers unique côté serveur (schéma `data:`, liste blanche de types, poids), téléchargement unique côté front qui refuse tout sauf `data:`/`blob:` ; en-têtes de sécurité du front ; configuration validée au démarrage (class-validator, déjà installé) ; index sur les clés étrangères filtrées (migration additive) ; mise à jour des dépendances vulnérables ; tests e2e d'isolation entre deux sociétés | refus des fichiers non conformes ; le reste aucun |
| 4 — Fondations front | `lib/format` unique (montants FCFA via `Intl`, dates en français, fuseau Africa/Dakar), client d'API unique, `components/ui` (Modal, ConfirmModal, Drawer, KpiTile, Pill, Field, EmptyState, Skeleton) adoptés écran par écran ; code mort et dépendances inutilisées retirés ; 2 cycles d'import cassés | aucun |
| 5 — Structure front | `features/<module>/` (taches, projets, finances, rh, crm, equipes, pilotage), découpage des 26 composants de plus de 300 lignes, imports absolus, `error.tsx`/`not-found.tsx` | aucun |
| 6 — Structure back | règles métier en fonctions de domaine pures et testées (retard, échéances, prolongations, compteurs, encaissé/échu/à échoir) servies au front ; isolation multi-sociétés par un mécanisme unique (extension Prisma) ; pagination des listes ; logs structurés ; N+1 | aucun (pagination : mêmes données par défaut) |
| 7 — Types partagés | voir ci-dessous | aucun |
| 8 — Langue | renommage en anglais module par module, en même temps que les phases 5 et 6 (noms de tables et colonnes conservés par `@@map`/`@map`) | aucun |
| 9 — Documentation | `README.md`, `ARCHITECTURE.md`, `docs/glossaire.md`, ADR (`docs/adr/`), `CLAUDE.md` (absent aujourd'hui) | aucun |

### Types et contrats partagés — proposition

Recommandation : **OpenAPI comme contrat, plus un paquet de domaine partagé**,
dans un monorepo npm workspaces (`packages/domain`).

1. Le back décrit son API depuis les DTO (`@nestjs/swagger` et son plugin
   CLI) ; le front génère ses types avec `openapi-typescript` et un client
   typé. Le contrat est indépendant du langage : il servira tel quel aux
   applications macOS, Windows et iOS prévues.
2. Les règles pures aujourd'hui recopiées (nomenclature, fiche programme,
   nommage des fichiers, statuts effectifs) vivent une seule fois dans
   `packages/domain`, importé par le back et le front.

Alternatives écartées : un paquet de types TypeScript écrit à la main (dérive
dès qu'on oublie de le mettre à jour, inutilisable par les applications
natives) ; tRPC (impose TypeScript aux deux bouts, incompatible avec les
clients natifs). Coût : 2 dépendances de développement et une de production
(`@nestjs/swagger`), à justifier dans un ADR.

## Décisions attendues

0. **Liste blanche des types de fichiers** (suite de C1, corrigée) : quels
   types accepter (PDF, images, DWG, Office, ZIP…) ?
1. **Périmètre des modules.** La RH est volontairement « périmètre groupe »
   (`rh/temps.service.ts`), de même que Pilotage et les rôles transverses.
   La règle « chaque requête filtrée par la société active » doit-elle s'y
   appliquer, ou faut-il distinguer modules de société et modules de groupe ?
2. **Langue.** Renommage complet en anglais (identifiants, fichiers, classes
   CSS, modèles Prisma) : d'accord pour le faire module par module plutôt
   qu'en une fois ? Les commentaires restent-ils en français ?
3. **Montants saisis.** Refuser les décimales dans les DTO (`@IsInt`) au lieu
   de l'arrondi silencieux actuel ?
4. **Liens publics.** Leur donner une durée de vie (laquelle ?) ou garder le
   seul statut métier ?
5. **Crochets Git.** Husky + lint-staged (2 dépendances) ou le hook maison
   `.githooks/` existant, complété ?
6. **Prettier.** Reformater tout le dépôt en un commit dédié, ou seulement les
   fichiers touchés au fil des phases ?
7. **Types partagés.** OpenAPI + `packages/domain` comme proposé ?
8. **Carte.** Leaflet n'est plus importé nulle part alors que le schéma garde
   latitude et longitude : on retire la dépendance, ou une carte est prévue ?
9. **Dépendances vulnérables.** Certaines corrections imposent des versions
   majeures (`@nestjs/schedule` 12) : on les traite en phase 3 ?

### Annexe — composants de plus de 300 lignes

```
1238 app/admin/[slug]/facturation/projets/[projetId]/page.tsx
1074 components/mes-taches/mes-taches.tsx
1066 app/admin/[slug]/rh/page.tsx
 980 components/projets-ouverts/projets-ouverts.tsx
 643 app/admin/[slug]/facturation/page.tsx
 625 components/projets-ouverts/tache-panneau.tsx
 551 app/admin/[slug]/crm/page.tsx
 523 components/admin/caracteristiques-projet.tsx
 487 components/groupe/comptes-roles-panel.tsx
 483 components/admin/lignes-devis-editeur.tsx
 465 components/pilotage/attention.tsx
 456 components/admin/admin-shell.tsx
 450 components/mon-espace/demandes.tsx
 443 components/pilotage/registre.tsx
 438 components/admin/detail-dossier-modal.tsx
 413 components/finances/offre-panneau.tsx
 397 components/admin/contrat-dossier.tsx
 357 components/finances/parametres-facturation.tsx
 356 components/pilotage/a-decider.tsx
 351 components/finances/a-valider-cfo.tsx
 346 components/finances/facture-document.tsx
 324 components/rh/feuilles-temps-rh.tsx
 323 components/mon-espace/performances.tsx
 320 components/equipes/equipes.tsx
 316 components/finances/onglet-rentabilite.tsx
 316 components/chat/panneau-chat.tsx
```

### Outils et commandes

`knip@5`, `madge@8`, `jscpd@4` lancés par `npx` (non installés dans le
dépôt), `npm audit`, `jest --coverage`, et des scripts de mesure ponctuels
(index des clés étrangères, appels Prisma en boucle, fonctions homonymes).

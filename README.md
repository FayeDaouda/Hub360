# Hub 360

Back-office SaaS **multi-société** pour la holding (Grey Concrete aujourd'hui,
autres sociétés ensuite). L'architecture est pilotée par les données : une
nouvelle société s'ajoute en base, sans toucher au code.

Cible produit : web d'abord, puis applications macOS / Windows / iOS — le
backend NestJS reste la source de vérité unique, consommée par tous les
clients.

## Stack

| | |
|---|---|
| Backend | NestJS 10 · Prisma 5 · PostgreSQL 16 · JWT (Passport) |
| Frontend | Next.js 14 (App Router) · React 18 · TypeScript |
| Tests | Jest (backend) |
| Hébergement prévu | Hetzner Cloud (VPS + Object Storage), domaine `hub.group` |

## Structure

```
hub/
├── backend/            API NestJS + Prisma
│   ├── prisma/         schéma + migrations + seed
│   └── src/
│       ├── auth/       login par société, comptes, JWT
│       ├── commun/     gardes transverses, interceptor de sérialisation
│       ├── societes/ clients/ crm/ equipe/ notifications/ chat/
│       └── projets/    cœur métier
│           ├── domaine/   config + gardes (règles pures, miroir du front)
│           └── permis/ etudes/ execution/ images/ fichiers/ facturation/
├── frontend/
│   ├── app/            routes (portail, /admin/[slug], /collab/[slug])
│   ├── components/     UI
│   └── lib/            client API + types (miroir de backend/src/**/domaine)
├── .github/workflows/  CI (lint + types + build + tests)
└── docker-compose.yml  PostgreSQL local (optionnel)
```

## Démarrage

### 1. PostgreSQL

Avec Docker :

```bash
docker compose up -d
```

Ou une instance locale (ex. Homebrew) : créer une base `hub` accessible sur
`localhost:5432` et reporter l'URL dans `backend/.env`.

### 2. Backend

```bash
cd backend
cp .env.example .env          # ajuster DATABASE_URL + générer un JWT_SECRET
npm ci
npm run prisma:generate
npm run prisma:migrate         # applique les migrations
npm run prisma:seed            # données de démonstration Grey Concrete
npm run start:dev              # http://localhost:3001/api
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local
npm ci
npm run dev                    # http://localhost:3000
```

## Comptes de démonstration (après seed)

| Rôle | Identifiant | Accès |
|---|---|---|
| Admin holding | `admin@hub.group` | portail groupe |
| Admin société | `admin.greyconcrete@hub.group` | `/admin/grey-concrete` |
| Collaborateur | `rokhaya.ndoye@greyconcrete.hub` | `/collab/grey-concrete` |

Mot de passe commun : `changeme123` — à changer avant toute mise en production.

## Scripts

| Backend | |
|---|---|
| `npm run start:dev` | API en watch |
| `npm run build` | compilation (`nest build`) |
| `npm test` · `test:watch` · `test:cov` | tests unitaires Jest |
| `npm run prisma:migrate` · `prisma:seed` · `prisma:studio` | base |

| Frontend | |
|---|---|
| `npm run dev` · `build` · `start` | Next.js |
| `npm run lint` | ESLint (`next lint`) |
| `npm run typecheck` | `tsc --noEmit` |

## Conventions (non négociables)

- **Migrations Prisma uniquement** pour tout changement de schéma durable —
  jamais de `psql` ad hoc hors données de test jetables.
- **Discipline miroir back ↔ front** : chaque règle métier vit à un seul
  endroit conceptuel, dupliquée et commentée des deux côtés
  (`backend/src/projets/domaine/{config,gardes}.ts` ↔ `frontend/lib/types.ts`).
- **`AccesProjetGuard` est le point de cloisonnement projet unique.** Toute
  route projet qui autorise une écriture collaborateur passe par le décorateur
  `@EcritureCollaborateur()` (liste blanche) — et est testée pour les trois
  cas : rôle autorisé / rôle refusé / hors périmètre.
- **Un test pour chaque garde et chaque règle de `domaine/gardes.ts`.**
- **Rien de fictif livré** : aucun écran sur données mock, aucun lien mort,
  aucun bouton inerte, aucun secret en clair (`main.ts` refuse de démarrer en
  prod avec le `JWT_SECRET` par défaut).
- **`lint` + `typecheck` + `build` + `test` verts des deux côtés** avant de
  considérer un lot terminé. La CI rejoue exactement ça.
- Responsive vérifié au build (mobile / tablette / desktop), pas en repasse.

`no-img-element` est désactivé côté front : toutes les images sont soit des
data URI (pipeline photo redimensionnée client-side, transition avant le
stockage objet), soit de petites marques statiques — `next/image` n'apporte
rien ici. À réévaluer quand S3 sera branché.

## État fonctionnel

**Livré** — portail sociétés · auth (login par société, activation invité,
reset) · CRM (dossiers, nomenclature auto, création du projet à la validation)
· projet : avant-projet + sous-checklists opérationnelles + phases + pré-bilan
· sections aval : permis, études, exécution, images, documents · équipe :
cellules, collaborateurs, comptes, indicateurs · notifications (stockées +
échéances dérivées) · chat multi-canaux (SSE) · facturation client (facture,
paiement, échéancier) · espace collaborateur : accueil, projets en
lecture/écriture selon la matrice de droits, « Mes indicateurs ».

**En attente d'un élément externe** — transport e-mail prod (code prêt,
identifiants SMTP manquants) · stockage objet S3 (choix fournisseur +
cadrage ; images stockées en data URI d'ici là) · sous-checklists Permis /
Exécution (validation du contenu par le studio) · modèle de facture PDF
(gabarit légal sénégalais) · packaging desktop / iOS (cadrage dédié) ·
déploiement Hetzner.

**Durcissement pré-production à solder** — `@nestjs/throttler` sur
`/auth/login` · `helmet` · filtre d'exception global · CORS restreint à
l'origine du frontend · couverture de tests étendue module par module.

# HUB

Logiciel de gestion multi-société pour la holding (Grey Concrete, Indigo, et
futures sociétés). Architecture pensée pour qu'une nouvelle société s'ajoute
en base de données, sans toucher au code.

## Structure

```
hub/
├── backend/     API NestJS + Prisma (PostgreSQL)
├── frontend/    Portail web Next.js
└── docker-compose.yml   PostgreSQL local pour le dev
```

## Démarrage rapide

### 1. Base de données locale

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate    # crée les tables
npm run prisma:seed       # crée les rôles/modules de base + un compte admin
npm run start:dev         # http://localhost:3001/api
```

Compte de départ créé par le seed : `admin@hub.group` / `changeme123`
(à changer avant toute mise en prod).

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev                # http://localhost:3000
```

Le portail affiche les sociétés actives (vide au premier lancement — crée
une société via Prisma Studio le temps d'avoir un back-office admin).

```bash
cd backend
npm run prisma:studio      # interface pour ajouter une société à la main
```

## Ce qui est déjà posé

- Schéma multi-société : `societes`, `utilisateurs`, `roles`,
  `utilisateur_societe_roles` (table pivot rôle-par-société),
  `modules`, `societe_modules` (modules activables par société)
- Auth JWT : login par société (email + mdp + slug société), token porteur
  du rôle et de la société
- Portail : grille des sociétés actives, consommée depuis l'API

## Prochaines étapes suggérées

- Page de login par société (`/login/[slug]`) côté frontend
- Guard de rôle (`RolesGuard`) côté backend pour protéger les routes par rôle
- Back-office admin pour créer une société / activer des modules sans
  passer par Prisma Studio
- Module `projets` (première brique métier pour Grey Concrete)
- Déploiement : VPS Hetzner (CPX22) + Object Storage pour les fichiers,
  domaine hub.group (Hostinger) pointé en DNS vers le VPS

## Stack

- Backend : NestJS, Prisma, PostgreSQL, JWT (Passport)
- Frontend : Next.js (App Router)
- Hébergement prévu : Hetzner Cloud (VPS + Object Storage)

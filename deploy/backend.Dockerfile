# Serveur HUB (NestJS + Prisma). Construit depuis la racine du dépôt :
#   docker build -f deploy/backend.Dockerfile -t hub-backend .
# Étape « build » (toutes les dépendances) : réutilisée pour charger les
# données de démo sur un serveur de test (service « demo » du compose).
# Même disposition que le dépôt (backend/ à côté de packages/domain/) : le
# lien « file:../packages/domain » du package.json se résout tel quel.
FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
# Paquet partagé (@hub/domain), compilé avant le back qui le lit.
WORKDIR /repo/packages/domain
COPY packages/domain/package*.json ./
RUN npm ci
COPY packages/domain/ ./
RUN npm run build
WORKDIR /repo/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npx prisma generate && npm run build

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo/backend
ENV NODE_ENV=production
COPY --from=build /repo/packages/domain/package.json ../packages/domain/package.json
COPY --from=build /repo/packages/domain/dist ../packages/domain/dist
COPY --from=build /repo/backend/node_modules ./node_modules
COPY --from=build /repo/backend/package*.json ./
RUN npm prune --omit=dev
COPY --from=build /repo/backend/dist ./dist
COPY --from=build /repo/backend/prisma ./prisma
EXPOSE 3001
# Migrations appliquées à chaque démarrage (idempotent), puis l'API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]

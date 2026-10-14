# Serveur HUB (NestJS + Prisma). Construit depuis la racine du dépôt :
#   docker build -f deploy/backend.Dockerfile -t hub-backend .
# Étape « build » (toutes les dépendances) : réutilisée pour charger les
# données de démo sur un serveur de test (service « demo » du compose).
FROM node:20-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npx prisma generate && npm run build

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
RUN npm prune --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
EXPOSE 3001
# Migrations appliquées à chaque démarrage (idempotent), puis l'API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]

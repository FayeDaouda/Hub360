# Interface HUB (Next.js, sortie standalone). Construit depuis la racine :
#   docker build -f deploy/frontend.Dockerfile -t hub-frontend .
# L'API est appelée en relatif (/api, routé par Caddy) : la même image sert
# la production et la pré-production.
# Même disposition que le dépôt (frontend/ à côté de packages/domain/) : le
# lien « file:../packages/domain » du package.json se résout tel quel. Le
# paquet est intégré au code des pages : l'image finale n'en a pas besoin.
FROM node:20-bookworm-slim AS build
# Paquet partagé (@hub/domain), compilé avant le front qui le lit.
WORKDIR /repo/packages/domain
COPY packages/domain/package*.json ./
RUN npm ci
COPY packages/domain/ ./
RUN npm run build
WORKDIR /repo/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ENV NEXT_PUBLIC_API_URL=/api NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /repo/frontend/.next/standalone ./
COPY --from=build /repo/frontend/.next/static ./.next/static
COPY --from=build /repo/frontend/public ./public
EXPOSE 3000
CMD ["node", "server.js"]

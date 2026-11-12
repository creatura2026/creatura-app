# syntax=docker/dockerfile:1
# =============================================================================
# CREATURA - Image d'une application front (PWA joueur ou dashboard admin)
#
#   docker build -f docker/frontend/Dockerfile --build-arg APP=player -t creatura-player .
#   docker build -f docker/frontend/Dockerfile --build-arg APP=admin  -t creatura-admin  .
#
# Contexte de build : la racine du repo (monorepo pnpm : apps/* + packages/shared).
# Les fichiers statiques sont servis par nginx, en utilisateur non root, port 8080.
# L'API est appelée sur la même origine (/api/v1) : l'Ingress route /api vers le back.
# =============================================================================
ARG APP=player

# ---- Build -------------------------------------------------------------------
FROM node:24-alpine AS build
ARG APP
ARG PNPM_VERSION=10
RUN npm install --global pnpm@${PNPM_VERSION}

WORKDIR /src

# Téléchargement des dépendances d'après le seul lockfile : cette couche reste en
# cache tant que pnpm-lock.yaml ne change pas.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

COPY . .
RUN pnpm install --offline --frozen-lockfile --filter "${APP}..." \
 && pnpm --filter "${APP}" run build-only


# ---- Runtime -----------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.27-alpine
ARG APP

COPY docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/${APP}/dist /usr/share/nginx/html

EXPOSE 8080

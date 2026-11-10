# =============================================================================
# CREATURA - Image PostgreSQL 16 avec le schéma et le catalogue (AS-42)
#
# Construire : docker build -t creatura-db ./db
# En local, utiliser plutôt : docker compose up -d   (depuis le dossier db/)
#
# Même version majeure que sur RDS (PostgreSQL 16) pour que ce qui marche
# en local marche sur AWS.
# =============================================================================
FROM postgres:16

LABEL org.opencontainers.image.title="creatura-db" \
      org.opencontainers.image.description="PostgreSQL 16 initialisé avec le schéma CREATURA" \
      org.opencontainers.image.source="https://github.com/creatura2026/creatura-app"

# Scripts SQL, tests et script d'application (mêmes chemins qu'en montage /db)
COPY init/    /db/init/
COPY tests/   /db/tests/
COPY scripts/ /db/scripts/

# Lancé automatiquement par l'image officielle au premier démarrage
COPY initdb/10_creatura.sh /docker-entrypoint-initdb.d/10_creatura.sh

# sed : supprime d'éventuels retours chariot Windows (CRLF) qui feraient
# planter les scripts shell dans le conteneur Linux
RUN sed -i 's/\r$//' /db/scripts/*.sh /docker-entrypoint-initdb.d/*.sh \
 && chmod 755 /db/scripts/*.sh /docker-entrypoint-initdb.d/*.sh

# Le healthcheck interroge le vrai serveur (TCP) et non le serveur temporaire
# lancé pendant l'initialisation (qui n'écoute que sur le socket local)
HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=10 \
    CMD pg_isready -h localhost -U "$POSTGRES_USER" -d "$POSTGRES_DB" || exit 1

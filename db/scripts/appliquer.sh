#!/bin/sh
# =============================================================================
# CREATURA - Applique le schéma et les données sur une base PostgreSQL
# Ticket : AS-42
#
# Utilisé à deux endroits, avec la même logique :
#   * au premier démarrage du conteneur local (via initdb/10_creatura.sh)
#   * plus tard sur RDS, par un Job lancé dans EKS avec cette même image
#
# Connexion : variables standard de PostgreSQL (PGHOST, PGPORT, PGUSER,
# PGPASSWORD, PGDATABASE, PGSSLMODE). Aucune valeur en dur.
#
# Options (variables d'environnement) :
#   CREATURA_DEMO=true   ajoute les comptes et données de démo (LOCAL/DEV UNIQUEMENT)
#
# Ré-exécutable : si les tables existent déjà, le schéma n'est pas recréé ;
# le catalogue et la démo ignorent ce qui est déjà présent.
# =============================================================================
set -eu

DOSSIER_SQL="${DOSSIER_SQL:-/db/init}"
PSQL="psql -v ON_ERROR_STOP=1 --quiet --no-psqlrc"

echo "[creatura] Base cible : ${PGHOST:-socket local} / ${PGDATABASE:-?}"

if [ "$($PSQL -tAc "SELECT to_regclass('public.utilisateur') IS NOT NULL")" = "t" ]; then
    echo "[creatura] Schéma déjà présent : 01_schema.sql ignoré"
else
    echo "[creatura] Création du schéma (01_schema.sql)"
    $PSQL -f "$DOSSIER_SQL/01_schema.sql"
fi

echo "[creatura] Catalogue des créatures (02_catalogue.sql)"
$PSQL -f "$DOSSIER_SQL/02_catalogue.sql"

if [ "${CREATURA_DEMO:-false}" = "true" ]; then
    echo "[creatura] Données de démo (03_demo_dev.sql) - NE PAS UTILISER EN PRODUCTION"
    $PSQL -f "$DOSSIER_SQL/03_demo_dev.sql"
else
    echo "[creatura] Données de démo ignorées (CREATURA_DEMO != true)"
fi

echo "[creatura] Base prête."

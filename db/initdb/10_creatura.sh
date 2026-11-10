#!/bin/sh
# =============================================================================
# CREATURA - Initialisation au premier démarrage du conteneur (AS-42)
#
# L'image officielle postgres exécute ce fichier UNE SEULE FOIS, quand le
# volume de données est vide. Pour réinitialiser : docker compose down -v
#
# Pendant cette phase, le serveur n'écoute que sur le socket local :
# on se connecte avec l'utilisateur et la base créés par l'image.
# =============================================================================
set -eu

export PGUSER="$POSTGRES_USER"
export PGDATABASE="${POSTGRES_DB:-$POSTGRES_USER}"

/db/scripts/appliquer.sh

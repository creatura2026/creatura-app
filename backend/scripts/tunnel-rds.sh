#!/bin/sh
# Tunnel SSM (Session Manager) vers la RDS de test : la base répond sur localhost:15432.
# Passe par le port 443 : marche aussi sur les réseaux qui bloquent le 5432 (école).
# Prérequis : AWS CLI v2 et session-manager-plugin (Mac : brew install awscli session-manager-plugin).
# Guide complet : « Accéder à la RDS Creatura : back, tunnel et IAM » (MDi).
#
# Laisser tourner ; Ctrl+C pour fermer. Si l'infra est recréée, le bastion et l'adresse de la base
# changent : BASTION_ID=… RDS_HOST=… scripts/tunnel-rds.sh
set -eu
cd "$(dirname "$0")/.."

BASTION_ID="${BASTION_ID:-i-0447e279b76d6ee7b}"
RDS_HOST="${RDS_HOST:-creatura-db-ed4b478a0ca761f756222ce69e.ctm4owqmyomg.eu-north-1.rds.amazonaws.com}"
LOCAL_PORT="${LOCAL_PORT:-15432}"

# Clé AWS du back : celle de .env.rds ou .env si elle y est, sinon la chaîne habituelle (aws configure).
for file in .env .env.rds; do
  [ -f "$file" ] || continue
  key=$(sed -n 's/^AWS_ACCESS_KEY_ID=//p' "$file")
  secret=$(sed -n 's/^AWS_SECRET_ACCESS_KEY=//p' "$file")
  if [ -n "$key" ] && [ -n "$secret" ]; then
    export AWS_ACCESS_KEY_ID="$key" AWS_SECRET_ACCESS_KEY="$secret"
    unset AWS_PROFILE
    break
  fi
done

exec aws ssm start-session --region eu-north-1 --target "$BASTION_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=$RDS_HOST,portNumber=5432,localPortNumber=$LOCAL_PORT"

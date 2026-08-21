#!/bin/sh
# Démarrage du conteneur app : migrations, admin initial, serveur.
# Une seule instance app → pas de risque de migrations concurrentes.
set -e

echo "[entrypoint] Application des migrations…"
node scripts/db.mjs migrate

echo "[entrypoint] Vérification du compte administrateur initial…"
node scripts/create-admin.mjs

echo "[entrypoint] Démarrage du serveur Next…"
exec node server.js

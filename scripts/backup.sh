#!/usr/bin/env bash
# Sauvegarde cohérente de la prod : base Postgres + fichiers uploadés.
# Usage (sur le VPS, à la racine du projet) : ./scripts/backup.sh [dossier_cible]
# À planifier par ex. dans le cron du VPS : 0 3 * * * /opt/crm-bigm/scripts/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET_DIR="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$TARGET_DIR"

# shellcheck disable=SC1091
source .env 2>/dev/null || true

echo "→ Dump de la base…"
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U "${POSTGRES_USER:-crm}" -d "${POSTGRES_DB:-crm}" --format=custom \
  > "$TARGET_DIR/db-$STAMP.dump"

echo "→ Archive des fichiers uploadés…"
docker compose -f docker-compose.prod.yml exec -T app \
  tar -czf - -C /data uploads \
  > "$TARGET_DIR/uploads-$STAMP.tar.gz"

echo "→ Rotation (30 jours)…"
find "$TARGET_DIR" -name "db-*.dump" -mtime +30 -delete
find "$TARGET_DIR" -name "uploads-*.tar.gz" -mtime +30 -delete

echo "Sauvegarde terminée : $TARGET_DIR/db-$STAMP.dump + uploads-$STAMP.tar.gz"
echo ""
echo "Restauration :"
echo "  docker compose -f docker-compose.prod.yml exec -T db pg_restore -U \$POSTGRES_USER -d \$POSTGRES_DB --clean < db-<date>.dump"
echo "  docker compose -f docker-compose.prod.yml exec -T app tar -xzf - -C /data < uploads-<date>.tar.gz"

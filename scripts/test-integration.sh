#!/usr/bin/env bash
# Gate d'intégration : Postgres éphémère (5433) + suite Vitest intégration.
# Utilise Docker si disponible, sinon un Postgres local (scripts/local-pg.sh).
set -euo pipefail
cd "$(dirname "$0")/.."

if docker compose -f docker-compose.test.yml up -d --wait >/dev/null 2>&1; then
  cleanup() { docker compose -f docker-compose.test.yml down -v >/dev/null; }
else
  bash scripts/local-pg.sh start 5433 crm_test crm_test
  cleanup() { bash scripts/local-pg.sh stop 5433; }
fi
trap cleanup EXIT

npx vitest run -c vitest.integration.config.ts

#!/usr/bin/env bash
# Gate e2e local : Postgres éphémère (5434) + schéma + seed e2e,
# puis Playwright démarre l'app buildée (voir playwright.config.ts).
# Utilise Docker si disponible, sinon un Postgres local (scripts/local-pg.sh).
set -euo pipefail
cd "$(dirname "$0")/.."

export E2E_DATABASE_URL="${E2E_DATABASE_URL:-postgresql://crm_e2e:crm_e2e@localhost:5434/crm_e2e}"
# Clé de TEST du coffre-fort (32 octets base64) — jamais celle de prod.
export VAULT_KEY="${VAULT_KEY:-dGVzdC1rZXktMzItYnl0ZXMtcG91ci1sZS1jb2ZmcmU=}"

# Chromium système (sandbox/CI sans téléchargement Playwright)
if [ -z "${PLAYWRIGHT_CHROMIUM_PATH:-}" ] && [ -x /opt/pw-browsers/chromium ]; then
  export PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium
fi

if docker compose -f docker-compose.e2e-db.yml up -d --wait >/dev/null 2>&1; then
  cleanup() { docker compose -f docker-compose.e2e-db.yml down -v >/dev/null; }
else
  bash scripts/local-pg.sh start 5434 crm_e2e crm_e2e
  cleanup() { bash scripts/local-pg.sh stop 5434; }
fi
trap cleanup EXIT

DATABASE_URL="$E2E_DATABASE_URL" node scripts/db.mjs fresh
if [ -f src/db/seed.ts ]; then
  DATABASE_URL="$E2E_DATABASE_URL" SEED_DEMO=true \
    SEED_ADMIN_EMAIL="admin@bigm.fr" SEED_ADMIN_PASSWORD="Admin1234!" \
    SEED_DEMO_PASSWORD="Test1234!" \
    npx tsx src/db/seed.ts
fi

rm -rf ./.uploads-e2e ./.backups-e2e
npm run build
npx playwright test "$@"

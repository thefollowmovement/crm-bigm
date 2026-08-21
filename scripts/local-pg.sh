#!/usr/bin/env bash
# Postgres local de secours pour les environnements sans Docker (CI restreinte).
# Usage : scripts/local-pg.sh start <port> <user> <db> | stop <port>
# Les données vivent dans /tmp/crm-pgdata-<port> (jetable).
# Postgres refusant de tourner en root, les commandes sont exécutées via
# l'utilisateur système `postgres` quand le script est lancé en root.
set -euo pipefail

PG_BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
if [ -z "$PG_BIN" ]; then
  echo "Postgres introuvable (ni Docker, ni installation locale)." >&2
  exit 1
fi

ACTION="${1:?start|stop}"
PORT="${2:?port}"
DATADIR="/tmp/crm-pgdata-${PORT}"
SOCKDIR="/tmp/crm-pgsock-${PORT}"

run_pg() {
  if [ "$(id -u)" = "0" ]; then
    su -s /bin/bash postgres -c "$*"
  else
    bash -c "$*"
  fi
}

case "$ACTION" in
  start)
    USER_NAME="${3:?user}"
    DB_NAME="${4:?db}"
    mkdir -p "$DATADIR" "$SOCKDIR"
    if [ "$(id -u)" = "0" ]; then chown postgres:postgres "$DATADIR" "$SOCKDIR"; fi
    if [ ! -f "$DATADIR/PG_VERSION" ]; then
      run_pg "'$PG_BIN/initdb' -D '$DATADIR' --username='$USER_NAME' --auth=trust -E UTF8" >/dev/null
    fi
    if ! run_pg "'$PG_BIN/pg_ctl' -D '$DATADIR' status" >/dev/null 2>&1; then
      run_pg "'$PG_BIN/pg_ctl' -D '$DATADIR' -l '$DATADIR/log' \
        -o '-p $PORT -k $SOCKDIR -c listen_addresses=127.0.0.1 -c fsync=off' -w start" >/dev/null
    fi
    if ! run_pg "'$PG_BIN/psql' -h 127.0.0.1 -p $PORT -U '$USER_NAME' -d postgres -tAc \
        \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\"" | grep -q 1; then
      run_pg "'$PG_BIN/createdb' -h 127.0.0.1 -p $PORT -U '$USER_NAME' '$DB_NAME'"
    fi
    echo "Postgres local prêt sur 127.0.0.1:$PORT ($DB_NAME)."
    ;;
  stop)
    run_pg "'$PG_BIN/pg_ctl' -D '$DATADIR' -m fast -w stop" >/dev/null 2>&1 || true
    rm -rf "$DATADIR" "$SOCKDIR"
    ;;
  *)
    echo "Action inconnue : $ACTION" >&2
    exit 1
    ;;
esac

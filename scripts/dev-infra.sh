#!/usr/bin/env bash
# Starts/stops a local PostgreSQL 16 + Redis for development and tests,
# without requiring Docker. State lives under .dev-infra/ (gitignored).
# Works both as a regular user and as root (drops to the postgres user).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$ROOT/.dev-infra"
PGDATA="$INFRA_DIR/pgdata"
PGPORT="${HYPE_PGPORT:-54329}"
REDIS_PORT="${HYPE_REDIS_PORT:-63790}"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"

if [ -z "$PGBIN" ]; then
  if command -v pg_ctl >/dev/null 2>&1; then
    PGBIN="$(dirname "$(command -v pg_ctl)")"
  else
    echo "PostgreSQL server binaries not found. Install postgresql-16 or use Docker." >&2
    exit 1
  fi
fi

# Postgres refuses to run as root — drop to the postgres user when needed.
pg() {
  if [ "$(id -u)" = "0" ]; then
    runuser -u postgres -- "$@"
  else
    "$@"
  fi
}

start() {
  mkdir -p "$INFRA_DIR"
  if [ "$(id -u)" = "0" ]; then
    chown postgres:postgres "$INFRA_DIR"
  fi

  if [ ! -d "$PGDATA" ]; then
    pg "$PGBIN/initdb" -D "$PGDATA" -U hype --auth=trust --no-instructions >/dev/null
  fi
  if ! pg "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    pg "$PGBIN/pg_ctl" -D "$PGDATA" \
      -o "-p $PGPORT -k $INFRA_DIR -c listen_addresses=127.0.0.1" \
      -l "$INFRA_DIR/postgres.log" start >/dev/null
  fi
  pg "$PGBIN/psql" -h 127.0.0.1 -p "$PGPORT" -U hype -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='hype_machine'" | grep -q 1 || \
    pg "$PGBIN/createdb" -h 127.0.0.1 -p "$PGPORT" -U hype hype_machine

  if ! redis-cli -p "$REDIS_PORT" ping >/dev/null 2>&1; then
    redis-server --port "$REDIS_PORT" --daemonize yes \
      --dir "$INFRA_DIR" --logfile "$INFRA_DIR/redis.log" \
      --save '' --appendonly no >/dev/null
  fi

  echo "Postgres:  postgresql://hype@127.0.0.1:$PGPORT/hype_machine"
  echo "Redis:     redis://127.0.0.1:$REDIS_PORT"
}

stop() {
  if [ -d "$PGDATA" ]; then
    pg "$PGBIN/pg_ctl" -D "$PGDATA" stop -m fast >/dev/null 2>&1 || true
  fi
  redis-cli -p "$REDIS_PORT" shutdown nosave >/dev/null 2>&1 || true
  echo "dev infra stopped"
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  *) echo "usage: $0 [start|stop]" >&2; exit 1 ;;
esac

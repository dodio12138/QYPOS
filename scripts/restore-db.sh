#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: npm run restore -- backups/qypos-YYYYMMDD-HHMMSS.sql"
  exit 1
fi

docker compose exec -T postgres psql -U "${POSTGRES_USER:-qypos}" "${POSTGRES_DB:-qypos}" < "$1"

#!/usr/bin/env bash
set -euo pipefail

mkdir -p backups
stamp="$(date +%Y%m%d-%H%M%S)"
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-qypos}" "${POSTGRES_DB:-qypos}" > "backups/qypos-${stamp}.sql"
echo "Created backups/qypos-${stamp}.sql"

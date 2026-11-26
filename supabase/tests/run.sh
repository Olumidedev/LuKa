#!/usr/bin/env bash
# Runs every SQL test suite against a fresh local Postgres (needs pg_trgm + pgvector).
# Usage: sudo -u postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")"
M=""; for f in $(ls ../migrations/*.sql | sort); do M="$M -f $f"; done
for t in policies admin catalog knowledge_base; do
  psql -q -c "drop database if exists lukatest" -c "create database lukatest" >/dev/null
  SEED=""; [ "$t" = knowledge_base ] && SEED="-f ../seed.sql"
  psql -q -v ON_ERROR_STOP=1 -d lukatest -f auth_stub.sql $M $SEED -f "$t.test.sql" 2>&1 | grep -E "PASSED|ERROR|psql:" | grep -v NOTICE || true
done

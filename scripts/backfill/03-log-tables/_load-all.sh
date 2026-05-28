#!/usr/bin/env bash
# Load all generated .sql files into prod Supabase via psql.
# Run after `node _extract.mjs all` has produced the *.sql files.
#
# USAGE:
#   export PGPASSWORD=<the prod postgres password>
#   ./_load-all.sh
#
# The connection string targets the **pooler** endpoint (port 6543) which is
# the only one that accepts non-IPv6 connections from Windows by default.

set -euo pipefail

PG_URL="postgresql://postgres.yzljakczhwrpbxflnmco@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"

if [ -z "${PGPASSWORD:-}" ]; then
  echo "ERROR: set PGPASSWORD env var first"
  exit 1
fi

cd "$(dirname "$0")"

# Smallest first — if one fails the others are unaffected.
for table in tb_history tb_history_key tb_web_hs; do
  for f in "${table}"-part-*.sql; do
    if [ -f "$f" ]; then
      echo "=== loading $f ($(du -h "$f" | cut -f1)) ==="
      time psql "$PG_URL" -v ON_ERROR_STOP=1 -f "$f"
    fi
  done
done

echo ""
echo "All chunks loaded. Now run the sequence resets:"
echo ""
cat <<'SQL'
SELECT setval('public.tb_history_id_seq',     (SELECT MAX(id) FROM public.tb_history));
SELECT setval('public.tb_history_key_id_seq', (SELECT MAX(id) FROM public.tb_history_key));
SELECT setval('public.tb_web_hs_id_seq',      (SELECT MAX(id) FROM public.tb_web_hs));
SQL

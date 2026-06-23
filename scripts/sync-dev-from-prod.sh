#!/usr/bin/env bash
# sync-dev-from-prod.sh — make the DEV Supabase's PUBLIC data == PROD's, atomically.
#
# Owner 2026-06-23: "เคลียข้อมูลเก่าใน dev ออก · อยาก data dev กับ prod เท่ากัน · น้องเทสยาก
# เพราะข้อมูลไม่ตรง". DEV had accumulated huge old test data (47k forwarders / 124k orders)
# vs PROD's real early-stage data (97 / 26). This clears DEV's old data + reloads PROD's so
# the team tests against prod-identical data.
#
# WHAT IT DOES (one psql --single-transaction → rollback on ANY error · DEV never half-loaded):
#   1. pg_dump DEV public data  → a timestamped BACKUP (insurance).
#   2. pg_dump PROD public data → plain SQL.
#   3. On DEV, in ONE transaction: session_replication_role=replica (triggers+FK off) →
#      TRUNCATE every public BASE table EXCEPT the preserved staff-login tables →
#      load PROD's data (incl. sequence setvals) → COMMIT.
#   4. Verify a few table counts match.
#
# PRESERVED (so the TEAM never loses dev access / RBAC): profiles, admins, tb_admin.
#   → DEV keeps its own staff accounts + roles; everything else (customers + transactional
#     + feature data) becomes == prod. Adjust PRESERVE below if you want a fuller/looser sync.
#
# ⚠️ PII: this copies REAL customer data (names/phones/addresses/financials) into DEV.
#   Only run for the team's own dev project. The dumps contain PII — delete them after.
#   ⚠️ DESTRUCTIVE to DEV. Never point DEV_URL at prod.
#
# USAGE (passwords via env — NEVER hardcode):
#   PROD_DB_URL='postgresql://postgres.<prodref>:<pw>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres' \
#   DEV_DB_URL='postgresql://postgres.<devref>:<pw>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres' \
#   bash scripts/sync-dev-from-prod.sh
set -euo pipefail

: "${PROD_DB_URL:?set PROD_DB_URL}"
: "${DEV_DB_URL:?set DEV_DB_URL}"
PRESERVE_EXCLUDES="--exclude-table=public.profiles --exclude-table=public.admins --exclude-table=public.tb_admin"
STAMP="$(date +%Y%m%d-%H%M%S)"
TMP="${TMPDIR:-/tmp}"
BACKUP="$TMP/dev-backup-$STAMP.dump"
PRODSQL="$TMP/prod-data-$STAMP.sql"
LOADSQL="$TMP/dev-load-$STAMP.sql"

echo "1/4 · backup DEV → $BACKUP"
pg_dump "$DEV_DB_URL" --data-only --schema=public $PRESERVE_EXCLUDES -Fc -f "$BACKUP"

echo "2/4 · dump PROD → $PRODSQL"
pg_dump "$PROD_DB_URL" --data-only --schema=public $PRESERVE_EXCLUDES --no-owner --no-privileges -f "$PRODSQL"

echo "3/4 · build + run atomic load on DEV"
TRUNC="$(psql "$DEV_DB_URL" -tA -c "select string_agg(format('%I',table_name), ', ') from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name not in ('profiles','admins','tb_admin')")"
{ echo "SET session_replication_role = replica;"; echo "TRUNCATE $TRUNC ;"; cat "$PRODSQL"; } > "$LOADSQL"
psql "$DEV_DB_URL" --single-transaction -v ON_ERROR_STOP=1 -q -f "$LOADSQL"

echo "4/4 · verify (DEV should match PROD)"
for t in tb_users tb_forwarder tb_order tb_payment momo_import_tracks; do
  p=$(psql "$PROD_DB_URL" -tA -c "select count(*) from $t")
  d=$(psql "$DEV_DB_URL" -tA -c "select count(*) from $t")
  printf "  %-20s prod=%-8s dev=%-8s %s\n" "$t" "$p" "$d" "$([ "$p" = "$d" ] && echo ✓ || echo '✗ DIFF')"
done

echo "done. ⚠️ delete the PII dumps when finished: rm -f '$PRODSQL' '$LOADSQL' '$BACKUP'"

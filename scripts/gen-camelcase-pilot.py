#!/usr/bin/env python3
"""
Pilot migration generator: per-batch subset of the full camelCase rename.

Reads scripts/_camelcase-map.json (produced by gen-camelcase-migration.py).
Edit PILOT_TABLES + MIGRATION_OUT then run to emit the batch.

Batch history:
- 0113 (2026-05-27) — tb_users + tb_admin + tb_co (~80 renames). Applied.
- 0114 (2026-05-27) — hotfix: re-declare generate_member_code() with quoted "userID".
- 0115 (2026-05-28) — tb_forwarder family (~196 renames). Cargo flow core.
"""
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MAP_IN = REPO_ROOT / "scripts" / "_camelcase-map.json"
MIGRATION_OUT = REPO_ROOT / "supabase" / "migrations" / "0115_align_container_payment_tables.sql"
# Batch 2a — container-payment admin tables. Smallest, safest cargo-adjacent
# slice. Only 2 files in the codebase touch these (admin-only); the full
# tb_forwarder family is deferred to batch 2b because it's entangled with
# 18 customer-facing pages + would need ~380 manual edits.
PILOT_TABLES = [
    "tb_cnt",
    "tb_cnt_item",
    "tb_check_forwarder",
]

def main():
    if not MAP_IN.exists():
        print(f"FATAL: rename map not found ({MAP_IN}). Run gen-camelcase-migration.py first.", file=sys.stderr)
        sys.exit(1)
    full_map = json.loads(MAP_IN.read_text(encoding="utf-8"))

    pilot_map = {t: full_map[t] for t in PILOT_TABLES if t in full_map}
    total = sum(len(v) for v in pilot_map.values())

    lines = []
    lines.append("-- ============================================================")
    lines.append("-- 0115 (batch 2a) - container-payment admin tables camelCase")
    lines.append("-- ============================================================")
    lines.append("-- Batch 2a of the cross-app camelCase alignment (was 0113 +")
    lines.append("-- 0114 hotfix for batch 1 = tb_users + tb_admin + tb_co).")
    lines.append("-- This batch covers ONLY the container-payment admin tables")
    lines.append("-- (smallest cargo-adjacent slice, 2 admin files touch them).")
    lines.append("-- Batch 2b = full tb_forwarder family (~177 renames, 18")
    lines.append("-- customer-facing pages) is deferred until those pages can")
    lines.append("-- be migrated one screen at a time.")
    lines.append("--")
    for t in PILOT_TABLES:
        if t in pilot_map:
            lines.append(f"-- - {t} ({len(pilot_map[t])} renames)")
    lines.append(f"-- Total: {total} renames across {len(pilot_map)} tables.")
    lines.append("--")
    lines.append("-- Pre-flight verified: no PL/pgSQL function bodies reference")
    lines.append("-- these tables (0010_forwarder.sql functions operate on the")
    lines.append("-- REBUILT public.forwarders table, not legacy tb_forwarder).")
    lines.append("-- So no companion 0116-style hotfix expected.")
    lines.append("--")
    lines.append("-- Source: ก๊อต's spec at pacred-admin-next/docs/database/")
    lines.append("-- No type changes. No data changes. Idempotent (IF EXISTS guard).")
    lines.append("-- ============================================================")
    lines.append("")

    for t in PILOT_TABLES:
        if t not in pilot_map:
            continue
        lines.append(f"-- -- {t} ({len(pilot_map[t])} renames) --")
        for old, new in sorted(pilot_map[t].items()):
            lines.append(
                f"DO $$ BEGIN "
                f"IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='{t}' AND column_name='{old}') "
                f"AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='{t}' AND column_name='{new}') "
                f"THEN EXECUTE 'ALTER TABLE public.{t} RENAME COLUMN {old} TO \"{new}\"'; "
                f"END IF; END $$;"
            )
        lines.append("")

    MIGRATION_OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote pilot migration: {MIGRATION_OUT.relative_to(REPO_ROOT)}")
    print(f"  {total} renames across {len(pilot_map)} pilot tables")


if __name__ == "__main__":
    main()

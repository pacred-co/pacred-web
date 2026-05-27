#!/usr/bin/env python3
"""
Pilot migration generator: subset of 0113 — only tb_users, tb_admin, tb_co.

Reads scripts/_camelcase-map.json (produced by gen-camelcase-migration.py).
Outputs supabase/migrations/0113_align_pilot_users_admin_co.sql with
the RENAMEs for just the 3 pilot tables (~80 renames).

The full 996-rename migration (0113_align_legacy_camelcase.sql) is
KEPT as a draft sibling — when the pilot is verified live, run the
full one.
"""
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MAP_IN = REPO_ROOT / "scripts" / "_camelcase-map.json"
MIGRATION_OUT = REPO_ROOT / "supabase" / "migrations" / "0113_align_pilot_users_admin_co.sql"
PILOT_TABLES = ["tb_users", "tb_admin", "tb_co"]

def main():
    if not MAP_IN.exists():
        print(f"FATAL: rename map not found ({MAP_IN}). Run gen-camelcase-migration.py first.", file=sys.stderr)
        sys.exit(1)
    full_map = json.loads(MAP_IN.read_text(encoding="utf-8"))

    pilot_map = {t: full_map[t] for t in PILOT_TABLES if t in full_map}
    total = sum(len(v) for v in pilot_map.values())

    lines = []
    lines.append("-- ============================================================")
    lines.append("-- 0113 (PILOT) - tb_users + tb_admin + tb_co camelCase rename")
    lines.append("-- ============================================================")
    lines.append("-- Pilot subset of the full 0113_align_legacy_camelcase.sql")
    lines.append("-- (996 renames across 108 tables). Apply this first, verify")
    lines.append("-- Pacred customer + admin flows still work, then ship the rest.")
    lines.append("--")
    for t in PILOT_TABLES:
        if t in pilot_map:
            lines.append(f"-- - {t} ({len(pilot_map[t])} renames)")
    lines.append(f"-- Total: {total} renames across {len(pilot_map)} tables.")
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

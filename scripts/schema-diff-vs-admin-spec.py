#!/usr/bin/env python3
"""
Schema audit: Pacred prod tb_* tables (from supabase/migrations/0081_pcs_legacy_schema.sql)
vs ก๊อต's canonical spec (from /tmp/pacred-admin-docs/docs/database/*.md).

Goal: identify every column where the casing diverges. Output:
  - Per-table column-count comparison
  - Per-column camelCase rename map (lowercase → camelCase)
  - Tables in Pacred but not in spec (and vice versa)

Run from repo root:  python scripts/schema-diff-vs-admin-spec.py
Requires:  /tmp/pacred-admin-docs/docs/database/  (sparse-checkout from
           https://github.com/pacred-co/pacred-admin-next)
"""
import re
import os
import sys
from pathlib import Path
from collections import defaultdict

REPO_ROOT = Path(__file__).resolve().parent.parent
PACRED_SCHEMA_SQL = REPO_ROOT / "supabase" / "migrations" / "0081_pcs_legacy_schema.sql"
ADMIN_DOCS_DIR = Path("/tmp/pacred-admin-docs/docs/database")

# Windows path fallback
if not ADMIN_DOCS_DIR.exists():
    ADMIN_DOCS_DIR = Path(os.environ.get("LOCALAPPDATA", "")) / "Temp" / "pacred-admin-docs" / "docs" / "database"
if not ADMIN_DOCS_DIR.exists():
    print(f"FATAL: admin docs not found at {ADMIN_DOCS_DIR}", file=sys.stderr)
    sys.exit(1)


def parse_pacred_schema(sql_path: Path) -> dict[str, list[str]]:
    """Extract {tableName: [columnName, ...]} from the CREATE TABLE blocks
    in 0081_pcs_legacy_schema.sql. Identifiers are PostgreSQL-lowercased."""
    text = sql_path.read_text(encoding="utf-8")
    tables: dict[str, list[str]] = {}
    # Match CREATE TABLE public.NAME ( ... );
    pattern = re.compile(
        r"CREATE TABLE public\.(\w+)\s*\((.*?)\);",
        re.DOTALL,
    )
    for m in pattern.finditer(text):
        name = m.group(1)
        body = m.group(2)
        cols = []
        # Each column line starts with whitespace + identifier
        for line in body.split("\n"):
            line = line.strip().rstrip(",")
            if not line or line.startswith("--"):
                continue
            # Skip table-level constraints
            if line.upper().startswith(("CONSTRAINT", "PRIMARY KEY", "UNIQUE", "CHECK", "FOREIGN KEY")):
                continue
            # First token is the column name (may be quoted)
            first = line.split()[0].strip('"')
            if first:
                cols.append(first)
        if cols:
            tables[name] = cols
    return tables


def parse_admin_spec(docs_dir: Path) -> dict[str, list[str]]:
    """Extract {tableName: [camelCaseColumnName, ...]} from ก๊อต's .md docs.
    Table name = filename without .md. Columns come from the ## Schema markdown
    table — first cell of each row, stripped of backticks."""
    tables: dict[str, list[str]] = {}
    for md_path in sorted(docs_dir.glob("*.md")):
        if md_path.name == "README.md":
            continue
        name = md_path.stem
        text = md_path.read_text(encoding="utf-8")
        cols = []
        in_schema = False
        seen_header = False
        for line in text.split("\n"):
            stripped = line.strip()
            if stripped.startswith("## Schema"):
                in_schema = True
                continue
            if in_schema and stripped.startswith("## "):
                break  # next section
            if in_schema and stripped.startswith("|"):
                cells = [c.strip() for c in stripped.strip("|").split("|")]
                if not cells:
                    continue
                first = cells[0]
                # Skip header row + separator row
                if first.lower() in ("column", ""):
                    seen_header = True
                    continue
                if first.startswith("---") or re.match(r"^-+$", first):
                    continue
                if not seen_header:
                    continue
                # Strip backticks around column name
                colname = first.strip("`").strip()
                if colname:
                    cols.append(colname)
        if cols:
            tables[name] = cols
    return tables


def main():
    print(f"Pacred schema:  {PACRED_SCHEMA_SQL}")
    print(f"Admin spec:     {ADMIN_DOCS_DIR}")
    print()

    pacred = parse_pacred_schema(PACRED_SCHEMA_SQL)
    spec   = parse_admin_spec(ADMIN_DOCS_DIR)

    print(f"Pacred tables in 0081:  {len(pacred)}")
    print(f"Admin-spec tables:      {len(spec)}")
    print()

    # Tables only on one side
    pacred_only = sorted(set(pacred) - set(spec))
    spec_only   = sorted(set(spec) - set(pacred))
    common      = sorted(set(pacred) & set(spec))

    print(f"Common tables:          {len(common)}")
    print(f"Pacred-only tables:     {len(pacred_only)}")
    print(f"Spec-only tables:       {len(spec_only)}")
    print()

    if pacred_only:
        print("--- TABLES IN PACRED 0081 BUT NOT IN SPEC ---")
        for t in pacred_only:
            print(f"  {t}")
        print()

    if spec_only:
        print("--- TABLES IN SPEC BUT NOT IN PACRED 0081 ---")
        for t in spec_only:
            print(f"  {t}")
        print()

    # Per-table casing diff
    print("--- PER-TABLE COLUMN DIFF (common tables) ---")
    total_renames = 0
    total_pacred_only_cols = 0
    total_spec_only_cols = 0
    rename_map: dict[str, list[tuple[str, str]]] = {}

    for t in common:
        pcols = pacred[t]
        scols = spec[t]
        # Case-insensitive intersection
        pcols_lower = {c.lower(): c for c in pcols}
        scols_lower = {c.lower(): c for c in scols}

        pacred_extra = [pcols_lower[k] for k in (set(pcols_lower) - set(scols_lower))]
        spec_extra   = [scols_lower[k] for k in (set(scols_lower) - set(pcols_lower))]

        # Rename: lowercase Pacred → camelCase from spec
        renames = []
        for k in set(pcols_lower) & set(scols_lower):
            p_name = pcols_lower[k]
            s_name = scols_lower[k]
            if p_name != s_name:
                renames.append((p_name, s_name))

        total_renames        += len(renames)
        total_pacred_only_cols += len(pacred_extra)
        total_spec_only_cols   += len(spec_extra)

        if renames or pacred_extra or spec_extra:
            print(f"\n{t}:")
            print(f"  {len(pcols)} cols in Pacred / {len(scols)} cols in spec / "
                  f"{len(renames)} casing-only renames")
            if pacred_extra:
                print(f"  Pacred-only cols ({len(pacred_extra)}):")
                for c in pacred_extra[:5]:
                    print(f"    + {c}")
                if len(pacred_extra) > 5:
                    print(f"    ... +{len(pacred_extra) - 5} more")
            if spec_extra:
                print(f"  Spec-only cols ({len(spec_extra)}):")
                for c in spec_extra[:5]:
                    print(f"    - {c}")
                if len(spec_extra) > 5:
                    print(f"    ... -{len(spec_extra) - 5} more")
            if renames and len(renames) <= 3:
                for old, new in renames[:3]:
                    print(f"    rename  {old:30s} -> {new}")

        if renames:
            rename_map[t] = renames

    print()
    print("=" * 60)
    print(f"TOTAL casing-only renames across all common tables:  {total_renames}")
    print(f"TOTAL Pacred-only columns (extra in our DB):         {total_pacred_only_cols}")
    print(f"TOTAL spec-only columns (missing in our DB):         {total_spec_only_cols}")
    print("=" * 60)


if __name__ == "__main__":
    main()

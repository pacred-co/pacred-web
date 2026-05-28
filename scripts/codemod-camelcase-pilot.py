#!/usr/bin/env python3
"""
Codemod for the camelCase pilot — rewrite Pacred Supabase-client queries
against tb_users / tb_admin / tb_co to use the new camelCase column names.

Strategy: SCOPED file rewrite.
  - Walk every file under actions/ + app/[locale]/ + lib/ that contains
    `.from("tb_users")`, `.from("tb_admin")`, or `.from("tb_co")`.
  - Within those files, apply word-boundary regex replacements for the
    lowercase → camelCase column names from scripts/_camelcase-map.json
    (pilot subset).
  - Skip lines that look like comments or that reference OTHER tb_* tables
    (since the same lowercase column names — id, adminid, userid — exist
    on dozens of tables; renaming them in a non-pilot context would break
    queries against the still-lowercase tables).

Outputs:
  --dry-run (default): prints proposed changes per file, no writes.
  --apply: writes changes in place + prints summary.

Always run --dry-run first; commit the migration only after the dry-run
diff has been reviewed.
"""
import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MAP_IN = REPO_ROOT / "scripts" / "_camelcase-map.json"
PILOT_TABLES = ["tb_users", "tb_admin", "tb_co"]
SEARCH_ROOTS = [
    REPO_ROOT / "actions",
    REPO_ROOT / "app" / "[locale]",
    REPO_ROOT / "lib",
]
SKIP_DIRS = {"node_modules", ".next", "dist", "build", ".turbo"}

# Other tb_* tables — if a file ALSO queries these, the rename is unsafe
# because columns like `id`/`adminid`/`userid` exist on them too (still
# lowercase post-pilot). Skip those files; revisit when their tables are
# in the next phase.
OTHER_TB_TABLES = [
    "tb_address", "tb_address_main", "tb_address_maomao_free",
    "tb_admin_address", "tb_api_china_hs", "tb_bill", "tb_bill_item",
    "tb_cart", "tb_cash_back", "tb_cash_back_hs", "tb_check_forwarder",
    "tb_cnt", "tb_cnt_item", "tb_cnt_pay_idorco", "tb_cnt_pay_trackingchn",
    "tb_contact_outsider", "tb_corporate", "tb_cost_container",
    "tb_credit", "tb_csvimport", "tb_customrate_hs", "tb_education_background",
    "tb_farwarder_quotation", "tb_farwarder_quotation_item", "tb_forwarder",
    "tb_forwarder_driver", "tb_forwarder_driver_item", "tb_forwarder_img",
    "tb_forwarder_import", "tb_forwarder_import2", "tb_forwarder_item",
    "tb_forwarder_prepare", "tb_forwarder_tran_th_h", "tb_forwarder_tran_th_sub",
    "tb_header_order", "tb_history", "tb_history_key", "tb_hs_rate_custom_cbm",
    "tb_hs_rate_custom_kg", "tb_keyword_product", "tb_log_forwarder_status",
    "tb_notify", "tb_notify_read", "tb_notify_sheet_ctt", "tb_notify_wp",
    "tb_order", "tb_org_email_ships", "tb_org_line_ships", "tb_org_tell_ships",
    "tb_org_wechat_ships", "tb_organization_domainname", "tb_organization_email",
    "tb_organization_line", "tb_organization_tell", "tb_organization_wechat",
    "tb_otp_check", "tb_page_name", "tb_payment", "tb_pcs_logged",
    "tb_post_job", "tb_pro_valentine", "tb_product", "tb_product_category",
    "tb_promotion", "tb_promotion33", "tb_rate_custom_cbm", "tb_rate_custom_kg",
    "tb_rate_g_cbm", "tb_rate_g_kg", "tb_rate_vip_cbm", "tb_rate_vip_kg",
    "tb_receipt", "tb_receipt_item", "tb_register", "tb_sales_report",
    "tb_set_comm_interpreter", "tb_settings", "tb_shop_pay_h", "tb_shop_pay_sub",
    "tb_sms_hs", "tb_sms_statistic", "tb_sms_statistic9", "tb_survey",
    "tb_survey202306", "tb_terms_service", "tb_user_sales",
    "tb_user_sales_admin_pay", "tb_user_sales_pay", "tb_users_otp",
    "tb_users_otp_hs", "tb_wallet", "tb_wallet_hs", "tb_wallet_paydeposit",
    "tb_web_hs", "tb_withdraw_comm_interpreter_h",
    "tb_withdraw_comm_interpreter_item", "tb_withdraw_comm_sale_h",
    "tb_withdraw_comm_sale_item", "tb_youtude",
]


def iter_source_files() -> list[Path]:
    files = []
    for root in SEARCH_ROOTS:
        if not root.exists():
            continue
        for p in root.rglob("*"):
            if not p.is_file():
                continue
            if p.suffix not in (".ts", ".tsx", ".js", ".jsx"):
                continue
            if any(part in SKIP_DIRS for part in p.parts):
                continue
            files.append(p)
    return files


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Write changes (default dry-run)")
    args = parser.parse_args()

    if not MAP_IN.exists():
        print(f"FATAL: {MAP_IN} not found. Run gen-camelcase-migration.py first.", file=sys.stderr)
        sys.exit(1)
    full_map = json.loads(MAP_IN.read_text(encoding="utf-8"))

    # Build flat rename map across pilot tables. If two pilot tables share
    # a lowercase name that maps to DIFFERENT camelCase, that's an unsafe
    # rename — abort.
    flat: dict[str, str] = {}
    for t in PILOT_TABLES:
        for old, new in full_map.get(t, {}).items():
            if old in flat and flat[old] != new:
                print(f"FATAL: ambiguous rename '{old}' → {flat[old]} vs {new} (across pilot tables)",
                      file=sys.stderr)
                sys.exit(1)
            flat[old] = new

    print(f"Pilot rename map: {len(flat)} unique lowercase → camelCase pairs")
    print()

    files = iter_source_files()
    print(f"Scanning {len(files)} source files...")
    print()

    pilot_pattern = re.compile(
        r'\.from\(\s*"(' + "|".join(re.escape(t) for t in PILOT_TABLES) + r')"\s*\)'
    )
    other_pattern = re.compile(
        r'\.from\(\s*"(' + "|".join(re.escape(t) for t in OTHER_TB_TABLES) + r')"\s*\)'
    )

    touched_files = 0
    skipped_files = 0
    skipped_due_to_other_tb = []
    total_replacements = 0
    per_file_changes: dict[Path, list[tuple[str, str, int]]] = {}

    for f in files:
        text = f.read_text(encoding="utf-8")
        if not pilot_pattern.search(text):
            continue
        if other_pattern.search(text):
            # File touches other tb_* tables too; renaming shared columns
            # (e.g. `id`) here would break queries against the not-yet-
            # renamed tables. Skip + flag for the next-phase pilot batch.
            skipped_files += 1
            skipped_due_to_other_tb.append(f.relative_to(REPO_ROOT))
            continue

        new_text = text
        file_changes: list[tuple[str, str, int]] = []
        for old, new in sorted(flat.items(), key=lambda kv: -len(kv[0])):
            # \b word boundary protects against partial matches like
            # `useridold` → `userIDold` (correct: we want full-word match
            # only). The `\b` works on word chars [A-Za-z0-9_] which is
            # exactly the identifier alphabet.
            #
            # We replace ONLY when old appears as a quoted string literal
            # ("userid") or as an object-key identifier or property
            # access. Bare identifier replacement would be too aggressive.
            #
            # Patterns we target:
            #   "userid"           → "userID"        (.select / .eq / .order arg)
            #   { userid:          → { userID:       (insert / update object key)
            #   .userid            → .userID         (row member access)
            quoted_re = re.compile(rf'(["\']){re.escape(old)}(\1)')
            objkey_re = re.compile(rf'(\b){re.escape(old)}(\s*:)')
            propaccess_re = re.compile(rf'(\.){re.escape(old)}(\b)')

            after_quoted, n1 = quoted_re.subn(rf'\g<1>{new}\g<2>', new_text)
            after_objkey, n2 = objkey_re.subn(rf'\g<1>{new}\g<2>', after_quoted)
            after_propaccess, n3 = propaccess_re.subn(rf'\g<1>{new}\g<2>', after_objkey)

            n = n1 + n2 + n3
            if n:
                file_changes.append((old, new, n))
                new_text = after_propaccess

        if new_text != text:
            touched_files += 1
            total_replacements += sum(c[2] for c in file_changes)
            per_file_changes[f] = file_changes
            if args.apply:
                f.write_text(new_text, encoding="utf-8")

    print("=" * 60)
    print(f"Files touched:     {touched_files}")
    print(f"Files skipped:     {skipped_files} (use OTHER tb_* tables — defer to next phase)")
    print(f"Total replacements: {total_replacements}")
    print("=" * 60)
    print()

    if per_file_changes:
        print("--- Per-file changes ---")
        for f in sorted(per_file_changes.keys(), key=lambda p: str(p)):
            rel = f.relative_to(REPO_ROOT)
            changes = per_file_changes[f]
            n = sum(c[2] for c in changes)
            print(f"  {rel}  ({n} edits, {len(changes)} unique cols)")
            for old, new, count in changes[:3]:
                print(f"    {old:25s} -> {new:25s} x{count}")
            if len(changes) > 3:
                print(f"    ... +{len(changes) - 3} more cols")
        print()

    if skipped_due_to_other_tb:
        print("--- Skipped files (touch other tb_* tables) ---")
        for f in skipped_due_to_other_tb[:20]:
            print(f"  {f}")
        if len(skipped_due_to_other_tb) > 20:
            print(f"  ... +{len(skipped_due_to_other_tb) - 20} more")
        print()
        print(f"^ These {len(skipped_due_to_other_tb)} files are SAFE TO LEAVE for the pilot — they")
        print("  reference tb_* tables that are not yet renamed. They become eligible")
        print("  when the full migration ships.")
        print()

    if not args.apply:
        print(">>> DRY RUN — no files written. Pass --apply to write changes.")


if __name__ == "__main__":
    main()

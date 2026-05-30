/**
 * Wave 31 / P0-14 — locks down the legacy-view → AdminServiceOrderUpdateForm
 * wiring in `legacy-view.tsx`.
 *
 * Why this exists:
 *   Before P0-14 the legacy-view path (the one ALL 21,950 real
 *   tb_header_order rows hit) rendered status badge + MarkPaidTbForm +
 *   SpawnForwarderForm — but NOT the status/cancel/saveNote panel.
 *   Staff couldn't flip status, cancel, or saveNote on any real order
 *   from the Pacred admin UI; they fell back to legacy PHP. P0-14
 *   mounts AdminServiceOrderUpdateForm in legacy-view.tsx with a
 *   legacy-hstatus → rebuilt-string-key mapping (the form expects the
 *   rebuilt vocabulary; the action then re-maps back to legacy chars).
 *
 * What this test asserts (tb_*-delta · pure shape level):
 *   A. `legacy-view.tsx` imports `AdminServiceOrderUpdateForm` from
 *      `./update-form` — proves the form is wired in.
 *   B. `legacy-view.tsx` renders `<AdminServiceOrderUpdateForm` — proves
 *      it's actually mounted in the JSX, not just imported.
 *   C. `legacy-view.tsx` defines `LEGACY_TO_REBUILT_KEY` covering all 6
 *      legacy hstatus codes ('1'..'6') — proves no real order would
 *      fall through to an `undefined` status.
 *   D. The mapping `LEGACY_TO_REBUILT_KEY` is the exact inverse of
 *      `REBUILT_TO_LEGACY_HSTATUS` declared inside
 *      actions/admin/service-orders.ts — proves a round-trip (legacy
 *      char → rebuilt key → form → action → legacy char) lands on the
 *      SAME char it started with. This is the load-bearing invariant
 *      that prevents the form from silently corrupting hstatus on save.
 *
 * We do NOT exercise the full Server Action here (it depends on
 * withAdmin · createAdminClient · sendNotification; that's covered by
 * the existing actions/admin/service-orders.test.ts mapping tests +
 * the qa-flow-simulator skill during phase verify).
 *
 * Pattern matches actions/admin/service-orders.test.ts (pass/fail
 * counts via tsx, no vitest, no Supabase mock).
 *
 * Run with:
 *   pnpm tsx "app/[locale]/(admin)/admin/service-orders/[hNo]/legacy-view-update-form.test.ts"
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let pass = 0;
let fail = 0;

function assertEq(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  OK ${label}`);
  } else {
    fail++;
    console.error(
      `  FAIL ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`,
    );
  }
}

function section(name: string): void {
  console.log(`\n${name}`);
}

console.log("=== Wave 31 / P0-14 — legacy-view.tsx mounts AdminServiceOrderUpdateForm ===");

// Read both files as source text. We don't import legacy-view.tsx
// because it's an async Server Component with React/JSX that brings
// the full Supabase + i18n stack into the test process — overkill for
// pure shape verification. Source-grep is enough to prove the wiring.
const HERE = dirname(fileURLToPath(import.meta.url));
const LEGACY_VIEW_PATH = join(HERE, "legacy-view.tsx");
const ACTION_PATH = join(HERE, "..", "..", "..", "..", "..", "..", "actions", "admin", "service-orders.ts");

const legacyViewSrc = readFileSync(LEGACY_VIEW_PATH, "utf8");
const actionSrc = readFileSync(ACTION_PATH, "utf8");

// ────────────────────────────────────────────────────────────
// A. Import wiring
// ────────────────────────────────────────────────────────────
section("A. legacy-view.tsx imports AdminServiceOrderUpdateForm");

const hasImport = /import\s+\{\s*AdminServiceOrderUpdateForm\s*\}\s+from\s+["']\.\/update-form["']/.test(legacyViewSrc);
assertEq("imports { AdminServiceOrderUpdateForm } from './update-form'", hasImport, true);

// ────────────────────────────────────────────────────────────
// B. JSX render site
// ────────────────────────────────────────────────────────────
section("B. legacy-view.tsx renders <AdminServiceOrderUpdateForm ...>");

const hasJsxRender = /<AdminServiceOrderUpdateForm\b/.test(legacyViewSrc);
assertEq("contains JSX render `<AdminServiceOrderUpdateForm`", hasJsxRender, true);

// Sanity-check the 4 props the form requires (hNo, status, note_admin, totalThb).
// These match update-form.tsx signature L18.
const hasHnoProp = /hNo=\{r\.hno\}/.test(legacyViewSrc);
const hasStatusProp = /status=\{LEGACY_TO_REBUILT_KEY\[r\.hstatus\s*\?\?\s*["']1["']\]\s*\?\?\s*["']pending["']\}/.test(legacyViewSrc);
const hasNoteProp = /note_admin=\{r\.hnote\s*\?\?\s*null\}/.test(legacyViewSrc);
const hasTotalProp = /totalThb=\{Number\(r\.htotalpriceuser\s*\?\?\s*0\)\}/.test(legacyViewSrc);

assertEq("hNo={r.hno} prop wired", hasHnoProp, true);
assertEq("status={LEGACY_TO_REBUILT_KEY[...]} prop wired", hasStatusProp, true);
assertEq("note_admin={r.hnote ?? null} prop wired", hasNoteProp, true);
assertEq("totalThb={Number(r.htotalpriceuser ?? 0)} prop wired", hasTotalProp, true);

// ────────────────────────────────────────────────────────────
// C. LEGACY_TO_REBUILT_KEY total over the 6 legacy hstatus codes
// ────────────────────────────────────────────────────────────
section("C. LEGACY_TO_REBUILT_KEY covers all 6 legacy hstatus codes");

// Migration 0081_pcs_legacy_schema.sql L2568 declares hstatus codes '1'..'6'.
// Any missing code would cause `LEGACY_TO_REBUILT_KEY[r.hstatus] === undefined`
// and the form's status select would land on the `?? "pending"` fallback —
// silent data corruption for the non-pending real orders.
const LEGACY_HSTATUS_CODES = ["1", "2", "3", "4", "5", "6"] as const;
const EXPECTED_MAP: Record<string, string> = {
  "1": "pending",
  "2": "awaiting_payment",
  "3": "ordered",
  "4": "awaiting_chn_dispatch",
  "5": "completed",
  "6": "cancelled",
};

// Parse the LEGACY_TO_REBUILT_KEY definition from legacy-view.tsx source.
// We re-derive it from source-text so a future drift in legacy-view.tsx
// surfaces here even though we don't import the module.
const mapBlock = legacyViewSrc.match(/const LEGACY_TO_REBUILT_KEY:\s*Record<string,\s*string>\s*=\s*\{([^}]+)\}/);
if (!mapBlock) {
  console.error("  FAIL could not locate LEGACY_TO_REBUILT_KEY definition in legacy-view.tsx");
  fail++;
} else {
  const body = mapBlock[1];
  for (const code of LEGACY_HSTATUS_CODES) {
    const re = new RegExp(`["']${code}["']\\s*:\\s*["'](\\w+)["']`);
    const m = body.match(re);
    const got = m?.[1];
    assertEq(`LEGACY_TO_REBUILT_KEY["${code}"] = "${EXPECTED_MAP[code]}"`, got, EXPECTED_MAP[code]);
  }
}

// ────────────────────────────────────────────────────────────
// D. Round-trip invariant — legacy-view's map is the inverse of
//    actions/admin/service-orders.ts's REBUILT_TO_LEGACY_HSTATUS
// ────────────────────────────────────────────────────────────
section("D. Round-trip invariant: legacy hstatus char → rebuilt key → legacy char");

// The form takes a rebuilt-string status (from LEGACY_TO_REBUILT_KEY) and
// the Server Action `adminUpdateServiceOrder` translates it back to a
// legacy char via REBUILT_TO_LEGACY_HSTATUS on write. If these two maps
// drift, a status flip from the form silently writes the wrong hstatus —
// the exact silent-dead-write class of bug ADR-0017 + the 2026-05-30 master
// gap audit warn against.
const actionMapBlock = actionSrc.match(/const REBUILT_TO_LEGACY_HSTATUS:\s*Record<string,\s*string>\s*=\s*\{([^}]+)\}/);
if (!actionMapBlock) {
  console.error("  FAIL could not locate REBUILT_TO_LEGACY_HSTATUS in actions/admin/service-orders.ts");
  fail++;
} else {
  const actionBody = actionMapBlock[1];
  const reverseMap: Record<string, string> = {};
  // Match e.g. `pending: "1",` or `awaiting_chn_dispatch: "4",`
  const entryRe = /(\w+)\s*:\s*["'](\d)["']/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(actionBody)) !== null) {
    reverseMap[m[1]] = m[2];
  }

  for (const code of LEGACY_HSTATUS_CODES) {
    const rebuiltKey = EXPECTED_MAP[code];
    const backToLegacy = reverseMap[rebuiltKey];
    assertEq(
      `round-trip '${code}' → ${rebuiltKey} → '${backToLegacy ?? "?"}' (must equal '${code}')`,
      backToLegacy,
      code,
    );
  }
}

// ────────────────────────────────────────────────────────────
// summary
// ────────────────────────────────────────────────────────────
console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);

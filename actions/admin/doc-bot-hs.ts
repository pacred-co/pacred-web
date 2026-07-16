"use server";

// ════════════════════════════════════════════════════════════════════
// DOC BOT HS aliases — READ-ONLY product→พิกัด browse of doc_bot_hs_codes.
//
// The DOC BOT's real, live HS knowledge base: **5,335 rows** (mig 0249 imported
// 749 from the bot's own Supabase; mig 0251 added 4,586 from the owner's
// "พิกัด อัพเดท.xlsx" → source ∈ doc_bot | ไฟล์:คำศัพท์-คำแปล | ไฟล์:nnb | ไฟล์:Vat).
// (An earlier version of this header said "749 rows" — that is only the
// source='doc_bot' slice, not the table.)
//
// GRAIN — the load-bearing fact: this table is **PRODUCT-grain**, not code-grain
// (5,335 rows · 1,318 distinct HS8 keys · ~2,771 products; code 82159900 alone
// has 168 rows / 81 products). That is why the unified library (2026-07-16) is
// anchored on the code-grain hs_codes and this table stays as its ALIAS CHILD —
// putting one duty per row here would duplicate it ~4x and invite the update
// anomaly that is already real (94 codes have rows that disagree on อากร).
//
// It is deliberately messy — a product asked many times can carry CONFLICTING
// codes (พวงกุญแจ = 4, ตัวจ่ายไฟ = 3). Per the owner: DON'T delete the conflicts —
// keep them ALL as พิกัดหลัก (primary) + พิกัดรอง (alternates) so the Doc team
// CHOOSES per case (a code "ติด" at customs → they "เลี่ยงพิกัด" to an alternate).
// This action SURFACES the choices; the human picks.
//
// ⚠️ ISOLATION (§0e · owner directive): a pure READ. It NEVER writes — not to
// doc_bot_*, not to hs_codes, not to any money / customs / order table. The
// 2026-07-16 merge reads this table from a script; nothing here mutates.
// ════════════════════════════════════════════════════════════════════

import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, type AdminActionResult } from "./common";
import type { AdminRole } from "@/lib/auth/require-admin";

// Same roles as the คลัง HS library page (super / accounting / doc lanes) — the
// people who maintain the duty reference + the 3-number / ใบขน flow.
const DOC_BOT_HS_ROLES: AdminRole[] = [
  "super",
  "accounting",
  "pricing",
  "freight_import_doc",
  "freight_clearance_both",
];

// A single row of the bot's HS lookup. All duty fields are TEXT in the source
// (0 / "8%" / "ยกเว้น" / "" …) — surfaced verbatim, never coerced (this is a
// reference display, not a computed cost).
export type DocBotHsRow = {
  id:          string;
  hs_code:     string | null;
  th:          string | null; // Thai product/description
  en:          string | null; // English product/description
  fe:          string | null; // Form-E duty
  no:          string | null; // normal duty (อากรปกติ)
  stat:        string | null; // statistical code (รหัสสถิติ)
  note:        string | null;
  imported_at: string;
  /** origin of the row: 'doc_bot' (749 bot rows) or 'ไฟล์:<sheet>' (the owner's
   *  "พิกัด อัพเดท.xlsx" import · mig 0251). Shown as a badge in the browse. */
  source:      string | null;
  /** 0258 — generated 8-digit join key to the unified library (hs_codes.hs8_key).
   *  null for the 125 keyless rows (123 blank + 2 non-digit) — they are
   *  product-only entries and must stay visible, not silently dropped. */
  hs8_key:     string | null;
};

/**
 * List the ENTIRE doc_bot_hs_codes table (5,335 rows) newest-first for the
 * product-alias section of the unified คลัง HS page. Read-only reference lookup —
 * no write of any kind (§0e). The grouping / primary-vs-alternate / conflict
 * detection all happen in the client over this flat set (text-only).
 * §0c: error destructured.
 */
export async function listDocBotHsLibrary(): Promise<AdminActionResult<DocBotHsRow[]>> {
  return withAdmin([...DOC_BOT_HS_ROLES], async () => {
    const admin = createAdminClient();
    // 5,335 rows today; cap well above it so nothing is silently truncated.
    const { data, error } = await admin
      .from("doc_bot_hs_codes")
      .select("id, hs_code, th, en, fe, no, stat, note, imported_at, source, hs8_key")
      .order("imported_at", { ascending: false })
      .limit(8000);
    if (error) {
      console.error("[doc_bot_hs_codes list]", { code: error.code, message: error.message });
      return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    }
    return { ok: true, data: ((data ?? []) as unknown) as DocBotHsRow[] };
  });
}

/** A doc-bot override: "when the ask contains <keyword>, the right พิกัด is
 *  <correct_hs>" — the Doc team's correction of a bot mis-classification. */
export type DocBotHsOverrideRow = {
  id:         string;
  keyword:    string | null;
  correct_hs: string | null;
  note:       string | null;
  created_at: string;
};

/**
 * List doc_bot_hs_overrides (9 rows · keyword → correct_hs).
 *
 * ⚠️ This table was a VERIFIED TOTAL ORPHAN before 2026-07-16 — grep-confirmed
 * zero code consumers anywhere in the repo. It holds real Doc-team knowledge
 * (the bot's known mis-classifications) that nothing read, so it was quietly
 * rotting. Surfacing it on the unified library is the cheapest way to put it
 * back in front of the people who wrote it.
 *
 * Read-only (§0e). §0c: error destructured.
 */
export async function listDocBotHsOverrides(): Promise<AdminActionResult<DocBotHsOverrideRow[]>> {
  return withAdmin([...DOC_BOT_HS_ROLES], async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("doc_bot_hs_overrides")
      .select("id, keyword, correct_hs, note, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      console.error("[doc_bot_hs_overrides list]", { code: error.code, message: error.message });
      return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    }
    return { ok: true, data: ((data ?? []) as unknown) as DocBotHsOverrideRow[] };
  });
}

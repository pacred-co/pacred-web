"use server";

// ════════════════════════════════════════════════════════════════════
// DOC BOT HS library — READ-ONLY browse of doc_bot_hs_codes (mig 0249).
//
// The DOC BOT's real, live HS-code knowledge base (749 rows · imported from a
// separate Supabase 2026-07-09). It is deliberately messy — 118 products were
// asked multiple times and some carry CONFLICTING codes (พวงกุญแจ = 4 codes,
// ตัวจ่ายไฟ = 3). Per the owner: DON'T delete the conflicts — keep them ALL and
// present them as พิกัดหลัก (primary) + พิกัดรอง (alternates) so the Doc team can
// CHOOSE per case (sometimes a code is "ติด" at customs → they "เลี่ยงพิกัด" to
// an alternate). This action just SURFACES the choices; the human picks.
//
// ⚠️ ISOLATION (§0e · owner directive): this is a pure READ. It NEVER writes —
// not to doc_bot_*, not to the canonical hs_codes dictionary, not to any money /
// customs / order table. No merge / dedup happens here (that's a later slice —
// the owner picks the primaries). This slice only DISPLAYS.
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
};

/**
 * List the ENTIRE doc_bot_hs_codes library (749 rows) newest-first for the
 * grouped bot-library browse. Read-only reference lookup — no write of any kind
 * (§0e). The grouping / primary-vs-alternate / conflict detection all happen in
 * the client over this flat set (small · text-only). §0c: error destructured.
 */
export async function listDocBotHsLibrary(): Promise<AdminActionResult<DocBotHsRow[]>> {
  return withAdmin([...DOC_BOT_HS_ROLES], async () => {
    const admin = createAdminClient();
    // The table is ~749 rows; cap well above it so nothing is lost.
    const { data, error } = await admin
      .from("doc_bot_hs_codes")
      .select("id, hs_code, th, en, fe, no, stat, note, imported_at")
      .order("imported_at", { ascending: false })
      .limit(3000);
    if (error) {
      console.error("[doc_bot_hs_codes list]", { code: error.code, message: error.message });
      return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    }
    return { ok: true, data: ((data ?? []) as unknown) as DocBotHsRow[] };
  });
}

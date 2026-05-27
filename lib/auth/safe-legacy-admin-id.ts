/**
 * `safeLegacyAdminId(raw, max = 10)` — defensively clip a Pacred admin id
 * before writing it into a legacy varchar column.
 *
 * Wave 23 (2026-05-27 · ภูม flag): the legacy `pcsc_main` schema declared
 * every `adminid*` column as `varchar(10)` — fine when the admin id was
 * a short ascii nickname (e.g. "koy" · "fah" · "admin_nat"), but Pacred's
 * `resolveLegacyAdminId()` may return strings like `"admin_pasit_pappornpisit"`
 * (the legacy slug-style + auth.users sync output) which routinely exceeds
 * 10 chars. Insert without clipping → Postgres throws
 * `"value too long for type character varying(10)"` and the server action
 * returns `{ok: false}` — silent UI failure (action banner shows generic
 * error · admin doesn't know why).
 *
 * The bug bit 3 separate surfaces today before this helper existed:
 *   - /admin/forwarders/new           (commit 5254f8d · PCS pickup tel
 *                                       was actually a different overflow
 *                                       at faddresstel, but same family)
 *   - /admin/forwarders bulk-update   (commit 347ad81 · adminidupdate)
 *   - /admin/forwarders/[fNo] action  (the new TbForwarderActionPanel —
 *                                       reused the bulk action, so the
 *                                       347ad81 fix protected it too)
 *
 * Per task #178 there are 14+ more write sites in 9 files (admin-profile,
 * cart, cnt-hs, forwarder-check, api-forwarder-manual, carrier-manual,
 * barcode-import, combine-bill, …). This helper is the canonical clip
 * function — call it at every INSERT/UPDATE site that writes into a
 * `tb_forwarder.adminid*` column.
 *
 * Why a function (vs inline .slice(0, 10) at every call site)?
 *   - One place to update if the legacy column ever widens (unlikely)
 *   - One place to add Sentry breadcrumb when the slice actually truncates
 *     (useful for finding admins whose names are getting silently shortened)
 *   - Search-grep "safeLegacyAdminId(" gives a single audit query for any
 *     reviewer to confirm coverage
 */

import { logger } from "@/lib/logger";

const DEFAULT_MAX = 10;

export function safeLegacyAdminId(raw: string | null | undefined, max = DEFAULT_MAX): string {
  const s = String(raw ?? "").trim();
  if (s.length <= max) return s;
  // Truncation is a quiet correctness fix · log it so we can spot admins
  // whose ids are being silently shortened (the legacy adminid is often
  // used as a join key — if "admin_pasit_pappornpisit" gets clipped to
  // "admin_pasi" we want to know which sales-rep lookups will miss).
  logger.warn(
    "safeLegacyAdminId",
    `truncating admin id "${s}" (${s.length} chars) → "${s.slice(0, max)}" (${max} chars · varchar(${max}) column limit)`,
  );
  return s.slice(0, max);
}

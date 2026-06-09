/**
 * W11 — NETBAY e-customs filing integration (DOCUMENTED STUB · HARD-BLOCKED).
 *
 * NETBAY (`api.netbay.co.th`) is the real Thai Customs e-declaration gateway.
 * Pacred's `customs_declarations` model generates INTERNAL working drafts only;
 * real filing is MANUAL (a broker keys it into NETBAY) until creds + the field
 * spec arrive. See `docs/learnings/customs-brokerage-kit.md` §6.
 *
 * 🔒 HARD OWNER-BLOCKER (Appendix A · build-backlog-2026-06-09):
 *   - NETBAY broker account + username/password
 *   - the field-spec / payload-schema (no structured JSON/XML export documented)
 *   Until those exist this module is a STUB: every function returns
 *   `{ ok: false, reason: "netbay_not_configured" }` and NEVER performs a
 *   network call or any customs submission. The platform writes back
 *   `customs_control_no` MANUALLY (operator enters it on the ใบขน) — there is no
 *   automatic e-submission path.
 *
 * The mechanism (function shapes + config gate) is here so a future build wires
 * the real HTTP call in ONE place once creds land — without that build, calling
 * these is safe and inert.
 *
 * Server-only.
 */

import "server-only";

export type NetbayConfig = {
  endpoint: string;
  username: string;
  password: string;
};

export type NetbaySubmitResult =
  | { ok: true; controlNo: string }
  | { ok: false; reason: "netbay_not_configured"; message: string }
  | { ok: false; reason: "submission_failed"; message: string };

/**
 * Read NETBAY creds from env. Returns null until ALL three are set — the
 * single source of truth for whether e-filing is available.
 */
export function getNetbayConfig(): NetbayConfig | null {
  const endpoint = process.env.NETBAY_ENDPOINT;
  const username = process.env.NETBAY_USERNAME;
  const password = process.env.NETBAY_PASSWORD;
  if (!endpoint || !username || !password) return null;
  return { endpoint, username, password };
}

/** True only when NETBAY creds are fully configured. */
export function isNetbayConfigured(): boolean {
  return getNetbayConfig() !== null;
}

const NOT_CONFIGURED_MESSAGE =
  "ยังไม่ได้ตั้งค่า NETBAY (ยื่นใบขนอิเล็กทรอนิกส์) — ต้องมีบัญชี broker + username/password + field spec ก่อน · ระหว่างนี้ยื่นใบขนด้วยตนเอง และคีย์เลขควบคุมศุลกากร (customs control no.) เอง";

/**
 * Submit a customs declaration to NETBAY. STUB — never submits.
 *
 * When configured (future build), this is where the real HTTP call + payload
 * mapping go. Today it always reports `netbay_not_configured` so callers
 * degrade gracefully and the operator files manually.
 *
 * @param _declarationId the customs_declarations.id to submit (unused in stub)
 */
export async function submitDeclarationToNetbay(
  _declarationId: string,
): Promise<NetbaySubmitResult> {
  const config = getNetbayConfig();
  if (!config) {
    return { ok: false, reason: "netbay_not_configured", message: NOT_CONFIGURED_MESSAGE };
  }

  // Creds present but the payload contract is NOT confirmed → we deliberately
  // do NOT submit. Submitting a wrong-shaped declaration to customs is a
  // money/legal risk; the real call is wired only after the field spec + a
  // verified mapping land. Until then, treat configured-but-unmapped as
  // not-yet-available.
  return {
    ok: false,
    reason: "netbay_not_configured",
    message:
      "ตั้งค่า NETBAY แล้ว แต่ยังไม่ได้แมป payload schema (รอ field spec ที่ยืนยัน) — ยังไม่เปิดการยื่นอัตโนมัติ",
  };
}

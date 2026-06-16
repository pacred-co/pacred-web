"use server";

/**
 * verifyCostRevealPin — server-side PIN check for the cost-reveal blur gate
 * (owner ภูม 2026-06-16: "ราคาต้นทุน ใส่เบลอไปก่อน · กดลูกตา ใส่รหัส 0948782006 →
 *  ขึ้นทั้งหมด · รีเฟรช/หลุดออกจากระบบ ต้องใส่รหัสใหม่").
 *
 * The PIN is verified HERE (server) so the literal code never ships in the
 * client JS bundle. State (revealed-or-not) lives in client memory — see
 * `components/admin/cost-reveal.tsx`.
 *
 * NOTE — the blur itself is a VISUAL gate (CSS blur; the value is still in the
 * DOM). The real access control is the server-side ROLE gate dave shipped
 * 2026-06-15 (cost renders only to super/accounting/pricing + freight managers).
 * This adds shoulder-surf / casual-view protection on top of that.
 */

import { requireAdmin } from "@/lib/auth/require-admin";

// Owner-set PIN. Overridable via env so it can be rotated without a code
// change (defaults to the owner's number). Kept module-scope server-only.
const COST_REVEAL_PIN = (process.env.COST_REVEAL_PIN ?? "0948782006").trim();

export async function verifyCostRevealPin(pin: unknown): Promise<{ ok: boolean }> {
  // Any signed-in admin may ATTEMPT — the PIN is the gate. (The eye only
  // appears on cost surfaces, which are already role-gated to cost-owners.)
  await requireAdmin();
  if (typeof pin !== "string") return { ok: false };
  return { ok: pin.trim() === COST_REVEAL_PIN };
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPendingFriForwarderSets } from "@/lib/admin/topup-slip-dedup";

/**
 * Customer-flow clarity (gap-hunt 2026-06-29 P1) — "ส่งสลิปแล้ว · รอตรวจ".
 *
 * When a customer submits a forwarder/import payment (`submitForwarderPayment`,
 * actions/forwarder.ts) the handler INSERTs a pending `tb_wallet_hs` row but
 * deliberately keeps `tb_forwarder.fstatus='5'` ("รอชำระเงิน") — the legacy
 * waits for an admin to verify the slip before any status/money flip. With no
 * indicator the customer thinks the slip vanished and re-pays / asks "ส่งสลิป
 * ไปแล้วเงียบ". This helper resolves WHICH forwarder rows already have a
 * pending (not-yet-verified) slip so the customer surfaces can render a clear
 * "ส่งสลิปแล้ว · รอตรวจ" badge beside the plain "รอชำระเงิน" pill.
 *
 * The link (§0b verified against submitForwarderPayment L342-349 + L518-552):
 *   tb_wallet_hs.reforder = String(tb_forwarder.id)        ← the join key
 *   tb_wallet_hs.typeservice = '2'                          ← import service
 *   tb_wallet_hs.status      = '1'                          ← pending admin verify
 *   tb_wallet_hs.typenew     IN ('5','6')                   ← the pay row kinds
 * (status flips 1→2 on admin approve via adminApproveWalletHs /
 *  adminBulkApproveWalletHs — once approved it is NO LONGER "รอตรวจ".)
 *
 * READ-ONLY — this never mutates fstatus or any money. Additive signal only.
 */

const IMPORT_TYPESERVICE = "2";
const PENDING_STATUS = "1";
const PAY_TYPENEW = ["5", "6"] as const;

export type PendingSlipReviewTarget = {
  kind: "wallet" | "billing-run";
  id: number;
  href: string;
  /**
   * The payment is settling an existing credit draw.  Credit shipments stay
   * physically ready to dispatch while accounting reviews the slip; cash
   * shipments must remain in the virtual 5.1 gate until approval.
   */
  isCreditPayment: boolean;
};

function preferReviewTarget(
  current: PendingSlipReviewTarget | undefined,
  candidate: PendingSlipReviewTarget,
): PendingSlipReviewTarget {
  if (!current) return candidate;
  // A billing run is the canonical two-round accounting surface when both a
  // wallet row and an invoice describe the same payment (see topup-slip-dedup).
  if (candidate.kind === "billing-run" && current.kind !== "billing-run") return candidate;
  if (candidate.kind !== current.kind) return current;
  return candidate.id < current.id ? candidate : current;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 owner 2026-07-31 — สถานะใหม่ "5.1 รอออก/ใบเสร็จรับเงิน"
 * ═══════════════════════════════════════════════════════════════════════════
 * *"สถานะนี้ก็คือสถานะที่ ลูกค้า หรือ พนักงาน แนบสลิปเข้ามาในระบบ ให้ทางบัญชี
 *  ตรวจสลิป พร้อมออกใบเสร็จ ไปใน flow จนจบก่อนที่จะไปเตรียมส่ง"*
 *
 * ⇒ "มีสลิปรอตรวจไหม" กลายเป็น **ตัวตัดสินสถานะ** ไม่ใช่แค่ป้ายเสริมอีกต่อไป
 *   → ต้องมีที่มาที่เดียว (owner: *"ข้อมูลกระจัดกระจายไม่ได้ถูกดึงถูกใช้จากที่
 *   เดียวกัน เวลาอัพเดทอะไร ตายเลย"*) — ไฟล์นี้คือที่นั้น.
 *
 * "แนบสลิปแล้ว รอบัญชีตรวจ" เข้าระบบได้ **2 ทาง** (ต้องนับทั้งคู่ ไม่งั้นงาน
 * ที่เซล/บัญชีแนบสลิปแทนลูกค้าจะตกหล่นจากคิว):
 *   (A) **ลูกค้าจ่ายเอง** → `submitForwarderPayment` INSERT `tb_wallet_hs`
 *       pending (typeservice='2' · status='1' · typenew 5/6 · reforder=fid)
 *   (B) **พนักงานแนบให้บนใบวางบิล** → `tb_forwarder_invoice.slip_path` /
 *       `slip_paths` (mig 0229/0231) ที่ยังไม่ paid/cancelled → โยงกลับเป็น fid
 *       ผ่าน `tb_forwarder_invoice_item.forwarder_id`
 *
 * ⚠️ ทาง (A) **ต้องกรอง typeservice/typenew ให้ครบ** — `tb_wallet_hs` status='1'
 * เฉยๆ รวมรายการเติมเงิน (typenew='1') ที่ `reforder` เป็นเลขออเดอร์ฝากสั่ง
 * ไม่ใช่ fid → เลขชนกันได้ = ตีธงงานผิดตัวเงียบๆ.
 *
 * READ-ONLY ทั้งไฟล์ · fail-soft (query พัง = คืนเซ็ตว่าง แล้ว log) — สถานะย่อย
 * ที่หายไปชั่วคราว ดีกว่าจอพังทั้งหน้า (§0c).
 */
async function queryPendingSlipReviewTargets(
  admin: SupabaseClient,
  opts: { userId?: string; forwarderIds?: number[] },
): Promise<Map<number, PendingSlipReviewTarget>> {
  const { userId, forwarderIds } = opts;
  const ids = forwarderIds?.filter((id) => Number.isFinite(id));
  const out = new Map<number, PendingSlipReviewTarget>();

  // ── (A) สลิปที่ลูกค้าส่งเอง — tb_wallet_hs pending ────────────────────────
  let wq = admin
    .from("tb_wallet_hs")
    .select("id, reforder, wusercredit")
    .eq("typeservice", IMPORT_TYPESERVICE)
    .eq("status", PENDING_STATUS)
    .in("typenew", [...PAY_TYPENEW]);
  if (userId) wq = wq.eq("userid", userId);
  if (ids) wq = wq.in("reforder", ids.map(String));

  // ── (B) สลิปที่พนักงานแนบบนใบวางบิล — canonical pending gate ─────────────
  // IMPORTANT: a rejected invoice deliberately keeps slip_path/slip_paths as
  // audit evidence. Looking at the file columns alone therefore produces a
  // false 5.1. Reuse the dashboard queue loader whose SOT is exactly
  // status=issued + slip_status=pending, so badge/list/derived status cannot drift.
  const [wRes, friSets] = await Promise.all([
    wq,
    loadPendingFriForwarderSets(admin),
  ]);

  if (wRes.error) {
    console.error("[pending-slip] tb_wallet_hs read failed", {
      code: wRes.error.code, message: wRes.error.message, userid: userId ?? "(all)",
    });
  }
  for (const r of (wRes.data ?? []) as Array<{
    id: number | string;
    reforder: string | null;
    wusercredit: string | null;
  }>) {
    const n = Number((r.reforder ?? "").trim());
    const reviewId = Number(r.id);
    if (Number.isInteger(n) && n > 0 && Number.isInteger(reviewId) && reviewId > 0) {
      const candidate: PendingSlipReviewTarget = {
        kind: "wallet",
        id: reviewId,
        href: `/admin/wallet/${reviewId}`,
        isCreditPayment: String(r.wusercredit ?? "").trim() === "1",
      };
      out.set(n, preferReviewTarget(out.get(n), candidate));
    }
  }

  for (const invoice of friSets) {
    const invoiceId = Number(invoice.invoiceId);
    for (const forwarderId of invoice.forwarderIds) {
      const n = Number(forwarderId);
      if (Number.isInteger(n) && n > 0 && Number.isInteger(invoiceId) && invoiceId > 0) {
        const candidate: PendingSlipReviewTarget = {
          kind: "billing-run",
          id: invoiceId,
          href: `/admin/billing-run/${invoiceId}`,
          // The caller still has the forwarder's live fcredit flag and combines
          // it with this target.  The invoice queue does not currently expose a
          // frozen credit/cash discriminator in loadPendingFriForwarderSets.
          isCreditPayment: false,
        };
        out.set(n, preferReviewTarget(out.get(n), candidate));
      }
    }
  }

  // ขอบเขตของผู้เรียก: ถ้าส่ง forwarderIds มา ต้องไม่คืนอะไรนอกลิสต์
  // (ทาง B กรองที่ query แล้ว · กันไว้อีกชั้นเผื่อ query ตกเงื่อนไข)
  if (ids) {
    const allow = new Set(ids);
    for (const n of [...out.keys()]) if (!allow.has(n)) out.delete(n);
  }
  return out;
}

/**
 * **ฝั่งแอดมิน** — คืน fid ทั้งระบบที่ "แนบสลิปแล้ว รอบัญชีตรวจ" (ทั้ง 2 ทาง).
 * ใช้ตัดสินสถานะ 5.1 บนหน้ารายการฝากนำเข้า + หัวแถวสถานะบนโปรไฟล์ลูกค้า.
 * ส่ง `forwarderIds` มาได้เพื่อจำกัดขอบเขต (โปรไฟล์ลูกค้ารายเดียว).
 */
export async function resolvePendingSlipFidsAll(
  admin: SupabaseClient,
  forwarderIds?: number[],
): Promise<Set<number>> {
  if (forwarderIds && forwarderIds.length === 0) return new Set();
  try {
    const targets = await queryPendingSlipReviewTargets(admin, { forwarderIds });
    return new Set(targets.keys());
  } catch (e) {
    console.error("[pending-slip] resolvePendingSlipFidsAll unexpected", { error: String(e) });
    return new Set();
  }
}

/**
 * Admin queue linkage for derived status 5.1. Besides deciding the state, this
 * returns the exact accounting review route so staff never have to search for
 * the same slip again from the forwarder list.
 */
export async function resolvePendingSlipReviewTargetsAll(
  admin: SupabaseClient,
  forwarderIds?: number[],
): Promise<Map<number, PendingSlipReviewTarget>> {
  if (forwarderIds && forwarderIds.length === 0) return new Map();
  try {
    return await queryPendingSlipReviewTargets(admin, { forwarderIds });
  } catch (e) {
    console.error("[pending-slip] resolvePendingSlipReviewTargetsAll unexpected", {
      error: String(e),
    });
    return new Map();
  }
}

/**
 * Returns the SUBSET of `forwarderIds` that currently have a pending
 * (status='1') import payment slip in `tb_wallet_hs`, as a Set of numeric ids.
 *
 * `admin` must be a service-role client (tb_wallet_hs is RLS-locked). `userId`
 * is the customer's member_code (PR<n>) — the same `userid` the slip rows carry,
 * so a customer can never see another customer's pending state.
 *
 * On any query error this returns an EMPTY set (fail-soft): a missing badge is
 * strictly better than a thrown render on a supplementary signal (§0c — the
 * caller still logs the error).
 */
export async function resolvePendingSlipForwarderIds(
  admin: SupabaseClient,
  userId: string,
  forwarderIds: number[],
): Promise<Set<number>> {
  const ids = forwarderIds.filter((id) => Number.isFinite(id));
  if (!userId || ids.length === 0) return new Set();

  // owner 2026-07-31 — เดินผ่าน core ตัวเดียวกับฝั่งแอดมิน (ครอบทั้ง 2 ทาง:
  // ลูกค้าจ่ายเอง + พนักงานแนบสลิปบนใบวางบิล) เพื่อให้ "หน้าบ้าน = หลังบ้าน"
  // เห็นสถานะเดียวกันเป๊ะ. userId ยังคงกันไม่ให้ข้ามลูกค้าในทาง (A) และ ids
  // กันขอบเขตอีกชั้นในทาง (B).
  try {
    const targets = await queryPendingSlipReviewTargets(admin, { userId, forwarderIds: ids });
    return new Set(targets.keys());
  } catch (e) {
    console.error("[pending-slip] resolvePendingSlipForwarderIds unexpected", {
      error: String(e),
      userid: userId,
    });
    return new Set();
  }
}

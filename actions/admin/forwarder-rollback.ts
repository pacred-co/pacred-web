"use server";

/**
 * ถอยสถานะ ฝากนำเข้า — ULTRA-ONLY rollback WITH a full downstream unwind
 * (owner 2026-07-17).
 *
 * Owner, verbatim: "ทำให้สามารถถอยสถานะได้ตั้งแต่ตรงนี้เลย · ทำได้เฉพาะ ultra เท่านั้น ·
 * ที่เหลือตามเดิม · พอถอย สถานะเอกสาร สถานะงานก็ต้องถอยตามกลับมาหมด · ทั้ง เอกสารที่
 * ออกไปก็ต้องไปให้เลย · ถ้าถอยสถานะที่ออกเอกสารไปแล้ว ก็ยกเลิกไปให้ด้วยเลย เพราะจะต้อง
 * ทำใหม่ เพราะมีแก้ไขข้อมูล · ถอยสถานะแล้ว จะเดินสถานะไปต่อ ต่อจากนี้ก็ต้องทำแค่ตาม
 * process เท่านั้น".
 *
 * WHAT THIS IS (and what it is NOT)
 * ─────────────────────────────────
 * The สถานะใหม่ dropdown on /admin/forwarders/[fNo] moves FORWARD only
 * (`adminBulkUpdateForwarderTbStatus` · its G5 matrix · `assertNotRefunded`,
 * which by DESIGN refuses demoting a paid row back into a collectible state).
 * `revertForwarderStep` gives a one-step-back but is STATUS-ONLY and refuses a
 * paid row — a bare flip would desync the docs/AR from the status.
 *
 * This action is the ONE path that may move a PAID row backwards — because it
 * unwinds the money + documents FIRST, through the EXISTING audited reverse
 * actions, and only then writes the status. It re-implements no money math:
 *
 *   removeOpenDriverStops        (lib/admin/revert-driver-cleanup.ts)
 *   adminReverseForwarderPayment (actions/admin/pay-user.ts    — un-settle + refund WALLET only)
 *   adminReverseBillingRunPaid   (actions/admin/billing-run.ts — paid→issued + restore credit)
 *   cancelBillingRunInvoice      (actions/admin/billing-run.ts — issued→cancelled)
 *
 * Everything else keeps today's behaviour ("ที่เหลือตามเดิม"): the forward
 * dropdown, revertForwarderStep, the 99/credit branches, and every non-ultra
 * staffer's flow are UNTOUCHED.
 *
 * 💰 MONEY-SAFETY
 *   - ULTRA-ONLY, server-enforced: `roles.includes("ultra")` EXACTLY — mirroring
 *     adminBulkUpdateForwarderTbStatus's manual-source gate. super/normies are
 *     GOD-NAV but are NOT ultra → blocked here too. The UI gate is cosmetic.
 *   - REFUSE, never guess (see lib/admin/forwarder-rollback-plan.ts): a shared
 *     bill/receipt, a combined เติม-แล้วจ่าย slip, a driver en route, a delivered
 *     (fstatus 7) row → refused with a Thai reason pointing at the surface that
 *     owns the unwind. Cancelling a shared bill from a single-order dropdown
 *     would silently revert OTHER customers' orders ("งานหาย").
 *   - FAIL-CLOSED fact gathering: a read we can't complete aborts BEFORE any
 *     write — an unreadable bill must never mean "no bill to cancel".
 *   - ABORT-ON-STEP-FAILURE: if any unwind step fails we stop and report. The
 *     status flip is LAST, so a partial unwind never leaves the row claiming a
 *     status its documents contradict.
 *   - ATOMIC CLAIM on every flip: the expected value is folded into the UPDATE's
 *     WHERE and 0 rows aborts. The final flip re-reads the LIVE fstatus first,
 *     because the reverse steps legitimately move the row to '5' themselves.
 *   - Touches NO price column (ftotalprice / frefrate / fdiscount / …).
 *
 * The linked ฝากสั่งซื้อ needs no work here: the mig-0235 DB trigger on
 * tb_forwarder(fstatus, fcabinetnumber) re-derives the shop status as a pure
 * function of arrivals (and never re-opens a 5/6 shop order), so it follows the
 * rollback automatically.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { FSTATUS_CFG } from "@/lib/admin/forwarder-status";
import { assertNoDriverEnRoute, removeOpenDriverStops } from "@/lib/admin/revert-driver-cleanup";
import { adminReverseForwarderPayment } from "./pay-user";
import { adminReverseBillingRunPaid, cancelBillingRunInvoice } from "./billing-run";
import { appendStatusLog } from "@/lib/notifications/status-flip-helper";
import {
  planForwarderRollback,
  type RollbackFacts,
  type RollbackRefusal,
  type RollbackStep,
} from "@/lib/admin/forwarder-rollback-plan";

// ── Local resolveLegacyAdminId — same pattern as forwarder-step.ts /
// forwarders-field-edits.ts (a known consolidation TODO across the forwarder
// actions; kept local to avoid exporting a non-action from a "use server" file).
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error(`[forwarder-rollback.resolveLegacyAdminId] failed`, { code: error.code, message: error.message });
  }
  const email = user?.email ?? null;
  if (!email) return "system";
  const admin = createAdminClient();
  const { data, error: aErr } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (aErr) {
    console.error(`[forwarder-rollback tb_admin lookup] failed`, { code: aErr.code, message: aErr.message });
  }
  return data?.adminID ?? email.slice(0, 10);
}

function labelOf(fstatus: string): string {
  return FSTATUS_CFG[fstatus as keyof typeof FSTATUS_CFG]?.label ?? fstatus;
}

function rank(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isInteger(n) ? n : NaN;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Thai message per refusal — each names the surface that OWNS the unwind, so
 *  the ultra is routed, not just blocked. */
function refusalMessage(r: RollbackRefusal, fNo: string): string {
  switch (r) {
    case "not_a_change":
      return "ไม่มีการเปลี่ยนแปลง — เลือกสถานะใหม่ก่อน";
    case "not_a_rollback":
      return "สถานะที่เลือกเป็นการเดินหน้า ไม่ใช่การถอย — ใช้การบันทึกสถานะตามปกติ";
    case "out_of_scope_status":
      return "สถานะนี้ไม่รองรับการถอย (สถานะพิเศษ/เครดิต) — ใช้ฟอร์มเฉพาะของสถานะนั้น";
    case "shipped_irreversible":
      return `ออเดอร์ #${fNo} ส่งของถึงลูกค้าแล้ว (ส่งแล้ว) — ถอยสถานะไม่ได้ เพราะของอยู่กับลูกค้าแล้ว`;
    case "driver_en_route":
      return `ออเดอร์ #${fNo} คนขับออกรถไปแล้ว — เอาออกจากรอบคนขับก่อน แล้วค่อยถอยสถานะ`;
    case "combined_slip":
      return `ออเดอร์ #${fNo} ชำระแบบรวมสลิป (เติม-แล้วจ่าย) — ต้องให้บัญชีย้อนทั้งชุดที่หน้าตรวจสลิป ไม่สามารถถอยทีละออเดอร์ได้`;
    case "bill_shared":
      return `ใบวางบิลของออเดอร์ #${fNo} ครอบหลายออเดอร์ — ถอย/ยกเลิกที่หน้าใบวางบิลก่อน (กันออเดอร์ของลูกค้ารายอื่นถอยตามไปด้วย)`;
    case "receipt_shared":
      return `ใบเสร็จของออเดอร์ #${fNo} ออกร่วมกับออเดอร์อื่น — ยกเลิกใบเสร็จที่หน้าใบเสร็จก่อน (กันออเดอร์อื่นเสียเอกสาร)`;
    default:
      return "ถอยสถานะไม่ได้";
  }
}

// ── Facts + display detail ──────────────────────────────────────────────

type BillRow = { id: number; doc_no: string; status: string };

type RollbackContext = {
  facts: RollbackFacts;
  fidorco: string | null;
  /** covering bills that are still live (issued/paid) */
  bills: BillRow[];
  /** active (non-cancelled) receipts covering this order */
  receipts: Array<{ id: number; rid: string }>;
  /** the settled pay's amount + whether the wallet gets it back */
  paymentAmount: number;
  paymentIsWalletFunded: boolean;
  /** the outstanding credit hold (from the mark_credit audit) — 0 = unknown */
  creditAmount: number;
  openDriverStops: number;
};

/**
 * Gather everything the plan needs. FAIL-CLOSED: every read destructures its
 * error and aborts — an unreadable bill must never be read as "no bill".
 * (The driver EN-ROUTE probe reuses `assertNoDriverEnRoute`, which fails-OPEN
 * by design; that is the same semantics the two existing reverse actions use,
 * kept identical on purpose.)
 */
async function gatherRollbackContext(
  admin: ReturnType<typeof createAdminClient>,
  fid: number,
  to: string,
): Promise<{ ok: true; ctx: RollbackContext } | { ok: false; error: string }> {
  // 1. the order itself
  const { data: fwd, error: fErr } = await admin
    .from("tb_forwarder")
    .select("id, fstatus, fcredit, userid, fidorco")
    .eq("id", fid)
    .maybeSingle<{ id: number; fstatus: string | null; fcredit: string | null; userid: string | null; fidorco: string | null }>();
  if (fErr) {
    console.error(`[forwarder-rollback tb_forwarder read] failed`, { code: fErr.code, message: fErr.message, fid });
    return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fErr.message}` };
  }
  if (!fwd) return { ok: false, error: `ไม่พบออเดอร์ฝากนำเข้า #${fid}` };

  const from = String(fwd.fstatus ?? "").trim();
  const isCredit = String(fwd.fcredit ?? "").trim() === "1";

  // 2. driver — en route (refusal) + not-yet-dispatched stops (cleanup/preview)
  const enRoute = await assertNoDriverEnRoute(admin, [fid]);
  const { data: openStops, error: stopErr } = await admin
    .from("tb_forwarder_driver_item")
    .select("id")
    .eq("fid", fid)
    .or("fdistatus.eq.,fdistatus.is.null");
  if (stopErr) {
    console.error(`[forwarder-rollback driver stops read] failed`, { code: stopErr.code, message: stopErr.message, fid });
    return { ok: false, error: `ตรวจสอบรอบคนขับไม่สำเร็จ: ${stopErr.message}` };
  }

  // 3. settled payment (+ the combined-slip shape)
  const { data: payRows, error: pErr } = await admin
    .from("tb_wallet_hs")
    .select("id, amount, depositnamebank, reforder2")
    .eq("reforder", String(fid))
    .eq("typeservice", "2")
    .in("typenew", ["5", "6"])
    .eq("status", "2")
    .order("id", { ascending: false })
    .limit(1);
  if (pErr) {
    console.error(`[forwarder-rollback tb_wallet_hs read] failed`, { code: pErr.code, message: pErr.message, fid });
    return { ok: false, error: `ตรวจสอบการชำระเงินไม่สำเร็จ: ${pErr.message}` };
  }
  const pay = (payRows ?? [])[0] as
    | { id: number; amount: number | string | null; depositnamebank: string | null; reforder2: string | null }
    | undefined;

  let hasCombinedSlip = false;
  if (pay) {
    hasCombinedSlip = (pay.reforder2 ?? "").trim() !== "";
    if (!hasCombinedSlip) {
      const { data: link, error: linkErr } = await admin
        .from("tb_wallet_paydeposit")
        .select("id")
        .eq("hno", String(fid))
        .limit(1)
        .maybeSingle<{ id: number }>();
      if (linkErr) {
        console.error(`[forwarder-rollback paydeposit link probe] failed`, { code: linkErr.code, message: linkErr.message, fid });
        return { ok: false, error: `ตรวจสอบสลิปรวมไม่สำเร็จ: ${linkErr.message}` };
      }
      hasCombinedSlip = link != null;
    }
  }

  // 4. covering bills (issued/paid) + the shared-with-other-orders check
  const { data: myBillItems, error: biErr } = await admin
    .from("tb_forwarder_invoice_item")
    .select("invoice_id")
    .eq("forwarder_id", fid);
  if (biErr) {
    console.error(`[forwarder-rollback invoice items read] failed`, { code: biErr.code, message: biErr.message, fid });
    return { ok: false, error: `ตรวจสอบใบวางบิลไม่สำเร็จ: ${biErr.message}` };
  }
  const invoiceIds = Array.from(
    new Set(((myBillItems ?? []) as Array<{ invoice_id: number | null }>)
      .map((r) => r.invoice_id)
      .filter((n): n is number => typeof n === "number")),
  );

  let bills: BillRow[] = [];
  let isBillShared = false;
  if (invoiceIds.length > 0) {
    const { data: invs, error: invErr } = await admin
      .from("tb_forwarder_invoice")
      .select("id, doc_no, status")
      .in("id", invoiceIds)
      .in("status", ["issued", "paid"]);
    if (invErr) {
      console.error(`[forwarder-rollback invoices read] failed`, { code: invErr.code, message: invErr.message, fid });
      return { ok: false, error: `อ่านใบวางบิลไม่สำเร็จ: ${invErr.message}` };
    }
    bills = (invs ?? []) as BillRow[];
    if (bills.length > 0) {
      const liveIds = bills.map((b) => b.id);
      const { data: allItems, error: aiErr } = await admin
        .from("tb_forwarder_invoice_item")
        .select("invoice_id, forwarder_id")
        .in("invoice_id", liveIds);
      if (aiErr) {
        console.error(`[forwarder-rollback invoice coverage read] failed`, { code: aiErr.code, message: aiErr.message, fid });
        return { ok: false, error: `ตรวจสอบขอบเขตใบวางบิลไม่สำเร็จ: ${aiErr.message}` };
      }
      isBillShared = ((allItems ?? []) as Array<{ forwarder_id: number | null }>)
        .some((r) => typeof r.forwarder_id === "number" && r.forwarder_id !== fid);
    }
  }

  // 5. active receipts + the shared check
  const { data: myRcptItems, error: riErr } = await admin
    .from("tb_receipt_item")
    .select("rid")
    .eq("fid", fid);
  if (riErr) {
    console.error(`[forwarder-rollback receipt items read] failed`, { code: riErr.code, message: riErr.message, fid });
    return { ok: false, error: `ตรวจสอบใบเสร็จไม่สำเร็จ: ${riErr.message}` };
  }
  const rids = Array.from(
    new Set(((myRcptItems ?? []) as Array<{ rid: string | null }>)
      .map((r) => r.rid)
      .filter((x): x is string => !!x && x.trim() !== "")),
  );

  let receipts: Array<{ id: number; rid: string }> = [];
  let isReceiptShared = false;
  if (rids.length > 0) {
    const { data: recs, error: recErr } = await admin
      .from("tb_receipt")
      .select("id, rid")
      .in("rid", rids)
      .neq("rstatus", "2"); // '2' = ยกเลิก — an already-cancelled receipt does not count
    if (recErr) {
      console.error(`[forwarder-rollback receipts read] failed`, { code: recErr.code, message: recErr.message, fid });
      return { ok: false, error: `อ่านใบเสร็จไม่สำเร็จ: ${recErr.message}` };
    }
    receipts = (recs ?? []) as Array<{ id: number; rid: string }>;
    if (receipts.length > 0) {
      const liveRids = receipts.map((r) => r.rid);
      const { data: allRi, error: allRiErr } = await admin
        .from("tb_receipt_item")
        .select("rid, fid")
        .in("rid", liveRids);
      if (allRiErr) {
        console.error(`[forwarder-rollback receipt coverage read] failed`, { code: allRiErr.code, message: allRiErr.message, fid });
        return { ok: false, error: `ตรวจสอบขอบเขตใบเสร็จไม่สำเร็จ: ${allRiErr.message}` };
      }
      isReceiptShared = ((allRi ?? []) as Array<{ fid: number | null }>)
        .some((r) => typeof r.fid === "number" && r.fid !== fid);
    }
  }

  // 6. the credit hold amount — from the grant's own audit row (the same
  //    "read what the settle logged" approach adminReverseBillingRunPaid uses).
  //    Missing → 0 = UNKNOWN; the release then refuses to guess a decrement.
  let creditAmount = 0;
  if (isCredit) {
    const { data: logRows, error: logErr } = await admin
      .from("admin_audit_log")
      .select("payload")
      .eq("action", "tb_forwarder.mark_credit")
      .eq("target_id", String(fid))
      .order("created_at", { ascending: false })
      .limit(1);
    if (logErr) {
      console.error(`[forwarder-rollback credit audit read] failed`, { code: logErr.code, message: logErr.message, fid });
    } else {
      const payload = (logRows ?? [])[0]?.payload as { priceCredited?: number } | null;
      creditAmount = num(payload?.priceCredited);
    }
  }

  const facts: RollbackFacts = {
    from,
    to,
    isCredit,
    hasSettledPayment: pay != null,
    hasCombinedSlip,
    hasPaidBill: bills.some((b) => b.status === "paid"),
    hasIssuedBill: bills.some((b) => b.status === "issued"),
    isBillShared,
    hasActiveReceipt: receipts.length > 0,
    isReceiptShared,
    hasOpenDriverStop: (openStops ?? []).length > 0,
    hasDriverEnRoute: !enRoute.ok,
  };

  return {
    ok: true,
    ctx: {
      facts,
      fidorco: fwd.fidorco,
      bills,
      receipts,
      paymentAmount: pay ? Math.round(num(pay.amount) * 100) / 100 : 0,
      paymentIsWalletFunded: (pay?.depositnamebank ?? "").trim().toUpperCase() === "WALLET",
      creditAmount,
      openDriverStops: (openStops ?? []).length,
    },
  };
}

// ── PREVIEW — what the confirm dialog enumerates (READ-ONLY) ─────────────

const previewSchema = z.object({
  fid: z.number().int().positive(),
  to: z.string().trim().min(1).max(2),
});

export type RollbackPreview = {
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  steps: RollbackStep[];
  /** ใบวางบิล ที่จะถูกยกเลิก (doc_no) */
  billDocNos: string[];
  /** ใบเสร็จ ที่จะถูกยกเลิก (rid) */
  receiptRids: string[];
  /** ยอดที่จะย้อนการชำระ (0 = ไม่มี) */
  paymentAmount: number;
  /** true = คืนเข้ากระเป๋าลูกค้า · false = จ่ายเข้าธนาคาร (ไม่คืนกระเป๋า) */
  paymentIsWalletFunded: boolean;
  /** ยอดเครดิตที่จะปลด (0 = ไม่มี/ยังไม่ทราบ) */
  creditAmount: number;
  /** จำนวนจุดส่งของคนขับที่จะถูกถอดออกจากรอบ */
  openDriverStops: number;
};

/**
 * READ-ONLY — resolve the plan + the human detail so the client can enumerate
 * "จะยกเลิกใบวางบิล FRI… · ใบเสร็จ FRG… · คืนเครดิต ฿X · ยกเลิกรอบคนขับ" in the
 * confirm (AGENTS.md §0f: never a bare "ยืนยัน?"). Writes NOTHING. Ultra-only —
 * the preview reveals money detail, so it is gated like the mutation.
 */
export async function previewForwarderRollback(
  rawInput: z.infer<typeof previewSchema>,
): Promise<AdminActionResult<RollbackPreview>> {
  const parsed = previewSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { fid, to } = parsed.data;

  return withAdmin<RollbackPreview>(["super", "accounting", "ops", "warehouse"], async ({ roles }) => {
    if (!roles.includes("ultra")) {
      return { ok: false, error: "เฉพาะ Ultra Admin Z เท่านั้นที่ถอยสถานะได้ (สิทธิ์ไม่พอ)" };
    }
    const admin = createAdminClient();
    const got = await gatherRollbackContext(admin, fid, to);
    if (!got.ok) return { ok: false, error: got.error };
    const { ctx } = got;
    const fNo = ctx.fidorco ?? String(fid);

    const plan = planForwarderRollback(ctx.facts);
    if (!plan.ok) return { ok: false, error: refusalMessage(plan.refusal, fNo) };

    return {
      ok: true,
      data: {
        from: plan.from,
        to: plan.to,
        fromLabel: labelOf(plan.from),
        toLabel: labelOf(plan.to),
        steps: plan.steps,
        billDocNos: ctx.bills.map((b) => b.doc_no),
        receiptRids: ctx.receipts.map((r) => r.rid),
        paymentAmount: plan.steps.includes("reverse_payment") ? ctx.paymentAmount : 0,
        paymentIsWalletFunded: ctx.paymentIsWalletFunded,
        creditAmount: plan.steps.includes("release_credit") ? ctx.creditAmount : 0,
        openDriverStops: plan.steps.includes("driver_cleanup") ? ctx.openDriverStops : 0,
      },
    };
  });
}

// ── THE ROLLBACK ────────────────────────────────────────────────────────

const rollbackSchema = z.object({
  fid: z.number().int().positive(),
  to: z.string().trim().min(1).max(2),
  reason: z.string().trim().min(3, "กรุณาระบุเหตุผล (อย่างน้อย 3 ตัวอักษร)").max(500),
});
export type ForwarderRollbackInput = z.infer<typeof rollbackSchema>;

export type ForwarderRollbackResult = {
  fid: number;
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  steps: RollbackStep[];
  /** ใบวางบิล ที่ยกเลิกจริง */
  cancelledBills: string[];
  /** ใบเสร็จ ที่ยกเลิกจริง */
  voidedReceipts: string[];
  /** ยอดที่ย้อนการชำระจริง (คืนกระเป๋าเมื่อ shape=wallet-funded) */
  reversedPayment: number;
  /** ยอดเครดิตที่ปลดจริง */
  releasedCredit: number;
  /** จุดส่งของคนขับที่ถอดออก */
  removedDriverStops: number;
  /** true = สถานะถูกเขียนโดยขั้นตอนนี้ · false = ขั้นตอนย้อนพาไปถึงปลายทางแล้ว */
  statusFlipped: boolean;
  /** เรื่องที่ต้องให้คนตามต่อ (ไม่ได้ทำให้อัตโนมัติ เพราะไม่ปลอดภัยที่จะเดา) */
  warnings: string[];
};

export async function adminRollbackForwarderStatus(
  rawInput: ForwarderRollbackInput,
): Promise<AdminActionResult<ForwarderRollbackResult>> {
  const parsed = rollbackSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { fid, to, reason } = parsed.data;

  // The page-level union mirrors adminBulkUpdateForwarderTbStatus's; the
  // `ultra` re-assert below is the REAL gate (super/normies are god-nav but
  // are NOT ultra → blocked, exactly like the manual forward move).
  return withAdmin<ForwarderRollbackResult>(
    ["ops", "super", "manager", "warehouse", "accounting"],
    async ({ adminId, roles }) => {
      if (!roles.includes("ultra")) {
        return { ok: false, error: "เฉพาะ Ultra Admin Z เท่านั้นที่ถอยสถานะได้ (สิทธิ์ไม่พอ)" };
      }
      const admin = createAdminClient();
      const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

      // 1. FACTS (fail-closed) → PLAN (pure).
      const got = await gatherRollbackContext(admin, fid, to);
      if (!got.ok) return { ok: false, error: got.error };
      const { ctx } = got;
      const fNo = ctx.fidorco ?? String(fid);
      const from = ctx.facts.from;

      const plan = planForwarderRollback(ctx.facts);
      if (!plan.ok) return { ok: false, error: refusalMessage(plan.refusal, fNo) };

      // Log the INTENT before touching anything — so a mid-way failure still
      // leaves a trail of what was attempted, on which artefacts.
      await logAdminAction(adminId, "tb_forwarder.rollback_status", "tb_forwarder", String(fid), {
        from, to: plan.to, fromLabel: labelOf(from), toLabel: labelOf(plan.to), reason,
        steps: plan.steps,
        bills: ctx.bills.map((b) => ({ id: b.id, doc_no: b.doc_no, status: b.status })),
        receipts: ctx.receipts.map((r) => r.rid),
        payment_amount: ctx.paymentAmount,
        credit_amount: ctx.creditAmount,
        open_driver_stops: ctx.openDriverStops,
      });

      const cancelledBills: string[] = [];
      const voidedReceipts: string[] = [];
      const warnings: string[] = [];
      let reversedPayment = 0;
      let releasedCredit = 0;
      let removedDriverStops = 0;

      // 2. EXECUTE the plan in order. ABORT on the first failure — a partial
      //    unwind is fine (every step is individually money-safe + audited);
      //    a WRONG status on top of a half-unwound order is not, and the flip
      //    is last precisely so that can't happen.
      for (const step of plan.steps) {
        switch (step) {
          case "driver_cleanup": {
            const res = await removeOpenDriverStops(admin, [fid]);
            removedDriverStops = res.removed;
            break;
          }

          case "reverse_payment": {
            const res = await adminReverseForwarderPayment({
              fid: String(fid),
              reason: `ถอยสถานะ #${fNo} ${labelOf(from)} → ${labelOf(plan.to)}: ${reason}`,
            });
            if (!res.ok) {
              return { ok: false, error: `ย้อนการชำระเงินไม่สำเร็จ (ยังไม่ได้ถอยสถานะ): ${res.error}` };
            }
            reversedPayment = res.data?.refunded ?? 0;
            if (res.data?.receiptVoided) voidedReceipts.push(res.data.receiptVoided);
            break;
          }

          case "reverse_bill_paid": {
            for (const bill of ctx.bills.filter((b) => b.status === "paid")) {
              const res = await adminReverseBillingRunPaid({
                invoiceId: bill.id,
                reason: `ถอยสถานะ #${fNo}: ${reason}`,
              });
              if (!res.ok) {
                return { ok: false, error: `ย้อนการรับชำระใบวางบิล ${bill.doc_no} ไม่สำเร็จ (ยังไม่ได้ถอยสถานะ): ${res.error}` };
              }
              if (res.data?.receiptVoided) voidedReceipts.push(res.data.receiptVoided);
            }
            break;
          }

          case "cancel_bill": {
            // owner: "ถ้าถอยสถานะที่ออกเอกสารไปแล้ว ก็ยกเลิกไปให้ด้วยเลย เพราะจะต้อง
            // ทำใหม่ เพราะมีแก้ไขข้อมูล" — the reverse above turned any paid bill
            // back to 'issued', so every covering bill is cancellable now.
            for (const bill of ctx.bills) {
              const res = await cancelBillingRunInvoice({
                invoiceId: bill.id,
                cancelReason: `ถอยสถานะ #${fNo} ${labelOf(from)} → ${labelOf(plan.to)}: ${reason}`,
              });
              if (!res.ok) {
                return { ok: false, error: `ยกเลิกใบวางบิล ${bill.doc_no} ไม่สำเร็จ (ยังไม่ได้ถอยสถานะ): ${res.error}` };
              }
              cancelledBills.push(bill.doc_no);
            }
            break;
          }

          case "void_receipt": {
            // Mop-up: the two reverses above void their OWN fully-covered receipt,
            // so this usually finds nothing left. The `.in(rstatus,['1','3'])`
            // claim makes an already-voided receipt a 0-row no-op (never a
            // double-void), and the plan already refused a SHARED receipt.
            for (const rec of ctx.receipts) {
              if (voidedReceipts.includes(rec.rid)) continue;
              const { data: voided, error: vErr } = await admin
                .from("tb_receipt")
                .update({ rstatus: "2" })
                .eq("id", rec.id)
                .in("rstatus", ["1", "3"])
                .select("id");
              if (vErr) {
                console.error(`[forwarder-rollback receipt void] failed`, { code: vErr.code, message: vErr.message, fid, rid: rec.rid });
                return { ok: false, error: `ยกเลิกใบเสร็จ ${rec.rid} ไม่สำเร็จ (ยังไม่ได้ถอยสถานะ): ${vErr.message}` };
              }
              if ((voided ?? []).length > 0) {
                voidedReceipts.push(rec.rid);
                await logAdminAction(adminId, "receipt.void", "tb_receipt", String(rec.id), {
                  rid: rec.rid, reason: `ถอยสถานะฝากนำเข้า #${fNo}: ${reason}`,
                });
              }
            }
            break;
          }

          case "release_credit": {
            // Re-READ: reverse_bill_paid can RESTORE fcredit='1' (billing-run.ts
            // step 2), so the live value — not the plan-time fact — decides.
            const { data: cur, error: cErr } = await admin
              .from("tb_forwarder")
              .select("fcredit, userid")
              .eq("id", fid)
              .maybeSingle<{ fcredit: string | null; userid: string | null }>();
            if (cErr) {
              console.error(`[forwarder-rollback credit re-read] failed`, { code: cErr.code, message: cErr.message, fid });
              return { ok: false, error: `ตรวจสอบเครดิตไม่สำเร็จ (ยังไม่ได้ถอยสถานะ): ${cErr.message}` };
            }
            if (String(cur?.fcredit ?? "").trim() !== "1") break; // nothing held → no-op

            const userid = String(cur?.userid ?? "").trim();
            // ATOMIC CLAIM — 0 rows = someone released it first → never decrement twice.
            const { data: claimed, error: relErr } = await admin
              .from("tb_forwarder")
              .update({ fcredit: "", fcreditdate: null, paydeposit: "", adminidupdate: legacyAdminId })
              .eq("id", fid)
              .eq("fcredit", "1")
              .select("id");
            if (relErr) {
              console.error(`[forwarder-rollback credit release] failed`, { code: relErr.code, message: relErr.message, fid });
              return { ok: false, error: `ปลดเครดิตไม่สำเร็จ (ยังไม่ได้ถอยสถานะ): ${relErr.message}` };
            }
            if ((claimed ?? []).length === 0) break; // lost the race → already released

            // Give the credit line its headroom back. The amount comes from the
            // GRANT's own audit row (mirrors adminReverseBillingRunPaid step 2).
            // UNKNOWN amount → do NOT guess: leaving the debt overstates AR
            // (conservative), while a wrong decrement over-extends real credit.
            if (ctx.creditAmount > 0 && userid) {
              const { data: creditRow, error: crErr } = await admin
                .from("tb_credit")
                .select("creditvalue")
                .eq("userid", userid)
                .maybeSingle<{ creditvalue: number | string | null }>();
              if (crErr) {
                console.error(`[forwarder-rollback tb_credit read] failed`, { code: crErr.code, message: crErr.message, userid });
                warnings.push(`ปลดเครดิตออเดอร์แล้ว แต่ลดยอดค้างเครดิตของลูกค้าไม่สำเร็จ — บัญชีต้องตรวจยอดเครดิตด้วยมือ`);
              } else if (creditRow) {
                const next = Math.max(0, Math.round((num(creditRow.creditvalue) - ctx.creditAmount) * 100) / 100);
                const { error: crUpdErr } = await admin
                  .from("tb_credit").update({ creditvalue: next }).eq("userid", userid);
                if (crUpdErr) {
                  console.error(`[forwarder-rollback tb_credit decrement] failed`, { code: crUpdErr.code, message: crUpdErr.message, userid });
                  warnings.push(`ปลดเครดิตออเดอร์แล้ว แต่ลดยอดค้างเครดิตของลูกค้าไม่สำเร็จ — บัญชีต้องตรวจยอดเครดิตด้วยมือ`);
                } else {
                  releasedCredit = ctx.creditAmount;
                  await logAdminAction(adminId, "tb_forwarder.credit_released", "tb_forwarder", String(fid), {
                    userid, released: ctx.creditAmount, outstanding_before: num(creditRow.creditvalue), outstanding_after: next, reason,
                  });
                }
              }
            } else {
              warnings.push(
                `ปลดเครดิตออเดอร์ #${fNo} แล้ว แต่ไม่ทราบยอดที่เคยตัดเครดิตไว้ (ไม่พบประวัติการให้เครดิต) — บัญชีต้องปรับยอดค้างเครดิตของลูกค้าด้วยมือ`,
              );
            }
            break;
          }

          case "flip_status": {
            // The reverse steps legitimately move the row themselves (both land
            // it at '5'), so claim on the LIVE value, not on the plan-time `from`.
            const { data: live, error: lErr } = await admin
              .from("tb_forwarder")
              .select("fstatus")
              .eq("id", fid)
              .maybeSingle<{ fstatus: string | null }>();
            if (lErr) {
              console.error(`[forwarder-rollback live fstatus re-read] failed`, { code: lErr.code, message: lErr.message, fid });
              return { ok: false, error: `อ่านสถานะปัจจุบันไม่สำเร็จ: ${lErr.message}` };
            }
            const liveStatus = String(live?.fstatus ?? "").trim();

            if (liveStatus === plan.to) break; // the unwind already landed it — no flip needed
            if (rank(liveStatus) > rank(from)) {
              return { ok: false, error: "สถานะเปลี่ยนไปแล้วระหว่างทำรายการ (มีคนเดินสถานะพร้อมกัน) — โหลดหน้าใหม่แล้วตรวจสอบเอกสารอีกครั้ง" };
            }
            if (rank(liveStatus) < rank(plan.to)) {
              return { ok: false, error: `สถานะปัจจุบัน (${labelOf(liveStatus)}) ต่ำกว่าปลายทางที่เลือกแล้ว — ไม่ถอยต่อ (เดินสถานะไปข้างหน้าตาม process แทน)` };
            }

            const nowIso = new Date().toISOString();
            const update: Record<string, unknown> = {
              fstatus:          plan.to,
              fdateadminstatus: nowIso,
              adminidupdate:    legacyAdminId,
            };
            // Every stage above `to` is no longer occupied → drop its stamp so the
            // date-driven customer timeline (actions/track.ts hasRealStamp) stops
            // claiming a step that was undone.
            for (const col of plan.clearDateCols) update[col] = null;

            const { data: flipped, error: uErr } = await admin
              .from("tb_forwarder")
              .update(update)
              .eq("id", fid)
              .eq("fstatus", liveStatus) // ATOMIC CLAIM
              .select("id");
            if (uErr) {
              console.error(`[forwarder-rollback flip] failed`, { code: uErr.code, message: uErr.message, fid });
              return { ok: false, error: `ถอยสถานะไม่สำเร็จ: ${uErr.message}` };
            }
            if ((flipped ?? []).length === 0) {
              return { ok: false, error: "สถานะเปลี่ยนไปแล้วระหว่างทำรายการ (มีคนแก้พร้อมกัน) — โหลดหน้าใหม่แล้วลองอีกครั้ง" };
            }
            await appendStatusLog(admin, fid, liveStatus, plan.to, legacyAdminId);
            break;
          }
        }
      }

      // 3. Report what ACTUALLY happened (not what was planned).
      const { data: after, error: aErr } = await admin
        .from("tb_forwarder")
        .select("fstatus")
        .eq("id", fid)
        .maybeSingle<{ fstatus: string | null }>();
      if (aErr) {
        console.error(`[forwarder-rollback final read] failed`, { code: aErr.code, message: aErr.message, fid });
      }
      const finalStatus = String(after?.fstatus ?? plan.to).trim();

      await logAdminAction(adminId, "tb_forwarder.rollback_status_done", "tb_forwarder", String(fid), {
        from, to: plan.to, final_status: finalStatus, reason,
        cancelled_bills: cancelledBills, voided_receipts: voidedReceipts,
        reversed_payment: reversedPayment, released_credit: releasedCredit,
        removed_driver_stops: removedDriverStops, warnings,
      });

      revalidatePath(`/admin/forwarders/${fid}`);
      revalidatePath("/admin/forwarders");
      revalidatePath("/admin/billing-run");
      revalidatePath("/admin/report-cnt");
      revalidatePath("/admin");

      return {
        ok: true,
        data: {
          fid,
          from,
          to: plan.to,
          fromLabel: labelOf(from),
          toLabel: labelOf(plan.to),
          steps: plan.steps,
          cancelledBills,
          voidedReceipts: Array.from(new Set(voidedReceipts)),
          reversedPayment,
          releasedCredit,
          removedDriverStops,
          statusFlipped: finalStatus === plan.to,
          warnings,
        },
      };
    },
  );
}

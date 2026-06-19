"use server";

/**
 * Reversible forwarder status step — UNIT D (2026-06-19 · owner directive).
 *
 * Owner (forwarder-collect-money-audit-2026-06-19.md §#3):
 *   "ยกเลิก step5 → ถอยไป step4 · ทำ4เสร็จ→5→6 · ยกเลิกได้ · log หลังบ้าน"
 *   — cancel a step → revert one status back; finish 4→5→6; cancellable;
 *   make it easy for staff; keep an audit log.
 *
 * Today `tb_forwarder.fstatus` advances FORWARD-only (the bulk-status action
 * `adminBulkUpdateForwarderTbStatus` + the MOMO propagate path + the credit
 * grant) — there is no "cancel a step → revert" path. This file adds two small,
 * MONEY-SAFE, audit-logged primitives:
 *
 *   - revertForwarderStep({ fid })  — fstatus N → N-1 (one step back)
 *   - advanceForwarderStep({ fid }) — fstatus N → N+1 (one step forward · 4→5→6)
 *
 * Both are STATUS-ONLY (Option B — no money/dispatch/wallet/receipt side-effect):
 * they touch fstatus + fdateadminstatus + adminidupdate + the matching
 * fdatestatusN stamp, nothing else. The pricing / collect / settlement flows
 * stay where they live (pay-user.ts, billing-run.ts, wallet-hs.ts).
 *
 * ─── Why the careful guards (money-safety) ─────────────────────────────────
 * `fstatus` overloads two axes (physical 1-4 · money/dispatch 5-7 · see the
 * juristic+credit-loop save-point). The dangerous case is reverting OUT of a
 * money state (6→5) after money was ALREADY collected — that would desync the
 * receipt/AR (which key off paydeposit / fcredit / the settled tb_wallet_hs)
 * from the status. So revertForwarderStep:
 *   - allows revert only for fstatus ∈ {2,3,4,5,6} → N-1   (never 1→0)
 *   - REFUSES 7→6 always (already shipped — physical irreversible)
 *   - REFUSES 6→5 when the row is already PAID:
 *       (a) paydeposit ∈ {'1','2'}  (the canonical paid marker), OR
 *       (b) fcredit cleared to '' after having been a credit row
 *           (paid-on-credit settled), OR
 *       (c) any SETTLED tb_wallet_hs exists for the row
 *           (type='4' · status='2' · reforder=fid · the settle marker
 *            written by pay-user.ts both branches).
 *     An UNSETTLED credit-granted row (fcredit='1', not yet collected) is the
 *     legacy-allowed case — reverting it desyncs no money, so it's permitted.
 *   - re-asserts the CURRENT fstatus in the UPDATE WHERE (TOCTOU — two admins
 *     can't both revert / a stale page can't double-step).
 *   - clears the matching fdatestatusN of the state we LEAVE (e.g. reverting
 *     from 6 clears fdatestatus6) so the date-driven customer timeline
 *     (actions/track.ts hasRealStamp) stays truthful — a reverted step is no
 *     longer "done".
 *
 * advanceForwarderStep is forward-only (N→N+1, never demote), stamps the
 * fdatestatusN of the state we ENTER, and is also TOCTOU-guarded. It is
 * deliberately status-only: completing step 4 → 5 → 6 here does NOT collect
 * money or dispatch (that's the admin จ่ายแทนลูกค้า / billing-run path) — it just
 * advances the workflow pill the way the owner asked ("ทำ4เสร็จ→5→6").
 *
 * Casing: tb_forwarder + tb_wallet_hs are lowercase columns. adminidupdate is
 * varchar(10) → sliced. RBAC: ['ops','super','warehouse'] (god roles ultra/super
 * auto-pass via withAdmin → requireAdmin → isGodRole).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { FSTATUS_CFG } from "@/lib/admin/forwarder-status";
import { canAdvanceCreditCustomer, isCreditRow } from "@/lib/forwarder/credit-advance-guard";
import { resolveProfileIdForLegacyUserid } from "@/lib/auth/tb-users-resolver";
import { sendNotification } from "@/lib/notifications";

// ── Local resolveLegacyAdminId (same pattern as forwarders-field-edits.ts) ───
// Known consolidation TODO across the forwarder actions; kept local to avoid
// premature extraction + to stay strictly inside this unit's files.
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error(`[forwarder-step.resolveLegacyAdminId] failed`, { code: error.code, message: error.message });
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
    console.error(`[forwarder-step tb_admin lookup] failed`, { code: aErr.code, message: aErr.message });
  }
  return data?.adminID ?? email.slice(0, 10);
}

// ── checkCreditAdvanceToPrepShip — UNIT E credit-limit lock ──────────────────
// Owner: a credit customer at/over their credit limit (with unpaid debt) must
// NEVER be advanced to fstatus '6' (เตรียมส่ง) — lock the row until they pay the
// credit down enough. Reads the LIVE legacy credit pair by member-code:
//   limit       = tb_users.userCreditValue   (camelCase · per userID)
//   outstanding = tb_credit.creditvalue      (lowercase  · per userid)
// (the SAME columns actions/credit.ts::getMyCredit reads · ADR-0023).
//
// Returns { blocked, reason }. On a read error it FAILS CLOSED (blocked) — a
// money guard we can't complete must hold, not silently let a full-credit row
// flow to เตรียมส่ง. When NOT a credit row it short-circuits without a DB read.
async function checkCreditAdvanceToPrepShip(
  admin: ReturnType<typeof createAdminClient>,
  fcredit: string | null,
  userid: string | null,
): Promise<{ blocked: boolean; reason: string }> {
  // Cheap short-circuit: only credit rows can ever be blocked — skip the DB read.
  if (!isCreditRow(fcredit)) {
    return { blocked: false, reason: "" };
  }

  const code = String(userid ?? "").trim();
  if (!code) {
    // A credit row with no resolvable customer code is anomalous — hold it.
    return {
      blocked: true,
      reason: "ตรวจสอบวงเงินเครดิตไม่ได้ (ไม่พบรหัสลูกค้า) — กรุณาตรวจสอบรายการก่อนเลื่อนสถานะ",
    };
  }

  const [limitRes, creditRes] = await Promise.all([
    admin
      .from("tb_users")
      .select("userCreditValue")
      .eq("userID", code)
      .maybeSingle<{ userCreditValue: number | string | null }>(),
    admin
      .from("tb_credit")
      .select("creditvalue")
      .eq("userid", code)
      .maybeSingle<{ creditvalue: number | string | null }>(),
  ]);
  if (limitRes.error) {
    console.error(`[checkCreditAdvanceToPrepShip tb_users read] failed`, {
      code: limitRes.error.code, message: limitRes.error.message, userid: code,
    });
    return { blocked: true, reason: `ตรวจสอบวงเงินเครดิตไม่สำเร็จ: ${limitRes.error.message}` };
  }
  if (creditRes.error) {
    console.error(`[checkCreditAdvanceToPrepShip tb_credit read] failed`, {
      code: creditRes.error.code, message: creditRes.error.message, userid: code,
    });
    return { blocked: true, reason: `ตรวจสอบยอดค้างเครดิตไม่สำเร็จ: ${creditRes.error.message}` };
  }

  return canAdvanceCreditCustomer({
    fcredit,
    outstanding: creditRes.data?.creditvalue ?? 0,
    limit: limitRes.data?.userCreditValue ?? 0,
  });
}

// `fdatestatusN` map — status '1' has no dedicated date column (matches
// TB_STATUS_DATE_COL in forwarders.ts). '99' is special (not steppable here).
const STATUS_DATE_COL: Record<string, string | null> = {
  "1": null,
  "2": "fdatestatus2",
  "3": "fdatestatus3",
  "4": "fdatestatus4",
  "5": "fdatestatus5",
  "6": "fdatestatus6",
  "7": "fdatestatus7",
};

// Human label for the audit + error messages.
function labelOf(fstatus: string): string {
  return FSTATUS_CFG[fstatus as keyof typeof FSTATUS_CFG]?.label ?? fstatus;
}

const stepSchema = z.object({
  fid: z.number().int().positive(),
});
export type ForwarderStepInput = z.infer<typeof stepSchema>;

export type ForwarderStepData = {
  id: number;
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// revertForwarderStep — move fstatus N → N-1 (one step back · money-safe).
// ─────────────────────────────────────────────────────────────────────────────
export async function revertForwarderStep(
  rawInput: ForwarderStepInput,
): Promise<AdminActionResult<ForwarderStepData>> {
  const parsed = stepSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { fid } = parsed.data;

  return withAdmin<ForwarderStepData>(["ops", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    // 1. Read current state + the money markers (§0c destructure error).
    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fstatus, fcredit, paydeposit")
      .eq("id", fid)
      .maybeSingle<{
        id: number;
        fstatus: string | null;
        fcredit: string | null;
        paydeposit: string | null;
      }>();
    if (fwdErr) {
      console.error(`[revertForwarderStep read] failed`, { code: fwdErr.code, message: fwdErr.message, fid });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };

    const from = String(fwd.fstatus ?? "").trim();
    const fromInt = parseInt(from, 10);

    // 2. Steppable-range guard. Only {2,3,4,5,6} can revert one step.
    //    1→0 (nothing before รอเข้าโกดังจีน), 7→6 (already shipped), and the
    //    special '99' are refused.
    if (from === "7") {
      return { ok: false, error: "ถอยสถานะไม่ได้ — รายการนี้ส่งของแล้ว (ส่งแล้ว → เตรียมส่ง ย้อนไม่ได้)" };
    }
    if (!Number.isInteger(fromInt) || fromInt < 2 || fromInt > 6) {
      return {
        ok: false,
        error: `ถอยสถานะไม่ได้จากสถานะปัจจุบัน (${labelOf(from)}) — ถอยได้เฉพาะสถานะ 2–6`,
      };
    }
    const to = String(fromInt - 1);

    // 3. MONEY-SAFETY — refuse 6→5 when the row was already PAID (any of the
    //    three settle markers). An unsettled credit-granted row (fcredit='1',
    //    not yet collected) is legacy-allowed → permitted.
    if (from === "6") {
      const paidByDeposit = ["1", "2"].includes(String(fwd.paydeposit ?? "").trim());
      // fcredit='' on a row that reached fstatus 6 via the credit grant means
      // the credit was SETTLED (pay-user.ts sets fcredit:'' at settle). We treat
      // an empty fcredit at status 6 + a paid deposit as "already collected".
      // The decisive, unambiguous markers are paydeposit + the settled wallet_hs.
      const fcreditCleared = String(fwd.fcredit ?? "").trim() === "" && paidByDeposit;

      // Settled wallet-pay row: type='4' (ชำระจากกระเป๋า) · status='2' (settled) ·
      // reforder=fid. Written by pay-user.ts both branches at settle.
      const { data: settled, error: settledErr } = await admin
        .from("tb_wallet_hs")
        .select("id")
        .eq("reforder", String(fid))
        .eq("type", "4")
        .eq("status", "2")
        .limit(1);
      if (settledErr) {
        console.error(`[revertForwarderStep tb_wallet_hs settle-check] failed`, {
          code: settledErr.code, message: settledErr.message, fid,
        });
        // Fail CLOSED on a money check we can't complete — refusing a revert is
        // safer than silently allowing one that might desync paid money.
        return { ok: false, error: `ตรวจสอบสถานะการชำระเงินไม่สำเร็จ: ${settledErr.message}` };
      }
      const hasSettledWallet = (settled?.length ?? 0) > 0;

      if (paidByDeposit || fcreditCleared || hasSettledWallet) {
        return {
          ok: false,
          error:
            "ถอยสถานะไม่ได้ — รายการนี้ชำระเงินแล้ว (เตรียมส่ง → รอชำระเงิน ย้อนไม่ได้เพราะจะทำให้ยอดเก็บ/ใบเสร็จไม่ตรง). " +
            "ถ้าต้องการแก้ไขการชำระเงิน ให้ทำผ่านหน้าจ่ายแทนลูกค้า/คืนเงิน",
        };
      }
    }

    // 4. Build the UPDATE.
    //    - fstatus → N-1
    //    - stamp fdateadminstatus (every status change)
    //    - CLEAR the date stamp of the state we LEAVE (the reverted step is no
    //      longer "done" — keeps the date-driven timeline truthful).
    const nowIso = new Date().toISOString();
    const leftDateCol = STATUS_DATE_COL[from]; // the column for the state we're leaving
    const update: Record<string, unknown> = {
      fstatus:          to,
      fdateadminstatus: nowIso,
      adminidupdate:    legacyAdminId,
      ...(leftDateCol ? { [leftDateCol]: null } : {}),
    };

    // 5. UPDATE with the TOCTOU re-assert (current fstatus must still be `from`).
    const { data: updated, error: updErr } = await admin
      .from("tb_forwarder")
      .update(update)
      .eq("id", fid)
      .eq("fstatus", from)
      .select("id");
    if (updErr) {
      console.error(`[revertForwarderStep update] failed`, { code: updErr.code, message: updErr.message, fid });
      return { ok: false, error: `ถอยสถานะไม่สำเร็จ: ${updErr.message}` };
    }
    if (!updated || updated.length === 0) {
      // 0 rows = the status changed under us between read and write.
      return { ok: false, error: "สถานะเปลี่ยนไปแล้ว (มีคนอื่นแก้ไขพร้อมกัน) — โหลดหน้าใหม่แล้วลองอีกครั้ง" };
    }

    // 6. Audit (best-effort) + revalidate.
    await logAdminAction(adminId, "tb_forwarder.revert_step", "tb_forwarder", String(fid), {
      from, to, fromLabel: labelOf(from), toLabel: labelOf(to), cleared_date_col: leftDateCol,
    });

    revalidatePath(`/admin/forwarders/${fid}`);
    revalidatePath("/admin/forwarders");
    revalidatePath("/admin");

    return {
      ok: true,
      data: { id: fid, from, to, fromLabel: labelOf(from), toLabel: labelOf(to) },
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// advanceForwarderStep — move fstatus N → N+1 (one step forward · status-only).
// Forward-only · TOCTOU-guarded · Option B (NO money/dispatch side-effect).
// Owner: "ทำ4เสร็จ→5→6". Used for the 4→5 and 5→6 workflow advances.
// ─────────────────────────────────────────────────────────────────────────────
export async function advanceForwarderStep(
  rawInput: ForwarderStepInput,
): Promise<AdminActionResult<ForwarderStepData>> {
  const parsed = stepSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { fid } = parsed.data;

  return withAdmin<ForwarderStepData>(["ops", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fstatus, fcredit, userid, fidorco")
      .eq("id", fid)
      .maybeSingle<{
        id: number;
        fstatus: string | null;
        fcredit: string | null;
        userid: string | null;
        fidorco: string | null;
      }>();
    if (fwdErr) {
      console.error(`[advanceForwarderStep read] failed`, { code: fwdErr.code, message: fwdErr.message, fid });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${fwdErr.message}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };

    const from = String(fwd.fstatus ?? "").trim();
    const fromInt = parseInt(from, 10);

    // Forward-only, one step, bounded. Exposed for 4→5 and 5→6 (the owner's
    // "ทำ4เสร็จ→5→6"). We allow {1..6}→+1 generally but the UI only renders the
    // button for 4-5; the cap at 6→7 is excluded here because reaching ส่งแล้ว
    // (7) is the dispatch/delivery flow, not a plain status bump.
    if (!Number.isInteger(fromInt) || fromInt < 4 || fromInt > 5) {
      return {
        ok: false,
        error: `ดันสถานะถัดไปไม่ได้จากสถานะปัจจุบัน (${labelOf(from)}) — ใช้ได้เฉพาะ 4→5 และ 5→6`,
      };
    }
    const to = String(fromInt + 1);

    // ── UNIT E — credit-limit lock on the advance to fstatus '6' (เตรียมส่ง) ──
    // Owner: a credit customer who is at/over their credit limit (with unpaid
    // debt) must NEVER be advanced to '6'. Hold the row; tell them to pay the
    // credit down first. Only checked for the 5→6 advance — the 4→5 advance is
    // pre-prep-ship and carries no shipping commitment.
    if (to === "6") {
      const verdict = await checkCreditAdvanceToPrepShip(admin, fwd.fcredit, fwd.userid);
      if (verdict.blocked) {
        // Best-effort: fire a payment-due notification to the customer so they
        // know to pay the credit down. Never fails the (refused) advance.
        const code = String(fwd.userid ?? "").trim();
        if (code) {
          try {
            const profileId = await resolveProfileIdForLegacyUserid(code);
            if (profileId) {
              const fNo = fwd.fidorco ?? String(fwd.id);
              await sendNotification(profileId, {
                category:       "payment",
                severity:       "warning",
                title:          "กรุณาชำระยอดค้างเครดิต",
                body:
                  `รายการฝากนำเข้า ${fNo} พร้อมจัดส่ง แต่บัญชีของท่านเครดิตเต็ม/เกินวงเงิน — ` +
                  `กรุณาชำระยอดค้างเครดิตก่อน เพื่อให้ระบบเลื่อนสถานะเป็น "เตรียมส่ง" ได้`,
                link_href:      "/wallet-credit",
                reference_type: "forwarder",
                reference_id:   String(fwd.id),
              });
            }
          } catch (err) {
            console.error(`[advanceForwarderStep credit payment-due notify] failed (advance still refused)`, {
              fid, error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        // Audit the refusal (best-effort) so staff can see why the row is held.
        await logAdminAction(adminId, "tb_forwarder.advance_step_blocked_credit", "tb_forwarder", String(fid), {
          from, to, reason: verdict.reason, userid: code || null,
        });
        return { ok: false, error: verdict.reason };
      }
    }

    const nowIso = new Date().toISOString();
    const enteredDateCol = STATUS_DATE_COL[to]; // stamp the state we ENTER
    const update: Record<string, unknown> = {
      fstatus:          to,
      fdateadminstatus: nowIso,
      adminidupdate:    legacyAdminId,
      ...(enteredDateCol ? { [enteredDateCol]: nowIso } : {}),
    };

    const { data: updated, error: updErr } = await admin
      .from("tb_forwarder")
      .update(update)
      .eq("id", fid)
      .eq("fstatus", from)   // TOCTOU re-assert
      .select("id");
    if (updErr) {
      console.error(`[advanceForwarderStep update] failed`, { code: updErr.code, message: updErr.message, fid });
      return { ok: false, error: `ดันสถานะไม่สำเร็จ: ${updErr.message}` };
    }
    if (!updated || updated.length === 0) {
      return { ok: false, error: "สถานะเปลี่ยนไปแล้ว (มีคนอื่นแก้ไขพร้อมกัน) — โหลดหน้าใหม่แล้วลองอีกครั้ง" };
    }

    await logAdminAction(adminId, "tb_forwarder.advance_step", "tb_forwarder", String(fid), {
      from, to, fromLabel: labelOf(from), toLabel: labelOf(to), stamped_date_col: enteredDateCol,
    });

    revalidatePath(`/admin/forwarders/${fid}`);
    revalidatePath("/admin/forwarders");
    revalidatePath("/admin");

    return {
      ok: true,
      data: { id: fid, from, to, fromLabel: labelOf(from), toLabel: labelOf(to) },
    };
  });
}

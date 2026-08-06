"use server";

/**
 * TTW/อี้อู (Yiwu) packing-staging — CS assigns a PR to a staged tracking row.
 *
 * The 8 Yiwu packing lists (mig 0262 · ttw_packing_line) arrive with the warehouse's
 * own 单号 tracking + a 唛头 mark but NO customer/PR (会员 = "YY"). CS matches the mark
 * ↔ a delivery note → the real PR, then fills it here (owner 2026-07-18 "ให้ CS มา
 * ช่วยกันใส่ PR เอาใบส่งของมาจับคู่").
 *
 * SAFETY: ttw_packing_line is a NON-billable STAGING table (§0e isolation). This
 * action ONLY writes member_code / pr_source on a staged row — it does NOT create a
 * billable tb_forwarder row, touch any price/wallet, or change any status. Committing
 * a staged row to a billable row (grouping + creating the tb_forwarder shipment) is a
 * SEPARATE, later, gated step. A row already committed (committed_forwarder_id set) is
 * frozen — reassigning its PR is refused.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { cabinetWriteGuard } from "@/lib/forwarder/cabinet-class";
import { addYiwuDeliveryNoteShipments } from "./yiwu-delivery-note";
import { revalidatePath } from "next/cache";

/** Escape PostgREST `like` wildcards so a base tracking can't widen the match. */
function escapeLike(base: string): string {
  return base.replace(/[%_,\\]/g, "\\$&");
}

const AssignSchema = z.object({
  id: z.string().uuid(),
  // Empty string = clear the PR. Otherwise a PR-like code (stored uppercased).
  memberCode: z.string().trim().max(30),
});

export type TtwAssignResult = {
  id: string;
  memberCode: string | null;
  found: boolean;          // does this PR exist in tb_users?
  customerName: string | null;
  /** How many OTHER uncommitted no-PR rows with the SAME 唛头 mark got this PR
   *  auto-propagated (mark = TTW's per-customer code → same mark = same customer ·
   *  owner 2026-07-18 "จับคู่ PR ให้เราด้วยเลย" — CS ใส่ครั้งเดียวต่อมาร์ค). */
  propagated: number;
};

// CS roles who reconcile arrival packing lists ↔ customers.
const CS_ROLES = ["super", "ops", "sales", "sales_admin", "accounting"] as const;

export async function adminAssignTtwPackingPr(
  input: unknown,
): Promise<AdminActionResult<TtwAssignResult>> {
  const parsed = AssignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }
  const { id } = parsed.data;
  const memberCode = parsed.data.memberCode.toUpperCase() || null; // "" → clear

  return withAdmin<TtwAssignResult>([...CS_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // Guard: refuse if the staged row is already committed to a billable row.
    const { data: row, error: rowErr } = await admin
      .from("ttw_packing_line")
      .select("id, member_code, shipping_mark, committed_forwarder_id")
      .eq("id", id)
      .maybeSingle();
    if (rowErr) {
      console.error("[ttw assign-pr] load failed", { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: "อ่านข้อมูลไม่สำเร็จ" };
    }
    if (!row) return { ok: false, error: "ไม่พบรายการนี้" };
    if (row.committed_forwarder_id != null) {
      return { ok: false, error: "รายการนี้ commit เป็นรายการนำเข้าแล้ว — แก้ PR ไม่ได้" };
    }

    // Look the PR up (feedback only — CS may enter a PR not yet in tb_users).
    let found = false;
    let customerName: string | null = null;
    if (memberCode) {
      const { data: u, error: uErr } = await admin
        .from("tb_users")
        .select("userID, userName")
        .eq("userID", memberCode)
        .maybeSingle();
      if (uErr) {
        // Soft-fail — this lookup is display feedback only and does NOT gate the
        // write below (CS may legitimately enter a PR not yet in tb_users). Log
        // it so a real DB fault isn't mistaken for "PR ยังไม่มีในระบบ".
        console.error("[ttw assign-pr] member lookup failed", { memberCode, code: uErr.code, message: uErr.message });
      }
      if (u) {
        found = true;
        customerName = (u as { userName?: string | null }).userName?.trim() || null;
      }
    }

    // Update only member_code / pr_source (never a money/status field), and re-guard
    // committed_forwarder_id IS NULL at the write so a concurrent commit can't be raced.
    const { error: upErr, count } = await admin
      .from("ttw_packing_line")
      .update({ member_code: memberCode, pr_source: memberCode ? "cs" : null, updated_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", id)
      .is("committed_forwarder_id", null);
    if (upErr) {
      console.error("[ttw assign-pr] update failed", { code: upErr.code, message: upErr.message });
      return { ok: false, error: `บันทึกไม่สำเร็จ: ${upErr.message}` };
    }
    if (!count) return { ok: false, error: "บันทึกไม่สำเร็จ (อาจถูก commit ไปแล้ว)" };

    // ── MARK-FAMILY PROPAGATION (owner 2026-07-18 "จับคู่ PR ให้เราด้วยเลย") ──
    // The 唛头 mark is TTW's per-CUSTOMER code (e.g. SPK/KTM888/SEA = one customer's
    // whole stream · 101 rows). Assigning a PR to ONE row therefore identifies the
    // whole mark family → fill every OTHER uncommitted row of the same mark that has
    // NO PR yet (fill-when-NULL only · never overwrites a CS/auto value · staging only).
    // Clearing a PR ("" → null) does NOT touch the family — only the one row.
    let propagated = 0;
    const mark = (row.shipping_mark ?? "").trim();
    if (memberCode && mark) {
      const { count: pCount, error: pErr } = await admin
        .from("ttw_packing_line")
        .update(
          { member_code: memberCode, pr_source: "mark", updated_at: new Date().toISOString() },
          { count: "exact" },
        )
        .eq("shipping_mark", mark)
        .is("member_code", null)
        .is("committed_forwarder_id", null)
        .neq("id", id);
      if (pErr) {
        // best-effort — the single-row assign already landed; CS can fill the rest
        console.error("[ttw assign-pr] mark propagation failed", { code: pErr.code, message: pErr.message });
      } else {
        propagated = pCount ?? 0;
      }
    }

    await logAdminAction(adminId, "ttw_packing.assign_pr", "ttw_packing_line", id, {
      member_code: memberCode, found, mark, propagated,
    });
    revalidatePath("/admin/api-forwarder-ttw");

    return { ok: true, data: { id, memberCode, found, customerName, propagated } };
  });
}

// ────────────────────────────────────────────────────────────────────────
// "เอาเข้าระบบ" — commit a STAGING row → a billable tb_forwarder อี้อู row.
//
// owner ภูม 2026-07-25: the staging (447 rows · ttw_packing_line) had assign-PR but
// NO way to turn a row into a real รายการนำเข้า ("commit แล้ว 0/447" forever). DOC
// (or CS) assigns the PR, then presses "เอาเข้าระบบ" here to create the forwarder from
// the packing measurements — the "SEPARATE, later, gated step" the assign docstring
// promised.
//
// MONEY-SAFETY: this REUSES the guarded create `addYiwuDeliveryNoteShipments`
// (GUARD 1 dedup by base 单号 · GUARD 2 member-validate · box-split · auto-price) —
// it writes NO INSERT/price/money itself. The only extra write is marking the staging
// row committed (committed_forwarder_id · non-money · mirrors the assign guard). If the
// base already exists in tb_forwarder (dedup skip), we LINK the staging to that row
// instead of creating a duplicate.
// ────────────────────────────────────────────────────────────────────────

const CreateSchema = z.object({ id: z.string().uuid() });

const TTW_CREATE_ROLES = ["super", "ops", "sales", "sales_admin", "accounting", "warehouse"] as const;

export type TtwCreateResult = {
  id: string;
  base: string;
  forwarderId: number | null;
  created: boolean; // true = สร้างใหม่ · false = มีอยู่แล้ว → เชื่อมให้
  message: string;
};

export async function adminCreateForwarderFromTtwStaging(
  input: unknown,
): Promise<AdminActionResult<TtwCreateResult>> {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }
  const { id } = parsed.data;

  return withAdmin<TtwCreateResult>([...TTW_CREATE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: rowErr } = await admin
      .from("ttw_packing_line")
      .select("id, base_tracking, member_code, pr_source, boxes, weight_kg, cbm, container_no, committed_forwarder_id")
      .eq("id", id)
      .maybeSingle();
    if (rowErr) {
      console.error("[ttw create] load failed", { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: "อ่านข้อมูลไม่สำเร็จ" };
    }
    if (!row) return { ok: false, error: "ไม่พบรายการนี้" };
    const r = row as {
      id: string; base_tracking: string | null; member_code: string | null; pr_source: string | null;
      boxes: number | null; weight_kg: number | string | null; cbm: number | string | null;
      container_no: string | null; committed_forwarder_id: number | null;
    };
    if (r.committed_forwarder_id != null) return { ok: false, error: "รายการนี้ commit เข้าระบบแล้ว" };
    // 🚩 owner 2026-08-07: มาร์คแบบ "PCS####" = ร้าน/โกดังจีนอาจออกแทรคกิ้งผิด → ปักธงรอตรวจ
    // ห้ามเอาเข้าระบบจนกว่า CS ยืนยันกับลูกค้า/TTW แล้วกดใส่ PR ซ้ำ (ปลดธงเป็น 'cs' อัตโนมัติ)
    if (r.pr_source === "hold_verify") {
      return {
        ok: false,
        error: "แถวนี้ถูกปักธง 🚩 รอตรวจสอบ (มาร์คแบบ PCS — เลขแทรคอาจออกมาผิด) — ยืนยันกับลูกค้า/TTW ก่อน แล้วกด \"ใส่ PR\" ซ้ำเพื่อปลดธง",
      };
    }

    const pr = (r.member_code ?? "").trim().toUpperCase();
    if (!/^PR\d+$/.test(pr)) {
      return { ok: false, error: "ยังไม่ได้ใส่รหัสลูกค้า (PR) ที่ถูกต้อง — ใส่ PR ก่อนแล้วค่อยเอาเข้าระบบ" };
    }
    const base = (r.base_tracking ?? "").trim();
    if (!base) return { ok: false, error: "แถวนี้ไม่มีเลขแทรคกิ้ง (单号)" };

    const boxes = Number(r.boxes) || 1;
    const weightKg = Number(r.weight_kg) || 0;
    const cbm = Number(r.cbm) || 0;
    if (!(weightKg > 0) && !(cbm > 0)) {
      return { ok: false, error: "แถวนี้ไม่มีน้ำหนักและคิว — เอาเข้าระบบไม่ได้ (ต้องมีอย่างน้อยหนึ่งอย่าง)" };
    }

    // REUSE the guarded create — no new INSERT/money-path here.
    const res = await addYiwuDeliveryNoteShipments([
      {
        orderNo: base,
        memberCode: pr,
        arrivalDate: new Date().toISOString().slice(0, 10),
        packingId: (r.container_no ?? "").trim() || undefined,
        rows: [{ boxCount: boxes, weightKg, lengthCm: 0, widthCm: 0, heightCm: 0, cbm, productType: "" }],
      },
    ]);
    if (!res.ok) return { ok: false, error: res.error };
    const one = res.data?.results?.[0];

    let forwarderId: number | null = null;
    let created = false;
    let message = "";

    if (one?.ok) {
      forwarderId = one.fids?.[0] ?? null;
      created = true;
    } else if (one?.skipped) {
      // Already in tb_forwarder → link the staging to that existing row (no dup).
      const escB = escapeLike(base);
      const { data: existing, error: exErr } = await admin
        .from("tb_forwarder")
        .select("id")
        .or(`ftrackingchn.eq.${base},ftrackingchn.like.${escB}-%`)
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (exErr) console.error("[ttw create] existing lookup failed", { code: exErr.code, message: exErr.message });
      forwarderId = (existing as { id: number } | null)?.id ?? null;
      created = false;
    } else {
      return { ok: false, error: one?.error ?? "เอาเข้าระบบไม่สำเร็จ — ลองใหม่" };
    }

    // ── ผูกเลขตู้จริง + เลื่อนสถานะ → "กำลังส่งมาไทย" (staging มีตู้อยู่แล้ว · owner ภูม 2026-07-25).
    //    MONEY-FREE · mirror the packing reconcile guards: ใส่ตู้เฉพาะแถวที่ cabinet ว่าง (ไม่ทับ) ·
    //    เลื่อนเฉพาะ 1/2 → 3 (ไม่แตะแถวที่บิลแล้ว ≥4 · ไม่ถอยสถานะ). ครอบทั้ง base + box-split.
    const container = (r.container_no ?? "").trim();
    let advanced = false;
    if (forwarderId != null && container) {
      const escB = escapeLike(base);
      const orFilter = `ftrackingchn.eq.${base},ftrackingchn.like.${escB}-%`;
      // integrator 2026-07-25: ทุก write path ของ fcabinetnumber ต้องผ่าน cabinetWriteGuard
      // (กติกา cabinet-class 2026-07-20 · กันเลขกระสอบ CBX/placeholder หลุดลงช่องตู้ —
      // container จาก staging มาจากชื่อไฟล์ TTW ปกติผ่านเสมอ แต่ chokepoint ต้องครบ).
      const tierGuard = cabinetWriteGuard({ next: container, current: "" });
      if (!tierGuard.ok) {
        console.error("[ttw create] cabinet guard refused", { container, reason: tierGuard.reason });
      } else {
        const { error: cabErr } = await admin
          .from("tb_forwarder").update({ fcabinetnumber: container }).or(orFilter).eq("fcabinetnumber", "");
        if (cabErr) console.error("[ttw create] cabinet link failed", { code: cabErr.code, message: cabErr.message });
      }
      const { data: adv, error: stErr } = await admin
        .from("tb_forwarder")
        .update({ fstatus: "3", fdatestatus3: new Date().toISOString().slice(0, 10) })
        .or(orFilter).in("fstatus", ["1", "2"]).select("id");
      if (stErr) console.error("[ttw create] advance status failed", { code: stErr.code, message: stErr.message });
      else advanced = (adv ?? []).length > 0;
    }

    message = created
      ? `เข้าระบบแล้ว${container ? " · ผูกตู้ · กำลังส่งมาไทย" : ""}${forwarderId != null ? ` (#${forwarderId})` : ""}`
      : `มีในระบบอยู่แล้ว — เชื่อมให้${advanced ? " · เลื่อนเป็นกำลังส่งมาไทย" : ""}${forwarderId != null ? ` (#${forwarderId})` : ""}`;

    // Mark the staging row committed (non-money · guarded re-check).
    if (forwarderId != null) {
      const { error: upErr } = await admin
        .from("ttw_packing_line")
        .update({ committed_forwarder_id: forwarderId, updated_at: new Date().toISOString() })
        .eq("id", id)
        .is("committed_forwarder_id", null);
      if (upErr) console.error("[ttw create] mark committed failed", { code: upErr.code, message: upErr.message });
    }

    await logAdminAction(adminId, "ttw_packing.create_forwarder", "ttw_packing_line", id, {
      base, pr, forwarderId, created,
    });
    revalidatePath("/admin/api-forwarder-ttw");

    return { ok: true, data: { id, base, forwarderId, created, message } };
  });
}

"use server";

/**
 * W10 — China-warehouse worker-app server actions (Theme 7 Phase 1).
 *
 * Reference:
 *   - docs/research/cargothai-warehouse-ops-blueprint-2026-06-01.md (the 7-view
 *     worker app · status flow · data model)
 *   - docs/learnings/freight-erp-model.md (the freight ERP synthesis)
 *   - docs/research/build-backlog-2026-06-09.md §WAVE 10
 *
 * THE WORKER FLOW (writes the EXISTING cargo spine — tb_forwarder /
 * tb_forwarder_item — plus the isolated 0169/0170/0171 audit + sack tables):
 *
 *   intake      — scan a tracking already in the system → mark received at the
 *                 CN warehouse (fstatus 1→2 · sets fwarehousename + fdatestatus2).
 *   measure     — record weight/dims on a parcel + its first item → compute CBM.
 *   sack        — create a sack (warehouse_sack) + pack item(s) into it
 *                 (tb_forwarder_item.productbagid).
 *   seal        — close a sack (read-only after) — supervisor-gated re-open.
 *   assign      — attach a shipment to a container (tb_forwarder.fcabinetnumber)
 *                 — refuses when fcabinet_locked (mig 0150).
 *   depart      — container leaves CN (fstatus 2→3 · fdatestatus3).
 *   arrive      — shipment reaches TH (fstatus 3→4 · fdatestatus4) — parity with
 *                 the barcode-import scan, available to the worker app too.
 *   statusOverride — supervisor manual status flip (every transition gated by
 *                 canAnyRoleFlipFstatus — super/manager only for non-warehouse jumps).
 *   printLabel  — record a sack-tag / box-label / barcode print.
 *
 * 🔒 SAFETY (owner guardrail "ห้ามทำงานบัค งานหาย"):
 *   - NO money mutation. We NEVER write fcosttotalprice (cost-sheet
 *     authoritative · mig 0150 cost-lock) nor ftotalprice / fprofit* / any
 *     wallet/payment/billing column.
 *   - Container assignment respects fcabinet_locked — refuses to overwrite a
 *     locked cabinet (mig 0150).
 *   - Every status flip goes through canAnyRoleFlipFstatus (the legacy G5
 *     matrix) so a warehouse worker can only do warehouse transitions; cross-
 *     team / terminal jumps need super/manager.
 *   - All actions gated withAdmin(['super','warehouse','ops','manager']) +
 *     audited (logAdminAction + warehouse_intake_log).
 *   - 🔒 GATED activation: WHO uses this is the warehouse RBAC role assignment
 *     (China-team sign-off · owner-blocked). The code is role-gated; the role
 *     grant is the gate.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { canAnyRoleFlipFstatus } from "@/lib/auth/check-fstatus-transition";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// Worker-app role-set — matches the W10 spec.
const WAREHOUSE_ROLES = ["super", "warehouse", "ops", "manager"] as const;

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — the tb_admin.adminID string (matches tb_forwarder
// adminid* convention · varchar(10)/(20)). Mirrors forwarders-new.ts.
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
    error: dataErr,
  } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase auth] failed`, { code: dataErr.code, message: dataErr.message });
  }
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (error) {
    console.error(`[tb_admin lookup] failed`, { code: error.code, message: error.message });
  }
  if (data?.adminID) return data.adminID;
  return (email.split("@")[0] || "system").slice(0, 20);
}

/** Write one warehouse_intake_log audit row (best-effort, never throws). */
async function logIntakeEvent(
  admin: ReturnType<typeof createAdminClient>,
  event: {
    fid: number;
    step: string;
    fstatusFrom?: string | null;
    fstatusTo?: string | null;
    warehouseCode?: string | null;
    adminId: string;
    payload?: Record<string, unknown>;
    note?: string | null;
  },
): Promise<void> {
  try {
    await admin.from("warehouse_intake_log").insert({
      fid:            event.fid,
      step:           event.step,
      fstatus_from:   event.fstatusFrom ?? null,
      fstatus_to:     event.fstatusTo ?? null,
      warehouse_code: event.warehouseCode ?? null,
      admin_id:       event.adminId,
      payload:        event.payload ?? null,
      note:           event.note ?? null,
    });
  } catch (e) {
    console.error("[warehouse_intake_log insert] failed", e);
  }
}

/** CBM (m³) from cm dims = w·l·h / 1,000,000 (the demo + legacy formula). */
function computeCbm(widthCm: number, lengthCm: number, heightCm: number): number {
  const cbm = (widthCm * lengthCm * heightCm) / 1_000_000;
  return Math.round(cbm * 100000) / 100000; // numeric(10,5)
}

// ════════════════════════════════════════════════════════════
// 1. INTAKE — scan tracking already in system → received at CN warehouse
//    fstatus 1→2 · sets fwarehousename + fdatestatus2.
// ════════════════════════════════════════════════════════════

const intakeSchema = z.object({
  // tracking (ftrackingchn) or order id (fidorco) the worker scanned.
  keysearch:     z.string().trim().min(1).max(100),
  // the CN warehouse code (tb_forwarder.fwarehousename · varchar(1)).
  warehouseCode: z.string().trim().max(1).default(""),
  note:          z.string().trim().max(500).optional(),
});

export async function warehouseIntakeScan(
  rawInput: z.input<typeof intakeSchema>,
): Promise<AdminActionResult<{ fid: number; statusFlipped: boolean }>> {
  const parsed = intakeSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ fid: number; statusFlipped: boolean }>(
    [...WAREHOUSE_ROLES],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);
      const roles = (await getAdminRoles()) ?? [];

      // Find the shipment by tracking or order id (not yet billed: fstatus<5).
      const { data: rows, error: lookupErr } = await admin
        .from("tb_forwarder")
        .select("id, fstatus, fwarehousename, ftrackingchn, fidorco, userid")
        .or(`ftrackingchn.eq.${d.keysearch},fidorco.eq.${d.keysearch}`)
        .lt("fstatus", "5")
        .limit(2);
      if (lookupErr) {
        console.error(`[tb_forwarder intake lookup] failed`, {
          code: lookupErr.code,
          message: lookupErr.message,
        });
        return { ok: false, error: `db_error:${lookupErr.code ?? "unknown"}` };
      }
      const list = (rows ?? []) as Array<{
        id: number;
        fstatus: string | null;
        fwarehousename: string | null;
        ftrackingchn: string | null;
        fidorco: string | null;
        userid: string | null;
      }>;
      if (list.length === 0) {
        return { ok: false, error: "ไม่พบรายการจาก tracking/รหัสนี้ (หรือเลยขั้นตอนชำระเงินแล้ว)" };
      }
      if (list.length > 1) {
        return { ok: false, error: "พบหลายรายการที่ตรงกัน — กรุณาระบุให้เฉพาะเจาะจง" };
      }
      const fwd = list[0];
      const from = (fwd.fstatus ?? "1").trim();

      // Already at/past CN-warehouse-received → idempotent: just stamp warehouse.
      const targetTo = "2";
      const willFlip = from === "1";

      if (willFlip && !canAnyRoleFlipFstatus(roles, from, targetTo)) {
        return { ok: false, error: "forbidden_transition (ไม่มีสิทธิ์ยืนยันรับเข้าโกดัง)" };
      }

      const nowIso = new Date().toISOString();
      // NOTE: we do NOT set tb_forwarder.warehouse_app_intake here — the
      // "intaked via the worker app" signal is carried by the
      // warehouse_intake_log step='intake' row (mig 0169) instead. That keeps
      // this UPDATE working even if mig 0171 (the optional dashboard-split flag
      // column) hasn't been applied. The flag column stays available for a
      // future backfill / dashboard query.
      const update: Record<string, unknown> = {
        fwarehousename: d.warehouseCode || (fwd.fwarehousename ?? ""),
        adminidupdate: legacyAdminId,
        fdateadminstatus: nowIso,
      };
      if (willFlip) {
        update.fstatus = targetTo;
        update.fdatestatus2 = nowIso;
      }

      const { error: updErr } = await admin
        .from("tb_forwarder")
        .update(update)
        .eq("id", fwd.id);
      if (updErr) {
        console.error(`[tb_forwarder intake update] failed`, {
          code: updErr.code,
          message: updErr.message,
        });
        return { ok: false, error: `db_error:${updErr.code ?? "unknown"}` };
      }

      await logIntakeEvent(admin, {
        fid: fwd.id,
        step: "intake",
        fstatusFrom: from,
        fstatusTo: willFlip ? targetTo : from,
        warehouseCode: d.warehouseCode || (fwd.fwarehousename ?? ""),
        adminId: legacyAdminId,
        payload: { keysearch: d.keysearch, willFlip },
        note: d.note ?? null,
      });
      await logAdminAction(adminId, "warehouse.intake", "tb_forwarder", String(fwd.id), {
        from,
        to: willFlip ? targetTo : from,
        warehouseCode: d.warehouseCode,
      });

      revalidatePath("/admin/warehouse");
      revalidatePath("/admin/warehouse/intake");
      revalidatePath(`/admin/forwarders/${fwd.id}`);
      return { ok: true, data: { fid: fwd.id, statusFlipped: willFlip } };
    },
  );
}

// ════════════════════════════════════════════════════════════
// 2. MEASURE — record weight/dims → CBM (on the shipment + its first item).
// ════════════════════════════════════════════════════════════

const measureSchema = z.object({
  fid:      z.coerce.number().int().positive(),
  weightKg: z.coerce.number().min(0).max(99999999),
  widthCm:  z.coerce.number().min(0).max(99999999),
  lengthCm: z.coerce.number().min(0).max(99999999),
  heightCm: z.coerce.number().min(0).max(99999999),
  note:     z.string().trim().max(500).optional(),
});

export async function warehouseMeasure(
  rawInput: z.input<typeof measureSchema>,
): Promise<AdminActionResult<{ cbm: number }>> {
  const parsed = measureSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ cbm: number }>([...WAREHOUSE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fstatus, fwarehousename")
      .eq("id", d.fid)
      .maybeSingle<{ id: number; fstatus: string | null; fwarehousename: string | null }>();
    if (fwdErr) {
      console.error(`[tb_forwarder measure lookup] failed`, { code: fwdErr.code, message: fwdErr.message });
      return { ok: false, error: `db_error:${fwdErr.code ?? "unknown"}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการ (fid ไม่ถูกต้อง)" };

    // Legacy locks measurement edits once billed (fstatus>=5) / delivered (7).
    if (["5", "6", "7"].includes((fwd.fstatus ?? "").trim())) {
      return { ok: false, error: `สถานะปัจจุบัน (${fwd.fstatus}) แก้ขนาด/น้ำหนักไม่ได้แล้ว` };
    }

    const cbm = computeCbm(d.widthCm, d.lengthCm, d.heightCm);

    // ⚠️ NO cost/price column written — measure only.
    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({
        fweight: d.weightKg,
        fwidth:  d.widthCm,
        flength: d.lengthCm,
        fheight: d.heightCm,
        fvolume: cbm,
        adminidupdate: legacyAdminId,
        fdateadminstatus: new Date().toISOString(),
      })
      .eq("id", d.fid);
    if (updErr) {
      console.error(`[tb_forwarder measure update] failed`, { code: updErr.code, message: updErr.message });
      return { ok: false, error: `db_error:${updErr.code ?? "unknown"}` };
    }

    await logIntakeEvent(admin, {
      fid: d.fid,
      step: "measure",
      warehouseCode: fwd.fwarehousename ?? null,
      adminId: legacyAdminId,
      payload: { weightKg: d.weightKg, widthCm: d.widthCm, lengthCm: d.lengthCm, heightCm: d.heightCm, cbm },
      note: d.note ?? null,
    });
    await logAdminAction(adminId, "warehouse.measure", "tb_forwarder", String(d.fid), {
      weightKg: d.weightKg, cbm,
    });

    revalidatePath("/admin/warehouse/measure");
    revalidatePath(`/admin/forwarders/${d.fid}`);
    return { ok: true, data: { cbm } };
  });
}

// ════════════════════════════════════════════════════════════
// 3. SACK — create a sack + pack item(s) into it.
//    Sack header = warehouse_sack (0170). Parcel→sack link =
//    tb_forwarder_item.productbagid (existing legacy column).
// ════════════════════════════════════════════════════════════

const createSackSchema = z.object({
  warehouseCode: z.string().trim().max(1).default(""),
  note:          z.string().trim().max(500).optional(),
});

/** SK{yyMMdd}-{seq} sack number generator. */
function buildSackNo(seq: number): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `SK${yy}${mm}${dd}-${String(seq).padStart(3, "0")}`;
}

export async function warehouseCreateSack(
  rawInput: z.input<typeof createSackSchema>,
): Promise<AdminActionResult<{ sackId: number; sackNo: string }>> {
  const parsed = createSackSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ sackId: number; sackNo: string }>([...WAREHOUSE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    // today's sack count → next seq.
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { count, error: cntErr } = await admin
      .from("warehouse_sack")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfDay.toISOString());
    if (cntErr) {
      console.error(`[warehouse_sack count] failed`, { code: cntErr.code, message: cntErr.message });
    }
    const sackNo = buildSackNo((count ?? 0) + 1);

    const { data: row, error: insErr } = await admin
      .from("warehouse_sack")
      .insert({
        sack_no: sackNo,
        warehouse_code: d.warehouseCode,
        admin_id: legacyAdminId,
        note: d.note ?? null,
      })
      .select("id, sack_no")
      .single<{ id: number; sack_no: string }>();
    if (insErr || !row) {
      console.error(`[warehouse_sack insert] failed`, { code: insErr?.code, message: insErr?.message });
      return { ok: false, error: insErr?.message ?? "insert failed" };
    }

    await logAdminAction(adminId, "warehouse.create_sack", "warehouse_sack", String(row.id), { sackNo });
    revalidatePath("/admin/warehouse/sacks");
    return { ok: true, data: { sackId: row.id, sackNo: row.sack_no } };
  });
}

const packItemSchema = z.object({
  sackId:    z.coerce.number().int().positive(),
  // tb_forwarder_item.id to pack into the sack.
  itemId:    z.coerce.number().int().positive(),
});

export async function warehousePackItemIntoSack(
  rawInput: z.input<typeof packItemSchema>,
): Promise<AdminActionResult<void>> {
  const parsed = packItemSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<void>([...WAREHOUSE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    // Sack must exist + not be sealed.
    const { data: sack, error: sackErr } = await admin
      .from("warehouse_sack")
      .select("id, sealed, parcel_count")
      .eq("id", d.sackId)
      .maybeSingle<{ id: number; sealed: boolean; parcel_count: number }>();
    if (sackErr) {
      console.error(`[warehouse_sack lookup] failed`, { code: sackErr.code, message: sackErr.message });
      return { ok: false, error: `db_error:${sackErr.code ?? "unknown"}` };
    }
    if (!sack) return { ok: false, error: "ไม่พบกระสอบ (sackId ไม่ถูกต้อง)" };
    if (sack.sealed) return { ok: false, error: "กระสอบนี้ถูกซีลแล้ว — เปิดซีลก่อน (หัวหน้างานเท่านั้น)" };

    // Item must exist (we only need its fid for the audit + the link).
    const { data: item, error: itemErr } = await admin
      .from("tb_forwarder_item")
      .select("id, fid")
      .eq("id", d.itemId)
      .maybeSingle<{ id: number; fid: number }>();
    if (itemErr) {
      console.error(`[tb_forwarder_item lookup] failed`, { code: itemErr.code, message: itemErr.message });
      return { ok: false, error: `db_error:${itemErr.code ?? "unknown"}` };
    }
    if (!item) return { ok: false, error: "ไม่พบสินค้า (itemId ไม่ถูกต้อง)" };

    // Link parcel → sack via the legacy column.
    const { error: linkErr } = await admin
      .from("tb_forwarder_item")
      .update({ productbagid: d.sackId, adminidupdated: legacyAdminId, lasttimeupdated: new Date().toISOString() })
      .eq("id", d.itemId);
    if (linkErr) {
      console.error(`[tb_forwarder_item pack update] failed`, { code: linkErr.code, message: linkErr.message });
      return { ok: false, error: `db_error:${linkErr.code ?? "unknown"}` };
    }

    // Recompute sack aggregates from the linked items.
    await recomputeSackAggregates(admin, d.sackId);

    await logIntakeEvent(admin, {
      fid: item.fid,
      step: "sack",
      adminId: legacyAdminId,
      payload: { sackId: d.sackId, itemId: d.itemId },
    });
    await logAdminAction(adminId, "warehouse.pack_item", "warehouse_sack", String(d.sackId), { itemId: d.itemId });

    revalidatePath("/admin/warehouse/sacks");
    return { ok: true };
  });
}

/** Recompute weight/cbm/count of a sack from its linked tb_forwarder_item rows. */
async function recomputeSackAggregates(
  admin: ReturnType<typeof createAdminClient>,
  sackId: number,
): Promise<void> {
  const { data: items, error } = await admin
    .from("tb_forwarder_item")
    .select("productweightall, productcbmall")
    .eq("productbagid", sackId);
  if (error) {
    console.error(`[tb_forwarder_item sack agg] failed`, { code: error.code, message: error.message });
    return;
  }
  const list = (items ?? []) as Array<{ productweightall: number | string | null; productcbmall: number | string | null }>;
  let weight = 0;
  let cbm = 0;
  for (const it of list) {
    weight += Number(it.productweightall ?? 0);
    cbm += Number(it.productcbmall ?? 0);
  }
  await admin
    .from("warehouse_sack")
    .update({
      weight_kg: Math.round(weight * 100) / 100,
      cbm: Math.round(cbm * 100000) / 100000,
      parcel_count: list.length,
    })
    .eq("id", sackId);
}

// ════════════════════════════════════════════════════════════
// 4. SEAL / UNSEAL — close a sack (read-only after). Unseal = supervisor.
// ════════════════════════════════════════════════════════════

const sealSchema = z.object({ sackId: z.coerce.number().int().positive() });

export async function warehouseSealSack(
  rawInput: z.input<typeof sealSchema>,
): Promise<AdminActionResult<void>> {
  const parsed = sealSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin<void>([...WAREHOUSE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);
    const nowIso = new Date().toISOString();

    const { error: updErr } = await admin
      .from("warehouse_sack")
      .update({ sealed: true, sealed_at: nowIso, sealed_by: legacyAdminId })
      .eq("id", d.sackId)
      .eq("sealed", false); // idempotent — don't re-seal
    if (updErr) {
      console.error(`[warehouse_sack seal] failed`, { code: updErr.code, message: updErr.message });
      return { ok: false, error: `db_error:${updErr.code ?? "unknown"}` };
    }
    await logAdminAction(adminId, "warehouse.seal_sack", "warehouse_sack", String(d.sackId), {});
    revalidatePath("/admin/warehouse/sacks");
    return { ok: true };
  });
}

export async function warehouseUnsealSack(
  rawInput: z.input<typeof sealSchema>,
): Promise<AdminActionResult<void>> {
  const parsed = sealSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  // Re-open a sealed sack — supervisor only (super/manager).
  return withAdmin<void>(["super", "manager"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error: updErr } = await admin
      .from("warehouse_sack")
      .update({ sealed: false, sealed_at: null, sealed_by: null })
      .eq("id", d.sackId);
    if (updErr) {
      console.error(`[warehouse_sack unseal] failed`, { code: updErr.code, message: updErr.message });
      return { ok: false, error: `db_error:${updErr.code ?? "unknown"}` };
    }
    await logAdminAction(adminId, "warehouse.unseal_sack", "warehouse_sack", String(d.sackId), {});
    revalidatePath("/admin/warehouse/sacks");
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════
// 5. ASSIGN CONTAINER — attach a shipment to a container number.
//    🔒 Refuses when fcabinet_locked (mig 0150). Does NOT touch
//    fcosttotalprice (cost-sheet authoritative).
// ════════════════════════════════════════════════════════════

const assignSchema = z.object({
  fid:         z.coerce.number().int().positive(),
  containerNo: z.string().trim().min(1).max(300),
});

export async function warehouseAssignContainer(
  rawInput: z.input<typeof assignSchema>,
): Promise<AdminActionResult<void>> {
  const parsed = assignSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<void>([...WAREHOUSE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fstatus, fcabinetnumber, fcabinet_locked, fwarehousename")
      .eq("id", d.fid)
      .maybeSingle<{
        id: number;
        fstatus: string | null;
        fcabinetnumber: string | null;
        fcabinet_locked: boolean | null;
        fwarehousename: string | null;
      }>();
    if (fwdErr) {
      console.error(`[tb_forwarder assign lookup] failed`, { code: fwdErr.code, message: fwdErr.message });
      return { ok: false, error: `db_error:${fwdErr.code ?? "unknown"}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการ (fid ไม่ถูกต้อง)" };

    // 🔒 mig 0150 — never overwrite a locked cabinet.
    if (fwd.fcabinet_locked) {
      return { ok: false, error: "เลขตู้ถูกล็อกไว้ (fcabinet_locked) — แก้ไม่ได้" };
    }

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({
        fcabinetnumber: d.containerNo,
        adminidupdate: legacyAdminId,
        fdateadminstatus: new Date().toISOString(),
      })
      .eq("id", d.fid);
    if (updErr) {
      console.error(`[tb_forwarder assign update] failed`, { code: updErr.code, message: updErr.message });
      return { ok: false, error: `db_error:${updErr.code ?? "unknown"}` };
    }

    await logIntakeEvent(admin, {
      fid: d.fid,
      step: "assign_container",
      warehouseCode: fwd.fwarehousename ?? null,
      adminId: legacyAdminId,
      payload: { containerNo: d.containerNo, prev: fwd.fcabinetnumber },
    });
    await logAdminAction(adminId, "warehouse.assign_container", "tb_forwarder", String(d.fid), {
      containerNo: d.containerNo,
    });

    revalidatePath("/admin/warehouse/shipping");
    revalidatePath(`/admin/forwarders/${d.fid}`);
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════
// 6. DEPART / ARRIVE — advance the shipping status.
//    depart  fstatus 2→3 (กำลังส่งมาไทย · fdatestatus3)
//    arrive  fstatus 3→4 (ถึงไทยแล้ว · fdatestatus4)
//    Both gated via canAnyRoleFlipFstatus (G5 matrix).
// ════════════════════════════════════════════════════════════

const transitSchema = z.object({
  fid:  z.coerce.number().int().positive(),
  kind: z.enum(["depart", "arrive"]),
  note: z.string().trim().max(500).optional(),
});

export async function warehouseAdvanceTransit(
  rawInput: z.input<typeof transitSchema>,
): Promise<AdminActionResult<{ from: string; to: string }>> {
  const parsed = transitSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ from: string; to: string }>([...WAREHOUSE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);
    const roles = (await getAdminRoles()) ?? [];

    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fstatus, fwarehousename, fcredit")
      .eq("id", d.fid)
      .maybeSingle<{ id: number; fstatus: string | null; fwarehousename: string | null; fcredit: string | null }>();
    if (fwdErr) {
      console.error(`[tb_forwarder transit lookup] failed`, { code: fwdErr.code, message: fwdErr.message });
      return { ok: false, error: `db_error:${fwdErr.code ?? "unknown"}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการ (fid ไม่ถูกต้อง)" };

    const from = (fwd.fstatus ?? "1").trim();
    const isCredit = (fwd.fcredit ?? "").trim() === "1";
    const to = d.kind === "depart" ? "3" : "4";
    const expectedFrom = d.kind === "depart" ? "2" : "3";

    // A CREDIT order is flipped to fstatus=6 at credit-grant (legacy
    // forwarder.php:1431) but its goods can physically arrive in TH AFTER that.
    // Allow the ARRIVE scan on a credit order at 6 (6→4) so the warehouse can
    // record arrival — the 2026-06-14 prod "คนงานแสกนไม่ได้" fix. Legacy never
    // guarded the arrival write (forwarder.php:2231). depart keeps its 2→3 gate.
    const arriveOnCredit = d.kind === "arrive" && from === "6" && isCredit;
    if (from !== expectedFrom && !arriveOnCredit) {
      return {
        ok: false,
        error: `สถานะปัจจุบัน (${from}) ไม่พร้อม${d.kind === "depart" ? "ออกจากจีน" : "เข้าไทย"} — ต้องเป็น ${expectedFrom} ก่อน`,
      };
    }
    if (!canAnyRoleFlipFstatus(roles, from, to)) {
      return { ok: false, error: "forbidden_transition (ไม่มีสิทธิ์เปลี่ยนสถานะนี้)" };
    }

    const nowIso = new Date().toISOString();
    const update: Record<string, unknown> = {
      fstatus: to,
      adminidupdate: legacyAdminId,
      fdateadminstatus: nowIso,
    };
    if (d.kind === "depart") update.fdatestatus3 = nowIso;
    else update.fdatestatus4 = nowIso;

    const { error: updErr } = await admin.from("tb_forwarder").update(update).eq("id", d.fid);
    if (updErr) {
      console.error(`[tb_forwarder transit update] failed`, { code: updErr.code, message: updErr.message });
      return { ok: false, error: `db_error:${updErr.code ?? "unknown"}` };
    }

    await logIntakeEvent(admin, {
      fid: d.fid,
      step: d.kind,
      fstatusFrom: from,
      fstatusTo: to,
      warehouseCode: fwd.fwarehousename ?? null,
      adminId: legacyAdminId,
      note: d.note ?? null,
    });
    await logAdminAction(adminId, `warehouse.${d.kind}`, "tb_forwarder", String(d.fid), { from, to });

    revalidatePath("/admin/warehouse/transit");
    revalidatePath("/admin/warehouse/shipping");
    revalidatePath(`/admin/forwarders/${d.fid}`);
    return { ok: true, data: { from, to } };
  });
}

// ════════════════════════════════════════════════════════════
// 7. STATUS OVERRIDE — supervisor manual flip (every transition gated).
// ════════════════════════════════════════════════════════════

const overrideSchema = z.object({
  fid: z.coerce.number().int().positive(),
  to:  z.enum(["1", "2", "3", "4"]), // worker app only exposes the pre-billing range
  note: z.string().trim().max(500).optional(),
});

export async function warehouseStatusOverride(
  rawInput: z.input<typeof overrideSchema>,
): Promise<AdminActionResult<{ from: string; to: string }>> {
  const parsed = overrideSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ from: string; to: string }>([...WAREHOUSE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);
    const roles = (await getAdminRoles()) ?? [];

    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fstatus, fwarehousename")
      .eq("id", d.fid)
      .maybeSingle<{ id: number; fstatus: string | null; fwarehousename: string | null }>();
    if (fwdErr) {
      console.error(`[tb_forwarder override lookup] failed`, { code: fwdErr.code, message: fwdErr.message });
      return { ok: false, error: `db_error:${fwdErr.code ?? "unknown"}` };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการ (fid ไม่ถูกต้อง)" };

    const from = (fwd.fstatus ?? "1").trim();
    if (from === d.to) return { ok: true, data: { from, to: d.to } };

    // Never let the worker app touch billed/delivered rows.
    if (["5", "6", "7", "99"].includes(from)) {
      return { ok: false, error: `สถานะปัจจุบัน (${from}) อยู่นอกขอบเขตงานโกดัง` };
    }
    if (!canAnyRoleFlipFstatus(roles, from, d.to)) {
      return { ok: false, error: "forbidden_transition (ต้องเป็นหัวหน้างาน/super)" };
    }

    const nowIso = new Date().toISOString();
    const update: Record<string, unknown> = {
      fstatus: d.to,
      adminidupdate: legacyAdminId,
      fdateadminstatus: nowIso,
    };
    // stamp the matching fdatestatus column.
    if (d.to === "2") update.fdatestatus2 = nowIso;
    else if (d.to === "3") update.fdatestatus3 = nowIso;
    else if (d.to === "4") update.fdatestatus4 = nowIso;

    const { error: updErr } = await admin.from("tb_forwarder").update(update).eq("id", d.fid);
    if (updErr) {
      console.error(`[tb_forwarder override update] failed`, { code: updErr.code, message: updErr.message });
      return { ok: false, error: `db_error:${updErr.code ?? "unknown"}` };
    }

    await logIntakeEvent(admin, {
      fid: d.fid,
      step: "status_override",
      fstatusFrom: from,
      fstatusTo: d.to,
      warehouseCode: fwd.fwarehousename ?? null,
      adminId: legacyAdminId,
      note: d.note ?? null,
    });
    await logAdminAction(adminId, "warehouse.status_override", "tb_forwarder", String(d.fid), { from, to: d.to });

    revalidatePath("/admin/warehouse");
    revalidatePath(`/admin/forwarders/${d.fid}`);
    return { ok: true, data: { from, to: d.to } };
  });
}

// ════════════════════════════════════════════════════════════
// 8. PRINT LABEL — record a sack-tag / box-label / barcode print.
// ════════════════════════════════════════════════════════════

const printSchema = z.object({
  labelKind: z.enum(["sack_tag", "box_label", "barcode"]),
  sackId:    z.coerce.number().int().positive().optional(),
  fid:       z.coerce.number().int().positive().optional(),
  copies:    z.coerce.number().int().min(1).max(999).default(1),
});

export async function warehouseLogLabelPrint(
  rawInput: z.input<typeof printSchema>,
): Promise<AdminActionResult<void>> {
  const parsed = printSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;
  if (!d.sackId && !d.fid) {
    return { ok: false, error: "ต้องระบุ sackId หรือ fid อย่างใดอย่างหนึ่ง" };
  }

  return withAdmin<void>([...WAREHOUSE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

    const { error: insErr } = await admin.from("warehouse_sack_print_log").insert({
      sack_id:    d.sackId ?? null,
      fid:        d.fid ?? null,
      label_kind: d.labelKind,
      copies:     d.copies,
      admin_id:   legacyAdminId,
    });
    if (insErr) {
      console.error(`[warehouse_sack_print_log insert] failed`, { code: insErr.code, message: insErr.message });
      return { ok: false, error: `db_error:${insErr.code ?? "unknown"}` };
    }
    if (d.fid) {
      await logIntakeEvent(admin, {
        fid: d.fid,
        step: "print_label",
        adminId: legacyAdminId,
        payload: { labelKind: d.labelKind, copies: d.copies },
      });
    }
    await logAdminAction(adminId, "warehouse.print_label", "warehouse_sack_print_log", String(d.sackId ?? d.fid), {
      labelKind: d.labelKind, copies: d.copies,
    });
    return { ok: true };
  });
}

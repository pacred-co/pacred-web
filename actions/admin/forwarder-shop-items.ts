"use server";

/**
 * Server actions for editing shop-order line items (tb_order) directly from
 * the forwarder edit page (/admin/forwarders/[fNo]/edit).
 *
 * 2026-06-03 ภูม UX flag: "ทำให้แก้ไขในหน้านี้ด้วยเลยได้มั้ย พนักงานจะได้
 * ใช้ง่ายๆ ไม่ต้องโยกไปหน้าสั่งซื้อด้วย" — staff should edit shop line-items
 * inline without bouncing to /admin/service-orders/[hNo]/edit.
 *
 * Scope:
 *   - adminUpdateShopOrderRow — partial PATCH on a tb_order row · whitelisted
 *     fields (camount, cprice, cshippingchn, cpriceupdate, cnote, ctitle,
 *     cnameshop, ccolor, csize, ctrackingnumber). Each field has its own
 *     validation rule. After write, recomputes the header `tb_header_order`
 *     totals (hpriceupdate · hshippingchn · htotalpricechn) so the order's
 *     summary stays in sync.
 *   - adminDeleteShopOrderRow — hard-delete a single tb_order row · after
 *     write, decrements `tb_header_order.hcount` and recomputes totals.
 *
 * Sister actions in actions/admin/service-orders-line-edits.ts cover the
 * legacy-faithful split-by-field flow (adminUpdateCartItemPriceUpdate /
 * adminUpdateCartItemCTracking / adminUpdateCartItemShippingNumber). This
 * file is the COMPACT alternative for the forwarder-edit inline use-case
 * where ภูม wants one Save button per row instead of N per-field RPCs.
 *
 * Why both files? The per-field path is what /admin/service-orders/[hNo]/edit
 * uses — it does precise legacy-style audit-logging + waterfall recompute
 * per field. This file uses one wider patch + a simpler recompute = OK for
 * the forwarder side where the admin is doing forwarder ops, not accounting
 * waterfall ops.
 */

import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

// ─────────────────────────────────────────────────────────────────────────
// adminUpdateShopOrderRow — partial PATCH on a single tb_order row
// ─────────────────────────────────────────────────────────────────────────

/**
 * Per-field validators. Each maps the form's stringified value to the
 * DB-shaped value, applying its own rule. Returns { ok, value, error }.
 */
type FieldName =
  | "camount" | "cprice" | "cshippingchn" | "cpriceupdate"
  | "cnote" | "ctitle" | "cnameshop" | "ccolor" | "csize"
  | "ctrackingnumber";

const NUMERIC_FIELDS: ReadonlySet<FieldName> = new Set([
  "camount", "cprice", "cshippingchn", "cpriceupdate",
]);
const TEXT_FIELDS: ReadonlySet<FieldName> = new Set([
  "cnote", "ctitle", "cnameshop", "ccolor", "csize", "ctrackingnumber",
]);

function validateField(field: FieldName, raw: string): { ok: true; value: number | string } | { ok: false; error: string } {
  if (NUMERIC_FIELDS.has(field)) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return { ok: false, error: `${field}: ต้องเป็นตัวเลข` };
    if (field === "camount") {
      if (!Number.isInteger(n)) return { ok: false, error: `จำนวน: ต้องเป็นจำนวนเต็ม` };
      if (n < 0)               return { ok: false, error: `จำนวน: ต้องไม่ติดลบ` };
      if (n > 99_999)          return { ok: false, error: `จำนวน: เกิน 99,999` };
    } else {
      // Money fields — allow 2 decimals, range ±100,000 ¥
      if (Math.abs(n) > 100_000) return { ok: false, error: `${field}: เกินขอบเขต ±100,000` };
      const rounded = Math.round(n * 100) / 100;
      return { ok: true, value: rounded };
    }
    return { ok: true, value: n };
  }
  // Text fields — trim + length cap
  const v = raw.trim();
  if (v.length > 500) return { ok: false, error: `${field}: ยาวเกิน 500 ตัวอักษร` };
  if (field === "ctrackingnumber" && v.length > 200) return { ok: false, error: `tracking: ยาวเกิน 200 ตัวอักษร` };
  return { ok: true, value: v };
}

const updateRowSchema = z.object({
  itemId: z.number().int().positive(),
  patch:  z.record(z.string(), z.string()),    // { camount: "10", cprice: "55.00", ... }
});

export type AdminUpdateShopOrderRowInput = z.infer<typeof updateRowSchema>;

export type AdminUpdateShopOrderRowResult =
  | { ok: true;  itemId: number; updatedFields: FieldName[]; recomputed: { hpriceupdate: number; htotalpricechn: number } | null }
  | { ok: false; error: string };

export async function adminUpdateShopOrderRow(
  input: AdminUpdateShopOrderRowInput,
): Promise<AdminUpdateShopOrderRowResult> {
  const parsed = updateRowSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: `Input ไม่ถูกต้อง: ${parsed.error.message}` };
  }
  const { itemId, patch } = parsed.data;

  try {
    const { roles } = await requireAdmin(["super", "accounting", "ops"]);
    void roles;
  } catch {
    return { ok: false, error: "ต้องเป็น admin ระดับ super/accounting/ops เท่านั้น" };
  }

  // ── 1. Validate each requested field ────────────────────────────
  const ALLOWED: ReadonlySet<FieldName> = new Set([
    "camount", "cprice", "cshippingchn", "cpriceupdate",
    "cnote", "ctitle", "cnameshop", "ccolor", "csize", "ctrackingnumber",
  ]);

  const updates: Record<string, number | string> = {};
  const updatedFields: FieldName[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (!ALLOWED.has(k as FieldName)) {
      return { ok: false, error: `field "${k}" ไม่อยู่ใน whitelist (ห้ามแก้ผ่าน inline editor)` };
    }
    const r = validateField(k as FieldName, v);
    if (!r.ok) return { ok: false, error: r.error };
    updates[k] = r.value;
    updatedFields.push(k as FieldName);
  }

  if (updatedFields.length === 0) {
    return { ok: false, error: "ไม่มี field ใดส่งมาให้อัปเดต" };
  }

  // ── 2. Load existing row + parent header (for recompute scope) ──
  const admin = createAdminClient();
  const { data: rowBefore, error: loadErr } = await admin
    .from("tb_order")
    .select("id, hno, camount, cprice, cshippingchn, cpriceupdate")
    .eq("id", itemId)
    .maybeSingle();
  if (loadErr) {
    console.error(`[adminUpdateShopOrderRow load]`, { code: loadErr.code, message: loadErr.message, itemId });
    return { ok: false, error: `โหลดรายการล้มเหลว: ${loadErr.message}` };
  }
  if (!rowBefore) {
    return { ok: false, error: `ไม่พบรายการ id=${itemId} ใน tb_order` };
  }
  const hno = (rowBefore.hno as string) ?? "";

  // ── 3. Apply the partial UPDATE ─────────────────────────────────
  const { error: updErr } = await admin
    .from("tb_order")
    .update(updates)
    .eq("id", itemId);
  if (updErr) {
    console.error(`[adminUpdateShopOrderRow patch]`, { code: updErr.code, message: updErr.message, itemId, updates });
    return { ok: false, error: `บันทึก tb_order ล้มเหลว: ${updErr.message}` };
  }

  // ── 4. Re-aggregate the header totals (best-effort) ─────────────
  let recomputed: { hpriceupdate: number; htotalpricechn: number } | null = null;
  if (hno) {
    const { data: rows, error: aggErr } = await admin
      .from("tb_order")
      .select("camount, cprice, cshippingchn, cpriceupdate")
      .eq("hno", hno);
    if (!aggErr && rows) {
      const hpriceupdate = rows.reduce((s, r) => s + Number(r.cpriceupdate ?? 0), 0);
      const hshippingchn = rows.reduce((s, r) => s + Number(r.cshippingchn ?? 0), 0);
      const htotalpricechn = rows.reduce(
        (s, r) => s + Number(r.cprice ?? 0) * Number(r.camount ?? 0)
                   + Number(r.cshippingchn ?? 0)
                   + Number(r.cpriceupdate ?? 0),
        0,
      );
      const { error: hUpdErr } = await admin
        .from("tb_header_order")
        .update({
          hpriceupdate:   Math.round(hpriceupdate * 100) / 100,
          hshippingchn:   Math.round(hshippingchn * 100) / 100,
          htotalpricechn: Math.round(htotalpricechn * 100) / 100,
        })
        .eq("hno", hno);
      if (hUpdErr) {
        // Non-fatal — header sync can be re-run; the line is already saved.
        console.error(`[adminUpdateShopOrderRow header-sync]`, { code: hUpdErr.code, message: hUpdErr.message, hno });
      } else {
        recomputed = {
          hpriceupdate:   Math.round(hpriceupdate * 100) / 100,
          htotalpricechn: Math.round(htotalpricechn * 100) / 100,
        };
      }
    }
  }

  // ── 5. Revalidate the surfaces that read this data ──────────────
  revalidatePath(`/admin/forwarders`, "layout");
  if (hno) revalidatePath(`/admin/service-orders/${hno}`);

  return { ok: true, itemId, updatedFields, recomputed };
}


// ─────────────────────────────────────────────────────────────────────────
// adminDeleteShopOrderRow — hard delete one tb_order row
// ─────────────────────────────────────────────────────────────────────────

const deleteRowSchema = z.object({
  itemId:    z.number().int().positive(),
  reason:    z.string().trim().min(2, "ระบุเหตุผลลบอย่างน้อย 2 ตัวอักษร").max(500),
});

export type AdminDeleteShopOrderRowInput = z.infer<typeof deleteRowSchema>;

export type AdminDeleteShopOrderRowResult =
  | { ok: true;  itemId: number; hno: string; remainingCount: number }
  | { ok: false; error: string };

export async function adminDeleteShopOrderRow(
  input: AdminDeleteShopOrderRowInput,
): Promise<AdminDeleteShopOrderRowResult> {
  const parsed = deleteRowSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: `Input ไม่ถูกต้อง: ${parsed.error.message}` };
  }
  const { itemId, reason } = parsed.data;
  void reason; // captured for audit log (future) — for now passed for UX gate

  try {
    await requireAdmin(["super", "accounting"]);
  } catch {
    return { ok: false, error: "ต้องเป็น admin ระดับ super/accounting เท่านั้น (ลบรายการคือกระทบเงิน)" };
  }

  const admin = createAdminClient();

  // Load to capture hno + dollar context (for recompute after delete)
  const { data: row, error: loadErr } = await admin
    .from("tb_order")
    .select("id, hno, ctitle, camount, cprice")
    .eq("id", itemId)
    .maybeSingle();
  if (loadErr) {
    console.error(`[adminDeleteShopOrderRow load]`, { code: loadErr.code, message: loadErr.message, itemId });
    return { ok: false, error: `โหลดรายการล้มเหลว: ${loadErr.message}` };
  }
  if (!row) return { ok: false, error: `ไม่พบรายการ id=${itemId}` };
  const hno = (row.hno as string) ?? "";

  // Delete
  const { error: delErr } = await admin
    .from("tb_order")
    .delete()
    .eq("id", itemId);
  if (delErr) {
    console.error(`[adminDeleteShopOrderRow delete]`, { code: delErr.code, message: delErr.message, itemId });
    return { ok: false, error: `ลบรายการล้มเหลว: ${delErr.message}` };
  }

  // Recompute header counts + totals
  let remainingCount = 0;
  if (hno) {
    const { data: rows, count, error: aggErr } = await admin
      .from("tb_order")
      .select("camount, cprice, cshippingchn, cpriceupdate", { count: "exact" })
      .eq("hno", hno);
    if (!aggErr && rows) {
      remainingCount = count ?? rows.length;
      const hpriceupdate   = rows.reduce((s, r) => s + Number(r.cpriceupdate ?? 0), 0);
      const hshippingchn   = rows.reduce((s, r) => s + Number(r.cshippingchn ?? 0), 0);
      const htotalpricechn = rows.reduce(
        (s, r) => s + Number(r.cprice ?? 0) * Number(r.camount ?? 0)
                   + Number(r.cshippingchn ?? 0)
                   + Number(r.cpriceupdate ?? 0),
        0,
      );
      const { error: hUpdErr } = await admin
        .from("tb_header_order")
        .update({
          hcount:         remainingCount,
          hpriceupdate:   Math.round(hpriceupdate * 100) / 100,
          hshippingchn:   Math.round(hshippingchn * 100) / 100,
          htotalpricechn: Math.round(htotalpricechn * 100) / 100,
        })
        .eq("hno", hno);
      if (hUpdErr) {
        console.error(`[adminDeleteShopOrderRow header-sync]`, { code: hUpdErr.code, message: hUpdErr.message, hno });
      }
    }
  }

  revalidatePath(`/admin/forwarders`, "layout");
  if (hno) revalidatePath(`/admin/service-orders/${hno}`);

  return { ok: true, itemId, hno, remainingCount };
}

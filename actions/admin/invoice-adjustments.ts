"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";

/**
 * V-A5: Manual invoice adjustments (±amount, reason, audited).
 *
 * Per PORT_PLAN Part V row V-A5 — "ends the per-cent dev tickets".
 * Legacy reference: pcscargo/.../pcs-admin/include/pages/receipt.php
 * (no clean adjustment line — every per-cent correction required a
 * developer; chat audit W-4 documents the pain). This is a Pacred
 * safety+productivity improvement on top of the faithful port.
 *
 * Three actions:
 *   - addInvoiceAdjustment(target_type, target_id, amount, reason)
 *       INSERT row + writes admin_audit_log. amount can be ± (negative
 *       = discount, positive = surcharge). Customer notified.
 *   - listInvoiceAdjustments(target_type, target_id)
 *       Admin read for the invoice-detail panel. Returns active +
 *       reversed rows so the history is visible.
 *   - reverseInvoiceAdjustment(id, reason)
 *       Admin reversal — flips status='reversed' + records who/when/why.
 *       Reversed rows stay visible but are excluded from invoice total
 *       (the view `invoice_adjustment_totals` already filters them).
 *
 * RBAC: super OR accounting (money-touching gate per ADR-0005 K-7).
 * Ops is intentionally excluded — they have the U2-4 cost-adjustment
 * path for post-delivery rebills.
 */

// ────────────────────────────────────────────────────────────
// Shared schema parts
// ────────────────────────────────────────────────────────────
const TARGET_TYPES = ["forwarder", "service_order", "freight_invoice"] as const;
export type InvoiceAdjustmentTargetType = (typeof TARGET_TYPES)[number];

const TARGET_TYPE_LABEL_TH: Record<InvoiceAdjustmentTargetType, string> = {
  forwarder:       "ใบนำเข้า",
  service_order:   "ใบฝากสั่ง",
  freight_invoice: "ใบกำกับ Freight",
};

/**
 * Resolve target_type + target_id → (profile_id, link_href) so we can
 * (a) populate profile_id on the row for fast RLS lookup, and (b)
 * notify the customer with a working link to their receipt page.
 *
 * Returns { ok: false } if the parent invoice doesn't exist.
 */
async function resolveInvoiceTarget(
  admin: ReturnType<typeof createAdminClient>,
  target_type: InvoiceAdjustmentTargetType,
  target_id: string,
): Promise<
  | { ok: true; profile_id: string; link_href: string; revalidate_paths: string[] }
  | { ok: false; error: string }
> {
  if (target_type === "forwarder") {
    const { data } = await admin
      .from("forwarders")
      .select("profile_id, f_no")
      .eq("f_no", target_id)
      .maybeSingle<{ profile_id: string; f_no: string }>();
    if (!data) return { ok: false, error: "forwarder_not_found" };
    return {
      ok: true,
      profile_id: data.profile_id,
      link_href: `/service-import/${data.f_no}/receipt`,
      revalidate_paths: [
        `/admin/forwarders/${data.f_no}`,
        `/service-import/${data.f_no}`,
        `/service-import/${data.f_no}/receipt`,
      ],
    };
  }
  if (target_type === "service_order") {
    const { data } = await admin
      .from("service_orders")
      .select("profile_id, h_no")
      .eq("h_no", target_id)
      .maybeSingle<{ profile_id: string; h_no: string }>();
    if (!data) return { ok: false, error: "service_order_not_found" };
    return {
      ok: true,
      profile_id: data.profile_id,
      link_href: `/service-order/${data.h_no}/receipt`,
      revalidate_paths: [
        `/admin/service-orders/${data.h_no}`,
        `/service-order/${data.h_no}`,
        `/service-order/${data.h_no}/receipt`,
      ],
    };
  }
  // freight_invoice — target_id is the uuid
  const { data } = await admin
    .from("freight_invoices")
    .select("id, profile_id")
    .eq("id", target_id)
    .maybeSingle<{ id: string; profile_id: string }>();
  if (!data) return { ok: false, error: "freight_invoice_not_found" };
  return {
    ok: true,
    profile_id: data.profile_id,
    link_href: `/freight/invoice/${data.id}`,
    revalidate_paths: [
      `/admin/freight/invoices/${data.id}`,
      `/freight/invoice/${data.id}`,
    ],
  };
}

// ────────────────────────────────────────────────────────────
// Add (create) — admin records a manual ± adjustment line
// ────────────────────────────────────────────────────────────
const addSchema = z.object({
  target_type: z.enum(TARGET_TYPES),
  target_id:   z.string().trim().min(1).max(64),
  // Signed amount. The DB also enforces non-zero; here we cap the
  // magnitude to keep typos from creating ฿9,999,999 of "discount".
  amount_thb:  z.number().refine((v) => Number.isFinite(v) && v !== 0, {
    message: "amount ต้องไม่เป็น 0",
  }).refine((v) => Math.abs(v) <= 10_000_000, {
    message: "amount มากเกินไป (สูงสุด 10,000,000)",
  }),
  reason:      z.string().trim().min(3, "reason ต้อง ≥ 3 ตัว").max(2000),
});
export type AddInvoiceAdjustmentInput = z.infer<typeof addSchema>;

export async function addInvoiceAdjustment(
  input: AddInvoiceAdjustmentInput,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<{ id: string }>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const target = await resolveInvoiceTarget(admin, d.target_type, d.target_id);
    if (!target.ok) return { ok: false, error: target.error };

    const { data: created, error: insErr } = await admin
      .from("invoice_adjustments")
      .insert({
        target_type:    d.target_type,
        target_id:      d.target_id,
        profile_id:     target.profile_id,
        amount_thb:     d.amount_thb,
        reason:         d.reason,
        status:         "active",
        added_by_admin: adminId,
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr) return { ok: false, error: insErr.message };

    await logAdminAction(adminId, "invoice_adj.create", "invoice_adjustment", created.id, {
      target_type: d.target_type,
      target_id:   d.target_id,
      amount_thb:  d.amount_thb,
      reason:      d.reason,
    });

    // Customer notification — surcharge vs discount messaging.
    // Only attach reference_type for the kinds the notifications union
    // supports (forwarder / service_order); freight_invoice omits it.
    const isSurcharge = d.amount_thb > 0;
    const amountAbs = Math.abs(d.amount_thb);
    const targetLabel = TARGET_TYPE_LABEL_TH[d.target_type];
    const refType =
      d.target_type === "forwarder"     ? "forwarder" as const :
      d.target_type === "service_order" ? "service_order" as const :
      undefined;
    void sendNotification(target.profile_id, {
      category: "payment",
      severity: isSurcharge ? "warning" : "success",
      title:    isSurcharge
        ? `มีการปรับเพิ่มยอด — ${targetLabel} ${d.target_id}`
        : `มีการปรับลด/ส่วนลด — ${targetLabel} ${d.target_id}`,
      body:     `${isSurcharge ? "+" : "−"}฿${amountAbs.toLocaleString("th-TH", { minimumFractionDigits: 2 })} · ${d.reason}`,
      link_href: target.link_href,
      ...(refType ? { reference_type: refType, reference_id: d.target_id } : {}),
    });

    for (const p of target.revalidate_paths) revalidatePath(p);

    return { ok: true, data: { id: created.id } };
  });
}

// ────────────────────────────────────────────────────────────
// List — admin read for the invoice-detail panel
// ────────────────────────────────────────────────────────────
const listSchema = z.object({
  target_type: z.enum(TARGET_TYPES),
  target_id:   z.string().trim().min(1).max(64),
});
export type ListInvoiceAdjustmentsInput = z.infer<typeof listSchema>;

export type InvoiceAdjustmentRow = {
  id:                string;
  amount_thb:        number;
  reason:            string;
  status:            "active" | "reversed";
  added_by_admin:    string;
  reversed_at:       string | null;
  reversed_by_admin: string | null;
  reversal_reason:   string | null;
  created_at:        string;
};

export async function listInvoiceAdjustments(
  input: ListInvoiceAdjustmentsInput,
): Promise<AdminActionResult<{ rows: InvoiceAdjustmentRow[]; active_total_thb: number }>> {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async () => {
    const admin = createAdminClient();

    const { data: rows, error } = await admin
      .from("invoice_adjustments")
      .select("id, amount_thb, reason, status, added_by_admin, reversed_at, reversed_by_admin, reversal_reason, created_at")
      .eq("target_type", d.target_type)
      .eq("target_id",   d.target_id)
      .order("created_at", { ascending: false })
      .returns<InvoiceAdjustmentRow[]>();
    if (error) return { ok: false, error: error.message };

    const active_total_thb = (rows ?? [])
      .filter((r) => r.status === "active")
      .reduce((sum, r) => sum + Number(r.amount_thb), 0);

    return { ok: true, data: { rows: rows ?? [], active_total_thb } };
  });
}

// ────────────────────────────────────────────────────────────
// Reverse — admin flips an adjustment to status='reversed' + audit
// ────────────────────────────────────────────────────────────
const reverseSchema = z.object({
  id:     z.string().uuid(),
  reason: z.string().trim().min(3, "reason ต้อง ≥ 3 ตัว").max(500),
});
export type ReverseInvoiceAdjustmentInput = z.infer<typeof reverseSchema>;

export async function reverseInvoiceAdjustment(
  input: ReverseInvoiceAdjustmentInput,
): Promise<AdminActionResult> {
  const parsed = reverseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: adj } = await admin
      .from("invoice_adjustments")
      .select("id, target_type, target_id, profile_id, amount_thb, status")
      .eq("id", d.id)
      .maybeSingle<{
        id:          string;
        target_type: InvoiceAdjustmentTargetType;
        target_id:   string;
        profile_id:  string;
        amount_thb:  number;
        status:      string;
      }>();
    if (!adj)                       return { ok: false, error: "not_found" };
    if (adj.status === "reversed")  return { ok: false, error: "already_reversed" };

    const nowIso = new Date().toISOString();
    const { error: updErr } = await admin
      .from("invoice_adjustments")
      .update({
        status:            "reversed",
        reversed_at:       nowIso,
        reversed_by_admin: adminId,
        reversal_reason:   d.reason,
      })
      .eq("id", adj.id)
      .neq("status", "reversed");
    if (updErr) return { ok: false, error: updErr.message };

    await logAdminAction(adminId, "invoice_adj.reverse", "invoice_adjustment", adj.id, {
      target_type: adj.target_type,
      target_id:   adj.target_id,
      amount_thb:  adj.amount_thb,
      reason:      d.reason,
    });

    // Look up the parent invoice again for the revalidate paths
    const target = await resolveInvoiceTarget(admin, adj.target_type, adj.target_id);
    if (target.ok) {
      const wasSurcharge = Number(adj.amount_thb) > 0;
      const refType =
        adj.target_type === "forwarder"     ? "forwarder" as const :
        adj.target_type === "service_order" ? "service_order" as const :
        undefined;
      void sendNotification(adj.profile_id, {
        category: "payment",
        severity: "info",
        title:    `ยกเลิกรายการปรับ — ${TARGET_TYPE_LABEL_TH[adj.target_type]} ${adj.target_id}`,
        body:     `รายการ ${wasSurcharge ? "+" : "−"}฿${Math.abs(Number(adj.amount_thb)).toLocaleString("th-TH", { minimumFractionDigits: 2 })} ถูกยกเลิก · ${d.reason}`,
        link_href: target.link_href,
        ...(refType ? { reference_type: refType, reference_id: adj.target_id } : {}),
      });
      for (const p of target.revalidate_paths) revalidatePath(p);
    }

    return { ok: true };
  });
}

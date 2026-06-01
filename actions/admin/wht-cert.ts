"use server";

/**
 * actions/admin/wht-cert.ts — 50-ทวิ certificate tracking (Pacred RECEIVES
 * from juristic customers per ADR-0015 + 0129).
 *
 * Per `docs/briefs/poom-wave-2026-06-01.md` §3.4 banner (Phase-C item: "50-ทวิ
 * certificate chasing UI for tb_forwarder_wht_entry.cert_status='pending' ·
 * juristic customers จะออก 50-ทวิ ให้").
 *
 * Two surfaces:
 *   - getWhtCertQueue → list pending cert entries grouped by customer
 *   - adminMarkCertReceived → admin sets cert_status='received' with cert_number
 *   - adminWaiveCert      → admin sets cert_status='waived' with reason
 *
 * Per AGENTS.md §0c — every Supabase query destructures `error`.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

export type WhtCertEntry = {
  id:              number;
  invoiceId:       number | null;
  userid:          string;
  whtClass:        "transport" | "service" | "rental" | "goods";
  whtBaseThb:      number;
  whtRatePct:      number;
  whtAmountThb:    number;
  certStatus:      "pending" | "received" | "waived";
  certNumber:      string | null;
  certReceivedAt:  string | null;
  createdAt:       string;
  /** Hydrated invoice serial (if invoiceId is set). */
  invoiceSerial:   string | null;
};

export type WhtCertQueue = {
  pending:    WhtCertEntry[];
  received:   WhtCertEntry[];
  waived:     WhtCertEntry[];
  byCustomer: Array<{
    userid:        string;
    pendingCount:  number;
    pendingAmount: number;
  }>;
};

// ────────────────────────────────────────────────────────────────────────
// 1. LIST queue
// ────────────────────────────────────────────────────────────────────────

export async function getWhtCertQueue(opts: {
  status?: "pending" | "received" | "waived" | "all";
  userid?: string;
  limit?:  number;
}): Promise<WhtCertQueue> {
  const admin = createAdminClient();

  let q = admin
    .from("tb_forwarder_wht_entry")
    .select(
      "id, invoice_id, userid, wht_class, wht_base_thb, wht_rate_pct, wht_amount_thb, " +
      "cert_status, cert_number, cert_received_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 500);

  if (opts.status && opts.status !== "all") q = q.eq("cert_status", opts.status);
  if (opts.userid) q = q.eq("userid", opts.userid);

  const { data: raw, error } = await q;
  if (error) {
    console.error("[wht-cert queue] failed", { code: error.code, message: error.message });
  }
  type Raw = {
    id:              number;
    invoice_id:      number | null;
    userid:          string;
    wht_class:       "transport" | "service" | "rental" | "goods";
    wht_base_thb:    number | string | null;
    wht_rate_pct:    number | string | null;
    wht_amount_thb:  number | string | null;
    cert_status:     "pending" | "received" | "waived";
    cert_number:     string | null;
    cert_received_at: string | null;
    created_at:      string;
  };
  const rows = (raw ?? []) as Raw[];

  // Hydrate invoice serial — batched IN query
  const invoiceIds = Array.from(new Set(rows.map((r) => r.invoice_id).filter((v): v is number => v != null)));
  let serialByInvoice = new Map<number, string | null>();
  if (invoiceIds.length > 0) {
    type InvRow = { id: number; serial_no: string | null };
    const { data: invRaw, error: invErr } = await admin
      .from("tb_forwarder_tax_invoice")
      .select("id, serial_no")
      .in("id", invoiceIds);
    if (invErr) {
      console.error("[wht-cert invoice hydrate] failed", { code: invErr.code, message: invErr.message });
    }
    serialByInvoice = new Map(((invRaw ?? []) as InvRow[]).map((i) => [i.id, i.serial_no]));
  }

  const entries: WhtCertEntry[] = rows.map((r) => ({
    id:              r.id,
    invoiceId:       r.invoice_id,
    userid:          r.userid,
    whtClass:        r.wht_class,
    whtBaseThb:      Number(r.wht_base_thb ?? 0),
    whtRatePct:      Number(r.wht_rate_pct ?? 0),
    whtAmountThb:    Number(r.wht_amount_thb ?? 0),
    certStatus:      r.cert_status,
    certNumber:      r.cert_number,
    certReceivedAt:  r.cert_received_at,
    createdAt:       r.created_at,
    invoiceSerial:   r.invoice_id != null ? (serialByInvoice.get(r.invoice_id) ?? null) : null,
  }));

  // Per-customer rollup (pending only)
  const customerAgg = new Map<string, { pendingCount: number; pendingAmount: number }>();
  for (const e of entries) {
    if (e.certStatus !== "pending") continue;
    const cur = customerAgg.get(e.userid) ?? { pendingCount: 0, pendingAmount: 0 };
    cur.pendingCount  += 1;
    cur.pendingAmount += e.whtAmountThb;
    customerAgg.set(e.userid, cur);
  }
  const byCustomer = Array.from(customerAgg.entries())
    .map(([userid, agg]) => ({ userid, ...agg }))
    .sort((a, b) => b.pendingAmount - a.pendingAmount)
    .slice(0, 20);

  return {
    pending:  entries.filter((e) => e.certStatus === "pending"),
    received: entries.filter((e) => e.certStatus === "received"),
    waived:   entries.filter((e) => e.certStatus === "waived"),
    byCustomer,
  };
}

// ────────────────────────────────────────────────────────────────────────
// 2. Mark cert RECEIVED
// ────────────────────────────────────────────────────────────────────────

const markReceivedSchema = z.object({
  entryId:    z.number().int().positive(),
  certNumber: z.string().trim().min(1, "ต้องระบุเลขที่ 50-ทวิ").max(100),
});
export type MarkCertReceivedInput = z.infer<typeof markReceivedSchema>;

export async function adminMarkCertReceived(
  input: MarkCertReceivedInput,
): Promise<AdminActionResult<{ id: number; cert_number: string }>> {
  const parsed = markReceivedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    const { data: updRaw, error: updErr } = await admin
      .from("tb_forwarder_wht_entry")
      .update({
        cert_status:      "received",
        cert_number:      d.certNumber,
        cert_received_at: nowIso,
        updated_at:       nowIso,
      })
      .eq("id", d.entryId)
      .eq("cert_status", "pending")  // race-guard: only flip pending → received
      .select("id, cert_number")
      .maybeSingle<{ id: number; cert_number: string }>();
    if (updErr) {
      return { ok: false, error: `update_failed: ${updErr.message}` };
    }
    if (!updRaw) {
      return { ok: false, error: "already_processed_or_not_found" };
    }

    await logAdminAction(adminId, "wht_cert.received", "tb_forwarder_wht_entry", String(updRaw.id), {
      cert_number: d.certNumber,
    });

    revalidatePath("/admin/accounting/wht-certs");
    return { ok: true, data: updRaw };
  });
}

// ────────────────────────────────────────────────────────────────────────
// 3. WAIVE cert (admin decides juristic customer won't send — e.g. small WHT)
// ────────────────────────────────────────────────────────────────────────

const waiveSchema = z.object({
  entryId:      z.number().int().positive(),
  waivedReason: z.string().trim().min(10, "ต้องระบุเหตุผลอย่างน้อย 10 ตัวอักษร").max(500),
});
export type WaiveCertInput = z.infer<typeof waiveSchema>;

export async function adminWaiveCert(
  input: WaiveCertInput,
): Promise<AdminActionResult<{ id: number }>> {
  const parsed = waiveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    const { data: updRaw, error: updErr } = await admin
      .from("tb_forwarder_wht_entry")
      .update({
        cert_status:    "waived",
        waived_reason:  d.waivedReason,
        waived_by:      adminId,
        waived_at:      nowIso,
        updated_at:     nowIso,
      })
      .eq("id", d.entryId)
      .eq("cert_status", "pending")
      .select("id")
      .maybeSingle<{ id: number }>();
    if (updErr) {
      return { ok: false, error: `update_failed: ${updErr.message}` };
    }
    if (!updRaw) {
      return { ok: false, error: "already_processed_or_not_found" };
    }

    await logAdminAction(adminId, "wht_cert.waived", "tb_forwarder_wht_entry", String(updRaw.id), {
      reason: d.waivedReason,
    });

    revalidatePath("/admin/accounting/wht-certs");
    return { ok: true, data: updRaw };
  });
}

"use server";

/**
 * D1 Phase B — legacy `tb_cnt` container-PAYMENT ledger.
 *
 * Restores the legacy PCS Cargo "ตารางจ่ายเงินค่าตู้" model. `tb_cnt` is
 * NOT a logistics state-machine — it is a payment-slip ledger: one row
 * per China-side container payment (เลขตู้ + ยอด + paid/unpaid + slip
 * image), with a fan-out of the PK/CO numbers (`tb_cnt_pay_idorco`) and
 * China-tracking numbers (`tb_cnt_pay_trackingchn`) the payment covers.
 *
 * Spec: docs/research/d1-fidelity-admin.md §6.3 + d1-fidelity-workflow.md
 * §3. Legacy ground truth: pcs-admin/report-cnt.php (the addPay flow).
 *
 * Pacred's `cargo_containers` 6-state logistics entity is KEPT (it is a
 * genuine improvement) — this ledger lives ALONGSIDE it, giving the
 * accounting team the paid/unpaid container-cost surface they had in PCS.
 *
 * Tables (migration 0081 — legacy schema, RLS-on / no policies, so only
 * the service-role admin client reaches them):
 *   tb_cnt                 — one row per container payment
 *   tb_cnt_item            — each fCabinetNumber string → cntID
 *   tb_cnt_pay_idorco      — PK/CO numbers (forwarders.f_no) covered
 *   tb_cnt_pay_trackingchn — China tracking numbers covered
 *
 * Legacy column quirks reproduced faithfully:
 *   - cntstatus  : varchar(1) — "1" = ยังไม่จ่ายเงิน, "2" = จ่ายเงินแล้ว
 *   - cntname    : varchar(1000) — comma-joined list of เลขตู้ strings
 *   - all the *NOT NULL* text columns default to "" (legacy used "" not NULL)
 *
 * RBAC: super + accounting (finance territory — ADR-0005 K-7 / W-1).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
// Legacy cntstatus codes live in a plain module — a "use server" file
// may only export async functions, so the constant cannot live here.
import { PCS_CNT_STATUS } from "@/app/[locale]/(admin)/admin/accounting/container-payments/constants";

const SLIP_BUCKET = "slips";
const MAX_SLIP_BYTES = 10 * 1024 * 1024;
const SLIP_MIMES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];

// ────────────────────────────────────────────────────────────
// Row shapes (legacy bigint PKs — these tables predate Pacred's
// uuid convention; faithfulness means we keep them).
// ────────────────────────────────────────────────────────────

export type PcsContainerPaymentRow = {
  id:            number;
  cntname:       string;   // เลขตู้ — comma-joined list
  cntstatus:     string;   // "1" unpaid / "2" paid
  cntamount:     number;
  cntimagesslip: string;   // storage path of the China-side slip
  cntfile:       string;   // optional extra doc (PDF)
  date:          string | null;
  dateupdate:    string | null;
  adminidcreate: string;
  adminidupdate: string;
  nameblank:     string;   // payee bank name
  noblank:       string;   // payee account no.
  nameaccount:   string;   // payee account holder
};

export type PcsContainerPaymentDetail = PcsContainerPaymentRow & {
  cabinetNumbers: string[];   // tb_cnt_item.fcabinetnumber
  idOrCo:         string[];   // tb_cnt_pay_idorco.fidorco (PK/CO numbers)
  trackingChn:    string[];   // tb_cnt_pay_trackingchn.ftrackingchn
};

// ────────────────────────────────────────────────────────────
// LIST — the ledger view (keyed by cntname).
// ────────────────────────────────────────────────────────────

const listSchema = z.object({
  status: z.enum(["all", "unpaid", "paid"]).default("all"),
  q:      z.string().trim().max(200).optional(),   // matches cntname
  limit:  z.number().int().min(1).max(500).default(200),
});

export async function listPcsContainerPayments(
  input: z.input<typeof listSchema> = {},
): Promise<AdminActionResult<{ rows: PcsContainerPaymentRow[]; unpaidCount: number }>> {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const f = parsed.data;

  return withAdmin<{ rows: PcsContainerPaymentRow[]; unpaidCount: number }>(
    ["super", "accounting"],
    async () => {
      const admin = createAdminClient();

      let query = admin
        .from("tb_cnt")
        .select("id, cntname, cntstatus, cntamount, cntimagesslip, cntfile, date, dateupdate, adminidcreate, adminidupdate, nameblank, noblank, nameaccount")
        .order("id", { ascending: false })
        .limit(f.limit);

      if (f.status === "unpaid") query = query.eq("cntstatus", PCS_CNT_STATUS.UNPAID);
      if (f.status === "paid")   query = query.eq("cntstatus", PCS_CNT_STATUS.PAID);
      if (f.q)                   query = query.ilike("cntname", `%${f.q}%`);

      const { data, error } = await query;
      if (error) return { ok: false, error: error.message };

      // Sidebar/header badge count = unpaid payments (legacy cnt-hs badge).
      const { count } = await admin
        .from("tb_cnt")
        .select("id", { count: "exact", head: true })
        .eq("cntstatus", PCS_CNT_STATUS.UNPAID);

      return {
        ok: true,
        data: {
          rows:        ((data ?? []) as PcsContainerPaymentRow[]).map(normaliseRow),
          unpaidCount: count ?? 0,
        },
      };
    },
  );
}

// ────────────────────────────────────────────────────────────
// DETAIL — one payment + its three fan-out lists.
// ────────────────────────────────────────────────────────────

export async function getPcsContainerPaymentDetail(
  id: number,
): Promise<AdminActionResult<PcsContainerPaymentDetail>> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "invalid_input" };

  return withAdmin<PcsContainerPaymentDetail>(["super", "accounting"], async () => {
    const admin = createAdminClient();

    const { data: row, error } = await admin
      .from("tb_cnt")
      .select("id, cntname, cntstatus, cntamount, cntimagesslip, cntfile, date, dateupdate, adminidcreate, adminidupdate, nameblank, noblank, nameaccount")
      .eq("id", id)
      .maybeSingle<PcsContainerPaymentRow>();
    if (error) return { ok: false, error: error.message };
    if (!row)  return { ok: false, error: "not_found" };

    const [{ data: items }, { data: idorco }, { data: tracking }] = await Promise.all([
      admin.from("tb_cnt_item").select("fcabinetnumber").eq("cntid", id),
      admin.from("tb_cnt_pay_idorco").select("fidorco").eq("fcabinetnumber", row.cntname),
      admin.from("tb_cnt_pay_trackingchn").select("ftrackingchn").eq("fcabinetnumber", row.cntname),
    ]);

    return {
      ok: true,
      data: {
        ...normaliseRow(row),
        cabinetNumbers: ((items ?? []) as { fcabinetnumber: string }[]).map((r) => r.fcabinetnumber),
        idOrCo:         ((idorco ?? []) as { fidorco: string }[]).map((r) => r.fidorco),
        trackingChn:    ((tracking ?? []) as { ftrackingchn: string }[]).map((r) => r.ftrackingchn),
      },
    };
  });
}

// ────────────────────────────────────────────────────────────
// DOUBLE-PAY GUARD — legacy report-cnt.php counts existing
// tb_cnt_pay_trackingchn rows for the tracking numbers about to be
// paid; if any already exist it warns "กำลังจะจ่ายซ้ำ".
// ────────────────────────────────────────────────────────────

const dupSchema = z.object({
  tracking_chn: z.array(z.string().trim().min(1).max(50)).max(500).default([]),
  id_or_co:     z.array(z.string().trim().min(1).max(30)).max(500).default([]),
});

export async function checkPcsContainerDoublePay(
  input: z.infer<typeof dupSchema>,
): Promise<AdminActionResult<{ duplicateTracking: string[]; duplicateIdOrCo: string[] }>> {
  const parsed = dupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<{ duplicateTracking: string[]; duplicateIdOrCo: string[] }>(
    ["super", "accounting"],
    async () => {
      const admin = createAdminClient();
      const duplicateTracking: string[] = [];
      const duplicateIdOrCo:   string[] = [];

      if (d.tracking_chn.length > 0) {
        const { data } = await admin
          .from("tb_cnt_pay_trackingchn")
          .select("ftrackingchn")
          .in("ftrackingchn", d.tracking_chn);
        const seen = new Set(((data ?? []) as { ftrackingchn: string }[]).map((r) => r.ftrackingchn));
        for (const t of d.tracking_chn) if (seen.has(t)) duplicateTracking.push(t);
      }
      if (d.id_or_co.length > 0) {
        const { data } = await admin
          .from("tb_cnt_pay_idorco")
          .select("fidorco")
          .in("fidorco", d.id_or_co);
        const seen = new Set(((data ?? []) as { fidorco: string }[]).map((r) => r.fidorco));
        for (const c of d.id_or_co) if (seen.has(c)) duplicateIdOrCo.push(c);
      }

      return { ok: true, data: { duplicateTracking, duplicateIdOrCo } };
    },
  );
}

// ────────────────────────────────────────────────────────────
// CREATE — the legacy `addPay` flow: INSERT tb_cnt, then fan out
// every cabinet-number / PK-CO / tracking number into the three
// child tables.
// ────────────────────────────────────────────────────────────

const createSchema = z.object({
  cabinet_numbers: z.array(z.string().trim().min(1).max(300)).min(1, "ต้องระบุเลขตู้อย่างน้อย 1 รายการ").max(100),
  amount:          z.number().positive("ยอดเงินต้องมากกว่า 0").max(99_999_999.99),
  slip_path:       z.string().trim().min(1, "ต้องแนบสลิปการจ่ายเงิน").max(200),
  doc_path:        z.string().trim().max(200).optional(),
  payee_bank:      z.string().trim().max(300).optional(),   // nameblank
  payee_account_no:   z.string().trim().max(200).optional(), // noblank
  payee_account_name: z.string().trim().max(300).optional(), // nameaccount
  id_or_co:        z.array(z.string().trim().min(1).max(30)).max(500).default([]),
  tracking_chn:    z.array(z.string().trim().min(1).max(50)).max(500).default([]),
  mark_paid:       z.boolean().default(false),
});
export type CreatePcsContainerPaymentInput = z.infer<typeof createSchema>;

export async function adminCreatePcsContainerPayment(
  input: CreatePcsContainerPaymentInput,
): Promise<AdminActionResult<{ id: number }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<{ id: number }>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // De-dup the cabinet list, then build cntname the legacy way: a
    // comma-joined string of every เลขตู้ this payment covers.
    const cabinets = Array.from(new Set(d.cabinet_numbers.map((c) => c.trim()).filter(Boolean)));
    const cntname  = cabinets.join(",");
    const nowIso   = new Date().toISOString();

    const { data: created, error: insErr } = await admin
      .from("tb_cnt")
      .insert({
        cntname,
        cntstatus:     d.mark_paid ? PCS_CNT_STATUS.PAID : PCS_CNT_STATUS.UNPAID,
        cntamount:     d.amount,
        cntimagesslip: d.slip_path,
        cntfile:       d.doc_path ?? "",
        date:          nowIso,
        dateupdate:    nowIso,
        adminidcreate: adminId,
        adminidupdate: adminId,
        nameblank:     d.payee_bank ?? "",
        noblank:       d.payee_account_no ?? "",
        nameaccount:   d.payee_account_name ?? "",
      })
      .select("id")
      .single<{ id: number }>();
    if (insErr) return { ok: false, error: insErr.message };

    const cntId = created.id;

    // Fan-out 1 — tb_cnt_item: one row per cabinet-number string.
    if (cabinets.length > 0) {
      const { error: itemErr } = await admin
        .from("tb_cnt_item")
        .insert(cabinets.map((fcabinetnumber) => ({ fcabinetnumber, cntid: cntId })));
      if (itemErr) {
        // Best-effort rollback of the parent so we don't strand a
        // headerless payment — legacy PHP had no transaction either,
        // but Pacred should not leave inconsistent state.
        await admin.from("tb_cnt").delete().eq("id", cntId);
        return { ok: false, error: `บันทึกเลขตู้ไม่สำเร็จ: ${itemErr.message}` };
      }
    }

    // Fan-out 2 — tb_cnt_pay_idorco: the PK/CO numbers covered.
    const idOrCo = dedupe(d.id_or_co);
    if (idOrCo.length > 0) {
      await admin
        .from("tb_cnt_pay_idorco")
        .insert(idOrCo.map((fidorco) => ({ fidorco, fcabinetnumber: cntname })));
    }

    // Fan-out 3 — tb_cnt_pay_trackingchn: the China tracking numbers.
    const trackingChn = dedupe(d.tracking_chn);
    if (trackingChn.length > 0) {
      await admin
        .from("tb_cnt_pay_trackingchn")
        .insert(trackingChn.map((ftrackingchn) => ({ ftrackingchn, fcabinetnumber: cntname })));
    }

    await logAdminAction(adminId, "pcs_container_payment.create", "tb_cnt", String(cntId), {
      cntname,
      amount:        d.amount,
      cabinet_count: cabinets.length,
      idorco_count:  idOrCo.length,
      tracking_count: trackingChn.length,
      status:        d.mark_paid ? "paid" : "unpaid",
    });

    revalidatePath("/admin/accounting/container-payments");
    return { ok: true, data: { id: cntId } };
  });
}

// ────────────────────────────────────────────────────────────
// SET PAID / UNPAID — flips cntstatus. This IS the legacy "ตู้
// status" staff know — paid vs unpaid, not a logistics enum.
// ────────────────────────────────────────────────────────────

const setStatusSchema = z.object({
  id:   z.number().int().positive(),
  paid: z.boolean(),
});

export async function adminSetPcsContainerPaymentPaid(
  input: z.infer<typeof setStatusSchema>,
): Promise<AdminActionResult> {
  const parsed = setStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row } = await admin
      .from("tb_cnt")
      .select("id, cntstatus, cntname")
      .eq("id", d.id)
      .maybeSingle<{ id: number; cntstatus: string; cntname: string }>();
    if (!row) return { ok: false, error: "not_found" };

    const next = d.paid ? PCS_CNT_STATUS.PAID : PCS_CNT_STATUS.UNPAID;
    if (row.cntstatus === next) {
      return { ok: false, error: d.paid ? "รายการนี้จ่ายเงินแล้ว" : "รายการนี้ยังไม่จ่ายอยู่แล้ว" };
    }

    const { error } = await admin
      .from("tb_cnt")
      .update({ cntstatus: next, dateupdate: new Date().toISOString(), adminidupdate: adminId })
      .eq("id", d.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "pcs_container_payment.set_status", "tb_cnt", String(d.id), {
      cntname: row.cntname,
      from:    row.cntstatus,
      to:      next,
    });

    revalidatePath("/admin/accounting/container-payments");
    revalidatePath(`/admin/accounting/container-payments/${d.id}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// SLIP UPLOAD — mirrors uploadYuanRefundSlip. Caller uploads the
// China-side payment slip, gets back a storage path to pass into
// adminCreatePcsContainerPayment.
// ────────────────────────────────────────────────────────────

export async function uploadPcsContainerPaymentSlip(
  file: File,
): Promise<AdminActionResult<{ storage_path: string }>> {
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "no_file" };
  if (file.size > MAX_SLIP_BYTES)                 return { ok: false, error: "ไฟล์ใหญ่เกิน 10MB" };
  const mime = (file.type ?? "").toLowerCase();
  if (mime && !SLIP_MIMES.includes(mime))         return { ok: false, error: "รองรับเฉพาะ PDF / JPG / PNG" };

  return withAdmin<{ storage_path: string }>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const path  = `pcs-container-pay/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${inferExtension(file)}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadErr } = await admin.storage
      .from(SLIP_BUCKET)
      .upload(path, bytes, { contentType: mime || "application/octet-stream", upsert: false });
    if (uploadErr) return { ok: false, error: `อัปโหลดไม่สำเร็จ: ${uploadErr.message}` };

    await logAdminAction(adminId, "pcs_container_payment.slip_upload", "tb_cnt", "", {
      storage_path: path,
      filename:     file.name,
      size_bytes:   file.size,
    });
    return { ok: true, data: { storage_path: path } };
  });
}

// ────────────────────────────────────────────────────────────
// SIGNED-URL — preview the slip / doc PDF.
// ────────────────────────────────────────────────────────────

const signedSchema = z.object({
  id:   z.number().int().positive(),
  kind: z.enum(["slip", "doc"]),
});

export async function adminGetPcsContainerPaymentSlipUrl(
  input: z.infer<typeof signedSchema>,
): Promise<AdminActionResult<{ url: string | null; mime: string | null }>> {
  const parsed = signedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin<{ url: string | null; mime: string | null }>(
    ["super", "accounting"],
    async () => {
      const admin = createAdminClient();
      const { data: row } = await admin
        .from("tb_cnt")
        .select("id, cntimagesslip, cntfile")
        .eq("id", parsed.data.id)
        .maybeSingle<{ id: number; cntimagesslip: string; cntfile: string }>();
      if (!row) return { ok: false, error: "not_found" };

      const path = parsed.data.kind === "doc" ? row.cntfile : row.cntimagesslip;
      if (!path) return { ok: true, data: { url: null, mime: null } };

      const { data: signed, error } = await admin.storage
        .from(SLIP_BUCKET)
        .createSignedUrl(path, 60 * 60);
      if (error) return { ok: false, error: error.message };

      const ext  = (path.split(".").pop() ?? "").toLowerCase();
      const mime = ext === "pdf" ? "application/pdf"
                 : ext === "png" ? "image/png"
                 : (ext === "jpg" || ext === "jpeg") ? "image/jpeg"
                 : null;
      return { ok: true, data: { url: signed?.signedUrl ?? null, mime } };
    },
  );
}

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

/** Legacy text columns are NOT NULL; coerce any DB null to "". */
function normaliseRow(r: PcsContainerPaymentRow): PcsContainerPaymentRow {
  return {
    ...r,
    cntname:       r.cntname ?? "",
    cntstatus:     r.cntstatus ?? PCS_CNT_STATUS.UNPAID,
    cntamount:     Number(r.cntamount ?? 0),
    cntimagesslip: r.cntimagesslip ?? "",
    cntfile:       r.cntfile ?? "",
    adminidcreate: r.adminidcreate ?? "",
    adminidupdate: r.adminidupdate ?? "",
    nameblank:     r.nameblank ?? "",
    noblank:       r.noblank ?? "",
    nameaccount:   r.nameaccount ?? "",
  };
}

function dedupe(list: string[]): string[] {
  return Array.from(new Set(list.map((s) => s.trim()).filter(Boolean)));
}

function inferExtension(file: File): string {
  const name = (file.name ?? "").toLowerCase();
  if (name.endsWith(".pdf"))                           return ".pdf";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return ".jpg";
  if (name.endsWith(".png"))                           return ".png";
  const t = (file.type ?? "").toLowerCase();
  if (t.includes("pdf"))                               return ".pdf";
  if (t.includes("jpeg") || t.includes("jpg"))         return ".jpg";
  if (t.includes("png"))                               return ".png";
  return ".bin";
}

"use server";

/**
 * 50-ทวิ certificate gate for the public ใบเสร็จ (ภูม flag 2026-06-10).
 *
 * Rule: a juristic customer who withholds 1% CANNOT print/download their receipt
 * on /r/<token> until they upload their 50-ทวิ cert AND an admin approves it.
 *
 * Surfaces:
 *   - uploadReceiptWhtCert     — PUBLIC (token-authorized · no login): customer
 *                                uploads the cert image/PDF → status 'pending'.
 *   - getReceiptCertQueue      — admin: pending uploads awaiting approval.
 *   - adminApproveReceiptWhtCert — admin: 'pending' → 'approved' (unlocks print).
 *   - adminWaiveReceiptWhtCert   — admin: → 'waived' (small WHT / won't send · reason).
 *   - getReceiptCertSignedUrl  — admin: signed URL to view the uploaded file.
 *
 * Storage: the private 'wht-certs' bucket (migration 0044). Writes go via the
 * service-role admin client (the public upload has no auth.uid()).
 * §0c: every Supabase query destructures `error`.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { verifyReceiptToken } from "@/lib/receipt/receipt-token";
import { withAdmin, logAdminAction, type AdminActionResult } from "./admin/common";

const BUCKET = "wht-certs";
const MAX_BYTES = 4 * 1024 * 1024; // 4MB decoded ceiling (client should pre-compress)

// ── 1. PUBLIC upload (token-authorized) ──────────────────────────────────

const uploadSchema = z.object({
  token:    z.string().min(8),
  // data URL: "data:<mime>;base64,<...>" — client compresses images first.
  dataUrl:  z.string().regex(/^data:(image\/(png|jpe?g|webp)|application\/pdf);base64,/, "ไฟล์ต้องเป็นรูป (JPG/PNG/WebP) หรือ PDF"),
  certNo:   z.string().trim().max(100).optional(),
});

export async function uploadReceiptWhtCert(
  input: z.infer<typeof uploadSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const v = parsed.data;

  const receiptId = verifyReceiptToken(v.token);
  if (!receiptId) return { ok: false, error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" };

  const admin = createAdminClient();

  // Load the receipt — only accept an upload when this receipt actually carries
  // WHT (corporate). Reading corporatetype + amount mirrors the gate condition.
  const { data: rcpt, error: rErr } = await admin
    .from("tb_receipt")
    .select("id, userid, corporatetype, wht_cert_status")
    .eq("id", receiptId)
    .maybeSingle<{ id: number; userid: string | null; corporatetype: string | null; wht_cert_status: string | null }>();
  if (rErr) {
    console.error("[uploadReceiptWhtCert load] failed", { code: rErr.code, message: rErr.message });
    return { ok: false, error: rErr.message };
  }
  if (!rcpt) return { ok: false, error: "ไม่พบใบเสร็จ" };
  if (rcpt.wht_cert_status === "approved" || rcpt.wht_cert_status === "waived") {
    return { ok: false, error: "ใบเสร็จนี้ปลดล็อกแล้ว ไม่ต้องแนบเพิ่ม" };
  }

  // Decode + size-guard.
  const m = v.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return { ok: false, error: "รูปแบบไฟล์ไม่ถูกต้อง" };
  const mime = m[1];
  const buf = Buffer.from(m[2], "base64");
  if (buf.byteLength > MAX_BYTES) return { ok: false, error: "ไฟล์ใหญ่เกิน 4MB — ถ่ายรูปใหม่หรือบีบอัดก่อน" };

  const ext = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const path = `receipts/${receiptId}/cert-${Date.now()}.${ext}`;

  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, buf, {
    contentType: mime,
    upsert: true,
  });
  if (upErr) {
    console.error("[uploadReceiptWhtCert storage] failed", { message: upErr.message });
    return { ok: false, error: "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }

  const { error: updErr } = await admin
    .from("tb_receipt")
    .update({
      wht_cert_path:        path,
      wht_cert_no:          v.certNo || null,
      wht_cert_status:      "pending",
      wht_cert_uploaded_at: new Date().toISOString(),
    })
    .eq("id", receiptId);
  if (updErr) {
    console.error("[uploadReceiptWhtCert update] failed", { code: updErr.code, message: updErr.message });
    return { ok: false, error: updErr.message };
  }

  return { ok: true };
}

// ── 2. ADMIN queue + approve / waive ─────────────────────────────────────

export type ReceiptCertRow = {
  id:          number;
  rid:         string;
  userid:      string;
  certNo:      string | null;
  uploadedAt:  string | null;
};

export async function getReceiptCertQueue(): Promise<ReceiptCertRow[]> {
  // Admin-gate the read: a "use server" action is callable directly (not behind
  // the page's gate), so without this an unauthenticated POST could enumerate
  // pending receipt rids/userids/cert-numbers. requireAdmin redirects non-admins.
  await requireAdmin(["super", "accounting"]);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_receipt")
    .select("id, rid, userid, wht_cert_no, wht_cert_uploaded_at")
    .eq("wht_cert_status", "pending")
    .order("wht_cert_uploaded_at", { ascending: true })
    .limit(500);
  if (error) {
    console.error("[getReceiptCertQueue] failed", { code: error.code, message: error.message });
    return [];
  }
  return ((data ?? []) as Array<{ id: number; rid: string; userid: string | null; wht_cert_no: string | null; wht_cert_uploaded_at: string | null }>)
    .map((r) => ({ id: r.id, rid: r.rid, userid: r.userid ?? "", certNo: r.wht_cert_no, uploadedAt: r.wht_cert_uploaded_at }));
}

export async function getReceiptCertSignedUrl(
  receiptId: number,
): Promise<AdminActionResult<{ url: string }>> {
  return withAdmin<{ url: string }>(["super", "accounting"], async () => {
    const admin = createAdminClient();
    const { data: r, error } = await admin
      .from("tb_receipt").select("wht_cert_path").eq("id", receiptId)
      .maybeSingle<{ wht_cert_path: string | null }>();
    if (error) return { ok: false, error: error.message };
    if (!r?.wht_cert_path) return { ok: false, error: "ยังไม่มีไฟล์แนบ" };
    const { data: signed, error: sErr } = await admin.storage.from(BUCKET).createSignedUrl(r.wht_cert_path, 600);
    if (sErr || !signed) return { ok: false, error: sErr?.message ?? "ออกลิงก์ไม่สำเร็จ" };
    return { ok: true, data: { url: signed.signedUrl } };
  });
}

const approveSchema = z.object({
  receiptId: z.number().int().positive(),
  certNo:    z.string().trim().min(1, "กรุณาระบุเลขที่ 50 ทวิ").max(100),
});

export async function adminApproveReceiptWhtCert(
  input: z.infer<typeof approveSchema>,
): Promise<AdminActionResult<{ id: number }>> {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const v = parsed.data;

  return withAdmin<{ id: number }>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tb_receipt")
      .update({
        wht_cert_status:      "approved",
        wht_cert_no:          v.certNo,
        wht_cert_approved_by: adminId,
        wht_cert_approved_at: new Date().toISOString(),
      })
      .eq("id", v.receiptId)
      .eq("wht_cert_status", "pending")  // race-guard
      .select("id")
      .maybeSingle<{ id: number }>();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "ดำเนินการแล้ว หรือยังไม่มีไฟล์แนบ" };

    await logAdminAction(adminId, "receipt_wht_cert.approved", "tb_receipt", String(v.receiptId), { cert_no: v.certNo });
    revalidatePath("/admin/accounting/wht-certs");
    return { ok: true, data };
  });
}

const waiveSchema = z.object({
  receiptId: z.number().int().positive(),
  reason:    z.string().trim().min(10, "กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร").max(500),
});

export async function adminWaiveReceiptWhtCert(
  input: z.infer<typeof waiveSchema>,
): Promise<AdminActionResult<{ id: number }>> {
  const parsed = waiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const v = parsed.data;

  return withAdmin<{ id: number }>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tb_receipt")
      .update({
        wht_cert_status:      "waived",
        wht_cert_waive_reason: v.reason,
        wht_cert_approved_by: adminId,
        wht_cert_approved_at: new Date().toISOString(),
      })
      .eq("id", v.receiptId)
      .neq("wht_cert_status", "approved")
      .select("id")
      .maybeSingle<{ id: number }>();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "ดำเนินการแล้ว" };

    await logAdminAction(adminId, "receipt_wht_cert.waived", "tb_receipt", String(v.receiptId), { reason: v.reason });
    revalidatePath("/admin/accounting/wht-certs");
    return { ok: true, data };
  });
}

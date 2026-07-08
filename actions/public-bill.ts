"use server";

/**
 * Public (login-free) customer pay action for the ใบวางบิล at /b/[token].
 *
 * G5 — the customer scans the QR on their printed ใบวางบิล, opens /b/[token]
 * (no login), transfers the exact bill total, and attaches their slip HERE.
 *
 * SECURITY (mirrors actions/customs-confirm.ts + the /b/[token] page gate — does
 * NOT weaken): NO auth gate. The bill is resolved ONLY from the unguessable
 * HMAC BILL token (verifyBillToken → domain-separated `bill:{id}`); a client bill
 * id is NEVER accepted, so a token grants access to exactly that one bill. The
 * customer is anonymous → the write goes through createAdminClient() (RLS-bypass)
 * under a bill-scoped folder (billing-run/{invoiceId}/customer/…).
 *
 * MONEY — this NEVER settles. It only STAGES a pending slip (slip_status="pending",
 * slip_reviewed_at=null) exactly like the admin uploadBillingRunSlip. Settlement
 * stays gated by the EXISTING round-1 review (reviewBillingRunSlipRound1) + the
 * round-2 markBillingRunPaid (super/accounting). It writes ONLY slip_* columns —
 * never status / total_thb / net_payable / paid_*.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyBillToken } from "@/lib/receipt/receipt-token";
import { validateStoredFile } from "@/lib/file-validation";

export async function customerUploadBillingRunSlip(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = String(formData.get("token") ?? "").trim();
  const file = formData.get("slip");

  // Capability gate: resolve the invoice id from the token ONLY — a forged /
  // tampered / wrong-type (receipt) token → refuse. Never trust a client id.
  const invoiceId = verifyBillToken(token);
  if (invoiceId === null) return { ok: false, error: "invalid_token" };

  // File pre-check — mirrors uploadForwarderSlip (image/* | pdf, size>0, ≤5 MB).
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "กรุณาแนบไฟล์สลิป" };
  }
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";
  if (!isImage && !isPdf) {
    return { ok: false, error: "ต้องเป็นรูปภาพหรือ PDF" };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "ไฟล์ใหญ่เกิน 5 MB" };
  }

  const admin = createAdminClient();

  // Load the bill by the token-derived id ONLY. Must still be 'issued' to accept
  // a slip (a paid / cancelled bill refuses — mirror uploadBillingRunSlip).
  const { data: cur, error: curErr } = await admin
    .from("tb_forwarder_invoice")
    .select("id, doc_no, status, slip_paths")
    .eq("id", invoiceId)
    .maybeSingle<{ id: number; doc_no: string; status: string; slip_paths: unknown }>();
  if (curErr) {
    console.error("[customerUploadBillingRunSlip current] failed", {
      code: curErr.code,
      message: curErr.message,
    });
    return { ok: false, error: "ไม่สามารถอ่านข้อมูลใบวางบิลได้" };
  }
  if (!cur) return { ok: false, error: "not_found" };
  if (cur.status !== "issued") {
    return { ok: false, error: `ใบวางบิล ${cur.doc_no} อยู่ในสถานะ ${cur.status} แล้ว — แนบสลิปไม่ได้` };
  }

  // Store under a bill-scoped folder (the customer is anonymous → admin client).
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
  const path = `billing-run/${invoiceId}/customer/${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from("slips")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) {
    console.error("[customerUploadBillingRunSlip upload] failed", { message: upErr.message });
    return { ok: false, error: "อัปโหลดสลิปไม่สำเร็จ" };
  }

  // Defence-in-depth — re-validate the stored bytes (magic bytes + size).
  const validated = await validateStoredFile("slips", path, ["image", "pdf"]);
  if (!validated.ok) {
    await admin.storage.from("slips").remove([path]);
    return { ok: false, error: "ไฟล์สลิปไม่ถูกต้อง" };
  }

  // STAGE a pending slip — mirror uploadBillingRunSlip (append, keep last 10),
  // set slip_status='pending' + clear round-1 so accounting re-checks. NEVER
  // touches status / totals / paid_* — settlement stays admin-gated.
  const prevPaths = Array.isArray(cur.slip_paths)
    ? cur.slip_paths.filter((p): p is string => typeof p === "string")
    : [];
  const nextPaths = [...prevPaths, path].slice(-10);
  const { error: updErr } = await admin
    .from("tb_forwarder_invoice")
    .update({
      slip_paths:       nextPaths,
      slip_path:        path,          // ล่าสุด = รูปหลัก (thumb ในคิว)
      slip_uploaded_by: "customer",
      slip_uploaded_at: new Date().toISOString(),
      slip_status:      "pending",
      slip_reviewed_at: null,          // สลิปใหม่ → ล้างตรวจรอบ1 (บัญชีตรวจใหม่)
    })
    .eq("id", invoiceId)
    .eq("status", "issued"); // race-guard: never stage onto a settled/cancelled bill
  if (updErr) {
    console.error("[customerUploadBillingRunSlip update] failed", {
      code: updErr.code,
      message: updErr.message,
    });
    return { ok: false, error: "บันทึกสลิปไม่สำเร็จ" };
  }

  revalidatePath(`/b/${token}`);
  return { ok: true };
}

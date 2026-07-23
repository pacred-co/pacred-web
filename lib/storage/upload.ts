/**
 * Server-side Supabase Storage upload helper (Wave 12-A · 2026-05-23).
 *
 * For ADMIN-initiated uploads (cnt-hs slip, wallet/add slip, yuan-payments/new
 * slip). Uses the service-role admin client (bypasses RLS) since the calling
 * server action is already gated by `withAdmin([roles])`.
 *
 * The `slips` bucket exists on prod (created by migration 0007_wallet.sql).
 * Its user-facing RLS policy enforces `auth.uid()/...` foldering for customer
 * writes, but admin-side service-role writes use a dedicated `admin/...`
 * prefix so the two paths never collide.
 *
 * Path convention for admin uploads:
 *   slips/admin/<kind>/<unix-ms>-<safe-original-name>
 *
 * Server-only. NEVER import from a "use client" component.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type UploadResult =
  | { ok: true; filename: string }
  | { ok: false; error: string };

const MAX_BYTES = 5 * 1024 * 1024;        // 5 MB — same as customer-side slip uploads
const ALLOWED_MIME = /^(image\/(jpeg|png|gif|webp)|application\/pdf)$/i;

/**
 * Upload an admin-supplied file (typically a slip image) to a Supabase bucket.
 *
 * @param file       The `File` instance (from a multipart FormData submission)
 * @param bucket     Bucket id (e.g. "slips")
 * @param prefix     Path prefix inside the bucket (e.g. "admin/cnt-slip")
 *                   — final path = `<prefix>/<unix-ms>-<safe-name>`
 * @param nameOverride  Optional clean base name to store the object as INSTEAD of
 *                   the client's `file.name` (still sanitised + still prefixed with
 *                   `<unix-ms>-` so it stays collision-proof). Used to name MOMO
 *                   docs by their printed NO (REC-…/INV-…) instead of the
 *                   duplicate "…(15).pdf" the browser hands us — owner 2026-07-23.
 * @returns          `{ ok: true, filename }` where `filename` is the path
 *                   inside the bucket (store this in the DB column), OR
 *                   `{ ok: false, error }` with a human-readable Thai message.
 */
export async function uploadToBucket(
  file: File,
  bucket: string,
  prefix: string,
  nameOverride?: string,
): Promise<UploadResult> {
  if (!file || !(file instanceof File)) {
    return { ok: false, error: "ไม่พบไฟล์" };
  }
  if (file.size === 0) {
    return { ok: false, error: "ไฟล์ว่าง" };
  }
  if (file.size > MAX_BYTES) {
    const mb = Math.round((file.size / (1024 * 1024)) * 10) / 10;
    return { ok: false, error: `ไฟล์ใหญ่เกิน 5 MB (ขนาดที่ส่งมา ${mb} MB)` };
  }
  if (!ALLOWED_MIME.test(file.type)) {
    return { ok: false, error: `ประเภทไฟล์ไม่รองรับ (${file.type || "unknown"}) — รับเฉพาะรูปภาพหรือ PDF` };
  }

  // Keep the client's extension (magic-byte-validated by the caller) but use the
  // clean base name when one is given — so an attached MOMO doc lands as
  // "REC-20260718-0002.pdf" not "REC-20260718-0002_15_.pdf".
  const ext = (file.name.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? "").toLowerCase();
  const rawName = nameOverride ? `${nameOverride}${ext}` : file.name;
  const safeName = rawName
    .replace(/[^\w.\-]/g, "_")
    .slice(-80);                          // cap to avoid path-too-long errors
  const filename = `${prefix.replace(/\/+$/, "")}/${Date.now()}-${safeName}`;

  const admin = createAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await admin.storage.from(bucket).upload(filename, buffer, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    // Surface the most common infra error — bucket not yet created on this
    // Supabase project.
    if (/bucket\s*not\s*found/i.test(error.message)) {
      return {
        ok: false,
        error: `Storage bucket '${bucket}' ยังไม่มีในโปรเจค Supabase นี้ — กรุณารัน migration ที่สร้าง bucket ก่อน`,
      };
    }
    return { ok: false, error: `อัปโหลดไม่สำเร็จ: ${error.message}` };
  }

  return { ok: true, filename };
}

/**
 * Build a signed URL for an admin-uploaded slip (private bucket).
 * Returns null on error (caller should render a "ไม่สามารถแสดงได้" fallback).
 *
 * `expiresIn` defaults to 1 hour — long enough for an admin's review session,
 * short enough to keep the URL non-shareable.
 */
export async function getSignedBucketUrl(
  bucket: string,
  filename: string,
  expiresIn = 3600,
): Promise<string | null> {
  if (!filename) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(filename, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}

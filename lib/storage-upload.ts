/**
 * Client-side upload helper for Supabase Storage.
 *
 * Slips bucket (private) is foldered by user_id — the RLS policy enforces
 * that {user_id}/<rest> path matches the caller's auth.uid().
 */

import { createClient } from "@/lib/supabase/client";

export async function uploadSlip(
  file: File,
  kind: "deposit" | "withdraw" | "yuan_payment" | "id_doc",
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // Limit: 5 MB; accept image/* and pdf
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "ไฟล์ใหญ่เกิน 5 MB" };
  const isOk =
    file.type.startsWith("image/") || file.type === "application/pdf";
  if (!isOk) return { ok: false, error: "ต้องเป็นรูปภาพหรือ PDF" };

  const ext = file.name.split(".").pop() ?? "bin";
  const stamp = Date.now();
  const path = `${user.id}/${kind}/${stamp}.${ext}`;

  const { error } = await supabase.storage.from("slips").upload(path, file, {
    upsert: false,
    contentType: file.type,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true, path };
}

/** Returns a signed URL valid for 1 hour (for previewing private slips). */
export async function getSignedSlipUrl(path: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.storage.from("slips").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/**
 * Avatar upload — public bucket, returns a permanent public URL.
 * Path is overwritten on each upload so old images get garbage-collected.
 */
export async function uploadAvatar(file: File): Promise<{ ok: true; publicUrl: string } | { ok: false; error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  if (file.size > 2 * 1024 * 1024) return { ok: false, error: "ไฟล์ใหญ่เกิน 2 MB" };
  if (!file.type.startsWith("image/")) return { ok: false, error: "ต้องเป็นรูปภาพ" };

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${user.id}/avatar.${ext}`;

  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "60",            // bust cache quickly after a change
  });
  if (error) return { ok: false, error: error.message };

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  // Cache-bust the public URL so the browser picks up the new image
  const cacheBuster = `?t=${Date.now()}`;
  return { ok: true, publicUrl: `${data.publicUrl}${cacheBuster}` };
}

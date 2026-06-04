"use client";

/**
 * Admin avatar upload field (2026-06-04) — replaces the deferred "Avatar URL
 * (file upload — Wave 23)" text-only field on /admin/admins/[id]/edit. Adds a
 * real file upload (→ adminUploadAvatarImage → avatars bucket public URL) with
 * a live preview, while KEEPING the URL input (paste still works). Controlled:
 * the parent owns the `avatarUrl` string + persists it on form submit
 * (adminUpdateProfileFields → profiles.avatar_url). No jQuery. Reusable for
 * /admins/new too.
 */

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { adminUploadAvatarImage } from "@/actions/admin/avatar-upload";

export function AdminAvatarUploadField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setErr(null);
    if (!file.type.startsWith("image/")) {
      setErr("รับเฉพาะไฟล์รูปภาพ");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErr("ไฟล์ใหญ่เกิน 5 MB");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await adminUploadAvatarImage(fd);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onChange(res.data?.url ?? "");
    } catch {
      setErr("อัปโหลดไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-muted mb-1">รูปโปรไฟล์ (Avatar)</label>
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-12 w-12 rounded-full object-cover border border-border" />
        ) : (
          <div className="h-12 w-12 rounded-full border border-border bg-surface-alt flex items-center justify-center text-muted">
            <Camera className="h-5 w-5" />
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPick}
          aria-label="เลือกรูปโปรไฟล์"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          {uploading ? "กำลังอัปโหลด…" : "อัปโหลดรูป"}
        </button>
      </div>
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={512}
        disabled={disabled || uploading}
        placeholder="หรือวาง URL รูปโดยตรง"
        className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
      />
      {err && <p className="mt-1 text-[11px] font-medium text-red-600">{err}</p>}
    </div>
  );
}

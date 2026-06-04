"use client";

/**
 * Profile avatar upload — the clean Pacred control that replaces the legacy
 * dead #edit-img-profile / #uploadimageModal jQuery modals (dropify + croppie
 * were never staged → the avatar-edit button was a dead click). Self-contained
 * React (no jQuery / Bootstrap dependency): a button under the avatar → native
 * file picker → client-side guard → updateMyAvatar() → router.refresh() so the
 * new picture appears at once. AGENTS.md §0a (our design) · mobile-first
 * (44px tap target).
 */

import { useRef, useState, useTransition } from "react";
import { Camera, Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { updateMyAvatar } from "@/actions/profile-avatar";

export function ProfileAvatarUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // reset so re-picking the same file still fires onChange
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("รับเฉพาะไฟล์รูปภาพ");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("ไฟล์ใหญ่เกิน 5 MB");
      return;
    }
    const fd = new FormData();
    fd.append("avatar", file);
    startTransition(async () => {
      const res = await updateMyAvatar(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-col items-center">
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
        disabled={pending}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white shadow-md transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />
        ) : (
          <Camera className="h-4 w-4" strokeWidth={2.5} />
        )}
        {pending ? "กำลังอัปโหลด…" : "เปลี่ยนรูปโปรไฟล์"}
      </button>
      {error && <p className="mt-1.5 text-[11px] font-medium text-red-600">{error}</p>}
      <p className="mt-1 text-[10px] text-muted">รองรับ JPG / PNG / WEBP · ไม่เกิน 5 MB</p>
    </div>
  );
}

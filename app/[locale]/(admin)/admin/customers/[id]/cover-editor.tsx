"use client";

/**
 * CoverEditor — Facebook-style "เปลี่ยนพื้นหลัง" button overlaid on the profile
 * cover. Opens a slim, Pacred-themed dialog to upload a new GLOBAL cover image
 * (shared by every customer page). Shows the recommended px size + a live
 * preview before the admin confirms (§0f confirm-before-mutate).
 *
 * Chrome matches the Pacred admin dialog kit (white card · gray borders ·
 * header border-b · footer border-t · primary-600 action) and reuses
 * <StyledFileInput> for the clean dashed upload zone. Upload + persist live in
 * actions/admin/profile-cover.ts (any admin). On success → router.refresh().
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, X } from "lucide-react";
import { StyledFileInput } from "@/components/ui/styled-file-input";
import { adminSetProfileCover, adminResetProfileCover } from "@/actions/admin/profile-cover";

export function CoverEditor({ hasCustom }: { hasCustom: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
    setPreviewUrl(null);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("กรุณาเลือกไฟล์รูปก่อน");
      return;
    }
    const fd = new FormData();
    fd.set("cover", file);
    start(async () => {
      const res = await adminSetProfileCover(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setPreviewUrl(null);
      router.refresh();
    });
  }

  function reset() {
    setError(null);
    start(async () => {
      const res = await adminResetProfileCover();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute bottom-2 right-2 z-10 inline-flex items-center gap-1.5 rounded-lg bg-white/90 px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm backdrop-blur-sm transition hover:bg-white"
      >
        <ImageIcon className="h-3.5 w-3.5" /> เปลี่ยนพื้นหลัง
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-surface"
            onClick={(e) => e.stopPropagation()}
          >
            {/* header — Pacred red bar with white text */}
            <div className="flex items-center justify-between bg-primary-600 px-4 py-3">
              <h3 className="text-sm font-semibold text-white">
                เปลี่ยนรูปพื้นหลัง
              </h3>
              <button
                type="button"
                onClick={close}
                className="rounded p-1 text-white/80 transition hover:bg-white/20 hover:text-white"
                aria-label="ปิด"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* body */}
            <form onSubmit={submit} className="px-4 py-4">
              <p className="mb-3 text-xs leading-relaxed text-gray-500">
                แนะนำ{" "}
                <strong className="font-semibold text-gray-700 dark:text-foreground">
                  1920 × 320 px
                </strong>{" "}
                · อัตราส่วน 6:1 (แนวนอน)
                <br />
                JPG / PNG / GIF / WEBP · ไม่เกิน 5 MB · ปกกลางใช้ร่วมทุกหน้า
              </p>

              <StyledFileInput
                ref={fileRef}
                accept="image/*"
                label="เลือกรูปพื้นหลัง"
                onChange={onPick}
                disabled={pending}
              />

              {previewUrl && (
                <div className="mt-3 h-20 w-full overflow-hidden rounded-lg border border-gray-200 bg-primary-600">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="ตัวอย่างปก" className="h-full w-full object-cover" />
                </div>
              )}

              {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

              {/* footer */}
              <div className="mt-5 flex items-center justify-between gap-2 border-t border-gray-200 pt-3 dark:border-white/10">
                {hasCustom ? (
                  <button
                    type="button"
                    onClick={reset}
                    disabled={pending}
                    className="text-xs text-gray-400 transition hover:text-gray-600 hover:underline disabled:opacity-50"
                  >
                    คืนค่าเริ่มต้น
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={close}
                    disabled={pending}
                    className="rounded-md border border-gray-300 px-3.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-md bg-primary-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-700 disabled:bg-gray-300"
                  >
                    {pending ? "กำลังอัปโหลด..." : "อัปโหลด"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

/**
 * /admin/cnt-hs/[id] — slip-upload form (Wave 12-A · 2026-05-23).
 *
 * Faithful port of cnt-hs.php L535-572 (upload-and-auto-approve).
 *   1. Admin picks a slip image (JPG/PNG/PDF · ≤5 MB)
 *   2. Optional preview before submit
 *   3. Submit → adminUploadCntSlip → uploads to slips bucket + flips
 *      cnt-hs row to cntstatus='2' (จ่ายแล้ว)
 *
 * Design (per `docs/learnings/pacred-design-philosophy.md`): Tailwind cards,
 * dashed dropzone, preview thumbnail, clear loading + success/error states.
 * Replaces the legacy Bootstrap `<input class="dropify" data-max-file-size="9M">`.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { adminUploadCntSlip } from "@/actions/admin/cnt-hs";

export function CntSlipUploadForm({ cntId }: { cntId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleSelect(f: File | null) {
    setError(null);
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (f && f.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(f));
    } else {
      setPreviewUrl(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("เลือกไฟล์สลิปก่อน");
      return;
    }
    const fd = new FormData();
    fd.set("slip", file);

    startTransition(async () => {
      const res = await adminUploadCntSlip(cntId, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Success — clear local state + refresh the page (status changes to '2',
      // slip viewer appears, action buttons hide).
      setFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">📎 อัปโหลดสลิป + อนุมัติ (auto-approve)</p>
          <p className="text-xs text-muted mt-0.5">
            JPG/PNG/PDF · ≤ 5 MB · เมื่ออัปโหลดสำเร็จ cntstatus จะกลายเป็น &quot;จ่ายแล้ว&quot; ทันที
          </p>
        </div>
      </div>

      <label
        className={`block rounded-xl border-2 border-dashed cursor-pointer transition ${
          file
            ? "border-green-300 bg-green-50/50 hover:border-green-400"
            : "border-border bg-surface-alt/30 hover:border-primary-400 hover:bg-primary-50/30"
        } p-5`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
          className="hidden"
          disabled={pending}
          onChange={(e) => handleSelect(e.currentTarget.files?.[0] ?? null)}
        />
        {file ? (
          <div className="flex items-start gap-4">
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="พรีวิวสลิป"
                className="rounded-md border border-border max-h-[140px] max-w-[180px] object-contain bg-white"
              />
            )}
            <div className="flex-1 min-w-0 text-sm">
              <p className="font-medium truncate">{file.name}</p>
              <p className="text-xs text-muted mt-0.5">
                {(file.size / 1024).toFixed(1)} KB · {file.type || "unknown"}
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={(e) => {
                  e.preventDefault();
                  handleSelect(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="text-xs text-red-600 hover:underline mt-2 disabled:opacity-50"
              >
                ลบไฟล์
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-2xl mb-1">📄</p>
            <p className="text-sm font-medium">คลิกเพื่อเลือกไฟล์สลิป</p>
            <p className="text-xs text-muted mt-0.5">หรือลากวางไฟล์มาที่นี่</p>
          </div>
        )}
      </label>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
          ⚠ {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="submit"
          disabled={pending || !file}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? "กำลังอัปโหลด…" : "✅ อัปโหลดสลิป + อนุมัติ"}
        </button>
      </div>
    </form>
  );
}

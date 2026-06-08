"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, Camera, CheckCircle2, Loader2 } from "lucide-react";
import {
  submitDeliveryFeedback,
  uploadDeliveryFeedbackPhoto,
} from "@/actions/delivery-feedback";

/**
 * <DeliveryFeedbackCard> — customer-side rating + comment + photo capture
 * for a delivered forwarder (ops-workflow audit 2026-06-05 §32 Phase 4a).
 *
 * Mounted on /service-import/[fNo] ONLY when fstatus === '7' (delivered).
 * If an existing feedback row exists (passed in via `existing` prop), the
 * card renders a "thank-you" summary card with an "แก้ไข" button that
 * re-opens the editor pre-filled. Otherwise it shows the empty form.
 *
 * All three content fields (rating · comment · photo) are OPTIONAL but
 * the submit action requires ≥ 1 set (matches the DB CHECK constraint).
 */
export type DeliveryFeedbackExisting = {
  rating: number | null;
  comment: string | null;
  photoPath: string | null;
  createdAt: string;
  updatedAt: string;
};

export function DeliveryFeedbackCard({
  fid,
  existing,
}: {
  fid: number;
  existing: DeliveryFeedbackExisting | null;
}) {
  const router = useRouter();
  // When existing is non-null we start collapsed (show the summary).
  const [editing, setEditing] = useState(existing === null);
  const [rating, setRating] = useState<number | null>(existing?.rating ?? null);
  const [comment, setComment] = useState<string>(existing?.comment ?? "");
  const [photoPath, setPhotoPath] = useState<string | null>(
    existing?.photoPath ?? null,
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("ไฟล์ใหญ่เกิน 5 MB");
      e.target.value = "";
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("ต้องเป็นรูปภาพเท่านั้น");
      e.target.value = "";
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append("photo", file);
    const res = await uploadDeliveryFeedbackPhoto(fd);
    setUploading(false);
    if (res.ok && res.data) {
      setPhotoPath(res.data.path);
    } else {
      setError(res.ok ? "อัปโหลดไม่สำเร็จ" : res.error);
      e.target.value = "";
    }
  }

  function onSubmit() {
    setError(null);
    setSuccess(null);
    const hasContent =
      rating !== null ||
      (comment.trim().length > 0) ||
      (photoPath !== null && photoPath !== "");
    if (!hasContent) {
      setError("กรุณาให้คะแนน เขียนความคิดเห็น หรือแนบรูป อย่างน้อย 1 อย่าง");
      return;
    }
    startTransition(async () => {
      const res = await submitDeliveryFeedback({
        fid,
        rating,
        comment: comment.trim() || null,
        photoPath: photoPath || null,
      });
      if (res.ok) {
        setSuccess(
          res.data?.updated
            ? "อัปเดต feedback เรียบร้อย ขอบคุณค่ะ"
            : "ขอบคุณสำหรับ feedback ค่ะ",
        );
        setEditing(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  // ─── Summary view (collapsed when an existing row is present) ───
  if (!editing && existing) {
    return (
      <section
        aria-labelledby="delivery-feedback-summary-title"
        className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 p-4"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600" aria-hidden />
            <h3 id="delivery-feedback-summary-title" className="font-semibold text-emerald-800 dark:text-emerald-200">
              ขอบคุณสำหรับ feedback ค่ะ
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-emerald-700 hover:underline shrink-0"
          >
            แก้ไข
          </button>
        </header>
        <div className="mt-2 space-y-1.5 text-sm text-foreground">
          {existing.rating !== null && (
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={`size-5 ${
                    existing.rating !== null && n <= existing.rating
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted"
                  }`}
                  aria-hidden
                />
              ))}
              <span className="ml-1.5 text-xs text-muted">
                {existing.rating} / 5
              </span>
            </div>
          )}
          {existing.comment && (
            <p className="whitespace-pre-wrap text-muted">
              <q>{existing.comment}</q>
            </p>
          )}
          {existing.photoPath && (
            <p className="text-xs text-muted">📷 แนบรูปแล้ว</p>
          )}
          <p className="text-[11px] text-muted">
            ส่งเมื่อ {formatDate(existing.createdAt)}
            {existing.updatedAt !== existing.createdAt && (
              <> · แก้ไขล่าสุด {formatDate(existing.updatedAt)}</>
            )}
          </p>
        </div>
      </section>
    );
  }

  // ─── Editor view (empty or "แก้ไข" expanded) ───
  return (
    <section
      aria-labelledby="delivery-feedback-form-title"
      className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/40 dark:bg-amber-950/10 p-4 space-y-3"
    >
      <header>
        <h3 id="delivery-feedback-form-title" className="font-semibold text-foreground">
          📝 รีวิวการจัดส่ง
        </h3>
        <p className="text-xs text-muted mt-0.5">
          ช่วยบอกเราหน่อย — รายการนี้จัดส่งเป็นอย่างไร? (ทุกอย่างไม่บังคับ)
        </p>
      </header>

      {/* Rating — 5 stars */}
      <div>
        <label className="block text-sm font-medium text-foreground">
          ให้คะแนน (ไม่บังคับ)
        </label>
        <div className="mt-1 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(rating === n ? null : n)}
              aria-label={`${n} ดาว`}
              aria-pressed={rating === n}
              className="p-1 rounded hover:bg-amber-100 active:scale-95 transition"
            >
              <Star
                className={`size-7 ${
                  rating !== null && n <= rating
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted hover:text-amber-300"
                }`}
                aria-hidden
              />
            </button>
          ))}
          {rating !== null && (
            <button
              type="button"
              onClick={() => setRating(null)}
              className="ml-2 text-xs text-muted hover:underline"
            >
              ล้าง
            </button>
          )}
        </div>
      </div>

      {/* Comment */}
      <div>
        <label
          htmlFor="delivery-feedback-comment"
          className="block text-sm font-medium text-foreground"
        >
          ความคิดเห็น (ไม่บังคับ · สูงสุด 500 ตัวอักษร)
        </label>
        <textarea
          id="delivery-feedback-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 500))}
          rows={3}
          maxLength={500}
          placeholder="เช่น สินค้าเรียบร้อยดี · พนักงานสุภาพ · มาช้านิดหน่อย"
          className="mt-1 w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-300"
        />
        <p className="mt-0.5 text-[11px] text-muted text-right">
          {comment.length} / 500
        </p>
      </div>

      {/* Photo */}
      <div>
        <label
          htmlFor="delivery-feedback-photo"
          className="block text-sm font-medium text-foreground"
        >
          แนบรูป (ไม่บังคับ · 1 รูป · ≤ 5 MB)
        </label>
        <div className="mt-1 flex items-center gap-2">
          <label
            htmlFor="delivery-feedback-photo"
            className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm cursor-pointer hover:bg-surface-alt ${
              uploading ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Camera className="size-4" aria-hidden />
            )}
            {uploading ? "กำลังอัปโหลด…" : photoPath ? "เปลี่ยนรูป" : "เลือกรูป"}
          </label>
          <input
            id="delivery-feedback-photo"
            type="file"
            accept="image/*"
            onChange={onPhotoChange}
            disabled={uploading}
            className="sr-only"
          />
          {photoPath && (
            <>
              <span className="text-xs text-emerald-700">
                ✓ แนบรูปแล้ว
              </span>
              <button
                type="button"
                onClick={() => setPhotoPath(null)}
                className="text-xs text-muted hover:underline"
              >
                ลบ
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-emerald-700" role="status">
          {success}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        {existing && (
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
              setRating(existing.rating);
              setComment(existing.comment ?? "");
              setPhotoPath(existing.photoPath);
            }}
            className="rounded-full border border-border bg-white px-4 py-2 text-sm hover:bg-surface-alt"
          >
            ยกเลิก
          </button>
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending || uploading}
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              กำลังส่ง…
            </>
          ) : existing ? (
            "บันทึกการแก้ไข"
          ) : (
            "ส่ง feedback"
          )}
        </button>
      </div>
    </section>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

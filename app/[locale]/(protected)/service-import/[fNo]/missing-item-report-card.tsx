"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackageX, Loader2, CheckCircle2 } from "lucide-react";
import { confirm } from "@/components/ui/confirm";
import { submitMissingItemReport } from "@/actions/missing-item-report";

/**
 * <MissingItemReportCard> — customer "แจ้งของไม่ครบ/เสียหาย" form.
 *
 * Mounted on /service-import/[fNo] ONLY when fstatus === '7' (delivered).
 * Submitting creates a cs_followup ops ticket on the work-board via
 * submitMissingItemReport (ensure_work_item RPC · entity_type='forwarder').
 *
 * §0f: confirm-before-submit — the report goes through a styled confirm
 * dialog before the action fires (it opens a real ops ticket).
 *
 * 2026-06-08 gap analysis #4.
 */

type Kind = "missing" | "damaged" | "both";

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "missing", label: "ของไม่ครบ / หาย" },
  { value: "damaged", label: "ของเสียหาย" },
  { value: "both", label: "ทั้งไม่ครบและเสียหาย" },
];

export function MissingItemReportCard({ fid }: { fid: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("missing");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit() {
    setError(null);
    const trimmed = detail.trim();
    if (trimmed.length < 5) {
      setError("กรุณาอธิบายปัญหาอย่างน้อย 5 ตัวอักษร");
      return;
    }
    startTransition(async () => {
      const ok = await confirm(
        "ส่งเรื่องแจ้งของไม่ครบ/เสียหายให้ทีมงานตรวจสอบ?\nทีมงานจะติดต่อกลับโดยเร็วที่สุด",
      );
      if (!ok) return;
      const res = await submitMissingItemReport({ fid, kind, detail: trimmed });
      if (res.ok) {
        setDone(true);
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  if (done) {
    return (
      <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-emerald-600" aria-hidden />
          <p className="font-semibold text-emerald-800 dark:text-emerald-200">
            รับเรื่องแล้ว — ทีมงานจะติดต่อกลับโดยเร็วที่สุด
          </p>
        </div>
      </section>
    );
  }

  if (!open) {
    return (
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 active:scale-[0.98] transition"
        >
          <PackageX className="size-4" aria-hidden />
          แจ้งของไม่ครบ/เสียหาย
        </button>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="missing-item-report-title"
      className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/40 dark:bg-rose-950/10 p-4 space-y-3"
    >
      <header>
        <h3 id="missing-item-report-title" className="font-semibold text-foreground flex items-center gap-1.5">
          <PackageX className="size-4 text-rose-600" aria-hidden />
          แจ้งของไม่ครบ / เสียหาย
        </h3>
        <p className="text-xs text-muted mt-0.5">
          บอกเราว่าเกิดอะไรขึ้นกับพัสดุนี้ — ทีมงานจะเปิดเคสตรวจสอบและติดต่อกลับ
        </p>
      </header>

      {/* Kind */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          ประเภทปัญหา
        </label>
        <div className="flex flex-wrap gap-2">
          {KIND_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setKind(opt.value)}
              aria-pressed={kind === opt.value}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                kind === opt.value
                  ? "border-rose-400 bg-rose-100 text-rose-800 font-semibold"
                  : "border-border bg-white text-foreground hover:bg-surface-alt"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div>
        <label
          htmlFor="missing-item-detail"
          className="block text-sm font-medium text-foreground"
        >
          รายละเอียด (จำเป็น · สูงสุด 1000 ตัวอักษร)
        </label>
        <textarea
          id="missing-item-detail"
          value={detail}
          onChange={(e) => setDetail(e.target.value.slice(0, 1000))}
          rows={4}
          maxLength={1000}
          placeholder="เช่น สั่ง 5 กล่อง ได้รับ 4 กล่อง · กล่องบุบ สินค้าด้านในแตก"
          className="mt-1 w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-300"
        />
        <p className="mt-0.5 text-[11px] text-muted text-right">
          {detail.length} / 1000
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={pending}
          className="rounded-full border border-border bg-white px-4 py-2 text-sm hover:bg-surface-alt disabled:opacity-60"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              กำลังส่ง…
            </>
          ) : (
            "ส่งเรื่องแจ้ง"
          )}
        </button>
      </div>
    </section>
  );
}

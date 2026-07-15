"use client";

/**
 * SlipCompare (owner 2026-07-15) — สลิป 2 กรอบเทียบกัน (เท่ากันคู่กัน):
 *   • กรอบ 1 (เส้นปะเขียว)  = สลิปที่ลูกค้าอัปโหลดจริง
 *   • กรอบ 2 (เส้นปะแดง)    = สลิปที่ซ้ำในระบบ — ป้าย +N นับจำนวน · ถ้าซ้ำ >1
 *                             กด ‹ › เลื่อนดูแต่ละใบ + วันเวลา/ชื่อ/ยอด.
 * กรอบเส้นปะรัดพอดีภาพสลิป · ทั้ง 2 กรอบสูงเท่ากัน (grid items-stretch) ·
 * กดสลิป = เปิดดูรูปเต็มจอ (lightbox · กด Esc/คลิกนอกเพื่อปิด).
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { SlipImage } from "@/components/admin/slip-image";

export type DupSlip = {
  id: number;
  slipUrl: string | null;
  dateSlip: string | null;
  amount: number;
  name: string;
  status: string | null;
};

/** `2026-07-15 14:30` — Gregorian, to the minute. */
function fmtStamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** a clickable slip — ภาพเต็มความกว้างกรอบ · กดเพื่อเปิด lightbox. */
function ClickableSlip({ url, onZoom }: { url: string; onZoom: (u: string) => void }) {
  return (
    <button type="button" onClick={() => onZoom(url)} className="block w-full cursor-zoom-in" title="กดเพื่อดูรูปเต็ม">
      <SlipImage src={url} className="w-full rounded-md" fallbackClassName="h-40 w-full" />
    </button>
  );
}

export function SlipCompare({
  customerSlipUrl,
  customerSlipMissingReason,
  customerName,
  dups,
}: {
  customerSlipUrl: string | null;
  customerSlipMissingReason: string | null;
  customerName: string;
  dups: DupSlip[];
}) {
  const [idx, setIdx] = useState(0);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const hasDup = dups.length > 0;
  const safeIdx = hasDup ? Math.min(idx, dups.length - 1) : 0;
  const cur = hasDup ? dups[safeIdx] : null;

  // Esc closes the lightbox
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightbox(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightbox]);

  return (
    <div className="pt-2">
      <div className="grid grid-cols-2 items-stretch gap-2">
        {/* ── กรอบ 1 · สลิปลูกค้าตัวจริง (label เหนือเส้นปะ · เส้นปะเขียว) ── */}
        <div className="flex flex-col">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-emerald-700">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> สลิปลูกค้า (ตัวจริง)
          </p>
          <div className="flex flex-1 flex-col rounded-lg border-2 border-dashed border-emerald-400 p-1">
            <div className="flex flex-1 items-center justify-center">
              {customerSlipUrl ? (
                <ClickableSlip url={customerSlipUrl} onZoom={setLightbox} />
              ) : (
                <div className="flex h-full min-h-32 w-full items-center justify-center px-2 text-center text-[11px] italic text-muted">
                  {customerSlipMissingReason ?? "ไม่มีสลิป"}
                </div>
              )}
            </div>
            <p className="mt-1 truncate px-0.5 text-center text-[11px] text-muted">{customerName}</p>
          </div>
        </div>

        {/* ── กรอบ 2 · สลิปที่ซ้ำ (label + badge เหนือเส้นปะ · เส้นปะแดง) ── */}
        <div className="flex flex-col">
          <div className="mb-1 flex items-center justify-between gap-1">
            <p className="flex items-center gap-1.5 text-sm font-bold text-red-700">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> สลิปที่ซ้ำ
            </p>
            {hasDup && (
              <span
                title="จำนวนเอกสารที่ซ้ำ"
                className="inline-flex min-w-6 items-center justify-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white"
              >
                +{dups.length}
              </span>
            )}
          </div>
          <div className="flex flex-1 flex-col rounded-lg border-2 border-dashed border-red-400 p-1">
            {!hasDup ? (
              <div className="flex h-full min-h-32 flex-1 items-center justify-center px-2 text-center text-[11px] italic text-emerald-700">
                ✓ ไม่พบสลิปซ้ำในระบบ
              </div>
            ) : (
              <div className="flex flex-1 flex-col">
                <div className="flex flex-1 items-center justify-center">
                  {cur?.slipUrl ? (
                    <ClickableSlip url={cur.slipUrl} onZoom={setLightbox} />
                  ) : (
                    <div className="flex h-full min-h-32 w-full items-center justify-center px-2 text-center text-[11px] italic text-muted">
                      รายการซ้ำนี้ไม่มีรูปสลิป
                    </div>
                  )}
                </div>
                <div className="mt-1 space-y-0.5 px-0.5 text-center text-[11px] text-red-900">
                <p>วันที่/เวลา: <b className="font-mono">{fmtStamp(cur?.dateSlip ?? null)}</b></p>
                <p>
                  ชื่อ: <b>{cur?.name}</b> · ยอด:{" "}
                  <b className="font-mono">{(cur?.amount ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</b>
                </p>
                <a
                  href={`/admin/wallet/${cur?.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono font-semibold text-red-700 underline hover:text-red-800"
                >
                  #{cur?.id} →
                </a>
              </div>

              {dups.length > 1 && (
                <div className="mt-1.5 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIdx((i) => (Math.min(i, dups.length - 1) - 1 + dups.length) % dups.length)}
                    aria-label="สลิปซ้ำก่อนหน้า"
                    className="rounded-lg border border-red-300 bg-white p-1 text-red-700 hover:bg-red-50 dark:bg-surface"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-[11px] font-semibold tabular-nums text-red-700">
                    {safeIdx + 1} / {dups.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIdx((i) => (Math.min(i, dups.length - 1) + 1) % dups.length)}
                    aria-label="สลิปซ้ำถัดไป"
                    className="rounded-lg border border-red-300 bg-white p-1 text-red-700 hover:bg-red-50 dark:bg-surface"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* ── lightbox · ดูรูปสลิปเต็มจอ ── */}
      {lightbox && typeof document !== "undefined"
        ? createPortal(
            <div
              onClick={() => setLightbox(null)}
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightbox}
                alt="สลิป"
                onClick={(e) => e.stopPropagation()}
                className="max-h-[92vh] max-w-[92vw] rounded-lg bg-white object-contain shadow-2xl"
              />
              <button
                type="button"
                onClick={() => setLightbox(null)}
                aria-label="ปิด"
                className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-gray-800 shadow-lg hover:bg-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

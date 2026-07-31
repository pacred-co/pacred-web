"use client";

/**
 * ปุ่ม "หมายเหตุ" ทั้งจุดส่ง (ภูม 2026-07-31) — มาร์คจุดส่งเป็น "ส่งไม่ได้" พร้อม
 * เหตุผล. กดแล้วเปิด popup: เลือกเหตุผลจาก dropdown หรือพิมพ์เอง (พิมพ์เองชนะ) →
 * adminMarkStopFailed มาร์คทุกรายการที่ "ยังไม่ส่งสำเร็จ" เป็น '3' + เก็บ fdinote
 * (แถว '3' วนกลับเข้าคิวมอบงานเอง · self-heal). เหตุผลจะโชว์คาการ์ดจุดส่ง.
 */

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { StickyNote, X } from "lucide-react";
import { adminMarkStopFailed } from "@/actions/admin/driver-work";

/** เหตุผล "ส่งไม่ได้" ที่พบบ่อย — กดเลือกได้เร็ว (หรือพิมพ์เองในช่องด้านล่าง). */
const PRESET_REASONS = [
  "ลูกค้าไม่อยู่ / ไม่พบผู้รับ",
  "ลูกค้าไม่รับสาย / ติดต่อไม่ได้",
  "ที่อยู่ผิด / หาที่อยู่ไม่เจอ",
  "ลูกค้าขอเลื่อนนัด",
  "ลูกค้าปฏิเสธรับสินค้า",
  "สินค้าเสียหาย / ไม่ครบ",
];

export function DriverStopFailButton({
  itemIds,
  gradient = false,
  disabled = false,
}: {
  /** tb_forwarder_driver_item.id(s) ของจุดส่งนี้ (action ข้ามรายการที่ส่งสำเร็จแล้วเอง) */
  itemIds: number[];
  /** ปุ่มเต็มความกว้าง (แถวปุ่มมือถือ) · default = pill เล็ก (เดสก์ท็อป) */
  gradient?: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState("");
  const [custom, setCustom] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setErr(null);
  }

  function submit() {
    const reason = custom.trim() || preset;
    if (!reason) {
      setErr("กรุณาเลือกหรือพิมพ์เหตุผลที่ส่งไม่ได้");
      return;
    }
    setErr(null);
    start(async () => {
      const res = await adminMarkStopFailed({ itemIds, reason });
      if (!res.ok) {
        setErr(res.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setOpen(false);
      setPreset("");
      setCustom("");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErr(null);
          setOpen(true);
        }}
        disabled={disabled || pending}
        className={
          gradient
            ? "inline-flex w-full items-center justify-center gap-1 rounded-full border border-amber-500 bg-white px-2 py-1 text-xs font-semibold whitespace-nowrap text-amber-700 hover:bg-amber-50 disabled:opacity-50"
            : "inline-flex items-center justify-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
        }
      >
        <StickyNote className={gradient ? "h-3.5 w-3.5" : "h-3 w-3"} /> หมายเหตุ
      </button>

      {/* Popup — เลือกเหตุผลจาก dropdown หรือพิมพ์เอง → มาร์คจุดส่ง "ส่งไม่ได้" */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-bold text-foreground">หมายเหตุจุดส่ง — ส่งไม่ได้เพราะอะไร?</h3>
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="rounded-full p-1 text-muted hover:bg-surface-alt disabled:opacity-50"
                aria-label="ปิด"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">เลือกเหตุผลที่พบบ่อย</label>
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value)}
                  disabled={pending}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground focus:border-primary-400 focus:outline-none disabled:opacity-50"
                >
                  <option value="">— เลือกเหตุผล —</option>
                  {PRESET_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted">หรือพิมพ์เหตุผลเอง (ถ้าพิมพ์ จะใช้อันนี้แทน)</label>
                <textarea
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  disabled={pending}
                  rows={2}
                  placeholder="เช่น ลูกค้าให้มาส่งใหม่พรุ่งนี้ / บ้านปิด ไม่มีคนรับ…"
                  className="w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground focus:border-primary-400 focus:outline-none disabled:opacity-50"
                />
              </div>

              <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                บันทึกแล้วจุดส่งนี้จะขึ้นสถานะ <b>ส่งไม่ได้</b> และวนกลับเข้าคิวมอบงานใหม่อัตโนมัติ
              </p>

              {err && (
                <p className="rounded-md border border-red-200 bg-red-50 px-2 py-2 text-xs text-red-700">{err}</p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending}
                  className="flex-1 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                >
                  {pending ? "กำลังบันทึก…" : "บันทึกหมายเหตุ"}
                </button>
                <button
                  type="button"
                  onClick={close}
                  disabled={pending}
                  className="rounded-xl border-2 border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-surface-alt disabled:opacity-60"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

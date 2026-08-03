"use client";

/**
 * "เพิ่มสินค้าเข้ารถเข็น" popup on `/cart/add/review`.
 *
 * owner 2026-08-03: "กดเพิ่มให้เป็น pop up เพิ่มสินค้าในรถเข็นดีกว่านะ" — the
 * "+ เพิ่มรายการ" button used to navigate BACK to /cart/add, which threw away the
 * review session the customer was already filling in (every tab reloaded from
 * scratch, and any variant/qty they had picked was gone). Pasting in place keeps
 * the work and just appends new tabs.
 *
 * Paste UI mirrors /cart/add row-for-row (numbered pill · rounded input · วาง ·
 * source logo · status · trash) so it reads as the same product, and link
 * judging is the SHARED `detectSource` — the two surfaces cannot drift.
 *
 * NO money path here: this only hands verified-looking URLs to the parent, which
 * fetches them with `searchProductByUrl`. หยิบใส่รถเข็น still happens per-item in
 * the rich card's <UrlPasteAddToCart> island → addCartItem → tb_cart.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  AlertTriangle, CheckCircle2, ClipboardPaste, Clock, Info, Pencil, Plus, Trash2, X,
} from "lucide-react";
import { MAX_LINKS, SOURCE_BADGE, detectSource, splitLinks } from "../link-source";

type Row = { id: number; url: string };
let ROW_SEQ = 1;
const newRow = (url = ""): Row => ({ id: ROW_SEQ++, url });

export function AddLinksDialog({
  open,
  used,
  onClose,
  onAdd,
}: {
  open: boolean;
  /** links already in the review session — caps how many more fit under MAX_LINKS */
  used: number;
  onClose: () => void;
  onAdd: (urls: string[]) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [err, setErr] = useState<string | null>(null);

  const room = Math.max(0, MAX_LINKS - used);
  const ready = useMemo(
    () => rows.map((r) => r.url.trim()).filter((u) => detectSource(u) !== null).slice(0, room),
    [rows, room],
  );
  const filled = useMemo(() => rows.filter((r) => r.url.trim()).length, [rows]);

  // `<dialog open>` is NOT the same as showModal() — the attribute renders it
  // inline with no backdrop and no top layer. It has to be opened imperatively.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setRows([newRow()]); // fresh sheet every time it opens
      setErr(null);
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  function setUrl(id: number, url: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, url } : r)));
    setErr(null);
  }
  // วางหลายลิงก์ทีเดียว → แยกลงหลายช่องให้เอง (พฤติกรรมเดียวกับหน้า /cart/add)
  function spread(id: number, text: string) {
    const links = splitLinks(text, room || MAX_LINKS);
    if (!links.length) return;
    setRows((rs) => {
      const idx = rs.findIndex((r) => r.id === id);
      if (idx < 0) return rs;
      const inserted = links.map((u, k) => (k === 0 ? { ...rs[idx], url: u } : newRow(u)));
      return [...rs.slice(0, idx), ...inserted, ...rs.slice(idx + 1)].slice(0, MAX_LINKS);
    });
    setErr(null);
  }
  async function pasteInto(id: number) {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) spread(id, text);
    } catch {
      setErr("ไม่สามารถอ่านคลิปบอร์ดได้ - กรุณากดวางเองด้วย Ctrl+V");
    }
  }

  function submit() {
    if (room === 0) {
      setErr(`เพิ่มได้สูงสุด ${MAX_LINKS} ลิงก์ต่อรอบ — ลบรายการที่ไม่ต้องการก่อนครับ`);
      return;
    }
    if (ready.length === 0) {
      setErr("ยังไม่มีลิงก์ที่พร้อมตรวจสอบ — วางลิงก์ 1688 / Taobao / Tmall ก่อนครับ");
      return;
    }
    onAdd(ready);
    onClose();
  }

  return (
    <dialog
      ref={ref}
      // Owner directive 2026-07-05 (see components/ui/pacred-dialog.tsx): modals
      // close only via ✕ / ยกเลิก — never on ESC or a stray backdrop click, so a
      // mis-tap can't wipe links the customer just pasted.
      onCancel={(e) => e.preventDefault()}
      onClose={onClose}
      // m-auto restores the native centering Tailwind v4 Preflight kills with its
      // `*{margin:0}` (otherwise the modal pins to the top-left corner).
      className="animate-fade-in m-auto max-h-[90vh] w-[min(680px,95vw)] rounded-2xl border border-border p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div>
          <h2 className="text-[15px] font-bold text-foreground">เพิ่มสินค้าเข้ารถเข็น</h2>
          <p className="mt-0.5 text-[12px] text-muted">
            วางลิงก์เพิ่มได้เลย ระบบจะดึงข้อมูลมาต่อท้ายรายการเดิม โดยไม่ทิ้งของที่กรอกไว้
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="-mr-1 shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="max-h-[calc(90vh-9.5rem)] overflow-y-auto px-5 py-4">
        <div className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
          <span className="font-bold text-foreground">ลิงก์สินค้าที่ต้องการเพิ่ม</span>
          <span className="rounded-full border border-red-300 px-2.5 py-0.5 text-[11.5px] font-bold text-red-600">
            {room > 0 ? `เพิ่มได้อีก ${room} ลิงก์` : `ครบ ${MAX_LINKS} ลิงก์แล้ว`}
          </span>
        </div>

        <div className="space-y-2">
          {rows.map((r, i) => {
            const src = detectSource(r.url);
            const hasText = !!r.url.trim();
            return (
              <div key={r.id} className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[13px] font-extrabold text-gray-700">
                  {i + 1}
                </span>
                <div className="relative min-w-0 flex-1">
                  <input
                    type="url"
                    inputMode="url"
                    value={r.url}
                    onChange={(e) => setUrl(r.id, e.target.value)}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text");
                      if (/[\s\n]/.test(text.trim())) {
                        e.preventDefault();
                        spread(r.id, text);
                      }
                    }}
                    placeholder="วางลิงก์สินค้า 1688 / Taobao / Tmall ที่นี่"
                    className={`h-10 w-full rounded-full border pl-3 text-[13.5px] outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 ${
                      hasText ? "pr-3" : "pr-[62px]"
                    } ${src ? "border-emerald-400 bg-emerald-50/40" : "border-red-400 bg-red-50/40"}`}
                  />
                  {!hasText && (
                    <button
                      type="button"
                      onClick={() => pasteInto(r.id)}
                      title="วางลิงก์ที่คัดลอกไว้"
                      className="absolute right-1.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[11.5px] font-bold text-gray-600 transition hover:bg-gray-200 active:scale-95"
                    >
                      <ClipboardPaste className="h-3.5 w-3.5" /> วาง
                    </button>
                  )}
                </div>
                {src && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={SOURCE_BADGE[src].icon}
                    alt={SOURCE_BADGE[src].label}
                    className="h-7 w-auto shrink-0 object-contain"
                  />
                )}
                <span className="hidden shrink-0 items-center gap-1 whitespace-nowrap text-[11.5px] font-bold sm:flex">
                  {src ? (
                    <span className="flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> พร้อมตรวจสอบ
                    </span>
                  ) : hasText ? (
                    <span className="flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5" /> ลิงก์ไม่รองรับ
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-gray-400">
                      <Clock className="h-3.5 w-3.5" /> รอวางลิงก์
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setRows((rs) => (rs.length <= 1 ? rs : rs.filter((x) => x.id !== r.id)))}
                  disabled={rows.length <= 1}
                  aria-label="ลบช่องนี้"
                  className="shrink-0 rounded-lg p-2 text-gray-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setRows((rs) => (rs.length >= MAX_LINKS ? rs : [...rs, newRow()]))}
          disabled={rows.length >= MAX_LINKS}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-dashed border-border bg-surface/50 py-2.5 text-[13px] font-bold text-muted hover:border-red-300 hover:text-primary-600 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> เพิ่มช่องลิงก์
        </button>

        <div className="mt-3 flex items-start gap-1.5 text-[12px] text-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
          <span>สามารถวางหลายลิงก์พร้อมกันได้ ระบบจะแยกเป็นแต่ละรายการให้อัตโนมัติ</span>
        </div>

        {err && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-800">
            {err}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3.5">
        <Link
          href="/service-order/add"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-muted hover:text-primary-600"
        >
          <Pencil className="h-4 w-4" /> ไม่มีลิงก์? กรอกข้อมูลเอง
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-4 py-2.5 text-[13px] font-bold text-muted hover:bg-gray-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={ready.length === 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-5 py-2.5 text-[13.5px] font-extrabold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" strokeWidth={2.6} />
            {ready.length > 0 ? `เพิ่ม ${ready.length} รายการ` : filled > 0 ? "ลิงก์ยังไม่รองรับ" : "เพิ่มรายการ"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

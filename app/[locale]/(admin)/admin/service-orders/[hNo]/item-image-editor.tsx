"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateCartItemImage } from "@/actions/admin/service-orders-line-edits";
import { NO_COVER_IMAGE } from "@/lib/legacy-image";

/**
 * Per-item product-image repair control (owner 2026-07-10:
 * "งานตัวเก่าที่เคยแนบรูป ช่วยแก้อันเก่าให้ด้วยที่ไม่ขึ้นรูป").
 *
 * `tb_order.cimages` used to be write-once — set at order submit and never
 * editable — so an order created with a bad image value (most often a Google-Drive
 * FOLDER link pasted into the CS add-form's free-text URL field) showed a broken
 * image forever, on both the admin and the customer surfaces.
 *
 * This control renders the current thumbnail (degrading to the neutral no-image
 * placeholder when the URL does not load, so a broken value is *visible as such*)
 * and lets an authorised admin paste a corrected DIRECT image URL. The server
 * action validates + normalises the value, so a repair cannot re-introduce an
 * un-renderable link. Display-only — it never touches price, qty or status.
 */
export function ItemImageEditor({
  tbOrderId,
  cimages,
  coverUrl,
  ctitle,
}: {
  tbOrderId: number;
  /** Raw stored `tb_order.cimages` — what the admin edits. */
  cimages: string | null;
  /** Server-resolved displayable URL (null when there is no usable image). */
  coverUrl: string | null;
  ctitle: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(cimages ?? "");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const thumbSrc = !coverUrl || imgFailed ? NO_COVER_IMAGE : coverUrl;
  const broken = !coverUrl || imgFailed;

  function save() {
    const next = value.trim();
    if (next === (cimages ?? "").trim()) {
      setOpen(false);
      return;
    }
    // §0f — confirm before mutating.
    const what = next === "" ? "ลบรูปสินค้านี้" : "เปลี่ยนรูปสินค้านี้";
    if (!window.confirm(`ยืนยัน${what}?\n\n${next || "(ไม่มีรูป)"}`)) return;

    setErr(null);
    startTransition(async () => {
      const res = await adminUpdateCartItemImage({ tb_order_id: tbOrderId, cimages: next });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="shrink-0">
      <a
        href={coverUrl ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
        aria-disabled={!coverUrl}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbSrc}
          alt={ctitle ?? "สินค้า"}
          className={`h-12 w-12 rounded border object-cover ${
            broken ? "border-amber-400 bg-amber-50" : "border-border"
          }`}
          onError={() => {
            if (!imgFailed) setImgFailed(true);
          }}
        />
      </a>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`mt-1 w-12 rounded px-1 py-0.5 text-[11px] font-medium ${
            broken
              ? "bg-amber-500 text-white hover:bg-amber-600"
              : "border border-border text-muted hover:bg-surface-alt"
          }`}
          title={broken ? "รูปนี้โหลดไม่ได้ — กดเพื่อใส่ลิงก์รูปใหม่" : "แก้ไขรูปสินค้า"}
        >
          {broken ? "แก้รูป" : "แก้รูป"}
        </button>
      ) : (
        <div className="mt-1 w-[280px] rounded-lg border border-border bg-white dark:bg-surface p-2 shadow-sm">
          <label className="block text-[11px] font-medium text-muted mb-1">
            ลิงก์รูปสินค้า (ลิงก์รูปโดยตรง)
          </label>
          <input
            type="url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://i.postimg.cc/xxx/yyy.jpg"
            className="w-full rounded border border-border bg-white dark:bg-surface px-2 py-1 text-[11px]"
          />
          <p className="mt-1 text-[11px] leading-snug text-muted">
            ต้องเป็นลิงก์ <strong>ไฟล์รูป</strong> ไม่ใช่ลิงก์โฟลเดอร์ Google Drive
            หรือลิงก์หน้าเว็บ · เว้นว่าง = ไม่มีรูป
          </p>
          {err && <p className="mt-1 text-[11px] text-red-600">{err}</p>}
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="rounded bg-primary-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {pending ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setValue(cimages ?? "");
                setErr(null);
                setOpen(false);
              }}
              className="rounded border border-border px-2 py-1 text-[11px] hover:bg-surface-alt"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * <ShopItemRowEditor> — per-row inline editor for one tb_order row.
 *
 * Rendered by <ForwarderItemsTable mode="edit"> for shop-spawned forwarders.
 * Replaces the read-only <tr> with editable number/text inputs + a Save
 * button + a Delete button. On save, calls adminUpdateShopOrderRow which
 * patches only the fields that changed (no full-row PUT). On delete, calls
 * adminDeleteShopOrderRow with a reason guard.
 *
 * Visual: same column layout as the view-mode row (matches PCS legacy
 * shops/detail.php update mode L260-340). Inputs are styled as inline
 * fields (no full Tailwind border-card chrome) so the table density stays.
 *
 * Edit gating:
 *   - camount + cprice + cshippingchn + cpriceupdate + cnote → always editable
 *   - cnameshop + ctitle + ccolor + csize + ctrackingnumber → editable only
 *     when user expands the "ปรับชื่อ/ร้าน/variant" details (avoid mis-clicks
 *     on long-form text in a tight table cell).
 *
 * The Save button is disabled when no field is dirty (vs initial values).
 * The Delete button always asks "พิมพ์ ลบ-{itemId} เพื่อยืนยัน" to gate
 * accidental clicks per AGENTS.md §0e (suspend/delete need confirms).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Save, ExternalLink, ChevronDown, Box } from "lucide-react";
import Image from "next/image";
import { adminUpdateShopOrderRow, adminDeleteShopOrderRow } from "@/actions/admin/forwarder-shop-items";

export type ShopItemRowEditorProps = {
  id: number;
  rowIndex: number;
  ctitle: string;
  curl: string;
  cnameshop: string;
  cimages: string | null;       // resolved URL (already through resolveLegacyUrl by parent)
  cprice: number;
  cshippingchn: number;
  cpriceupdate: number;
  camount: number;
  ccolor: string;
  csize: string;
  cnote: string;
  ctrackingnumber: string;
};

const INPUT_CLS =
  "w-full rounded border border-border bg-white dark:bg-surface px-1.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary-400/60 disabled:opacity-60 text-right font-mono";
const INPUT_TEXT_CLS =
  "w-full rounded border border-border bg-white dark:bg-surface px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400/60 disabled:opacity-60";

export function ShopItemRowEditor(p: ShopItemRowEditorProps) {
  const router = useRouter();
  const [camount,      setCamount]      = useState<string>(String(p.camount));
  const [cprice,       setCprice]       = useState<string>(p.cprice.toFixed(2));
  const [cshippingchn, setCshippingchn] = useState<string>(p.cshippingchn.toFixed(2));
  const [cpriceupdate, setCpriceupdate] = useState<string>(p.cpriceupdate.toFixed(2));
  const [cnote,        setCnote]        = useState<string>(p.cnote);
  // Advanced fields (collapsed by default)
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [ctitle,       setCtitle]       = useState<string>(p.ctitle);
  const [cnameshop,    setCnameshop]    = useState<string>(p.cnameshop);
  const [ccolor,       setCcolor]       = useState<string>(p.ccolor);
  const [csize,        setCsize]        = useState<string>(p.csize);
  const [ctrackingnumber, setCtrack]    = useState<string>(p.ctrackingnumber);

  const [pending, startTransition] = useTransition();
  const [error,   setError]        = useState<string | null>(null);
  const [success, setSuccess]      = useState<string | null>(null);

  // Compute the partial patch from current state vs initial values
  function buildPatch(): Record<string, string> {
    const patch: Record<string, string> = {};
    if (camount       !== String(p.camount))         patch.camount       = camount;
    if (cprice        !== p.cprice.toFixed(2))       patch.cprice        = cprice;
    if (cshippingchn  !== p.cshippingchn.toFixed(2)) patch.cshippingchn  = cshippingchn;
    if (cpriceupdate  !== p.cpriceupdate.toFixed(2)) patch.cpriceupdate  = cpriceupdate;
    if (cnote.trim()  !== p.cnote.trim())             patch.cnote         = cnote;
    if (showAdvanced) {
      if (ctitle.trim()    !== p.ctitle.trim())           patch.ctitle    = ctitle;
      if (cnameshop.trim() !== p.cnameshop.trim())        patch.cnameshop = cnameshop;
      if (ccolor.trim()    !== p.ccolor.trim())           patch.ccolor    = ccolor;
      if (csize.trim()     !== p.csize.trim())            patch.csize     = csize;
      if (ctrackingnumber.trim() !== p.ctrackingnumber.trim()) patch.ctrackingnumber = ctrackingnumber;
    }
    return patch;
  }

  const dirtyKeys = Object.keys(buildPatch());
  const isDirty = dirtyKeys.length > 0;

  // ── Computed line subtotal (live) ──
  const liveSubtotal =
    Number(cprice || "0") * Number(camount || "0")
    + Number(cshippingchn || "0")
    + Number(cpriceupdate || "0");

  function onSave() {
    setError(null);
    setSuccess(null);
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      setError("ไม่มีการเปลี่ยนแปลง");
      return;
    }
    startTransition(async () => {
      const res = await adminUpdateShopOrderRow({ itemId: p.id, patch });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`บันทึก ${res.updatedFields.length} field สำเร็จ`);
      router.refresh();
    });
  }

  function onDelete() {
    setError(null);
    const confirmStr = `ลบ-${p.id}`;
    const input = prompt(`ยืนยันลบรายการ "${p.ctitle.slice(0, 40)}..." โดยพิมพ์: ${confirmStr}`);
    if (input !== confirmStr) {
      setError(input == null ? "ยกเลิกแล้ว" : `พิมพ์ "${confirmStr}" ไม่ตรง — ยกเลิก`);
      return;
    }
    const reason = prompt("เหตุผลที่ลบ (อย่างน้อย 2 ตัวอักษร):") ?? "";
    if (reason.trim().length < 2) {
      setError("ต้องระบุเหตุผล");
      return;
    }
    startTransition(async () => {
      const res = await adminDeleteShopOrderRow({ itemId: p.id, reason });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`ลบสำเร็จ · เหลือ ${res.remainingCount} รายการ`);
      router.refresh();
    });
  }

  return (
    <>
      <tr className="border-b border-border/40 align-top">
        {/* # row index */}
        <td className="py-2 px-2 text-center text-muted text-xs">{p.rowIndex}</td>

        {/* Image (read-only) */}
        <td className="py-2 px-2">
          {p.cimages ? (
            <a href={p.cimages} target="_blank" rel="noopener noreferrer">
              <Image
                src={p.cimages}
                alt={p.ctitle || "product"}
                width={64}
                height={64}
                unoptimized
                className="rounded border border-border w-16 h-16 object-cover"
              />
            </a>
          ) : (
            <div className="w-16 h-16 rounded border border-dashed border-border bg-surface-alt/30 flex items-center justify-center text-muted">
              <Box className="h-5 w-5" />
            </div>
          )}
        </td>

        {/* Product info (read-only) + advanced toggle */}
        <td className="py-2 px-2">
          <div className="space-y-1">
            {p.curl ? (
              <a
                href={p.curl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-600 hover:underline text-sm leading-snug line-clamp-2 inline-flex items-start gap-1"
              >
                {ctitle.trim() || p.ctitle || "—"} <ExternalLink className="h-3 w-3 flex-shrink-0 mt-0.5" />
              </a>
            ) : (
              <span className="text-sm leading-snug">{ctitle.trim() || p.ctitle || "—"}</span>
            )}
            {(ccolor || csize) && (
              <p className="text-xs text-muted">
                {[ccolor, csize].filter(Boolean).join(" · ")}
              </p>
            )}
            <div className="flex items-center gap-2">
              <input
                value={cnote}
                onChange={(e) => setCnote(e.target.value)}
                placeholder="หมายเหตุ..."
                className={INPUT_TEXT_CLS + " max-w-[260px]"}
                disabled={pending}
              />
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-xs text-sky-600 hover:underline inline-flex items-center gap-1 flex-shrink-0"
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                {showAdvanced ? "ซ่อน" : "แก้ชื่อ/ร้าน/variant"}
              </button>
            </div>
          </div>
        </td>

        {/* Quantity (editable) */}
        <td className="py-2 px-2 text-center">
          <input
            type="number"
            min={0}
            step={1}
            value={camount}
            onChange={(e) => setCamount(e.target.value)}
            className={INPUT_CLS + " w-16"}
            disabled={pending}
          />
        </td>

        {/* Price per piece (editable) */}
        <td className="py-2 px-2 text-right">
          <div className="inline-flex items-center gap-1">
            <span className="text-muted">¥</span>
            <input
              type="number"
              step={0.01}
              value={cprice}
              onChange={(e) => setCprice(e.target.value)}
              className={INPUT_CLS + " w-20"}
              disabled={pending}
            />
          </div>
        </td>

        {/* Shipping CN (editable) */}
        <td className="py-2 px-2 text-right">
          <div className="inline-flex items-center gap-1">
            <span className="text-muted">¥</span>
            <input
              type="number"
              step={0.01}
              value={cshippingchn}
              onChange={(e) => setCshippingchn(e.target.value)}
              className={INPUT_CLS + " w-20"}
              disabled={pending}
            />
          </div>
        </td>

        {/* Price adjust (editable) */}
        <td className="py-2 px-2 text-right">
          <div className="inline-flex items-center gap-1">
            <span className="text-muted">¥</span>
            <input
              type="number"
              step={0.01}
              value={cpriceupdate}
              onChange={(e) => setCpriceupdate(e.target.value)}
              className={INPUT_CLS + " w-20"}
              disabled={pending}
            />
          </div>
        </td>

        {/* Subtotal (live) + actions */}
        <td className="py-2 px-2 text-right">
          <div className="space-y-1">
            <div className="font-mono font-medium text-sm">
              ¥{liveSubtotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </div>
            <div className="flex justify-end gap-1">
              <button
                type="button"
                onClick={onSave}
                disabled={pending || !isDirty}
                className="inline-flex items-center gap-1 rounded border border-primary-300 bg-primary-50 hover:bg-primary-100 text-primary-700 px-1.5 py-0.5 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                title={isDirty ? `บันทึก ${dirtyKeys.length} field` : "ไม่มีการเปลี่ยนแปลง"}
              >
                <Save className="h-3 w-3" /> บันทึก
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 px-1.5 py-0.5 text-xs font-medium disabled:opacity-40"
                title="ลบรายการนี้"
              >
                <Trash2 className="h-3 w-3" /> ลบ
              </button>
            </div>
          </div>
        </td>
      </tr>

      {/* Advanced row (text fields: title, shop name, variant, tracking) */}
      {showAdvanced && (
        <tr className="border-b border-border/40 bg-amber-50/30 dark:bg-amber-950/10">
          <td colSpan={8} className="px-2 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
              <Field label="ชื่อสินค้า (ctitle)">
                <input value={ctitle} onChange={(e) => setCtitle(e.target.value)} className={INPUT_TEXT_CLS} disabled={pending} placeholder="ชื่อสินค้าจีน..." />
              </Field>
              <Field label="ร้าน (cnameshop)">
                <input value={cnameshop} onChange={(e) => setCnameshop(e.target.value)} className={INPUT_TEXT_CLS} disabled={pending} placeholder="ชื่อร้าน..." />
              </Field>
              <Field label="สี (ccolor)">
                <input value={ccolor} onChange={(e) => setCcolor(e.target.value)} className={INPUT_TEXT_CLS} disabled={pending} placeholder="—" />
              </Field>
              <Field label="ขนาด (csize)">
                <input value={csize} onChange={(e) => setCsize(e.target.value)} className={INPUT_TEXT_CLS} disabled={pending} placeholder="—" />
              </Field>
              <Field label="Tracking (ctrackingnumber)">
                <input value={ctrackingnumber} onChange={(e) => setCtrack(e.target.value)} className={INPUT_TEXT_CLS} disabled={pending} placeholder="JT123..." />
              </Field>
            </div>
          </td>
        </tr>
      )}

      {/* Status message row */}
      {(error || success) && (
        <tr>
          <td colSpan={8} className="px-2 pb-2">
            {error && (
              <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">⚠️ {error}</div>
            )}
            {success && (
              <div className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">✓ {success}</div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <label className="block text-[10px] text-muted">{label}</label>
      {children}
    </div>
  );
}

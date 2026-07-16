"use client";

/**
 * อี้อู ใบส่งของ → box-split arrival rows (ภูม 2026-07-16 · Phase 3).
 *
 * FLAT Excel-style table (ภูม 2026-07-16: "เอาง่ายๆ เป็นตารางแบบ excel · ในรูปใบส่งของ
 * มันก็มาเป็นตาราง"). One row per box-group — columns mirror the ใบส่งของ (单号 · Pack ·
 * Weight · L/W/H · CBM · สินค้า). Because the อี้อู ใบส่งของ is image-only (OCR-weak), the
 * box detail is pulled from the packing Excel: upload it → click a 单号 chip → its box
 * rows drop straight into the table (no typing). Staff reviews · a single PR (Step 2)
 * covers the whole note · commit groups rows by 单号 into box-split shipments. Money-safe:
 * client pre-fill only; the create action re-validates every field server-side.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import {
  addYiwuDeliveryNoteShipments,
  uploadYiwuDeliveryImage,
  type YiwuCreateSummary,
} from "@/actions/admin/yiwu-delivery-note";
import { previewYiwuBoxesFromPacking } from "@/actions/admin/yiwu-packing-reconcile";
import type { YiwuPackingBox } from "@/lib/admin/yiwu-packing-boxes";
import { OcrExtract } from "@/components/ocr/ocr-extract";
import { parseYiwuDeliveryOcr } from "@/lib/admin/yiwu-delivery-parser";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

// One flat table row = one box-group. `orderNo` (单号) groups rows into shipments at commit.
type FlatRow = {
  id: number;
  orderNo: string;
  boxCount: string;
  weightKg: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  cbm: string;
  productType: string;
};

const emptyRow = (id: number): FlatRow => ({
  id, orderNo: "", boxCount: "1", weightKg: "", lengthCm: "", widthCm: "", heightCm: "", cbm: "", productType: "",
});

// Named helper keeps `new Date()` out of the render body (Next 16 react-hooks/purity).
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function YiwuDeliveryClient() {
  const { confirm, dialogs } = useConfirmDialogs();
  const idRef = useRef(2);
  const nextId = () => idRef.current++;

  // ── image (Step 1) ────────────────────────────────────────────────────────
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageKey, setImageKey] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [ocrNote, setOcrNote] = useState<string | null>(null);

  // ── customer + date (Step 2) ─────────────────────────────────────────────
  const [memberCode, setMemberCode] = useState("");
  const [arrivalDate, setArrivalDate] = useState<string>(todayIsoDate);

  // ── packing pre-fill ─────────────────────────────────────────────────────
  const packingFileRef = useRef<HTMLInputElement>(null);
  const [packingBoxes, setPackingBoxes] = useState<Record<string, YiwuPackingBox[]> | null>(null);
  const [packingOrderNos, setPackingOrderNos] = useState<string[]>([]);
  const [packingContainer, setPackingContainer] = useState<string | null>(null);
  const [packingLoading, setPackingLoading] = useState(false);
  const [packingNote, setPackingNote] = useState<string | null>(null);
  const [chipSearch, setChipSearch] = useState("");

  // ── the flat table (Step 3) ──────────────────────────────────────────────
  const [rows, setRows] = useState<FlatRow[]>([emptyRow(1)]);

  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<YiwuCreateSummary | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  useEffect(() => {
    return () => { if (imagePreview) URL.revokeObjectURL(imagePreview); };
  }, [imagePreview]);

  // ── image select → preview + auto-upload → key ──────────────────────────
  async function onPickImage(file: File | null) {
    setUploadErr(null); setResult(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    if (!file) { setImageFile(null); setImagePreview(null); setImageKey(""); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageKey("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadYiwuDeliveryImage(fd);
      if (!res.ok) setUploadErr(res.error);
      else if (res.data) setImageKey(res.data.key);
    } catch {
      setUploadErr("อัปโหลดรูปไม่สำเร็จ — ลองใหม่");
    } finally {
      setUploading(false);
    }
  }

  // OCR only helps with the PR (the table is filled from the packing Excel).
  function onOcrText(text: string) {
    const p = parseYiwuDeliveryOcr(text);
    if (p.memberCode && !memberCode) {
      setMemberCode(p.memberCode);
      setOcrNote(`อ่านรหัสลูกค้าได้: ${p.memberCode} — ตรวจให้ตรงกับรูป`);
    } else {
      setOcrNote("อ่านรูปแล้ว — กรอกรหัสลูกค้า (PR) เอง แล้วดึงกล่องจากไฟล์ packing ด้านล่าง");
    }
  }

  // ── packing upload → chip list ───────────────────────────────────────────
  const boxToRow = (orderNo: string, b: YiwuPackingBox): FlatRow => ({
    id: nextId(),
    orderNo,
    boxCount: String(b.boxCount),
    weightKg: b.weightKg ? String(b.weightKg) : "",
    lengthCm: b.lengthCm ? String(b.lengthCm) : "",
    widthCm: b.widthCm ? String(b.widthCm) : "",
    heightCm: b.heightCm ? String(b.heightCm) : "",
    cbm: b.cbm ? String(b.cbm) : "",
    productType: b.productType,
  });

  async function onPackingFile(file: File | null) {
    setPackingNote(null);
    if (!file) return;
    setPackingLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await previewYiwuBoxesFromPacking(fd);
      if (!res.ok) { setPackingNote(`⚠ ${res.error}`); return; }
      if (res.data) {
        setPackingBoxes(res.data.boxesByOrderNo);
        setPackingOrderNos(res.data.orderNos);
        setPackingContainer(res.data.container);
        setPackingNote(`พบ ${res.data.orderNos.length} เลข 单号 ในไฟล์ — คลิกเลขที่เป็นของลูกค้านี้ (จากรูปใบส่งของ) เพื่อเพิ่มลงตาราง`);
      }
    } catch {
      setPackingNote("⚠ อ่านไฟล์ packing ไม่สำเร็จ — ลองใหม่");
    } finally {
      setPackingLoading(false);
    }
  }

  /** Click a 单号 chip → drop its box rows into the table (dedupe · replace the lone blank row). */
  function addOrderNo(orderNo: string) {
    const boxes = packingBoxes?.[orderNo];
    if (!boxes || boxes.length === 0) return;
    setRows((prev) => {
      if (prev.some((r) => r.orderNo.trim() === orderNo)) return prev; // already added
      const newRows = boxes.map((b) => boxToRow(orderNo, b));
      const isBlankOnly = prev.length === 1 && !prev[0]!.orderNo.trim() && !prev[0]!.weightKg && !prev[0]!.cbm;
      return isBlankOnly ? newRows : [...prev, ...newRows];
    });
  }

  // ── flat table mutations ─────────────────────────────────────────────────
  function updateRow(id: number, field: keyof FlatRow, value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }
  function computeCbm(id: number) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const l = Number(r.lengthCm), w = Number(r.widthCm), h = Number(r.heightCm), b = Number(r.boxCount) || 1;
        if (l > 0 && w > 0 && h > 0) return { ...r, cbm: String(Math.round((l * w * h * b) / 1_000_000 * 1e6) / 1e6) };
        return r;
      }),
    );
  }
  function addRow() { setRows((prev) => [...prev, emptyRow(nextId())]); }
  function removeRow(id: number) {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length ? next : [emptyRow(nextId())];
    });
  }

  // ── totals ───────────────────────────────────────────────────────────────
  const distinctOrders = new Set(rows.map((r) => r.orderNo.trim()).filter(Boolean)).size;
  const totalBoxes = rows.reduce((n, r) => n + (Number(r.boxCount) || 0), 0);
  const filledRows = rows.filter((r) => r.orderNo.trim() && (Number(r.weightKg) > 0 || Number(r.cbm) > 0)).length;

  // ── submit ───────────────────────────────────────────────────────────────
  async function onSubmit() {
    setSubmitErr(null); setResult(null);
    const pr = memberCode.trim().toUpperCase();
    if (!/^PR\d+$/.test(pr)) { setSubmitErr("กรุณากรอกรหัสลูกค้าให้ถูกต้อง (PR ตามด้วยตัวเลข)"); return; }

    // group flat rows by 单号 → shipments
    const byOrder = new Map<string, FlatRow[]>();
    for (const r of rows) {
      const k = r.orderNo.trim();
      if (!k) { setSubmitErr("มีแถวที่ยังไม่ได้กรอกเลข 单号"); return; }
      if (!(Number(r.weightKg) > 0) && !(Number(r.cbm) > 0)) {
        setSubmitErr(`เลข ${k} มีแถวที่ยังไม่มีน้ำหนักและคิว (ต้องมีอย่างน้อยหนึ่งอย่าง)`); return;
      }
      const arr = byOrder.get(k);
      if (arr) arr.push(r);
      else byOrder.set(k, [r]);
    }
    if (byOrder.size === 0) { setSubmitErr("ยังไม่มีรายการ — เพิ่มกล่องจาก packing หรือกรอกเอง"); return; }

    const ok = await confirm(
      `ยืนยันเอาเข้าระบบ?\n\n` +
      `• ลูกค้า: ${pr}\n` +
      `• ${byOrder.size} ออเดอร์ (单号) · ${rows.length} กลุ่มกล่อง · รวม ${totalBoxes} กล่อง\n` +
      `• สถานะเริ่มต้น: ถึงโกดังจีนแล้ว (อี้อู) — ระบบตั้งราคาให้อัตโนมัติ\n\n` +
      `แต่ละกลุ่มที่ขนาดต่างกันจะถูกแตกเป็นคนละแถว (单号-1/N, -2/N …)`,
    );
    if (!ok) return;

    const payload = Array.from(byOrder.entries()).map(([orderNo, group]) => ({
      orderNo,
      memberCode: pr,
      arrivalDate: arrivalDate || undefined,
      imageUrl: imageKey || undefined,
      rows: group.map((r) => ({
        boxCount: Number(r.boxCount) || 1,
        weightKg: Number(r.weightKg) || 0,
        lengthCm: Number(r.lengthCm) || 0,
        widthCm: Number(r.widthCm) || 0,
        heightCm: Number(r.heightCm) || 0,
        cbm: Number(r.cbm) || 0,
        productType: r.productType.trim(),
      })),
    }));

    startTransition(async () => {
      try {
        const res = await addYiwuDeliveryNoteShipments(payload);
        if (!res.ok) setSubmitErr(res.error);
        else if (res.data) { setResult(res.data); setRows([emptyRow(nextId())]); }
      } catch {
        setSubmitErr("เกิดข้อผิดพลาด — ลองใหม่");
      }
    });
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500";
  const cellCls =
    "w-full rounded-md border border-gray-300 px-1.5 py-1 text-[13px] text-right tabular-nums focus:border-teal-500 focus:ring-1 focus:ring-teal-500";

  const filteredChips = packingOrderNos
    .filter((o) => !chipSearch.trim() || o.toLowerCase().includes(chipSearch.trim().toLowerCase()))
    .filter((o) => !rows.some((r) => r.orderNo.trim() === o));

  return (
    <div className="space-y-5">
      {/* ── STEP 1 · upload image ──────────────────────────────────────── */}
      <section className="rounded-2xl border border-gray-200 bg-surface p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-teal-600 text-[13px] font-bold text-white">1</span>
          <h2 className="text-base font-semibold">อัปโหลดรูปใบส่งของ (เก็บติดออเดอร์)</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-800 hover:bg-teal-100">
              <span>📷 เลือกรูปใบส่งของ</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0] ?? null)} />
            </label>
            <p className="mt-1.5 text-[11px] text-muted">รับเฉพาะรูป (JPG/PNG) ไม่เกิน 5 MB · รูปติดไปกับออเดอร์ตั้งแต่ “ถึงโกดังจีน”</p>
            {uploading && <p className="mt-1 text-[11px] text-teal-700">⏳ กำลังอัปโหลด…</p>}
            {imageKey && !uploading && <p className="mt-1 text-[11px] text-emerald-700">✓ อัปโหลดรูปแล้ว</p>}
            {uploadErr && <p className="mt-1 text-[11px] text-red-600">⚠ {uploadErr}</p>}
            {imageFile && (
              <OcrExtract
                file={imageFile}
                label="🔍 อ่านรหัสลูกค้าจากรูป (OCR)"
                hint="ให้ระบบลองอ่าน PR จากรูป (ตารางกล่องดึงจาก packing แทน)"
                onText={onOcrText}
              />
            )}
            {ocrNote && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">💡 {ocrNote}</p>}
          </div>
          {imagePreview && (
            <a href={imagePreview} target="_blank" rel="noreferrer" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="ใบส่งของ" className="max-h-40 rounded-lg border border-gray-200 object-contain" />
            </a>
          )}
        </div>
      </section>

      {/* ── STEP 2 · customer + date ───────────────────────────────────── */}
      <section className="rounded-2xl border border-gray-200 bg-surface p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-teal-600 text-[13px] font-bold text-white">2</span>
          <h2 className="text-base font-semibold">ลูกค้า &amp; วันที่ถึงโกดัง</h2>
          <span className="text-[11px] text-muted">(ใช้กับทุกแถวในตาราง — 1 ใบส่งของ = 1 ลูกค้า)</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">รหัสลูกค้า (PR)</label>
            <input value={memberCode} onChange={(e) => setMemberCode(e.target.value)} placeholder="เช่น PR172" autoComplete="off" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">วันที่ถึงโกดังจีน</label>
            <input type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} className={inputCls} />
          </div>
        </div>
      </section>

      {/* ── STEP 3 · flat Excel-style table ────────────────────────────── */}
      <section className="rounded-2xl border border-gray-200 bg-surface p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-teal-600 text-[13px] font-bold text-white">3</span>
          <h2 className="text-base font-semibold">ตารางกล่อง (เหมือนใบส่งของ · แก้ได้ทุกช่อง)</h2>
        </div>

        {/* packing pull → 单号 chips */}
        <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50/70 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium text-sky-900">⚡ ดึงกล่องจากไฟล์ packing list (แม่นกว่า OCR):</span>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-[12px] font-medium text-sky-800 hover:bg-sky-100">
              <span>📦 เลือกไฟล์ packing (.xlsx)</span>
              <input ref={packingFileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => onPackingFile(e.target.files?.[0] ?? null)} />
            </label>
            {packingLoading && <span className="text-[11px] text-sky-700">⏳ กำลังอ่าน…</span>}
            {packingContainer && <span className="text-[11px] text-sky-700">ตู้ {packingContainer}</span>}
          </div>
          {packingNote && <p className="mt-1.5 text-[11px] text-sky-900">💡 {packingNote}</p>}
          {packingBoxes && packingOrderNos.length > 0 && (
            <div className="mt-2">
              <input
                value={chipSearch}
                onChange={(e) => setChipSearch(e.target.value)}
                placeholder="🔎 ค้นเลข 单号…"
                className="mb-2 w-full max-w-xs rounded-lg border border-sky-300 px-2.5 py-1 text-[12px] focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                {filteredChips.slice(0, 60).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => addOrderNo(o)}
                    className="rounded-md border border-sky-300 bg-white px-2 py-1 text-[11px] font-medium text-sky-800 hover:bg-sky-100"
                  >
                    ＋ {o} <span className="text-sky-500">({packingBoxes[o]?.length ?? 0} กล่อง)</span>
                  </button>
                ))}
                {filteredChips.length === 0 && <span className="text-[11px] text-sky-600">— เพิ่มครบแล้ว หรือไม่พบเลขที่ค้นหา —</span>}
                {filteredChips.length > 60 && <span className="text-[11px] text-sky-600">…และอีก {filteredChips.length - 60} (พิมพ์ค้นหาเพื่อกรอง)</span>}
              </div>
            </div>
          )}
        </div>

        {/* the flat table */}
        <div className="overflow-x-auto scrollbar-x-visible rounded-lg border border-gray-200">
          <table className="w-full min-w-[820px] border-collapse text-[13px] [&_td]:border [&_th]:border [&_td]:border-gray-200 [&_th]:border-gray-300">
            <thead>
              <tr className="bg-teal-600 text-left text-[11px] text-white">
                <th className="px-2 py-1.5 font-medium">#</th>
                <th className="px-2 py-1.5 font-medium">เลข 单号</th>
                <th className="px-2 py-1.5 font-medium">กล่อง</th>
                <th className="px-2 py-1.5 font-medium">น้ำหนัก (กก.)</th>
                <th className="px-2 py-1.5 font-medium">กว้าง</th>
                <th className="px-2 py-1.5 font-medium">ยาว</th>
                <th className="px-2 py-1.5 font-medium">สูง (ซม.)</th>
                <th className="px-2 py-1.5 font-medium">คิว (CBM)</th>
                <th className="px-2 py-1.5 font-medium">สินค้า</th>
                <th className="px-2 py-1.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="odd:bg-white even:bg-gray-50/70">
                  <td className="px-2 py-1 text-center text-[11px] text-muted">{i + 1}</td>
                  <td className="px-1.5 py-1 w-40"><input value={r.orderNo} onChange={(e) => updateRow(r.id, "orderNo", e.target.value)} placeholder="X9002653" autoComplete="off" className="w-full rounded-md border border-gray-300 px-2 py-1 text-[13px] font-medium focus:border-teal-500 focus:ring-1 focus:ring-teal-500" /></td>
                  <td className="px-1.5 py-1 w-16"><input value={r.boxCount} onChange={(e) => updateRow(r.id, "boxCount", e.target.value)} inputMode="numeric" className={cellCls} /></td>
                  <td className="px-1.5 py-1 w-24"><input value={r.weightKg} onChange={(e) => updateRow(r.id, "weightKg", e.target.value)} inputMode="decimal" className={cellCls} /></td>
                  <td className="px-1.5 py-1 w-20"><input value={r.widthCm} onChange={(e) => updateRow(r.id, "widthCm", e.target.value)} inputMode="decimal" className={cellCls} /></td>
                  <td className="px-1.5 py-1 w-20"><input value={r.lengthCm} onChange={(e) => updateRow(r.id, "lengthCm", e.target.value)} inputMode="decimal" className={cellCls} /></td>
                  <td className="px-1.5 py-1 w-20"><input value={r.heightCm} onChange={(e) => updateRow(r.id, "heightCm", e.target.value)} inputMode="decimal" className={cellCls} /></td>
                  <td className="px-1.5 py-1 w-28">
                    <div className="flex items-center gap-1">
                      <input value={r.cbm} onChange={(e) => updateRow(r.id, "cbm", e.target.value)} inputMode="decimal" className={cellCls} />
                      <button type="button" onClick={() => computeCbm(r.id)} title="คำนวณคิวจาก กว้าง×ยาว×สูง×กล่อง" className="shrink-0 rounded border border-teal-200 bg-teal-50 px-1 text-[11px] text-teal-700 hover:bg-teal-100">=</button>
                    </div>
                  </td>
                  <td className="px-1.5 py-1"><input value={r.productType} onChange={(e) => updateRow(r.id, "productType", e.target.value)} placeholder="—" className="w-full rounded-md border border-gray-300 px-2 py-1 text-[13px] focus:border-teal-500 focus:ring-1 focus:ring-teal-500" /></td>
                  <td className="px-1.5 py-1 text-center"><button type="button" onClick={() => removeRow(r.id)} className="rounded p-1 text-red-500 hover:bg-red-50" title="ลบแถว">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button type="button" onClick={addRow} className="mt-2 rounded-lg border border-dashed border-teal-300 px-3 py-1.5 text-[12px] font-medium text-teal-700 hover:bg-teal-50">
          ＋ เพิ่มแถวว่าง (กรอกเอง)
        </button>
      </section>

      {/* ── submit bar ─────────────────────────────────────────────────── */}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/95 p-4 shadow-md backdrop-blur">
        <div className="text-sm text-emerald-900">
          <strong>{distinctOrders}</strong> ออเดอร์ (单号) · <strong>{rows.length}</strong> กลุ่มกล่อง · รวม <strong>{totalBoxes}</strong> กล่อง
          <span className="ml-2 text-[11px] text-emerald-700">→ ถึงโกดังจีน (อี้อู) · ระบบตั้งราคาให้เอง{filledRows < rows.length ? ` · ⚠ ${rows.length - filledRows} แถวยังไม่ครบ` : ""}</span>
        </div>
        <button type="button" onClick={onSubmit} disabled={pending} className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">
          {pending ? "⏳ กำลังเอาเข้าระบบ…" : "✅ เอาเข้าระบบ"}
        </button>
      </div>

      {submitErr && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">⚠ {submitErr}</div>}

      {/* ── result ─────────────────────────────────────────────────────── */}
      {result && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <h2 className="mb-2 text-base font-semibold text-emerald-900">ผลการเอาเข้าระบบ</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-lg bg-emerald-600 px-3 py-1 font-medium text-white">สำเร็จ {result.added} ออเดอร์ · {result.rowsCreated} แถว</span>
            {result.skipped > 0 && <span className="rounded-lg bg-amber-500 px-3 py-1 font-medium text-white">ข้าม (มีอยู่แล้ว) {result.skipped}</span>}
            {result.failed > 0 && <span className="rounded-lg bg-red-600 px-3 py-1 font-medium text-white">ไม่สำเร็จ {result.failed}</span>}
          </div>
          <ul className="mt-3 space-y-1 text-[13px]">
            {result.results.map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className={r.ok ? "text-emerald-700" : r.skipped ? "text-amber-700" : "text-red-700"}>{r.ok ? "✓" : r.skipped ? "⊘" : "✕"}</span>
                <span className="font-medium">{r.orderNo}</span>
                {r.ok ? <span className="text-muted">— สร้าง {r.fids?.length ?? 0} แถว</span> : <span className="text-muted">— {r.error}</span>}
              </li>
            ))}
          </ul>
          <Link href="/admin/forwarders" className="mt-3 inline-block rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100">ไปหน้าฝากนำเข้า →</Link>
        </section>
      )}

      {dialogs}
    </div>
  );
}

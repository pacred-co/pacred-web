"use client";

/**
 * อี้อู ใบส่งของ → box-split arrival rows (ภูม 2026-07-16 · Phase 3).
 *
 * DESIGN (ภูม 2026-07-16, round 2): the form MIRRORS the paper ใบส่งสินค้า —
 *   • the uploaded ใบส่งของ image is shown BIG + sticky on the left (click → full-screen
 *     zoom) so staff can READ it while they TYPE, without switching screens;
 *   • the table columns match the note 1:1 (单号 · PR · สินค้า · กล่อง · น้ำหนัก · ยาว ·
 *     กว้าง · สูง · คิว) with a totals row at the bottom (กล่อง/น้ำหนัก/คิว) like the note;
 *   • the customer PR is a COLUMN — one ใบส่งของ can carry >1 PR; a "เติม PR" fill-down +
 *     row-inherit keeps the single-PR case one-keystroke.
 *
 * FLOW (ภูม+เดฟ): CS uploads the ใบส่งของ IMAGE (OCR grabs the PR as a hint) → CS keys the
 * box rows straight off the note → submit → orders land at "ถึงโกดังจีน" (fstatus 2). DOC
 * later uploads the packing list (Step 2 below) → matches trackings → "กำลังส่งมาไทย".
 * Commit groups rows by 单号 into box-split shipments; each 单号 → one PR (validated).
 * Money-safe: the create action re-validates every field + the PR server-side.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import {
  addYiwuDeliveryNoteShipments,
  uploadYiwuDeliveryImage,
  type YiwuCreateSummary,
} from "@/actions/admin/yiwu-delivery-note";
import { OcrExtract } from "@/components/ocr/ocr-extract";
import { parseYiwuDeliveryOcr } from "@/lib/admin/yiwu-delivery-parser";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

// One flat table row = one box-group (a ใบส่งของ row). `orderNo` (单号) groups rows into
// shipments at commit; `pr` is the row's customer (a note can carry >1 PR).
type FlatRow = {
  id: number;
  orderNo: string;
  pr: string;
  productType: string;
  boxCount: string;
  weightKg: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  cbm: string;
};

const emptyRow = (id: number, pr = "", orderNo = ""): FlatRow => ({
  id, orderNo, pr, productType: "", boxCount: "1",
  weightKg: "", lengthCm: "", widthCm: "", heightCm: "", cbm: "",
});

// Named helper keeps `new Date()` out of the render body (Next 16 react-hooks/purity).
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
const n2 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
const n3 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 6 });

export function YiwuDeliveryClient() {
  const { confirm, dialogs } = useConfirmDialogs();
  const idRef = useRef(2);
  const nextId = () => idRef.current++;

  // ── image ─────────────────────────────────────────────────────────────────
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageKey, setImageKey] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [ocrNote, setOcrNote] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [imageWide, setImageWide] = useState(false); // true = รูปเต็มกว้าง (ตารางลงล่าง)

  // ── date (whole note) ─────────────────────────────────────────────────────
  const [arrivalDate, setArrivalDate] = useState<string>(todayIsoDate);

  // ── the table ─────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<FlatRow[]>([emptyRow(1)]);

  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<YiwuCreateSummary | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  useEffect(() => {
    return () => { if (imagePreview) URL.revokeObjectURL(imagePreview); };
  }, [imagePreview]);

  // ── image select → preview + auto-upload → key ────────────────────────────
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

  // OCR only helps with the PR — CS keys the box rows off the note into the table.
  function onOcrText(text: string) {
    const p = parseYiwuDeliveryOcr(text);
    if (p.memberCode) {
      // seed the FIRST row's PR (+ any still-empty PR cell) — staff overrides per row.
      const pr = p.memberCode.toUpperCase();
      setRows((prev) => prev.map((r, i) => (i === 0 || !r.pr.trim() ? { ...r, pr } : r)));
      setOcrNote(`อ่านรหัสลูกค้าได้: ${pr} — ใส่ให้แถวแล้ว · ตรวจให้ตรงกับรูป (ถ้ามีหลาย PR แก้เป็นรายแถว)`);
    } else {
      setOcrNote("อ่านรูปแล้ว — กรอกรหัสลูกค้า (PR) ในตารางเอง แล้วคีย์กล่องจากใบส่งของ");
    }
  }

  // ── table mutations ───────────────────────────────────────────────────────
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
  // add a row. sameOrder → clone the last row's 单号 (a bill with several box sizes =
  // one 单号, many rows — the note's normal case); otherwise a fresh 单号 (next bill) but
  // keep the PR (usually the same customer). Mirrors the note's structure.
  function addRow(sameOrder: boolean) {
    setRows((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, emptyRow(nextId(), last?.pr ?? "", sameOrder ? (last?.orderNo ?? "") : "")];
    });
  }
  function removeRow(id: number) {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length ? next : [emptyRow(nextId())];
    });
  }
  // fill the first row's PR / 单号 down into every still-empty cell.
  function fillPrDown() {
    setRows((prev) => {
      const pr = prev[0]?.pr.trim();
      if (!pr) return prev;
      return prev.map((r) => (r.pr.trim() ? r : { ...r, pr }));
    });
  }
  function fillOrderNoDown() {
    setRows((prev) => {
      const o = prev[0]?.orderNo.trim();
      if (!o) return prev;
      return prev.map((r) => (r.orderNo.trim() ? r : { ...r, orderNo: o }));
    });
  }

  // ── totals (like the note footer) ─────────────────────────────────────────
  const distinctOrders = new Set(rows.map((r) => r.orderNo.trim().toUpperCase()).filter(Boolean)).size;
  const distinctPrs = new Set(rows.map((r) => r.pr.trim().toUpperCase()).filter(Boolean)).size;
  const totalBoxes = rows.reduce((n, r) => n + (Number(r.boxCount) || 0), 0);
  const totalWeight = rows.reduce((n, r) => n + (Number(r.weightKg) || 0), 0);
  const totalCbm = rows.reduce((n, r) => n + (Number(r.cbm) || 0), 0);
  const filledRows = rows.filter((r) => r.orderNo.trim() && r.pr.trim() && Number(r.boxCount) >= 1 && (Number(r.weightKg) > 0 || Number(r.cbm) > 0)).length;
  // distinct 单号 in appearance order → cluster rows of one bill with a shared tint (like the note).
  const orderIndex = new Map<string, number>();
  for (const r of rows) { const k = r.orderNo.trim().toUpperCase(); if (k && !orderIndex.has(k)) orderIndex.set(k, orderIndex.size); }
  const rowTint = (r: FlatRow): string => {
    const k = r.orderNo.trim().toUpperCase();
    if (!k) return "bg-white";
    return (orderIndex.get(k)! % 2 === 0) ? "bg-white" : "bg-teal-50/50";
  };

  // ── submit ─────────────────────────────────────────────────────────────────
  async function onSubmit() {
    setSubmitErr(null); setResult(null);

    // group flat rows by 单号 (normalized UPPER so a case slip can't split one bill into
    // two shipments) → shipments; each 单号 must be one consistent PR.
    const byOrder = new Map<string, { pr: string; rows: FlatRow[] }>();
    for (const r of rows) {
      const k = r.orderNo.trim().toUpperCase();
      const pr = r.pr.trim().toUpperCase();
      if (!k) { setSubmitErr("มีแถวที่ยังไม่ได้กรอกเลข 单号"); return; }
      if (!/^PR\d+$/.test(pr)) { setSubmitErr(`เลข ${k}: กรอกรหัสลูกค้า (PR ตามด้วยตัวเลข) ให้ถูกต้อง`); return; }
      if (!(Number(r.boxCount) >= 1)) { setSubmitErr(`เลข ${k}: จำนวนกล่อง ต้องเป็นตัวเลข ≥ 1 (ห้ามเว้นว่าง)`); return; }
      if (!(Number(r.weightKg) > 0) && !(Number(r.cbm) > 0)) {
        setSubmitErr(`เลข ${k}: มีแถวที่ยังไม่มีน้ำหนักและคิว (ต้องมีอย่างน้อยหนึ่งอย่าง)`); return;
      }
      const g = byOrder.get(k);
      if (g) {
        if (g.pr !== pr) { setSubmitErr(`เลข ${k} มีหลาย PR (${g.pr} / ${pr}) — 单号 เดียวต้องลูกค้าเดียว`); return; }
        g.rows.push(r);
      } else {
        byOrder.set(k, { pr, rows: [r] });
      }
    }
    if (byOrder.size === 0) { setSubmitErr("ยังไม่มีรายการ — กรอกกล่องจากใบส่งของก่อน"); return; }

    const prLine = distinctPrs > 1 ? `${distinctPrs} ลูกค้า (PR)` : `ลูกค้า: ${rows.find((r) => r.pr.trim())?.pr.trim().toUpperCase() ?? "-"}`;
    const ok = await confirm(
      `ยืนยันเอาเข้าระบบ?\n\n` +
      `• ${prLine}\n` +
      `• ${byOrder.size} ออเดอร์ (单号) · ${rows.length} กลุ่มกล่อง · รวม ${totalBoxes} กล่อง · ${n2(totalWeight)} กก. · ${n3(totalCbm)} คิว\n` +
      `• สถานะเริ่มต้น: ถึงโกดังจีนแล้ว (อี้อู) — ระบบตั้งราคาให้อัตโนมัติ\n\n` +
      `แต่ละกลุ่มที่ขนาดต่างกันจะถูกแตกเป็นคนละแถว (单号-1/N, -2/N …)`,
    );
    if (!ok) return;

    const payload = Array.from(byOrder.entries()).map(([orderNo, group]) => ({
      orderNo,
      memberCode: group.pr,
      arrivalDate: arrivalDate || undefined,
      imageUrl: imageKey || undefined,
      rows: group.rows.map((r) => ({
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
        if (!res.ok) { setSubmitErr(res.error); return; }
        if (res.data) {
          setResult(res.data);
          // KEEP the rows of any FAILED 单号 so staff can fix + resubmit (no full re-key);
          // clear the grid only when every shipment went in. (Partial/total failures still
          // return ok:true with per-shipment errors inside data.results.)
          if (res.data.failed > 0) {
            const failed = new Set(res.data.results.filter((x) => !x.ok && !x.skipped).map((x) => x.orderNo));
            setRows((prev) => {
              const keep = prev.filter((r) => failed.has(r.orderNo.trim().toUpperCase()));
              return keep.length ? keep : [emptyRow(nextId())];
            });
          } else {
            setRows([emptyRow(nextId())]);
          }
        }
      } catch {
        setSubmitErr("เกิดข้อผิดพลาด — ลองใหม่");
      }
    });
  }

  const cellCls =
    "w-full rounded-md border border-gray-300 px-1.5 py-1 text-[13px] text-right tabular-nums focus:border-teal-500 focus:ring-1 focus:ring-teal-500";
  const textCellCls =
    "w-full rounded-md border border-gray-300 px-2 py-1 text-[13px] focus:border-teal-500 focus:ring-1 focus:ring-teal-500";

  return (
    <section className="rounded-2xl border border-gray-200 bg-surface p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-teal-600 text-[13px] font-bold text-white">1</span>
        <h2 className="text-base font-semibold">อ่านใบส่งของ → คีย์เข้าระบบ</h2>
        <span className="text-[11px] text-muted">(ดูรูปซ้าย · คีย์ตารางขวา ตามใบส่งของเป๊ะ)</span>
      </div>

      {/* layout: side-by-side (image sticky left · table right) OR image-wide (image
          full container width on top · table below) — a toggle so staff can blow the note
          up as big as the screen to read fine print. */}
      <div className={imageWide ? "space-y-5" : "grid items-start gap-5 lg:grid-cols-[minmax(420px,48%)_1fr]"}>
        {/* ── image + upload + date ────────────────────────────────────────── */}
        <div className={imageWide ? "space-y-3" : "lg:sticky lg:top-4 space-y-3"}>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-3.5 py-2 text-sm font-medium text-teal-800 hover:bg-teal-100">
              <span>📷 เลือกรูปใบส่งของ</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0] ?? null)} />
            </label>
            {imagePreview && (
              <button type="button" onClick={() => setImageWide((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg border border-teal-300 bg-white px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50"
                title={imageWide ? "กลับไปดูรูปควบคู่ตาราง" : "ขยายรูปเต็มความกว้างจอ (อ่านง่ายสุด)"}>
                {imageWide ? "◧ ดูควบคู่ตาราง" : "⛶ ขยายรูปเต็มกว้าง"}
              </button>
            )}
            {uploading && <span className="text-[11px] text-teal-700">⏳ กำลังอัปโหลด…</span>}
            {imageKey && !uploading && <span className="text-[11px] text-emerald-700">✓ อัปแล้ว</span>}
          </div>
          {uploadErr && <p className="text-[11px] text-red-600">⚠ {uploadErr}</p>}

          {/* BIG readable image (click → full-screen zoom) */}
          {imagePreview ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setZoomOpen(true)}
                className="block w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
                title="คลิกเพื่อดูเต็มจอ"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="ใบส่งของ อี้อู" className={`w-full object-contain ${imageWide ? "max-h-none" : "max-h-[80vh]"}`} />
              </button>
              <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">🔍 คลิกดูเต็มจอ</span>
            </div>
          ) : (
            <div className="grid h-56 place-items-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-center text-[12px] text-muted">
              เลือกรูปใบส่งของ แล้วรูปจะโชว์ตรงนี้ (ตัวใหญ่ · คลิกซูมได้)
            </div>
          )}

          {imageFile && (
            <OcrExtract
              file={imageFile}
              label="🔍 อ่านรหัสลูกค้าจากรูป (OCR · ช่วยเติม PR)"
              hint="ให้ระบบลองอ่าน PR จากรูป — กล่องคีย์เองในตาราง"
              onText={onOcrText}
            />
          )}
          {ocrNote && <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">💡 {ocrNote}</p>}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">วันที่ถึงโกดังจีน (ทั้งใบ)</label>
            <input type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500" />
          </div>
        </div>

        {/* ── RIGHT · the delivery-note table ──────────────────────────────── */}
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-muted">
              คีย์ตามใบส่งของทีละแถว — <strong>ขนาดต่างกันแยกคนละแถว</strong>. เลข 单号 เดียว = ลูกค้าเดียว (มีได้หลาย PR ในใบเดียว) · แถวที่ 单号 เดียวกันจะไฮไลต์เป็นกลุ่ม.
            </p>
            <div className="flex shrink-0 gap-1.5">
              <button type="button" onClick={fillOrderNoDown} className="rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-100" title="เอาเลข 单号 แถวแรก เติมทุกแถวที่ยังว่าง">
                ⬇ เติม 单号
              </button>
              <button type="button" onClick={fillPrDown} className="rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-100" title="เอา PR แถวแรก เติมทุกแถวที่ยังว่าง">
                ⬇ เติม PR
              </button>
            </div>
          </div>

          <div className="overflow-x-auto scrollbar-x-visible rounded-lg border border-gray-200">
            <table className="w-full min-w-[860px] border-collapse text-[13px] [&_td]:border [&_th]:border [&_td]:border-gray-200 [&_th]:border-gray-300">
              <thead>
                <tr className="bg-teal-600 text-left text-[11px] text-white">
                  <th className="px-2 py-1.5 font-medium">#</th>
                  <th className="px-2 py-1.5 font-medium">เลข 单号 (Bill No)</th>
                  <th className="px-2 py-1.5 font-medium">PR (ลูกค้า)</th>
                  <th className="px-2 py-1.5 font-medium">สินค้า</th>
                  <th className="px-2 py-1.5 font-medium">กล่อง</th>
                  <th className="px-2 py-1.5 font-medium">น้ำหนัก(กก.)</th>
                  <th className="px-2 py-1.5 font-medium">ยาว</th>
                  <th className="px-2 py-1.5 font-medium">กว้าง</th>
                  <th className="px-2 py-1.5 font-medium">สูง(ซม.)</th>
                  <th className="px-2 py-1.5 font-medium">คิว(CBM)</th>
                  <th className="px-2 py-1.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={rowTint(r)}>
                    <td className="px-2 py-1 text-center text-[11px] text-muted">{i + 1}</td>
                    <td className="px-1.5 py-1 w-36"><input value={r.orderNo} onChange={(e) => updateRow(r.id, "orderNo", e.target.value)} placeholder="X9002653" autoComplete="off" className="w-full rounded-md border border-gray-300 px-2 py-1 text-[13px] font-medium uppercase focus:border-teal-500 focus:ring-1 focus:ring-teal-500" /></td>
                    <td className="px-1.5 py-1 w-24"><input value={r.pr} onChange={(e) => updateRow(r.id, "pr", e.target.value)} placeholder="PR172" autoComplete="off" className="w-full rounded-md border border-gray-300 px-2 py-1 text-[13px] font-medium uppercase focus:border-teal-500 focus:ring-1 focus:ring-teal-500" /></td>
                    <td className="px-1.5 py-1 min-w-[120px]"><input value={r.productType} onChange={(e) => updateRow(r.id, "productType", e.target.value)} placeholder="ผ้าทำความสะอาด" className={textCellCls} /></td>
                    <td className="px-1.5 py-1 w-16"><input value={r.boxCount} onChange={(e) => updateRow(r.id, "boxCount", e.target.value)} inputMode="numeric" className={cellCls} /></td>
                    <td className="px-1.5 py-1 w-24"><input value={r.weightKg} onChange={(e) => updateRow(r.id, "weightKg", e.target.value)} inputMode="decimal" className={cellCls} /></td>
                    <td className="px-1.5 py-1 w-20"><input value={r.lengthCm} onChange={(e) => updateRow(r.id, "lengthCm", e.target.value)} inputMode="decimal" className={cellCls} /></td>
                    <td className="px-1.5 py-1 w-20"><input value={r.widthCm} onChange={(e) => updateRow(r.id, "widthCm", e.target.value)} inputMode="decimal" className={cellCls} /></td>
                    <td className="px-1.5 py-1 w-20"><input value={r.heightCm} onChange={(e) => updateRow(r.id, "heightCm", e.target.value)} inputMode="decimal" className={cellCls} /></td>
                    <td className="px-1.5 py-1 w-28">
                      <div className="flex items-center gap-1">
                        <input value={r.cbm} onChange={(e) => updateRow(r.id, "cbm", e.target.value)} inputMode="decimal" className={cellCls} />
                        <button type="button" onClick={() => computeCbm(r.id)} title="คำนวณคิวจาก ยาว×กว้าง×สูง×กล่อง" className="shrink-0 rounded border border-teal-200 bg-teal-50 px-1 text-[11px] text-teal-700 hover:bg-teal-100">=</button>
                      </div>
                    </td>
                    <td className="px-1.5 py-1 text-center"><button type="button" onClick={() => removeRow(r.id)} className="rounded p-1 text-red-500 hover:bg-red-50" title="ลบแถว">✕</button></td>
                  </tr>
                ))}
              </tbody>
              {/* totals row (like the note footer) */}
              <tfoot>
                <tr className="bg-teal-50 text-[12px] font-semibold text-teal-900">
                  <td className="px-2 py-1.5 text-center" colSpan={4}>รวม</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{totalBoxes}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{n2(totalWeight)}</td>
                  <td className="px-2 py-1.5" colSpan={3} />
                  <td className="px-2 py-1.5 text-right tabular-nums" colSpan={1}>{n3(totalCbm)}</td>
                  <td className="px-2 py-1.5" />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => addRow(true)} className="rounded-lg border border-dashed border-teal-300 px-3 py-1.5 text-[12px] font-medium text-teal-700 hover:bg-teal-50" title="เพิ่มแถวขนาดอื่นของ 单号 เดิม (คัดลอกเลข 单号 + PR ให้)">
              ＋ เพิ่มแถว (单号 เดิม)
            </button>
            <button type="button" onClick={() => addRow(false)} className="rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50" title="เพิ่ม 单号 ใหม่ (เว้นเลข 单号 · คง PR ไว้)">
              ＋ 单号 ใหม่
            </button>
          </div>
        </div>
      </div>

      {/* ── submit bar ─────────────────────────────────────────────────────── */}
      <div className="sticky bottom-3 z-10 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/95 p-4 shadow-md backdrop-blur">
        <div className="text-sm text-emerald-900">
          <strong>{distinctOrders}</strong> ออเดอร์ (单号){distinctPrs > 1 ? <> · <strong>{distinctPrs}</strong> ลูกค้า</> : null} · <strong>{rows.length}</strong> กลุ่มกล่อง · รวม <strong>{totalBoxes}</strong> กล่อง · {n2(totalWeight)} กก. · {n3(totalCbm)} คิว
          <span className="ml-2 text-[11px] text-emerald-700">→ ถึงโกดังจีน (อี้อู) · ระบบตั้งราคาให้เอง{filledRows < rows.length ? ` · ⚠ ${rows.length - filledRows} แถวยังไม่ครบ` : ""}</span>
        </div>
        <button type="button" onClick={onSubmit} disabled={pending} className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">
          {pending ? "⏳ กำลังเอาเข้าระบบ…" : "✅ เอาเข้าระบบ"}
        </button>
      </div>

      {submitErr && <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">⚠ {submitErr}</div>}

      {/* ── result ───────────────────────────────────────────────────────────── */}
      {result && (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
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
        </div>
      )}

      {/* ── full-screen image zoom ───────────────────────────────────────────── */}
      {zoomOpen && imagePreview && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/80 p-4"
          onClick={() => setZoomOpen(false)}
        >
          <button type="button" onClick={() => setZoomOpen(false)} className="fixed right-4 top-4 z-10 rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium text-gray-800 shadow hover:bg-white">✕ ปิด</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagePreview} alt="ใบส่งของ อี้อู (ซูม)" className="w-[min(1400px,95vw)] max-w-none rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {dialogs}
    </section>
  );
}

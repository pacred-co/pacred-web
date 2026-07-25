"use client";

/**
 * อี้อู ใบส่งของ → box-split arrival rows (แผนก CS · ภูม 2026-07-16 · rework 2026-07-25).
 *
 * REWORK (owner ภูม 2026-07-25 · mockup ผ่าน):
 *   • ตัด OCR ทิ้ง — พนักงาน CS คีย์เอง (ไม่ดึงข้อความจากรูป).
 *   • รูปเล็ก: hover → พรีวิวเด้ง · คลิก → ดูเต็มจอ (เลิกรูปใหญ่ sticky ที่มองยาก · CS เปิดรูปแยกดูเองอยู่แล้ว).
 *   • ตาราง excel + ลากสลับหัวคอลัมน์ ยาว/กว้าง/สูง ได้ — อี้อูส่งใบบางที กว้าง×ยาว×สูง บางที ยาว×กว้าง×สูง
 *     → CS ลากคอลัมน์ให้ตรงลำดับในใบ แล้วคีย์ซ้าย→ขวาได้เลย = กันคีย์ผิด (field binding ติดไปกับคอลัมน์).
 *   • อัพ packing list (step 2 เดิม) ย้ายไปหน้า TTW (แผนก DOC).
 *
 * commit `addYiwuDeliveryNoteShipments` + validation + result = เดิมทุกบรรทัด (money-path ไม่แตะ).
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import {
  addYiwuDeliveryNoteShipments,
  uploadYiwuDeliveryImage,
  type YiwuCreateSummary,
} from "@/actions/admin/yiwu-delivery-note";
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

// dim columns are RE-ORDERABLE — the field binding travels with the column so CS types
// left-to-right in whatever order อี้อู printed the note (กว้าง×ยาว×สูง OR ยาว×กว้าง×สูง).
type DimKey = "lengthCm" | "widthCm" | "heightCm";
const DIM_LABEL: Record<DimKey, string> = { lengthCm: "ยาว", widthCm: "กว้าง", heightCm: "สูง" };

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

  // ── image (single · small thumb + hover preview + click-to-full) ────────────
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageKey, setImageKey] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [hoverPrev, setHoverPrev] = useState(false);

  // ── date + Packing ID (whole note) ────────────────────────────────────────
  const [arrivalDate, setArrivalDate] = useState<string>(todayIsoDate);
  const [packingId, setPackingId] = useState("");

  // ── the table ─────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<FlatRow[]>([emptyRow(1)]);

  // ── draggable dim columns (ยาว/กว้าง/สูง) ────────────────────────────────────
  const [dimOrder, setDimOrder] = useState<DimKey[]>(["lengthCm", "widthCm", "heightCm"]);
  const [dragKey, setDragKey] = useState<DimKey | null>(null);
  const [overKey, setOverKey] = useState<DimKey | null>(null);

  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<YiwuCreateSummary | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  useEffect(() => {
    return () => { if (imagePreview) URL.revokeObjectURL(imagePreview); };
  }, [imagePreview]);

  // ── image select → preview + auto-upload → key (no OCR) ────────────────────
  async function onPickImage(file: File | null) {
    setUploadErr(null); setResult(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    if (!file) { setImagePreview(null); setImageKey(""); return; }
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

  // ── dim column drag → reorder dimOrder (move dragKey to target's slot) ──────
  function onDimDrop(target: DimKey) {
    setDimOrder((prev) => {
      if (!dragKey || dragKey === target) return prev;
      const next = prev.filter((k) => k !== dragKey);
      const idx = next.indexOf(target);
      next.splice(idx < 0 ? next.length : idx, 0, dragKey);
      return next;
    });
    setDragKey(null); setOverKey(null);
  }

  // ── totals (like the note footer) ─────────────────────────────────────────
  const distinctOrders = new Set(rows.map((r) => r.orderNo.trim().toUpperCase()).filter(Boolean)).size;
  const distinctPrs = new Set(rows.map((r) => r.pr.trim().toUpperCase()).filter(Boolean)).size;
  const totalBoxes = rows.reduce((n, r) => n + (Number(r.boxCount) || 0), 0);
  const totalWeight = rows.reduce((n, r) => n + (Number(r.weightKg) || 0), 0);
  const totalCbm = rows.reduce((n, r) => n + (Number(r.cbm) || 0), 0);
  const filledRows = rows.filter((r) => r.orderNo.trim() && r.pr.trim() && Number(r.boxCount) >= 1 && (Number(r.weightKg) > 0 || Number(r.cbm) > 0)).length;
  // distinct 单号 in appearance order → cluster rows of one bill with a shared tint.
  const orderIndex = new Map<string, number>();
  for (const r of rows) { const k = r.orderNo.trim().toUpperCase(); if (k && !orderIndex.has(k)) orderIndex.set(k, orderIndex.size); }
  const rowTint = (r: FlatRow): string => {
    const k = r.orderNo.trim().toUpperCase();
    if (!k) return "bg-white";
    return (orderIndex.get(k)! % 2 === 0) ? "bg-white" : "bg-teal-50/40";
  };

  // ── submit (verbatim — money-path unchanged) ───────────────────────────────
  async function onSubmit() {
    setSubmitErr(null); setResult(null);

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
      packingId: packingId.trim() || undefined,
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

  // excel-cell inputs (border comes from the table gridlines · input is borderless)
  const cellCls =
    "w-full border-0 bg-transparent px-1.5 py-2 text-[13px] text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-500 focus:bg-teal-50";
  const textCellCls =
    "w-full border-0 bg-transparent px-2 py-2 text-[13px] text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-500 focus:bg-teal-50";

  return (
    <section className="rounded-2xl border border-gray-200 bg-surface p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-teal-600 text-[13px] font-bold text-white">1</span>
        <h2 className="text-base font-semibold">อ่านใบส่งของ → คีย์เข้าระบบ</h2>
        <span className="text-[11px] text-muted">(รูปเล็กซ้าย · คีย์ตารางขวา ตามใบส่งของเป๊ะ)</span>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[196px_1fr]">
        {/* ── LEFT · small image (hover=preview · click=full) + date ─────────── */}
        <div className="space-y-3">
          <label className="mb-1 block text-xs font-medium text-muted">รูปใบส่งของ</label>
          <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800 hover:bg-teal-100">
            <span>📷 เลือกรูป</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0] ?? null)} />
          </label>

          {imagePreview ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setZoomOpen(true)}
                onMouseEnter={() => setHoverPrev(true)}
                onMouseLeave={() => setHoverPrev(false)}
                className="relative block h-[132px] w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
                title="เอาเมาส์จ่อ=พรีวิว · คลิก=ดูเต็มจอ"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="ใบส่งของ อี้อู" className="h-full w-full object-cover" />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[11px] text-white">🔍 คลิกดูรูปเต็ม</span>
              </button>

              {/* floating hover preview (โผล่เฉพาะตอนจ่อเมาส์ · ลอยเหนือตาราง) */}
              {hoverPrev && (
                <div className="pointer-events-none absolute left-full top-0 z-40 ml-3 w-80 rounded-xl border border-gray-200 bg-white p-1.5 shadow-2xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="พรีวิวใบส่งของ" className="w-full rounded-lg object-contain" />
                  <p className="py-1 text-center text-[11px] text-muted">พรีวิว · คลิกที่รูปเพื่อดูเต็มจอ</p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid h-[132px] place-items-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-2 text-center text-[11px] text-muted">
              ยังไม่มีรูป — เลือกรูปใบส่งของ
            </div>
          )}

          <div className="flex items-center gap-2 text-[11px]">
            {uploading && <span className="text-teal-700">⏳ กำลังอัปโหลด…</span>}
            {imageKey && !uploading && <span className="text-emerald-700">✓ อัปแล้ว</span>}
          </div>
          {uploadErr && <p className="text-[11px] text-red-600">⚠ {uploadErr}</p>}

          <p className="text-[11px] leading-relaxed text-muted">
            • จ่อเมาส์ = พรีวิว · คลิก = ดูเต็มจอ<br />
            • อัปแล้วย้อนดูได้ (เก็บกับรายการ)<br />
            • ไม่มีดึงข้อความจากรูป — CS คีย์เอง
          </p>

          <div className="space-y-2 pt-1">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">วันที่ถึงโกดังจีน (ทั้งใบ)</label>
              <input type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">เลขที่ตู้/Packing ID</label>
              <input value={packingId} onChange={(e) => setPackingId(e.target.value)} placeholder="เช่น SEA0625-8211YW" autoComplete="off"
                className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm uppercase focus:border-teal-500 focus:ring-1 focus:ring-teal-500" />
              <p className="mt-0.5 text-[11px] text-muted">อ้างอิงต้นทาง · เลขตู้จริงมาตอนอัป packing (หน้า TTW)</p>
            </div>
          </div>
        </div>

        {/* ── RIGHT · the excel key-in table ────────────────────────────────── */}
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-muted">
              คีย์ตามใบส่งของทีละแถว — <strong>ขนาดต่างกันแยกคนละแถว</strong> · 单号 เดียว = ลูกค้าเดียว (ไฮไลต์เป็นกลุ่ม) ·{" "}
              <strong className="text-amber-700">ลากสลับหัวคอลัมน์ ยาว/กว้าง/สูง ได้</strong> ตามที่อี้อูส่งมา
            </p>
            <div className="flex shrink-0 gap-1.5">
              <button type="button" onClick={fillOrderNoDown} className="rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-100" title="เอาเลข 单号 แถวแรก เติมทุกแถวที่ยังว่าง">⬇ เติม 单号</button>
              <button type="button" onClick={fillPrDown} className="rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-100" title="เอา PR แถวแรก เติมทุกแถวที่ยังว่าง">⬇ เติม PR</button>
            </div>
          </div>

          <div className="overflow-x-auto scrollbar-x-visible rounded-lg border border-gray-200">
            <table className="w-full min-w-[900px] border-collapse text-[13px] [&_td]:border [&_td]:border-gray-200 [&_th]:border [&_th]:border-gray-300">
              <thead>
                <tr className="bg-gray-100 text-center text-[11px] text-gray-600">
                  <th className="w-8 px-1 py-1.5 font-semibold">#</th>
                  <th className="w-32 px-2 py-1.5 font-semibold">เลข 单号</th>
                  <th className="w-36 px-2 py-1.5 font-semibold">PR (ลูกค้า)</th>
                  <th className="px-2 py-1.5 font-semibold">สินค้า</th>
                  <th className="w-14 px-2 py-1.5 font-semibold">กล่อง</th>
                  <th className="w-20 px-2 py-1.5 font-semibold">น้ำหนัก</th>
                  {dimOrder.map((k) => (
                    <th
                      key={k}
                      draggable
                      onDragStart={() => setDragKey(k)}
                      onDragOver={(e) => { e.preventDefault(); setOverKey(k); }}
                      onDragEnd={() => { setDragKey(null); setOverKey(null); }}
                      onDrop={(e) => { e.preventDefault(); onDimDrop(k); }}
                      title="ลากสลับตำแหน่งคอลัมน์ได้ (ยาว/กว้าง/สูง)"
                      className={`w-16 cursor-grab select-none bg-amber-100 px-1 py-1 font-semibold text-amber-800 active:cursor-grabbing ${dragKey === k ? "opacity-40" : ""} ${overKey === k && dragKey && dragKey !== k ? "ring-2 ring-inset ring-blue-500" : ""}`}
                    >
                      <span className="mr-0.5 text-amber-500">⠿</span>{DIM_LABEL[k]}
                      <span className="block text-[9px] font-medium text-amber-700/80">⇄ ลากได้</span>
                    </th>
                  ))}
                  <th className="w-20 px-2 py-1.5 font-semibold">คิว(CBM)</th>
                  <th className="w-8 px-1 py-1.5 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={rowTint(r)}>
                    <td className="px-1 py-0 text-center text-[11px] text-muted">{i + 1}</td>
                    <td className="px-0 py-0"><input value={r.orderNo} onChange={(e) => updateRow(r.id, "orderNo", e.target.value)} placeholder="X9002653" autoComplete="off" className={`${cellCls} font-medium uppercase`} /></td>
                    <td className="px-0 py-0"><input value={r.pr} onChange={(e) => updateRow(r.id, "pr", e.target.value)} placeholder="PR172" autoComplete="off" className={`${cellCls} font-medium uppercase`} /></td>
                    <td className="px-0 py-0"><input value={r.productType} onChange={(e) => updateRow(r.id, "productType", e.target.value)} placeholder="ชื่อสินค้า" className={textCellCls} /></td>
                    <td className="px-0 py-0"><input value={r.boxCount} onChange={(e) => updateRow(r.id, "boxCount", e.target.value)} inputMode="numeric" className={cellCls} /></td>
                    <td className="px-0 py-0"><input value={r.weightKg} onChange={(e) => updateRow(r.id, "weightKg", e.target.value)} inputMode="decimal" className={cellCls} /></td>
                    {dimOrder.map((k) => (
                      <td key={k} className="bg-amber-50/50 px-0 py-0">
                        <input value={r[k]} onChange={(e) => updateRow(r.id, k, e.target.value)} inputMode="decimal" className={cellCls} />
                      </td>
                    ))}
                    <td className="px-0 py-0">
                      <div className="flex items-center">
                        <input value={r.cbm} onChange={(e) => updateRow(r.id, "cbm", e.target.value)} inputMode="decimal" className={cellCls} />
                        <button type="button" onClick={() => computeCbm(r.id)} title="คำนวณคิวจาก ยาว×กว้าง×สูง×กล่อง" className="mr-1 shrink-0 rounded border border-teal-200 bg-teal-50 px-1 text-[11px] text-teal-700 hover:bg-teal-100">=</button>
                      </div>
                    </td>
                    <td className="px-0 py-0 text-center"><button type="button" onClick={() => removeRow(r.id)} className="rounded p-1 text-red-500 hover:bg-red-50" title="ลบแถว">✕</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 text-[12px] font-semibold text-gray-700">
                  <td className="px-2 py-1.5 text-right" colSpan={4}>รวม</td>
                  <td className="px-2 py-1.5 text-center tabular-nums">{totalBoxes}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums">{n2(totalWeight)}</td>
                  <td className="px-2 py-1.5" colSpan={3} />
                  <td className="px-2 py-1.5 text-center tabular-nums">{n3(totalCbm)}</td>
                  <td className="px-2 py-1.5" />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => addRow(true)} className="rounded-lg border border-dashed border-teal-300 px-3 py-1.5 text-[12px] font-medium text-teal-700 hover:bg-teal-50" title="เพิ่มแถวขนาดอื่นของ 单号 เดิม (คัดลอกเลข 单号 + PR ให้)">＋ เพิ่มแถว (单号 เดิม)</button>
            <button type="button" onClick={() => addRow(false)} className="rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50" title="เพิ่ม 单号 ใหม่ (เว้นเลข 单号 · คง PR ไว้)">＋ 单号 ใหม่</button>
            <span className="text-[11px] text-amber-700">💡 อี้อูสลับ กว้าง↔ยาว → ลากหัวคอลัมน์เหลืองให้ตรงใบ กันคีย์ผิด</span>
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

      {/* ── full-screen image zoom (click thumb) ─────────────────────────────── */}
      {zoomOpen && imagePreview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/80 p-4" onClick={() => setZoomOpen(false)}>
          <button type="button" onClick={() => setZoomOpen(false)} className="fixed right-4 top-4 z-10 rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium text-gray-800 shadow hover:bg-white">✕ ปิด</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagePreview} alt="ใบส่งของ อี้อู (ซูม)" className="w-[min(1400px,95vw)] max-w-none rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {dialogs}
    </section>
  );
}

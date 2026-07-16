"use client";

/**
 * อี้อู ใบส่งของ → box-split arrival rows (ภูม 2026-07-16 · Phase 3).
 *
 * Upload the ใบส่งของ IMAGE → OCR-assist pre-fill → EDITABLE review grid (the
 * source of truth; staff corrects every field against the image) → confirm →
 * addYiwuDeliveryNoteShipments (the money-safe server create). One note can carry
 * several 单号; each 单号 splits into N box-group rows priced by their own dims.
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

type RowDraft = {
  boxCount: string; weightKg: string; lengthCm: string; widthCm: string;
  heightCm: string; cbm: string; productType: string;
};
type ShipmentDraft = { id: number; orderNo: string; rows: RowDraft[] };

const emptyRow = (): RowDraft => ({
  boxCount: "1", weightKg: "", lengthCm: "", widthCm: "", heightCm: "", cbm: "", productType: "",
});

// Named helper keeps `new Date()` out of the render body (Next 16 react-hooks/purity).
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function YiwuDeliveryClient() {
  const { confirm, dialogs } = useConfirmDialogs();
  const idRef = useRef(2);
  const nextId = () => idRef.current++;

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageKey, setImageKey] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const [memberCode, setMemberCode] = useState("");
  const [arrivalDate, setArrivalDate] = useState<string>(todayIsoDate);
  const [ocrNote, setOcrNote] = useState<string | null>(null);

  const [shipments, setShipments] = useState<ShipmentDraft[]>([
    { id: 1, orderNo: "", rows: [emptyRow()] },
  ]);

  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<YiwuCreateSummary | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  // Revoke the object URL when the preview changes / unmounts.
  useEffect(() => {
    return () => { if (imagePreview) URL.revokeObjectURL(imagePreview); };
  }, [imagePreview]);

  // ── image select → preview + auto-upload → key ──────────────────────────
  async function onPickImage(file: File | null) {
    setUploadErr(null);
    setResult(null);
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

  // ── OCR text → pre-fill (best-effort; staff corrects) ───────────────────
  function onOcrText(text: string) {
    const p = parseYiwuDeliveryOcr(text);
    let filled = 0;
    if (p.memberCode && !memberCode) { setMemberCode(p.memberCode); filled++; }
    if (p.rows.length > 0) {
      setShipments((prev) => {
        const next = [...prev];
        const first = { ...next[0]! };
        if (p.orderNo && !first.orderNo) first.orderNo = p.orderNo;
        first.rows = p.rows.map((r) => ({
          boxCount: String(r.boxCount), weightKg: r.weightKg ? String(r.weightKg) : "",
          lengthCm: r.lengthCm ? String(r.lengthCm) : "", widthCm: r.widthCm ? String(r.widthCm) : "",
          heightCm: r.heightCm ? String(r.heightCm) : "", cbm: r.cbm ? String(r.cbm) : "",
          productType: r.productType,
        }));
        next[0] = first;
        return next;
      });
      filled += p.rows.length;
    }
    setOcrNote(
      filled > 0
        ? `เติมจากรูปให้แล้ว ${filled} จุด — กรุณาตรวจทุกช่องกับรูปก่อนเอาเข้าระบบ`
        : "อ่านรูปแล้วแต่จับข้อมูลไม่ได้ชัด — กรอกเองได้เลย",
    );
  }

  // ── grid mutations ──────────────────────────────────────────────────────
  function updateRow(sid: number, ri: number, field: keyof RowDraft, value: string) {
    setShipments((prev) =>
      prev.map((s) =>
        s.id !== sid ? s : { ...s, rows: s.rows.map((r, i) => (i === ri ? { ...r, [field]: value } : r)) },
      ),
    );
  }
  function computeCbm(sid: number, ri: number) {
    setShipments((prev) =>
      prev.map((s) => {
        if (s.id !== sid) return s;
        const rows = s.rows.map((r, i) => {
          if (i !== ri) return r;
          const l = Number(r.lengthCm), w = Number(r.widthCm), h = Number(r.heightCm), b = Number(r.boxCount) || 1;
          if (l > 0 && w > 0 && h > 0) {
            const cbm = Math.round((l * w * h * b) / 1_000_000 * 1e6) / 1e6;
            return { ...r, cbm: String(cbm) };
          }
          return r;
        });
        return { ...s, rows };
      }),
    );
  }
  function addRow(sid: number) {
    setShipments((prev) => prev.map((s) => (s.id === sid ? { ...s, rows: [...s.rows, emptyRow()] } : s)));
  }
  function removeRow(sid: number, ri: number) {
    setShipments((prev) =>
      prev.map((s) => (s.id === sid ? { ...s, rows: s.rows.filter((_, i) => i !== ri) } : s)).map((s) =>
        s.rows.length === 0 ? { ...s, rows: [emptyRow()] } : s,
      ),
    );
  }
  function updateOrderNo(sid: number, value: string) {
    setShipments((prev) => prev.map((s) => (s.id === sid ? { ...s, orderNo: value } : s)));
  }
  function addShipment() {
    setShipments((prev) => [...prev, { id: nextId(), orderNo: "", rows: [emptyRow()] }]);
  }
  function removeShipment(sid: number) {
    setShipments((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== sid)));
  }

  // ── totals for the summary bar ──────────────────────────────────────────
  const totalGroups = shipments.reduce((n, s) => n + s.rows.length, 0);
  const totalBoxes = shipments.reduce(
    (n, s) => n + s.rows.reduce((m, r) => m + (Number(r.boxCount) || 0), 0), 0,
  );

  // ── submit ──────────────────────────────────────────────────────────────
  async function onSubmit() {
    setSubmitErr(null);
    setResult(null);
    const pr = memberCode.trim().toUpperCase();
    if (!/^PR\d+$/.test(pr)) { setSubmitErr("กรุณากรอกรหัสลูกค้าให้ถูกต้อง (PR ตามด้วยตัวเลข)"); return; }
    for (const s of shipments) {
      if (!s.orderNo.trim()) { setSubmitErr("มีออเดอร์ที่ยังไม่ได้กรอกเลข 单号"); return; }
      const bad = s.rows.some((r) => !(Number(r.weightKg) > 0) && !(Number(r.cbm) > 0));
      if (bad) { setSubmitErr(`ออเดอร์ ${s.orderNo} มีแถวที่ยังไม่มีน้ำหนักและคิว (ต้องมีอย่างน้อยหนึ่งอย่าง)`); return; }
    }

    const ok = await confirm(
      `ยืนยันเอาเข้าระบบ?\n\n` +
      `• ลูกค้า: ${pr}\n` +
      `• ${shipments.length} ออเดอร์ (单号) · ${totalGroups} กลุ่มกล่อง · รวม ${totalBoxes} กล่อง\n` +
      `• สถานะเริ่มต้น: ถึงโกดังจีนแล้ว (อี้อู) — ระบบตั้งราคาให้อัตโนมัติ\n\n` +
      `แต่ละกลุ่มที่ขนาดต่างกันจะถูกแตกเป็นคนละแถว (单号-1/N, -2/N …)`,
    );
    if (!ok) return;

    const payload = shipments.map((s) => ({
      orderNo: s.orderNo.trim(),
      memberCode: pr,
      arrivalDate: arrivalDate || undefined,
      imageUrl: imageKey || undefined,
      rows: s.rows.map((r) => ({
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
        if (!res.ok) {
          setSubmitErr(res.error);
        } else if (res.data) {
          setResult(res.data);
          // Clear the created shipments so a double-click can't re-submit the same note.
          setShipments([{ id: nextId(), orderNo: "", rows: [emptyRow()] }]);
        }
      } catch {
        setSubmitErr("เกิดข้อผิดพลาด — ลองใหม่");
      }
    });
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500";
  const numCls =
    "w-full rounded-md border border-gray-300 px-1.5 py-1 text-[13px] text-right tabular-nums focus:border-teal-500 focus:ring-1 focus:ring-teal-500";

  return (
    <div className="space-y-5">
      {/* ── STEP 1 · upload image ──────────────────────────────────────── */}
      <section className="rounded-2xl border border-gray-200 bg-surface p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-teal-600 text-[13px] font-bold text-white">1</span>
          <h2 className="text-base font-semibold">อัปโหลดรูปใบส่งของ</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-800 hover:bg-teal-100">
              <span>📷 เลือกรูปใบส่งของ</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="mt-1.5 text-[11px] text-muted">รับเฉพาะรูป (JPG/PNG) ไม่เกิน 5 MB · รูปนี้จะติดไปกับออเดอร์ตั้งแต่ “ถึงโกดังจีน”</p>
            {uploading && <p className="mt-1 text-[11px] text-teal-700">⏳ กำลังอัปโหลด…</p>}
            {imageKey && !uploading && <p className="mt-1 text-[11px] text-emerald-700">✓ อัปโหลดรูปแล้ว</p>}
            {uploadErr && <p className="mt-1 text-[11px] text-red-600">⚠ {uploadErr}</p>}

            {imageFile && (
              <OcrExtract
                file={imageFile}
                label="🔍 อ่านรูป (OCR) — เติมข้อมูลให้ก่อน"
                hint="ให้ระบบลองอ่าน 单号 / รหัสลูกค้า / ตารางกล่อง — จะพลาดบ้าง แล้วค่อยแก้ในตารางด้านล่าง"
                onText={onOcrText}
              />
            )}
            {ocrNote && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">💡 {ocrNote}</p>
            )}
          </div>
          {imagePreview && (
            <a href={imagePreview} target="_blank" rel="noreferrer" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="ใบส่งของ"
                className="max-h-40 rounded-lg border border-gray-200 object-contain"
              />
            </a>
          )}
        </div>
      </section>

      {/* ── STEP 2 · customer + date ───────────────────────────────────── */}
      <section className="rounded-2xl border border-gray-200 bg-surface p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-teal-600 text-[13px] font-bold text-white">2</span>
          <h2 className="text-base font-semibold">ลูกค้า &amp; วันที่ถึงโกดัง</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">รหัสลูกค้า (PR)</label>
            <input
              value={memberCode}
              onChange={(e) => setMemberCode(e.target.value)}
              placeholder="เช่น PR022"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">วันที่ถึงโกดังจีน</label>
            <input type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} className={inputCls} />
          </div>
        </div>
      </section>

      {/* ── STEP 3 · shipments + box-split grid ────────────────────────── */}
      <section className="rounded-2xl border border-gray-200 bg-surface p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-teal-600 text-[13px] font-bold text-white">3</span>
          <h2 className="text-base font-semibold">ออเดอร์ &amp; กล่อง (แก้ได้ทุกช่อง)</h2>
        </div>

        <div className="space-y-4">
          {shipments.map((s, si) => (
            <div key={s.id} className="rounded-xl border border-gray-200 bg-gray-50/60 p-3.5">
              <div className="mb-2.5 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                  ออเดอร์ {si + 1}
                </span>
                <input
                  value={s.orderNo}
                  onChange={(e) => updateOrderNo(s.id, e.target.value)}
                  placeholder="เลข 单号 / Bill No (เช่น X9002653)"
                  className="min-w-[200px] flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm font-medium focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
                <span className="text-[11px] text-muted">{s.rows.length} กลุ่มกล่อง</span>
                {shipments.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeShipment(s.id)}
                    className="rounded-md border border-red-200 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"
                  >
                    ลบออเดอร์
                  </button>
                )}
              </div>

              <div className="overflow-x-auto scrollbar-x-visible">
                <table className="w-full min-w-[720px] border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-teal-600/90 text-left text-[11px] text-white">
                      <th className="rounded-l-md px-2 py-1.5 font-medium">#</th>
                      <th className="px-2 py-1.5 font-medium">กล่อง</th>
                      <th className="px-2 py-1.5 font-medium">น้ำหนัก (กก.)</th>
                      <th className="px-2 py-1.5 font-medium">กว้าง</th>
                      <th className="px-2 py-1.5 font-medium">ยาว</th>
                      <th className="px-2 py-1.5 font-medium">สูง (ซม.)</th>
                      <th className="px-2 py-1.5 font-medium">คิว (CBM)</th>
                      <th className="px-2 py-1.5 font-medium">ประเภทสินค้า</th>
                      <th className="rounded-r-md px-2 py-1.5 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.map((r, ri) => (
                      <tr key={ri} className="border-b border-gray-200 last:border-0 odd:bg-white even:bg-gray-50/70">
                        <td className="px-2 py-1 text-center text-[11px] text-muted">{ri + 1}</td>
                        <td className="px-1.5 py-1 w-16"><input value={r.boxCount} onChange={(e) => updateRow(s.id, ri, "boxCount", e.target.value)} className={numCls} inputMode="numeric" /></td>
                        <td className="px-1.5 py-1 w-24"><input value={r.weightKg} onChange={(e) => updateRow(s.id, ri, "weightKg", e.target.value)} className={numCls} inputMode="decimal" /></td>
                        <td className="px-1.5 py-1 w-20"><input value={r.widthCm} onChange={(e) => updateRow(s.id, ri, "widthCm", e.target.value)} className={numCls} inputMode="decimal" /></td>
                        <td className="px-1.5 py-1 w-20"><input value={r.lengthCm} onChange={(e) => updateRow(s.id, ri, "lengthCm", e.target.value)} className={numCls} inputMode="decimal" /></td>
                        <td className="px-1.5 py-1 w-20"><input value={r.heightCm} onChange={(e) => updateRow(s.id, ri, "heightCm", e.target.value)} className={numCls} inputMode="decimal" /></td>
                        <td className="px-1.5 py-1 w-28">
                          <div className="flex items-center gap-1">
                            <input value={r.cbm} onChange={(e) => updateRow(s.id, ri, "cbm", e.target.value)} className={numCls} inputMode="decimal" />
                            <button type="button" onClick={() => computeCbm(s.id, ri)} title="คำนวณคิวจาก กว้าง×ยาว×สูง×กล่อง" className="shrink-0 rounded border border-teal-200 bg-teal-50 px-1 text-[11px] text-teal-700 hover:bg-teal-100">=</button>
                          </div>
                        </td>
                        <td className="px-1.5 py-1"><input value={r.productType} onChange={(e) => updateRow(s.id, ri, "productType", e.target.value)} placeholder="—" className="w-full rounded-md border border-gray-300 px-2 py-1 text-[13px] focus:border-teal-500 focus:ring-1 focus:ring-teal-500" /></td>
                        <td className="px-1.5 py-1 text-center">
                          <button type="button" onClick={() => removeRow(s.id, ri)} className="rounded p-1 text-red-500 hover:bg-red-50" title="ลบแถว">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={() => addRow(s.id)}
                className="mt-2 rounded-lg border border-dashed border-teal-300 px-3 py-1.5 text-[12px] font-medium text-teal-700 hover:bg-teal-50"
              >
                ＋ เพิ่มกลุ่มกล่อง (ขนาดต่างกัน)
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addShipment}
          className="mt-3 rounded-lg border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-800 hover:bg-teal-100"
        >
          ＋ เพิ่มออเดอร์ (单号) อีก
        </button>
      </section>

      {/* ── submit bar ─────────────────────────────────────────────────── */}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/95 p-4 shadow-md backdrop-blur">
        <div className="text-sm text-emerald-900">
          <strong>{shipments.length}</strong> ออเดอร์ · <strong>{totalGroups}</strong> กลุ่มกล่อง · รวม{" "}
          <strong>{totalBoxes}</strong> กล่อง
          <span className="ml-2 text-[11px] text-emerald-700">→ ถึงโกดังจีน (อี้อู) · ระบบตั้งราคาให้เอง</span>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending}
          className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? "⏳ กำลังเอาเข้าระบบ…" : "✅ เอาเข้าระบบ"}
        </button>
      </div>

      {submitErr && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">⚠ {submitErr}</div>
      )}

      {/* ── result ─────────────────────────────────────────────────────── */}
      {result && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <h2 className="mb-2 text-base font-semibold text-emerald-900">ผลการเอาเข้าระบบ</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-lg bg-emerald-600 px-3 py-1 font-medium text-white">
              สำเร็จ {result.added} ออเดอร์ · {result.rowsCreated} แถว
            </span>
            {result.skipped > 0 && (
              <span className="rounded-lg bg-amber-500 px-3 py-1 font-medium text-white">ข้าม (มีอยู่แล้ว) {result.skipped}</span>
            )}
            {result.failed > 0 && (
              <span className="rounded-lg bg-red-600 px-3 py-1 font-medium text-white">ไม่สำเร็จ {result.failed}</span>
            )}
          </div>
          <ul className="mt-3 space-y-1 text-[13px]">
            {result.results.map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className={r.ok ? "text-emerald-700" : r.skipped ? "text-amber-700" : "text-red-700"}>
                  {r.ok ? "✓" : r.skipped ? "⊘" : "✕"}
                </span>
                <span className="font-medium">{r.orderNo}</span>
                {r.ok
                  ? <span className="text-muted">— สร้าง {r.fids?.length ?? 0} แถว</span>
                  : <span className="text-muted">— {r.error}</span>}
              </li>
            ))}
          </ul>
          <Link href="/admin/forwarders" className="mt-3 inline-block rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100">
            ไปหน้าฝากนำเข้า →
          </Link>
        </section>
      )}

      {dialogs}
    </div>
  );
}

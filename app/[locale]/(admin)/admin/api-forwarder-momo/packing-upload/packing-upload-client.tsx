"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  previewMomoPacking,
  applyMomoPacking,
  type MomoPackingPreview,
} from "@/actions/admin/momo-packing-reconcile";

const n3 = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 6 }));
const n2 = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));

const VERDICT: Record<string, { label: string; cls: string }> = {
  update:    { label: "จะอัปเดต",                 cls: "bg-amber-100 text-amber-800 border border-amber-300" },
  billed:    { label: "⚠ วางบิลแล้ว",             cls: "bg-orange-100 text-orange-800 border border-orange-300" },
  ok:        { label: "ตรงแล้ว",                   cls: "bg-emerald-100 text-emerald-800 border border-emerald-300" },
  "no-match":{ label: "🔴 ตกหล่น (ไม่พบในระบบ)",  cls: "bg-red-100 text-red-700 border border-red-300" },
};

// 35MB file → ~47MB base64 sits under the 50mb serverActions body limit.
const MAX_FILE_BYTES = 35 * 1024 * 1024;

/** Read a File → base64 (no data: prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      const res = reader.result as string;
      const comma = res.indexOf(",");
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.readAsDataURL(file);
  });
}

export function MomoPackingUploadClient() {
  const router = useRouter();
  const [preview, setPreview] = useState<MomoPackingPreview | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileB64, setFileB64] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  async function handleFile(file: File) {
    setMsg(null);
    setPreview(null);
    if (!/\.xlsx$/i.test(file.name)) {
      setMsg({ kind: "err", text: "รองรับเฉพาะไฟล์ .xlsx (packing list ของ MOMO)" });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setMsg({ kind: "err", text: `ไฟล์ใหญ่เกินไป (${(file.size / 1024 / 1024).toFixed(1)} MB) — จำกัด 35 MB` });
      return;
    }
    let b64: string;
    try {
      b64 = await fileToBase64(file);
    } catch {
      setMsg({ kind: "err", text: "อ่านไฟล์ไม่สำเร็จ" });
      return;
    }
    setFileName(file.name);
    setFileB64(b64);
    runPreview(b64);
  }

  function runPreview(b64: string) {
    setMsg(null);
    setPreview(null);
    start(async () => {
      const res = await previewMomoPacking({ fileBase64: b64 });
      if (!res.ok || !res.data) { setMsg({ kind: "err", text: res.ok ? "อ่านไม่สำเร็จ" : res.error }); return; }
      setPreview(res.data);
      if (res.data.rows.length === 0) {
        setMsg({ kind: "err", text: res.data.warnings[0] ?? "อ่านไม่พบรายการพัสดุในไฟล์" });
      }
    });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  const noMatchRows = useMemo(
    () => (preview ? preview.rows.filter((r) => r.verdict === "no-match") : []),
    [preview],
  );

  const hasWork = !!preview && (preview.summary.willUpdate > 0 || preview.summary.willAdvance > 0);

  function doApply() {
    if (!preview || !fileB64) return;
    if (!hasWork) { setMsg({ kind: "err", text: "ไม่มีรายการที่ต้องอัปเดต" }); return; }
    const u = preview.summary.willUpdate;
    const a = preview.summary.willAdvance;
    const parts = [
      u > 0 ? `อัปเดต ${u} แทรคกิ้ง (น้ำหนัก/คิว/ตู้) + คิดราคาขายใหม่` : null,
      a > 0 ? `เลื่อนสถานะ ${a} รายการ เป็น "กำลังส่งมาไทย" (3)` : null,
    ].filter(Boolean);
    if (!window.confirm(`ตู้ ${preview.container ?? "-"}\n${parts.join("\n")}\nยืนยันเพิ่มเข้าระบบ?\n(รายการที่วางบิลแล้วจะถูกข้าม)`)) return;
    setMsg(null);
    start(async () => {
      const res = await applyMomoPacking({ fileBase64: fileB64 });
      if (!res.ok || !res.data) { setMsg({ kind: "err", text: res.ok ? "บันทึกไม่สำเร็จ" : res.error }); return; }
      const d = res.data;
      setMsg({
        kind: "ok",
        text: `อัปเดตแล้ว ${d.updated} แทรคกิ้ง · คิดราคาใหม่ ${d.repriced}` +
          (d.advanced > 0 ? ` · เลื่อนสถานะ→มาไทย ${d.advanced}` : "") +
          (d.repriceFailed > 0 ? ` · ⚠ ไม่มีเรท ${d.repriceFailed} (ตั้งราคาเอง)` : "") +
          (d.skippedBilled > 0 ? ` · ข้าม(วางบิลแล้ว) ${d.skippedBilled}` : "") +
          (d.notFound > 0 ? ` · 🔴 ตกหล่น ${d.notFound}` : ""),
      });
      runPreview(fileB64); // re-preview → now shows "ตรงแล้ว"
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* ── UPLOAD ────────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
        <label className="block text-sm font-medium">อัปโหลด packing list ของ MOMO (.xlsx)</label>
        <p className="text-xs text-muted">
          โยนไฟล์ Excel ที่ MOMO ส่งมาตอนปิดตู้ (หนึ่งไฟล์ = หนึ่งตู้) เข้ามาได้เลย ระบบจะอ่านเป็นตาราง Excel
          ให้ตรวจ แล้วเทียบกับข้อมูลในระบบ (น้ำหนัก/คิว/กล่อง/เลขตู้).
        </p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            dragOver ? "border-primary-500 bg-primary-50/60" : "border-border bg-surface-alt/30 hover:border-primary-300"
          }`}
        >
          <span className="text-2xl">📦</span>
          <span className="text-sm font-medium">ลากไฟล์ .xlsx มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</span>
          <span className="text-[11px] text-muted">packing list ปิดตู้ของ MOMO · จำกัด 35 MB</span>
          {fileName && <span className="mt-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800">📎 {fileName}</span>}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
          />
        </div>
        {pending && <p className="text-xs text-muted">กำลังอ่านไฟล์…</p>}
        {msg && (
          <div className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {msg.text}
          </div>
        )}
        {preview && preview.warnings.length > 0 && preview.rows.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {preview.warnings.join(" · ")}
          </div>
        )}
      </section>

      {/* ── CONTAINER META ────────────────────────────────────────────────────── */}
      {preview && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-lg bg-sky-100 px-2.5 py-1 font-mono font-semibold text-sky-800">
              ตู้ {preview.container ?? "—"}
            </span>
            {preview.transportHint && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                {preview.transportHint === "SEA" ? "🚢 ทางเรือ" : "🚚 ทางรถ"} ({preview.transportHint})
              </span>
            )}
            <span className="text-xs text-muted">แทรคกิ้ง {preview.totals.trackingCount ?? preview.rows.length}</span>
            <span className="text-xs text-muted">กล่อง {preview.totals.qty ?? "—"}</span>
            <span className="text-xs text-muted">นน.รวม {n2(preview.totals.totalWeight)} กก.</span>
            <span className="text-xs text-muted">คิวรวม {n3(preview.totals.totalCbm)}</span>
            {preview.listTitle && <span className="ml-auto text-[11px] text-muted">{preview.listTitle}</span>}
          </div>
        </section>
      )}

      {/* ── EXCEL-LIKE RAW PREVIEW ─────────────────────────────────────────────── */}
      {preview?.rawGrid && preview.rawGrid.rows.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">ตาราง Excel จากไฟล์ (ตรวจก่อนเทียบ)</h2>
            <span className="text-[11px] text-muted">{preview.rawGrid.rows.length} แถว · {preview.rawGrid.header.length} คอลัมน์</span>
          </div>
          <div className="overflow-x-auto scrollbar-x-visible max-h-[28rem] overflow-y-auto rounded-lg border border-border">
            <table className="min-w-max text-[11px]">
              <thead className="sticky top-0 z-10 bg-surface-alt text-[11px] font-semibold text-foreground">
                <tr>
                  <th className="sticky left-0 z-20 bg-surface-alt px-2 py-1.5 text-right text-muted">#</th>
                  {preview.rawGrid.header.map((h, ci) => (
                    <th key={ci} className="whitespace-nowrap border-l border-border px-2 py-1.5 text-left">{h || `col ${ci + 1}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rawGrid.rows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 ? "bg-surface-alt/30" : ""}>
                    <td className="sticky left-0 z-10 bg-inherit px-2 py-1 text-right text-muted">{ri + 1}</td>
                    {preview.rawGrid!.header.map((_, ci) => (
                      <td key={ci} className="whitespace-nowrap border-l border-border px-2 py-1">
                        {row[ci] == null || row[ci] === "" ? "" : String(row[ci])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── 🔴 ตกหล่น ──────────────────────────────────────────────────────────── */}
      {preview && noMatchRows.length > 0 && (
        <section className="rounded-2xl border border-red-300 bg-red-50 p-5 shadow-sm space-y-2">
          <h2 className="text-sm font-semibold text-red-800">🔴 แทรคตกหล่น — มีในไฟล์แต่ไม่พบในระบบ ({noMatchRows.length})</h2>
          <p className="text-[11px] text-red-700">
            แทรคกิ้งเหล่านี้อยู่ใน packing list ของ MOMO แต่ระบบยังไม่รู้จัก (ยังไม่ได้สร้างรายการนำเข้า).
            ตรวจว่าตกหล่นจริงไหม แล้วสร้างรายการให้ลูกค้าก่อน — <strong>เวอร์ชันนี้ยังไม่สร้างให้อัตโนมัติ</strong>
            (การสร้างรายการใหม่ = เรื่องเงิน ต้องเลือกลูกค้า/เรทเอง).
          </p>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-xs">
              <thead className="text-[11px] uppercase tracking-wide text-red-700">
                <tr>
                  <th className="px-2 py-1 text-left">แทรคกิ้ง</th>
                  <th className="px-2 py-1 text-left">ลูกค้า (MOMO)</th>
                  <th className="px-2 py-1 text-right">นน.รวม</th>
                  <th className="px-2 py-1 text-right">คิวรวม</th>
                  <th className="px-2 py-1 text-right">กล่อง</th>
                </tr>
              </thead>
              <tbody>
                {noMatchRows.map((r, i) => (
                  <tr key={`${r.tracking}-${i}`} className="border-t border-red-200">
                    <td className="px-2 py-1 font-mono">{r.tracking}</td>
                    <td className="px-2 py-1">{r.code ?? "—"}</td>
                    <td className="px-2 py-1 text-right">{n2(r.totalWeight)}</td>
                    <td className="px-2 py-1 text-right">{n3(r.totalCbm)}</td>
                    <td className="px-2 py-1 text-right">{r.parcelCount ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── RECONCILE TABLE ────────────────────────────────────────────────────── */}
      {preview && preview.rows.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-gray-100 text-gray-700 px-2 py-0.5">ทั้งหมด {preview.summary.total}</span>
            <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">จะอัปเดต {preview.summary.willUpdate}</span>
            {preview.summary.willAdvance > 0 && <span className="rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5 font-medium">→ เลื่อนสถานะมาไทย {preview.summary.willAdvance}</span>}
            <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">ตรงแล้ว {preview.summary.alreadyOk}</span>
            {preview.summary.statusStale > 0 && <span className="rounded-full bg-rose-100 text-rose-800 px-2 py-0.5 font-medium">📦 มีตู้แต่สถานะค้าง {preview.summary.statusStale}</span>}
            {preview.summary.billedDiffer > 0 && <span className="rounded-full bg-orange-100 text-orange-800 px-2 py-0.5">⚠ วางบิลแล้วแต่ต่าง {preview.summary.billedDiffer}</span>}
            {preview.summary.noMatch > 0 && <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 font-medium">🔴 ตกหล่น {preview.summary.noMatch}</span>}
          </div>

          {hasWork && (
            <button
              type="button"
              onClick={doApply}
              disabled={pending}
              className="rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              ยืนยันเพิ่มเข้าระบบ ({preview.summary.willUpdate} แทรคกิ้ง
              {preview.summary.willAdvance > 0 ? ` · เลื่อนสถานะ ${preview.summary.willAdvance}` : ""})
            </button>
          )}

          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt/50 text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-2 text-left">แทรคกิ้ง</th>
                  <th className="px-2 py-2 text-left">ลูกค้า (ระบบ)</th>
                  <th className="px-2 py-2 text-right">นน. ระบบ→MOMO</th>
                  <th className="px-2 py-2 text-right">คิว ระบบ→MOMO</th>
                  <th className="px-2 py-2 text-right">กล่อง</th>
                  <th className="px-2 py-2 text-left">ประเภท / HS</th>
                  <th className="px-2 py-2 text-center">สถานะ</th>
                  <th className="px-2 py-2 text-center">ผล</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => {
                  const v = VERDICT[r.verdict] ?? VERDICT.ok;
                  return (
                    <tr key={`${r.tracking}-${i}`} className={`border-t border-border align-top ${r.statusStale ? "bg-rose-50/60" : ""}`}>
                      <td className="px-2 py-1.5 font-mono">{r.tracking}</td>
                      <td className="px-2 py-1.5 text-[11px]">
                        {r.matched ? `${r.userid ?? "-"} / ${r.curCab ?? "-"}` : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`px-2 py-1.5 text-right ${r.wtDiff ? "text-amber-700 font-semibold" : "text-muted"}`}>
                        {n2(r.curWt)}→{n2(r.totalWeight)}
                      </td>
                      <td className={`px-2 py-1.5 text-right ${r.volDiff ? "text-amber-700 font-semibold" : "text-muted"}`}>
                        {n3(r.curVol)}→{n3(r.totalCbm)}
                      </td>
                      <td className={`px-2 py-1.5 text-right ${r.amtDiff ? "text-amber-700 font-semibold" : "text-muted"}`}>
                        {r.curAmt ?? "—"}→{r.parcelCount ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 text-left text-[11px] leading-snug">
                        <div>{r.productType ?? "—"}</div>
                        {r.cg && <div className="text-sky-700">HS {r.cg}</div>}
                      </td>
                      <td className="px-2 py-1.5 text-center text-[11px]">
                        {r.fstatus ? <span className="text-muted">[{r.fstatus}]</span> : "—"}
                        {r.willAdvanceTo && (
                          <div className="mt-0.5 inline-block rounded bg-indigo-100 px-1 py-0.5 text-[11px] font-semibold text-indigo-700" title="ปิดตู้แล้ว → จะเลื่อนสถานะเป็น กำลังส่งมาไทย (3)">
                            → 3 มาไทย
                          </div>
                        )}
                        {r.statusStale && !r.willAdvanceTo && (
                          <div className="mt-0.5 inline-block rounded bg-rose-100 px-1 py-0.5 text-[11px] font-semibold text-rose-700">
                            📦 สถานะค้าง
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className={`inline-block rounded-full px-1.5 py-0.5 text-[11px] font-medium ${v.cls}`}>{v.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted">
            [เลขในวงเล็บ] = สถานะ fstatus ปัจจุบัน · → 3 มาไทย = ปิดตู้แล้ว จะเลื่อนสถานะเป็น &quot;กำลังส่งมาไทย&quot; (เฉพาะที่ยังค้าง 1/2) ·
            🔴 ตกหล่น = MOMO มีแต่ระบบไม่พบ → ดูรายการด้านบน · ⚠ วางบิลแล้ว = ข้าม (ตรวจ/แก้บิลเอง) ·
            เมื่อบันทึกจะคิดราคาขายใหม่จากค่าน้ำหนัก/คิวที่อัปเดต · famountcount ถูกตั้งเป็น 1 (คิวรวมอยู่แล้ว)
          </p>
        </section>
      )}
    </div>
  );
}

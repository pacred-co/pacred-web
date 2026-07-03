"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { useRouter } from "@/i18n/navigation";
import {
  previewTaemReconcile,
  applyTaemReconcile,
  type TaemReconcilePreview,
} from "@/actions/admin/taem-reconcile";

const n3 = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 6 }));
const n2 = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));

const VERDICT: Record<string, { label: string; cls: string }> = {
  update:    { label: "จะอัปเดต",        cls: "bg-amber-100 text-amber-800 border border-amber-300" },
  billed:    { label: "⚠ วางบิลแล้ว",    cls: "bg-orange-100 text-orange-800 border border-orange-300" },
  ok:        { label: "ตรงแล้ว",          cls: "bg-emerald-100 text-emerald-800 border border-emerald-300" },
  "no-match":{ label: "🔴 ตกหล่น (ไม่พบในระบบ)", cls: "bg-red-100 text-red-700 border border-red-300" },
  note:      { label: "ยังไม่มีข้อมูล",   cls: "bg-gray-100 text-gray-600 border border-gray-300" },
};

// 40MB — a real แต้ม packing list (e.g. GZS260524-1 = 10.86MB) tops 10MB from Excel
// metadata/styles. Safe: the xlsx is parsed CLIENT-side to TSV; only the small TSV text
// reaches the server action (never the raw file), so there's no server body-size limit.
const MAX_FILE_BYTES = 40 * 1024 * 1024; // 40MB guard
const SHEET_NAME = "Shipment Report";

/** One inline edit the admin typed in a preview row (keyed by tracking). Only the
 *  fields they changed are non-empty; blank string = no override (keep แต้ม value). */
type RowEdit = { wt: string; vol: string; parcel: string; container: string };
const EMPTY_EDIT: RowEdit = { wt: "", vol: "", parcel: "", container: "" };

/** A parsed raw-sheet snapshot for the Excel-like preview (header + all A→Z rows). */
type RawSheet = { header: string[]; rows: (string | number | null)[][] };

export function TaemReconcileClient() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<TaemReconcilePreview | null>(null);
  const [rawSheet, setRawSheet] = useState<RawSheet | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Inline edits keyed by tracking. Cleared whenever a new preview is loaded.
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  // ── xlsx UPLOAD → pick "Shipment Report" → TSV → reuse the proven paste path ──────
  function handleFile(file: File) {
    setMsg(null);
    if (!/\.xlsx$/i.test(file.name)) {
      setMsg({ kind: "err", text: "รองรับเฉพาะไฟล์ .xlsx (packing list ของแต้ม)" });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setMsg({ kind: "err", text: `ไฟล์ใหญ่เกินไป (${(file.size / 1024 / 1024).toFixed(1)} MB) — จำกัด 40 MB` });
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setMsg({ kind: "err", text: "อ่านไฟล์ไม่สำเร็จ" });
    reader.onload = () => {
      try {
        const buf = new Uint8Array(reader.result as ArrayBuffer);
        const wb = XLSX.read(buf, { type: "array" });
        // Prefer the "Shipment Report" sheet; fall back to the first sheet.
        const wsName = wb.SheetNames.includes(SHEET_NAME) ? SHEET_NAME : wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        if (!ws) { setMsg({ kind: "err", text: "ไม่พบชีตในไฟล์" }); return; }
        // Raw grid for the Excel-like preview (header + data rows).
        const grid = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null });
        const header = (grid[0] ?? []).map((c: string | number | null) => (c == null ? "" : String(c)));
        setRawSheet({ header, rows: grid.slice(1) });
        // TSV feeds the PROVEN parser unchanged (header row starts with "Container Name").
        const tsv = XLSX.utils.sheet_to_csv(ws, { FS: "\t" });
        setFileName(file.name);
        setText(tsv);
        // Auto-run preview from the freshly-loaded sheet (don't wait for the paste path).
        runPreview(tsv);
      } catch (err) {
        console.error("[taem xlsx] parse failed", err);
        setMsg({ kind: "err", text: "อ่านไฟล์ Excel ไม่สำเร็จ — ตรวจว่าเป็น .xlsx ของแต้ม" });
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function runPreview(theText: string) {
    setMsg(null);
    setPreview(null);
    setEdits({});
    start(async () => {
      const res = await previewTaemReconcile({ text: theText });
      if (!res.ok || !res.data) { setMsg({ kind: "err", text: res.ok ? "อ่านไม่สำเร็จ" : res.error }); return; }
      setPreview(res.data);
      if (res.data.rows.length === 0) setMsg({ kind: "err", text: "อ่านไม่พบรายการ — คัดลอกแถวจากชีต แต้ม (รวมหัวตารางได้) หรืออัปโหลด .xlsx" });
    });
  }

  function doPreview() {
    // Manual paste path doesn't have a raw sheet to show unless a file was loaded.
    runPreview(text);
  }

  function setEdit(tracking: string, field: keyof RowEdit, value: string) {
    setEdits((prev) => ({ ...prev, [tracking]: { ...(prev[tracking] ?? EMPTY_EDIT), [field]: value } }));
  }

  // Build the typed edits payload the server merges over the re-parsed values.
  // Only send a field the admin actually typed (finite number / non-empty container).
  const editsPayload = useMemo(() => {
    const out: { tracking: string; wt?: number | null; vol?: number | null; parcel?: number | null; container?: string | null }[] = [];
    for (const [tracking, e] of Object.entries(edits)) {
      const wtN = e.wt.trim() === "" ? undefined : Number(e.wt);
      const volN = e.vol.trim() === "" ? undefined : Number(e.vol);
      const parcelN = e.parcel.trim() === "" ? undefined : Number(e.parcel);
      const container = e.container.trim() === "" ? undefined : e.container.trim();
      const hasWt = wtN != null && Number.isFinite(wtN);
      const hasVol = volN != null && Number.isFinite(volN);
      const hasParcel = parcelN != null && Number.isFinite(parcelN);
      if (!hasWt && !hasVol && !hasParcel && container === undefined) continue;
      out.push({
        tracking,
        ...(hasWt ? { wt: wtN } : {}),
        ...(hasVol ? { vol: volN } : {}),
        ...(hasParcel ? { parcel: Math.trunc(parcelN as number) } : {}),
        ...(container !== undefined ? { container } : {}),
      });
    }
    return out;
  }, [edits]);

  const hasEdits = editsPayload.length > 0;

  // Anything the apply will actually write: measurement updates OR classification
  // (HS/box-mark/raw-type) reference fills + ETD/ETA, OR a pending inline edit.
  const hasWork =
    !!preview &&
    (preview.summary.willUpdate > 0 ||
      preview.summary.classWillWrite > 0 ||
      hasEdits ||
      preview.rows.some((r) => r.taemEtd || r.taemEta));

  const noMatchRows = useMemo(
    () => (preview ? preview.rows.filter((r) => r.verdict === "no-match") : []),
    [preview],
  );

  function doApply() {
    if (!preview) return;
    if (!hasWork) { setMsg({ kind: "err", text: "ไม่มีรายการที่ต้องอัปเดต" }); return; }
    const n = preview.summary.willUpdate;
    const cls = preview.summary.classWillWrite;
    const parts = [
      n > 0 ? `อัปเดต ${n} แทรคกิ้ง (น้ำหนัก/คิว/ตู้) + คิดราคาขายใหม่` : null,
      hasEdits ? `รวมการแก้ไขเอง ${editsPayload.length} แถว` : null,
      cls > 0 ? `บันทึก HS(CG.)/มาร์คกล่อง ${cls} รายการ` : null,
    ].filter(Boolean);
    if (!window.confirm(`${parts.join("\n")}\nให้ตรงกับฝั่งแต้ม?\n(รายการที่วางบิลแล้วจะถูกข้าม)`)) return;
    setMsg(null);
    start(async () => {
      const res = await applyTaemReconcile({ text, edits: editsPayload });
      if (!res.ok || !res.data) { setMsg({ kind: "err", text: res.ok ? "บันทึกไม่สำเร็จ" : res.error }); return; }
      const d = res.data;
      setMsg({
        kind: "ok",
        text: `อัปเดตแล้ว ${d.basisUpdated} แทรคกิ้ง · คิดราคาใหม่ ${d.repriced}` +
          (d.classUpdated > 0 ? ` · บันทึก HS/มาร์ค ${d.classUpdated}` : "") +
          (d.etdEtaUpserted > 0 ? ` · บันทึก ETD/ETA ${d.etdEtaUpserted} ตู้` : "") +
          (d.repriceFailed > 0 ? ` · ⚠ ไม่มีเรท ${d.repriceFailed} (ตั้งราคาเอง)` : "") +
          (d.classConflicts > 0 ? ` · ⚠ HS/มาร์คต่าง ${d.classConflicts} (ตรวจเอง)` : "") +
          (d.skippedBilled > 0 ? ` · ข้าม(วางบิลแล้ว) ${d.skippedBilled}` : ""),
      });
      // Re-preview from raw text (edits are now applied → cleared).
      runPreview(text);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* ── UPLOAD + PASTE ─────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
        <label className="block text-sm font-medium">อัปโหลด packing list ของแต้ม (.xlsx) หรือวางข้อมูล</label>
        <p className="text-xs text-muted">
          โยนไฟล์ Excel ที่แต้มส่งมา (ชีต &quot;Shipment Report&quot;) เข้ามาได้เลย ระบบจะอ่านเป็นตาราง Excel
          ให้ตรวจ แล้วเทียบกับข้อมูลในระบบทุกอย่าง (ขนาด/น้ำหนัก/คิว/ตู้). หรือคัดลอกแถวจากชีตแล้ววางในช่องด้านล่างก็ได้.
        </p>

        {/* drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            dragOver ? "border-primary-500 bg-primary-50/60" : "border-border bg-surface-alt/30 hover:border-primary-300"
          }`}
        >
          <span className="text-2xl">📄</span>
          <span className="text-sm font-medium">ลากไฟล์ .xlsx มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</span>
          <span className="text-[11px] text-muted">packing list ของแต้ม · จำกัด 40 MB · ชีต &quot;Shipment Report&quot;</span>
          {fileName && <span className="mt-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800">📎 {fileName}</span>}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="…หรือวางแถวจากชีตแต้มที่นี่ (รวมหัวตารางได้)"
          className="w-full rounded-lg border border-border bg-surface-alt/40 p-3 font-mono text-xs"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={doPreview}
            disabled={pending || text.trim().length < 5}
            className="rounded-full bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {pending ? "กำลังอ่าน…" : "ดูตัวอย่าง (Preview)"}
          </button>
          {hasWork && (
            <button
              type="button"
              onClick={doApply}
              disabled={pending}
              className="rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              ยืนยันเพิ่มเข้าระบบ ({preview!.summary.willUpdate} แทรคกิ้ง
              {hasEdits ? ` · แก้เอง ${editsPayload.length}` : ""}
              {preview!.summary.classWillWrite > 0 ? ` · HS/มาร์ค ${preview!.summary.classWillWrite}` : ""})
            </button>
          )}
        </div>
        {msg && (
          <div className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {msg.text}
          </div>
        )}
      </section>

      {/* ── EXCEL-LIKE RAW PREVIEW (all A→Z columns exactly like the file) ────── */}
      {rawSheet && rawSheet.rows.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">ตาราง Excel จากไฟล์ (ตรวจก่อนเทียบ)</h2>
            <span className="text-[11px] text-muted">{rawSheet.rows.length} แถว · {rawSheet.header.length} คอลัมน์</span>
          </div>
          <div className="overflow-x-auto scrollbar-x-visible max-h-[28rem] overflow-y-auto rounded-lg border border-border">
            <table className="min-w-max text-[11px]">
              <thead className="sticky top-0 z-10 bg-surface-alt text-[11px] font-semibold text-foreground">
                <tr>
                  <th className="sticky left-0 z-20 bg-surface-alt px-2 py-1.5 text-right text-muted">#</th>
                  {rawSheet.header.map((h, ci) => (
                    <th key={ci} className="whitespace-nowrap border-l border-border px-2 py-1.5 text-left">{h || `col ${ci + 1}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rawSheet.rows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 ? "bg-surface-alt/30" : ""}>
                    <td className="sticky left-0 z-10 bg-inherit px-2 py-1 text-right text-muted">{ri + 1}</td>
                    {rawSheet.header.map((_, ci) => (
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

      {/* ── 🔴 ตกหล่น: tracking in the list but NOT in the system ─────────────── */}
      {preview && noMatchRows.length > 0 && (
        <section className="rounded-2xl border border-red-300 bg-red-50 p-5 shadow-sm space-y-2">
          <h2 className="text-sm font-semibold text-red-800">🔴 แทรคตกหล่น — มีในไฟล์แต่ไม่พบในระบบ ({noMatchRows.length})</h2>
          <p className="text-[11px] text-red-700">
            แทรคกิ้งเหล่านี้อยู่ใน packing list ของแต้มแต่ระบบยังไม่รู้จัก (ยังไม่ได้สร้างรายการนำเข้า).
            ตรวจว่าตกหล่นจริงไหม แล้วสร้างรายการให้ลูกค้าก่อน — <strong>เวอร์ชันนี้ยังไม่สร้างให้อัตโนมัติ</strong>
            (การสร้างรายการใหม่ = เรื่องเงิน ต้องเลือกลูกค้า/เรทเอง → แยกทำในหน้าสร้างรายการนำเข้า).
          </p>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-xs">
              <thead className="text-[11px] uppercase tracking-wide text-red-700">
                <tr>
                  <th className="px-2 py-1 text-left">แทรคกิ้ง</th>
                  <th className="px-2 py-1 text-left">ตู้ (แต้ม)</th>
                  <th className="px-2 py-1 text-left">ลูกค้า (แต้ม)</th>
                  <th className="px-2 py-1 text-right">น้ำหนัก</th>
                  <th className="px-2 py-1 text-right">คิว</th>
                  <th className="px-2 py-1 text-right">กล่อง</th>
                </tr>
              </thead>
              <tbody>
                {noMatchRows.map((r, i) => (
                  <tr key={`${r.tracking}-${i}`} className="border-t border-red-200">
                    <td className="px-2 py-1 font-mono">{r.tracking}</td>
                    <td className="px-2 py-1">{r.taemContainer ?? "—"}</td>
                    <td className="px-2 py-1">{r.taemCode ?? "—"}</td>
                    <td className="px-2 py-1 text-right">{n2(r.taemWt)}</td>
                    <td className="px-2 py-1 text-right">{n3(r.taemVol)}</td>
                    <td className="px-2 py-1 text-right">{r.taemParcel ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── RECONCILE TABLE (diff + inline edit + flags) ──────────────────────── */}
      {preview && preview.rows.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-gray-100 text-gray-700 px-2 py-0.5">ทั้งหมด {preview.summary.total}</span>
            <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">จะอัปเดต {preview.summary.willUpdate}</span>
            <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">ตรงแล้ว {preview.summary.alreadyOk}</span>
            {preview.summary.statusStale > 0 && <span className="rounded-full bg-rose-100 text-rose-800 px-2 py-0.5 font-medium">📦 มีตู้แต่สถานะค้าง {preview.summary.statusStale}</span>}
            {preview.summary.billedDiffer > 0 && <span className="rounded-full bg-orange-100 text-orange-800 px-2 py-0.5">⚠ วางบิลแล้วแต่ต่าง {preview.summary.billedDiffer}</span>}
            {preview.summary.noMatch > 0 && <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 font-medium">🔴 ตกหล่น {preview.summary.noMatch}</span>}
            {preview.summary.noteRows > 0 && <span className="rounded-full bg-gray-100 text-gray-600 px-2 py-0.5">ยังไม่มีข้อมูล {preview.summary.noteRows}</span>}
            {preview.summary.classWillWrite > 0 && <span className="rounded-full bg-sky-100 text-sky-800 px-2 py-0.5">บันทึก HS/มาร์ค {preview.summary.classWillWrite}</span>}
            {preview.summary.classConflict > 0 && <span className="rounded-full bg-rose-100 text-rose-700 px-2 py-0.5">⚠ HS/มาร์คต่าง {preview.summary.classConflict}</span>}
            {preview.summary.productTypeMismatch > 0 && <span className="rounded-full bg-fuchsia-100 text-fuchsia-700 px-2 py-0.5">⚠ ประเภทสินค้าต่าง {preview.summary.productTypeMismatch}</span>}
            {preview.summary.crateMismatch > 0 && <span className="rounded-full bg-rose-100 text-rose-700 px-2 py-0.5">⚠ ตีลังไม้ไม่ตรง MOMO {preview.summary.crateMismatch}</span>}
          </div>
          <p className="text-[11px] text-muted">แก้ค่าในช่องได้เลย (เว้นว่าง = ใช้ค่าตามแต้ม) แล้วกด &quot;ยืนยันเพิ่มเข้าระบบ&quot; · ค่าที่แก้จะถูกคิดราคาขายใหม่ · รายการที่วางบิลแล้วจะถูกข้ามเสมอ</p>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt/50 text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-2 text-left">แทรคกิ้ง</th>
                  <th className="px-2 py-2 text-left">ลูกค้า/ตู้ (ระบบ)</th>
                  <th className="px-2 py-2 text-left">ตู้ (แต้ม · แก้ได้)</th>
                  <th className="px-2 py-2 text-right">นน. ระบบ→แต้ม (แก้ได้)</th>
                  <th className="px-2 py-2 text-right">คิว ระบบ→แต้ม (แก้ได้)</th>
                  <th className="px-2 py-2 text-right">กล่อง (แก้ได้)</th>
                  <th className="px-2 py-2 text-left">HS / มาร์ค / ประเภท (แต้ม)</th>
                  <th className="px-2 py-2 text-left">ตีลังไม้ MOMO ↔ ค่าบริการแต้ม</th>
                  <th className="px-2 py-2 text-right">ETD/ETA (แต้ม)</th>
                  <th className="px-2 py-2 text-center">ผล</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => {
                  const v = VERDICT[r.verdict] ?? VERDICT.note;
                  const e = edits[r.tracking] ?? EMPTY_EDIT;
                  // Inline edit only for matched, non-billed data rows (the writable ones).
                  const editable = r.isData && r.matched && !r.isBilled;
                  return (
                    <tr key={`${r.tracking}-${i}`} className={`border-t border-border align-top ${r.statusStale ? "bg-rose-50/60" : ""}`}>
                      <td className="px-2 py-1.5 font-mono">{r.tracking}</td>
                      <td className="px-2 py-1.5 text-[11px]">
                        {r.matched ? `${r.userid ?? "-"} / ${r.curCab ?? "-"}` : <span className="text-gray-400">—</span>}
                        {r.fstatus && <span className="ml-1 text-[11px] text-muted">[{r.fstatus}]</span>}
                        {r.statusStale && (
                          <div className="mt-0.5 inline-block rounded bg-rose-100 px-1 py-0.5 text-[11px] font-semibold text-rose-700" title="มีเลขตู้แล้ว (ของกำลังมาไทย) แต่สถานะในระบบยังค้างที่ 1/2 (อยู่จีน) — เลื่อนสถานะเอง">
                            📦 มีตู้แล้วแต่สถานะค้าง
                          </div>
                        )}
                      </td>
                      <td className={`px-2 py-1.5 text-[11px] ${r.cabDiff ? "text-amber-700 font-semibold" : ""}`}>
                        {editable ? (
                          <input
                            value={e.container}
                            onChange={(ev) => setEdit(r.tracking, "container", ev.target.value)}
                            placeholder={r.taemContainer ?? "—"}
                            className="w-28 rounded border border-border bg-surface-alt/40 px-1 py-0.5 text-[11px]"
                          />
                        ) : r.isData ? (r.taemContainer ?? "—") : <span className="text-gray-500 italic">{r.note}</span>}
                      </td>
                      <td className={`px-2 py-1.5 text-right ${r.wtDiff ? "text-amber-700 font-semibold" : "text-muted"}`}>
                        {r.isData ? (
                          <span className="inline-flex items-center gap-1 justify-end">
                            <span>{n2(r.curWt)}→</span>
                            {editable ? (
                              <input
                                type="number"
                                step="any"
                                value={e.wt}
                                onChange={(ev) => setEdit(r.tracking, "wt", ev.target.value)}
                                placeholder={r.taemWt == null ? "—" : String(r.taemWt)}
                                className="w-20 rounded border border-border bg-surface-alt/40 px-1 py-0.5 text-right text-[11px]"
                              />
                            ) : <span>{n2(r.taemWt)}</span>}
                          </span>
                        ) : "—"}
                      </td>
                      <td className={`px-2 py-1.5 text-right ${r.volDiff ? "text-amber-700 font-semibold" : "text-muted"}`}>
                        {r.isData ? (
                          <span className="inline-flex items-center gap-1 justify-end">
                            <span>{n3(r.curVol)}→</span>
                            {editable ? (
                              <input
                                type="number"
                                step="any"
                                value={e.vol}
                                onChange={(ev) => setEdit(r.tracking, "vol", ev.target.value)}
                                placeholder={r.taemVol == null ? "—" : String(r.taemVol)}
                                className="w-24 rounded border border-border bg-surface-alt/40 px-1 py-0.5 text-right text-[11px]"
                              />
                            ) : <span>{n3(r.taemVol)}</span>}
                          </span>
                        ) : "—"}
                      </td>
                      <td className={`px-2 py-1.5 text-right ${r.amtDiff ? "text-amber-700 font-semibold" : "text-muted"}`}>
                        {r.isData ? (
                          <span className="inline-flex items-center gap-1 justify-end">
                            <span>{r.curAmt ?? "—"}→</span>
                            {editable ? (
                              <input
                                type="number"
                                step="1"
                                value={e.parcel}
                                onChange={(ev) => setEdit(r.tracking, "parcel", ev.target.value)}
                                placeholder={r.taemParcel == null ? "—" : String(r.taemParcel)}
                                className="w-16 rounded border border-border bg-surface-alt/40 px-1 py-0.5 text-right text-[11px]"
                              />
                            ) : <span>{r.taemParcel ?? "—"}</span>}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-left text-[11px] leading-snug">
                        {r.isData ? (
                          <div className="space-y-0.5">
                            {r.taemCg && (
                              <div className={r.hsConflict ? "text-rose-700 font-semibold" : "text-sky-700"}>
                                HS {r.taemCg}{r.hsConflict ? ` ⚠ (เดิม ${r.curTaemHsCode})` : ""}
                              </div>
                            )}
                            {r.taemBoxMark && (
                              <div className={r.boxMarkConflict ? "text-rose-700 font-semibold" : "text-muted"}>
                                มาร์ค {r.taemBoxMark}{r.boxMarkConflict ? ` ⚠ (เดิม ${r.curBoxMark})` : ""}
                              </div>
                            )}
                            {r.productTypeMismatch && (
                              <div className="text-fuchsia-700 font-semibold" title="ประเภทสินค้าตามแต้มไม่ตรงกับที่ระบบใช้คิดราคา — ตรวจ/แก้เอง (ไม่เปลี่ยนอัตโนมัติ)">
                                ⚠ ประเภท {r.taemProductType}
                              </div>
                            )}
                            {!r.taemCg && !r.taemBoxMark && !r.productTypeMismatch && <span className="text-gray-400">—</span>}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-left text-[11px] leading-snug">
                        {r.matched ? (
                          <div className="space-y-0.5">
                            <div className={r.momoCrated ? "text-amber-700 font-medium" : "text-muted"}>
                              MOMO: {r.momoCrated ? `ตีลังไม้${r.momoCrateFee ? ` ฿${n2(r.momoCrateFee)}` : ""}` : "ไม่ตี"}
                            </div>
                            <div className="text-muted">
                              แต้ม: {r.taemServiceFee != null && r.taemServiceFee > 0 ? `฿${n2(r.taemServiceFee)}` : "—"}
                            </div>
                            {r.crateMismatch && (
                              <div className="text-rose-700 font-semibold" title="ค่าบริการ/ตีลังไม้ฝั่งแต้มไม่ตรงกับสถานะตีลังไม้ที่ได้จาก MOMO — ตรวจ/แก้เอง (ไม่เขียนทับอัตโนมัติ)">
                                ⚠ ไม่ตรงกัน
                              </div>
                            )}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right text-[11px] text-muted">
                        {r.taemEtd || r.taemEta
                          ? `${r.taemEtd ?? "—"} / ${r.taemEta ?? "—"}`
                          : "—"}
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
            [เลขในวงเล็บ] = สถานะ fstatus ปัจจุบัน · 📦 มีตู้แต่สถานะค้าง = มีเลขตู้แล้ว (ของมาไทย) แต่สถานะยังค้างจีน 1/2 → เลื่อนสถานะเอง ·
            🔴 ตกหล่น = แต้มมีแต่ระบบไม่พบ → ดูรายการด้านบน · ⚠ วางบิลแล้ว = ข้าม (ตรวจ/แก้บิลเอง) ·
            ยังไม่มีข้อมูล = แต้มยังไม่ปิดตู้/กระสอบรวม/ซ้ำ → ข้าม · แก้ค่าในช่อง (เว้นว่าง=ตามแต้ม) → คิดราคาใหม่ตามค่าที่แก้ ·
            HS(CG.)/มาร์คกล่อง = บันทึกเป็นข้อมูลอ้างอิง (ไม่กระทบราคา) เติมเฉพาะที่ยังว่าง · ถ้าค่าเดิมต่าง (⚠) จะไม่ทับให้ — ตรวจเอง ·
            ประเภทสินค้าที่ต่าง = แจ้งเตือนให้ตรวจ (ไม่เปลี่ยน fproductstype ที่ใช้คิดราคาให้อัตโนมัติ) ·
            ตีลังไม้ MOMO ↔ ค่าบริการแต้ม = เทียบสถานะตีลังไม้ (MOMO) กับช่อง Service fee (แต้ม) · ปกติช่องแต้มว่าง (ค่าตีลังไม้อยู่ในใบแจ้งหนี้ MOMO)
          </p>
        </section>
      )}
    </div>
  );
}

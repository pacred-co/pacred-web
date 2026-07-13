"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  previewMomoPacking,
  applyMomoPacking,
  type MomoPackingPreview,
} from "@/actions/admin/momo-packing-reconcile";
import { recordMomoPackingUpload } from "@/actions/admin/momo-packing-history";
import { PackingHistoryPanel } from "./packing-history-panel";

const n3 = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 6 }));
const n2 = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));

const VERDICT: Record<string, { label: string; cls: string }> = {
  ok:        { label: "✅ ตรงแล้ว",              cls: "bg-emerald-100 text-emerald-800 border border-emerald-300" },
  update:    { label: "🟡 น้ำหนัก/คิวต่าง",       cls: "bg-amber-100 text-amber-800 border border-amber-300" },
  box_short: { label: "🟠 กล่องขาด",             cls: "bg-orange-100 text-orange-800 border border-orange-300" },
  billed:    { label: "🔒 วางบิลแล้ว",            cls: "bg-gray-200 text-gray-700 border border-gray-300" },
  missing:   { label: "🔴 ไม่พบ — สร้างได้",      cls: "bg-red-100 text-red-700 border border-red-300" },
  multi_row: { label: "🟣 หลายแถว · ตรวจเอง",     cls: "bg-purple-100 text-purple-800 border border-purple-300" },
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
  const [toCreate, setToCreate] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  // ประวัติ packing (ภูม 2026-07-14): record each uploaded file once, then bump
  // the nonce so the history panel below reloads. Fire-and-forget — never blocks
  // or breaks the preview/apply money path.
  const recordedB64Ref = useRef<string | null>(null);
  const [historyNonce, setHistoryNonce] = useState(0);

  async function handleFile(file: File) {
    setMsg(null);
    setPreview(null);
    setToCreate(new Set());
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
    runPreview(b64, file.name);
  }

  function runPreview(b64: string, name?: string) {
    setMsg(null);
    setPreview(null);
    setToCreate(new Set());
    start(async () => {
      const res = await previewMomoPacking({ fileBase64: b64 });
      if (!res.ok || !res.data) { setMsg({ kind: "err", text: res.ok ? "อ่านไม่สำเร็จ" : res.error }); return; }
      setPreview(res.data);
      if (res.data.rows.length === 0) {
        setMsg({ kind: "err", text: res.data.warnings[0] ?? "อ่านไม่พบรายการพัสดุในไฟล์" });
        return;
      }
      // record this upload into history once per distinct file (fire-and-forget)
      if (recordedB64Ref.current !== b64) {
        recordedB64Ref.current = b64;
        void recordMomoPackingUpload({ fileBase64: b64, fileName: name }).then((rec) => {
          if (rec.ok) setHistoryNonce((v) => v + 1);
        });
      }
    });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function toggleCreate(base: string) {
    setToCreate((prev) => {
      const next = new Set(prev);
      if (next.has(base)) next.delete(base);
      else next.add(base);
      return next;
    });
  }

  const hasWork =
    !!preview && (preview.summary.willUpdate > 0 || preview.summary.willAdvance > 0 || toCreate.size > 0);

  function doApply() {
    if (!preview || !fileB64) return;
    if (!hasWork) { setMsg({ kind: "err", text: "ไม่มีรายการที่ต้องอัปเดต" }); return; }
    const u = preview.summary.willUpdate;
    const a = preview.summary.willAdvance;
    const c = toCreate.size;
    const parts = [
      u > 0 ? `แก้ ${u} แทรคกิ้ง (น้ำหนัก/คิว/กล่อง/ตู้) + คิดราคาขายใหม่` : null,
      c > 0 ? `สร้างของที่หาย ${c} รายการ` : null,
      a > 0 ? `เลื่อนสถานะ ${a} รายการ เป็น "กำลังส่งมาไทย" (3)` : null,
    ].filter(Boolean);
    if (!window.confirm(`ตู้ ${preview.container ?? "-"}\n${parts.join("\n")}\nยืนยันเพิ่มเข้าระบบ?\n(รายการที่วางบิลแล้ว/หลายแถว จะถูกข้าม)`)) return;
    setMsg(null);
    const createMissingBases = [...toCreate];
    start(async () => {
      const res = await applyMomoPacking({ fileBase64: fileB64, createMissingBases });
      if (!res.ok || !res.data) { setMsg({ kind: "err", text: res.ok ? "บันทึกไม่สำเร็จ" : res.error }); return; }
      const d = res.data;
      setMsg({
        kind: "ok",
        text: `แก้แล้ว ${d.updated} แทรคกิ้ง · คิดราคาใหม่ ${d.repriced}` +
          (d.created > 0 ? ` · สร้างของที่หาย ${d.created}` : "") +
          (d.advanced > 0 ? ` · เลื่อนสถานะ→มาไทย ${d.advanced}` : "") +
          (d.repriceFailed > 0 ? ` · ⚠ ไม่มีเรท ${d.repriceFailed} (ตั้งราคาเอง)` : "") +
          (d.createSkipped > 0 ? ` · สร้างซ้ำข้าม ${d.createSkipped}` : "") +
          (d.createFailed > 0 ? ` · สร้างไม่สำเร็จ ${d.createFailed}` : "") +
          (d.multiRow > 0 ? ` · 🟣 หลายแถว ${d.multiRow}` : "") +
          (d.skippedBilled > 0 ? ` · ข้าม(วางบิลแล้ว) ${d.skippedBilled}` : "") +
          (d.notFound > 0 ? ` · 🔴 ยังไม่สร้าง ${d.notFound}` : ""),
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
        <p className="text-xs text-muted leading-relaxed">
          อัปโหลด packing list ที่ MOMO ส่งมาตอนปิดตู้ (หนึ่งไฟล์ = หนึ่งตู้) → ระบบรวมกล่องย่อยของแต่ละแทรคกิ้ง แล้วเทียบกับข้อมูลในระบบให้
          → ติ๊ก &quot;สร้างของที่หาย&quot; เฉพาะที่ต้องการ → กดยืนยัน. ระบบจะแก้เฉพาะรายการที่<strong>ยังไม่วางบิล</strong> แล้วคิดราคาขายใหม่ให้อัตโนมัติ.
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

      {/* ── RECONCILE TABLE ────────────────────────────────────────────────────── */}
      {preview && preview.rows.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
          {/* summary strip */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-gray-100 text-gray-700 px-2 py-0.5">ทั้งหมด {preview.summary.total}</span>
            <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">✅ ตรง {preview.summary.alreadyOk}</span>
            {preview.summary.boxShort > 0 && <span className="rounded-full bg-orange-100 text-orange-800 px-2 py-0.5 font-medium">🟠 กล่องขาด {preview.summary.boxShort}</span>}
            {preview.summary.willUpdate - preview.summary.boxShort > 0 && <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">🟡 น้ำหนัก/คิวต่าง {preview.summary.willUpdate - preview.summary.boxShort}</span>}
            {preview.summary.missing > 0 && <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 font-medium">🔴 ไม่พบ {preview.summary.missing}</span>}
            {preview.summary.multiRow > 0 && <span className="rounded-full bg-purple-100 text-purple-800 px-2 py-0.5">🟣 หลายแถว {preview.summary.multiRow}</span>}
            {preview.summary.billedDiffer > 0 && <span className="rounded-full bg-gray-200 text-gray-700 px-2 py-0.5">🔒 วางบิลแล้ว {preview.summary.billedDiffer}</span>}
            {preview.summary.willAdvance > 0 && <span className="rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5 font-medium">→ เลื่อนสถานะมาไทย {preview.summary.willAdvance}</span>}
          </div>

          {hasWork && (
            <button
              type="button"
              onClick={doApply}
              disabled={pending}
              className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              ยืนยัน + อัปเดต (จะแก้ {preview.summary.willUpdate}
              {toCreate.size > 0 ? ` · สร้าง ${toCreate.size}` : ""}
              {preview.summary.willAdvance > 0 ? ` · เลื่อนสถานะ ${preview.summary.willAdvance}` : ""})
            </button>
          )}

          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt/50 text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-2 text-left">แทรคกิ้ง (ฐาน)</th>
                  <th className="px-2 py-2 text-left">ลูกค้า</th>
                  <th className="px-2 py-2 text-right">กล่อง ระบบ→packing</th>
                  <th className="px-2 py-2 text-right">นน. ระบบ→packing</th>
                  <th className="px-2 py-2 text-right">คิว ระบบ→packing</th>
                  <th className="px-2 py-2 text-left">ประเภท / HS</th>
                  <th className="px-2 py-2 text-center">สถานะ</th>
                  <th className="px-2 py-2 text-center">ผล</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => {
                  const v = VERDICT[r.verdict] ?? VERDICT.ok;
                  const isMissing = r.verdict === "missing";
                  return (
                    <tr key={`${r.baseTracking}-${i}`} className={`border-t border-border align-top ${r.statusStale ? "bg-rose-50/60" : isMissing ? "bg-red-50/40" : ""}`}>
                      <td className="px-2 py-1.5 font-mono">
                        {r.baseTracking}
                        {r.subCount > 1 && <span className="ml-1 rounded bg-gray-100 px-1 text-[11px] text-gray-600">{r.subCount} กล่องย่อย</span>}
                      </td>
                      <td className="px-2 py-1.5 text-[11px]">
                        {r.matched ? `${r.userid ?? "-"} / ${r.curCab ?? "-"}` : <span className="text-red-500">{r.code ?? "—"} (MOMO)</span>}
                      </td>
                      <td className={`px-2 py-1.5 text-right ${r.amtDiff ? "text-orange-700 font-semibold" : "text-muted"}`}>
                        {r.curAmt ?? "—"}→{r.packingBoxes ?? "—"}
                      </td>
                      <td className={`px-2 py-1.5 text-right ${r.wtDiff ? "text-amber-700 font-semibold" : "text-muted"}`}>
                        {n2(r.curWt)}→{n2(r.packingWeight)}
                      </td>
                      <td className={`px-2 py-1.5 text-right ${r.volDiff ? "text-amber-700 font-semibold" : "text-muted"}`}>
                        {n3(r.curVol)}→{n3(r.packingCbm)}
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
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className={`inline-block rounded-full px-1.5 py-0.5 text-[11px] font-medium ${v.cls}`}>{v.label}</span>
                        {isMissing && r.code && /^PR\d+$/i.test(r.code) && (
                          <label className="mt-1 flex items-center justify-center gap-1 text-[11px] text-red-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={toCreate.has(r.baseTracking)}
                              onChange={() => toggleCreate(r.baseTracking)}
                            />
                            สร้าง
                          </label>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted leading-relaxed">
            [เลขในวงเล็บ] = สถานะ fstatus ปัจจุบัน · &quot;ระบบ→packing&quot; = ค่าปัจจุบันในระบบ → ค่าจาก packing list (รวมกล่องย่อยแล้ว) ·
            🟠 กล่องขาด = ระบบนับกล่อง/น้ำหนักน้อยกว่า packing → จะแก้ให้ตรง · 🔴 ไม่พบ = MOMO มีแต่ระบบไม่รู้จัก → ติ๊ก &quot;สร้าง&quot; เพื่อสร้างรายการให้ ·
            🟣 หลายแถว = ระบบมีหลายรายการยังไม่วางบิลของแทรคเดียว → ไม่แก้อัตโนมัติ (ตรวจเอง กันคิดเงินซ้ำ) · 🔒 วางบิลแล้ว = ข้าม (แก้บิลเอง) ·
            เมื่อบันทึกจะคิดราคาขายใหม่จากค่าที่อัปเดต · famountcount ถูกตั้งเป็น 1 (คิวรวมอยู่แล้ว)
          </p>
        </section>
      )}

      {/* ── EXCEL-LIKE RAW PREVIEW (collapsible) ────────────────────────────────── */}
      {preview?.rawGrid && preview.rawGrid.rows.length > 0 && (
        <details className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold">
            <span>ตาราง Excel จากไฟล์ (ตรวจแถวย่อยดิบก่อนรวม)</span>
            <span className="text-[11px] font-normal text-muted">{preview.rawGrid.rows.length} แถว · {preview.rawGrid.header.length} คอลัมน์</span>
          </summary>
          <div className="mt-3 overflow-x-auto scrollbar-x-visible max-h-[28rem] overflow-y-auto rounded-lg border border-border">
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
        </details>
      )}

      {/* ── ประวัติ packing list ที่อัพ + พรีวิว + เช็ค API (ภูม 2026-07-14) ────────── */}
      <PackingHistoryPanel nonce={historyNonce} />
    </div>
  );
}

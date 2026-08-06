"use client";

import { useRef, useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  previewMomoPacking,
  applyMomoPacking,
  type MomoPackingPreview,
} from "@/actions/admin/momo-packing-reconcile";
import { recordMomoPackingUpload, listMomoPackingUploads } from "@/actions/admin/momo-packing-history";
import { PackingHistoryPanel } from "./packing-history-panel";
import { TranslateProvider, AutoTranslateText } from "@/components/translate/auto-translate";
import { describeApplyPlan, describePriorUploads } from "@/lib/admin/packing-upload-plan";
import { formatThaiDateTime } from "@/lib/utils/thai-datetime";

const n3 = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 6 }));
const n2 = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));
// ── ตารางแบบชีท "ข้อมูลรายละเอียดสินค้าในตู้" (owner ปอน 2026-07-14) ──────────
const DASH = <span className="text-gray-300">—</span>;
/** ป้ายเล็กใต้หัวคอลัมน์ที่โชว์เป็น diff (ค่าปัจจุบันในระบบ → ค่าจาก packing list) */
const DiffHint = () => <div className="text-[11px] font-normal text-muted/70">ระบบ→packing</div>;
/** คอลัมน์ที่ชีทมี แต่ไฟล์ packing list ของ MOMO ไม่มี — โชว์ไว้ให้ครบฟอร์ม (ไม่เดาค่า) */
const NO_FEED = "ไฟล์ packing list ของกวางโจว ไม่มีคอลัมน์นี้ (ไฟล์มี 18 คอลัมน์) — ไม่เดาค่าใส่";
const NO_FEED_ETD = "ไฟล์แพคกิ้งลิสต์ของกวางโจวไม่มี ETD/ETA — ระบบประมาณการให้จากวันปิดตู้ + สถิติเส้นทาง (ดูที่หน้ากวางโจว · ตู้)";
const thNoFeed = "px-2 py-2 text-center font-normal italic text-muted/50";
const tdNoFeed = "px-2 py-1.5 text-center text-gray-300";

// ผลต่อแถว — สีต้องไม่ชนกัน (owner 2026-07-30: เพิ่ม 🔵 ตู้ไม่ตรง = น้ำเงิน · ⬜ ไม่ใช่พัสดุ = สเลท)
const VERDICT: Record<string, { label: string; cls: string }> = {
  ok:         { label: "✅ ตรงแล้ว",              cls: "bg-emerald-100 text-emerald-800 border border-emerald-300" },
  update:     { label: "🟡 น้ำหนัก/คิวต่าง",       cls: "bg-amber-100 text-amber-800 border border-amber-300" },
  box_short:  { label: "🟠 กล่องขาด",             cls: "bg-orange-100 text-orange-800 border border-orange-300" },
  cab_diff:   { label: "🔵 ตู้ไม่ตรง",             cls: "bg-blue-100 text-blue-800 border border-blue-300" },
  billed:     { label: "🔒 วางบิลแล้ว",            cls: "bg-gray-200 text-gray-700 border border-gray-300" },
  missing:    { label: "🔴 ไม่พบ — สร้างได้",      cls: "bg-red-100 text-red-700 border border-red-300" },
  multi_row:  { label: "🟣 หลายแถว · ตรวจเอง",     cls: "bg-purple-100 text-purple-800 border border-purple-300" },
  not_parcel: { label: "⬜ ไม่ใช่พัสดุ",           cls: "bg-slate-100 text-slate-600 border border-slate-300" },
};
/** ป้ายเลขตู้ไม่ตรง ที่แปะเพิ่มบนแถวที่มีความต่างอื่นด้วย (ห้ามให้ "ตู้ไม่ตรง" หายไปในป้ายเดียว) */
const CAB_CHIP = "bg-blue-100 text-blue-800 border border-blue-300";

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
  // ประวัติของ "ตู้นี้" (owner 2026-07-30 · D4/D6) — ตู้เดียวอัพซ้ำได้หลายไฟล์
  // (prod มี 10 ตู้ที่อัพ 2-3 รอบ) → บอกให้ชัดว่าตัวจริงคือไฟล์ล่าสุด + เคยกดบันทึกไปหรือยัง.
  // uploadId = แถวประวัติของไฟล์นี้ → apply จะประทับ "✓ ใช้แล้ว" ที่แถวนั้นแถวเดียว.
  const [uploadId, setUploadId] = useState<number | null>(null);
  const [containerUploads, setContainerUploads] = useState<
    { id: number; uploadedAt: string; appliedAt: string | null; status: string }[]
  >([]);
  // อี้อู (Yiwu) ย้ายไปหน้าเฉพาะ /admin/api-forwarder-yiwu แล้ว — หน้านี้ = กวางโจว (MOMO) ล้วน.
  // ถ้าเผลออัปไฟล์อี้อูมา (detected format=yiwu) → ชี้ทางไปหน้าอี้อู แทนที่จะประมวลผลผิดที่.
  const [yiwuFile, setYiwuFile] = useState(false);

  async function handleFile(file: File) {
    setMsg(null);
    setPreview(null);
    setYiwuFile(false);
    setToCreate(new Set());
    setUploadId(null);          // ไฟล์ใหม่ = แถวประวัติใหม่ (ห้ามใช้ id ของไฟล์ก่อน)
    setContainerUploads([]);
    if (!/\.xlsx$/i.test(file.name)) {
      setMsg({ kind: "err", text: "รองรับเฉพาะไฟล์ .xlsx (packing list ของกวางโจว)" });
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

  /** โหลดประวัติของตู้นี้ (ใช้บอก "ตัวจริงคือไฟล์ล่าสุด" + "เคยกดบันทึกแล้ว"). */
  function loadContainerUploads(container: string | null) {
    if (!container) { setContainerUploads([]); return; }
    void listMomoPackingUploads(container).then((res) => {
      if (!res.ok || !res.data) { setContainerUploads([]); return; }
      setContainerUploads(
        res.data.map((r) => ({ id: r.id, uploadedAt: r.uploadedAt, appliedAt: r.appliedAt, status: r.status })),
      );
    });
  }

  function runPreview(b64: string, name?: string) {
    setMsg(null);
    setPreview(null);
    setYiwuFile(false);
    setToCreate(new Set());
    start(async () => {
      const res = await previewMomoPacking({ fileBase64: b64 });
      if (!res.ok || !res.data) { setMsg({ kind: "err", text: res.ok ? "อ่านไม่สำเร็จ" : res.error }); return; }
      // ไฟล์อี้อู → หน้านี้ไม่ประมวลผล ชี้ไปหน้าอี้อู (money-safe · ไม่เผลอ reconcile ผิดที่)
      if (res.data.format === "yiwu") {
        setYiwuFile(true);
        setFileName(name ?? null);
        return;
      }
      setPreview(res.data);
      loadContainerUploads(res.data.container);
      if (res.data.rows.length === 0) {
        setMsg({ kind: "err", text: res.data.warnings[0] ?? "อ่านไม่พบรายการพัสดุในไฟล์" });
        return;
      }
      // record this upload into history once per distinct file (fire-and-forget).
      if (res.data.format === "momo" && recordedB64Ref.current !== b64) {
        recordedB64Ref.current = b64;
        const cab = res.data.container;
        void recordMomoPackingUpload({ fileBase64: b64, fileName: name }).then((rec) => {
          if (rec.ok) {
            if (rec.data?.id) setUploadId(rec.data.id);
            setHistoryNonce((v) => v + 1);
            loadContainerUploads(cab); // ประวัติเพิ่งมีแถวใหม่ → โหลดซ้ำให้ตัวเลขตรง
          }
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

  // ── ปุ่มยืนยัน = ต้องมีคำตอบเสมอ (owner "เดี๋ยวให้กดอัพเดท เดี๋ยวไม่มี งงไปหมดเลย") ──
  // เดิมปุ่มโผล่เฉพาะเมื่อ hasWork แล้ว "หายเงียบ" ไม่บอกเหตุผล → ตัวตัดสินเดียว (pure +
  // มีเทส) คืนทั้งป้ายปุ่ม และเหตุผลเมื่อไม่มีอะไรให้ทำ.
  const appliedRows = containerUploads.filter((u) => u.status === "applied" || u.appliedAt);
  const appliedBeforeText = appliedRows.length > 0
    ? formatThaiDateTime(appliedRows[0].appliedAt ?? appliedRows[0].uploadedAt)
    : null;
  const applyPlan = preview
    ? describeApplyPlan({
        format: preview.format === "yiwu" ? "yiwu" : "momo",
        total: preview.summary.total,
        willUpdate: preview.summary.willUpdate,
        willAdvance: preview.summary.willAdvance,
        toCreateCount: toCreate.size,
        alreadyOk: preview.summary.alreadyOk,
        billedDiffer: preview.summary.billedDiffer,
        multiRow: preview.summary.multiRow,
        notParcel: preview.summary.notParcel,
        missing: preview.summary.missing,
        missingCreatable: preview.summary.missingCreatable,
        appliedBeforeText,
      })
    : null;
  const priorUploadsNote = preview
    ? describePriorUploads({
        count: containerUploads.length,
        latestText: containerUploads[0] ? formatThaiDateTime(containerUploads[0].uploadedAt) : null,
        appliedCount: appliedRows.length,
      })
    : null;

  function doApply() {
    if (!preview || !fileB64 || applyPlan?.kind !== "ready") return;
    const u = preview.summary.willUpdate;
    const a = preview.summary.willAdvance;
    const c = toCreate.size;
    const cabSkip = preview.summary.cabSkipped;
    const parts = [
      u > 0 ? `แก้ ${u} แทรคกิ้ง (น้ำหนัก/คิว/กล่อง/ตู้) + คิดราคาขายใหม่` : null,
      c > 0 ? `สร้างของที่หาย ${c} รายการ` : null,
      a > 0 ? `เลื่อนสถานะ ${a} รายการ เป็น "กำลังส่งมาไทย" (3)` : null,
      cabSkip > 0 ? `⚠ ไม่ทับเลขตู้ ${cabSkip} รายการ (แพคกิ้งบอกว่าอยู่ตู้อื่น/ชี้ไม่ได้)` : null,
    ].filter(Boolean);
    if (!window.confirm(`ตู้ ${preview.container ?? "-"}\n${parts.join("\n")}\nยืนยันเพิ่มเข้าระบบ?\n(รายการที่วางบิลแล้ว/หลายแถว จะถูกข้าม)`)) return;
    setMsg(null);
    const createMissingBases = [...toCreate];
    start(async () => {
      const res = await applyMomoPacking({
        fileBase64: fileB64,
        createMissingBases,
        ...(uploadId != null ? { uploadId } : {}),
      });
      if (!res.ok || !res.data) { setMsg({ kind: "err", text: res.ok ? "บันทึกไม่สำเร็จ" : res.error }); return; }
      const d = res.data;
      setMsg({
        kind: "ok",
        text: `แก้แล้ว ${d.updated} แทรคกิ้ง · คิดราคาใหม่ ${d.repriced}` +
          (d.cabinetWritten > 0 ? ` · 🔵 แก้เลขตู้ ${d.cabinetWritten}` : "") +
          (d.created > 0 ? ` · สร้างของที่หาย ${d.created}` : "") +
          (d.advanced > 0 ? ` · เลื่อนสถานะ→มาไทย ${d.advanced}` : "") +
          (d.repriceFailed > 0 ? ` · ⚠ ไม่มีเรท ${d.repriceFailed} (ตั้งราคาเอง)` : "") +
          (d.cabinetSkippedOther > 0 ? ` · ไม่ทับเลขตู้ ${d.cabinetSkippedOther} (ของอยู่ตู้อื่นตามแพคกิ้ง)` : "") +
          (d.cabinetSkippedUnsure > 0 ? ` · ไม่ทับเลขตู้ ${d.cabinetSkippedUnsure} (แยกหลายตู้ · ชี้ไม่ได้)` : "") +
          (d.cabinetRefused > 0 ? ` · 🔒 เลขตู้ถูกล็อก ${d.cabinetRefused}` : "") +
          (d.createSkipped > 0 ? ` · สร้างซ้ำข้าม ${d.createSkipped}` : "") +
          (d.createFailed > 0 ? ` · สร้างไม่สำเร็จ ${d.createFailed}` : "") +
          (d.multiRow > 0 ? ` · 🟣 หลายแถว ${d.multiRow}` : "") +
          (d.skippedBilled > 0 ? ` · ข้าม(วางบิลแล้ว) ${d.skippedBilled}` : "") +
          (d.notParcel > 0 ? ` · ⬜ ไม่ใช่พัสดุ ${d.notParcel}` : "") +
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
        <label className="block text-sm font-medium">อัปโหลดแพคกิ้งลิสต์ของโกดังกวางโจว (.xlsx)</label>
        <p className="text-xs text-muted leading-relaxed">
          อัปโหลด packing list ที่ <strong>กวางโจว (MOMO)</strong> ส่งมาตอนปิดตู้ (หนึ่งไฟล์ = หนึ่งตู้) → ระบบรวมกล่องย่อยของแต่ละแทรคกิ้ง แล้วเทียบกับข้อมูลในระบบให้
          → ติ๊ก &quot;สร้างของที่หาย&quot; เฉพาะที่ต้องการ → กดยืนยัน. ระบบจะแก้เฉพาะรายการที่<strong>ยังไม่วางบิล</strong> แล้วคิดราคาขายใหม่ให้อัตโนมัติ.
          <br />
          <span className="text-[11px]">อี้อู (Yiwu) แยกหน้าแล้ว → <Link href="/admin/api-forwarder-yiwu" className="font-medium text-primary-600 underline">อี้อู (ใบส่งของ)</Link></span>
        </p>
        {yiwuFile && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
            📦 ไฟล์นี้เป็น <strong>packing list ของอี้อู (Yiwu)</strong> — ไม่ใช่ MOMO/กวางโจว.
            การจับคู่อี้อูอยู่ที่หน้าเฉพาะ →{" "}
            <Link href="/admin/api-forwarder-yiwu" className="font-semibold text-amber-900 underline">ไปหน้า อี้อู (ใบส่งของ) · ขั้นตอน 2 จับคู่ packing list</Link>
          </div>
        )}
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
          <span className="text-[11px] text-muted">packing list ปิดตู้ของกวางโจว · จำกัด 35 MB</span>
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
        // owner 2026-07-20 "ตรงชื่อสินค้า ทำให้กดแปลจีนให้ด้วยเลย" — ONE batch
        // translate for every Chinese product name on the sheet (same in-house
        // stack as ฝากสั่ง: cache + ไทยก่อน + กดดูต้นฉบับ · display-only).
        <TranslateProvider texts={preview.rows.map((r) => r.packingProduct)}>
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
          {/* summary strip */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-gray-100 text-gray-700 px-2 py-0.5">ทั้งหมด {preview.summary.total}</span>
            <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">✅ ตรง {preview.summary.alreadyOk}</span>
            {preview.summary.boxShort > 0 && <span className="rounded-full bg-orange-100 text-orange-800 px-2 py-0.5 font-medium">🟠 กล่องขาด {preview.summary.boxShort}</span>}
            {preview.summary.willUpdate - preview.summary.boxShort - preview.summary.cabOnly > 0 && <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">🟡 น้ำหนัก/คิวต่าง {preview.summary.willUpdate - preview.summary.boxShort - preview.summary.cabOnly}</span>}
            {/* 🔵 เลขตู้ไม่ตรง — เดิมคำนวณไว้ใน server แต่ไม่มีที่ไหนบนจอโชว์เลย (owner 2026-07-30) */}
            {preview.summary.cabDiff > 0 && (
              <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 font-medium"
                title="เลขตู้ในระบบไม่ตรงกับเลขตู้ของไฟล์นี้ — ดูคอลัมน์ ผล ว่าตู้ไหนถูก">
                🔵 ตู้ไม่ตรง {preview.summary.cabDiff}
                {preview.summary.cabSkipped > 0 ? ` (ไม่ทับ ${preview.summary.cabSkipped})` : ""}
              </span>
            )}
            {preview.summary.missing > 0 && (
              <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 font-medium"
                title="มีในไฟล์ packing list แต่ระบบไม่พบ">
                🔴 ไม่พบ {preview.summary.missing}
                {preview.summary.missingCreatable < preview.summary.missing
                  ? ` (สร้างได้ ${preview.summary.missingCreatable})`
                  : ""}
              </span>
            )}
            {preview.summary.multiRow > 0 && <span className="rounded-full bg-purple-100 text-purple-800 px-2 py-0.5">🟣 หลายแถว {preview.summary.multiRow}</span>}
            {preview.summary.billedDiffer > 0 && <span className="rounded-full bg-gray-200 text-gray-700 px-2 py-0.5">🔒 วางบิลแล้ว {preview.summary.billedDiffer}</span>}
            {preview.summary.notParcel > 0 && (
              <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5"
                title="หัวตารางที่ติดมาในไฟล์ / เลขกระสอบ (CBX…) — ไม่ใช่พัสดุของลูกค้า">
                ⬜ ไม่ใช่พัสดุ {preview.summary.notParcel}
              </span>
            )}
            {preview.summary.willAdvance > 0 && <span className="rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5 font-medium">→ เลื่อนสถานะมาไทย {preview.summary.willAdvance}</span>}
          </div>

          {/* ตู้นี้เคยอัพมาก่อน — บอกว่าตัวจริงคือไฟล์ล่าสุด (ไม่บล็อกการอัพซ้ำ) */}
          {priorUploadsNote && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-900">
              🗂 {priorUploadsNote}
            </div>
          )}

          {/* ── ปุ่มยืนยัน หรือ เหตุผลที่ยังไม่มีอะไรให้กด (ห้ามหายเงียบ) ────────── */}
          {applyPlan?.kind === "ready" ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={doApply}
                disabled={pending}
                className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {applyPlan.label}
              </button>
              {applyPlan.details.length > 0 && (
                <ul className="space-y-0.5 text-[11px] leading-relaxed text-muted">
                  {applyPlan.details.map((d) => <li key={d}>• {d}</li>)}
                </ul>
              )}
            </div>
          ) : applyPlan ? (
            <div className="rounded-lg border border-border bg-surface-alt/40 px-3 py-2.5 text-xs leading-relaxed">
              <div className="font-semibold text-foreground">ยังไม่มีอะไรต้องกดบันทึก</div>
              <div className="mt-0.5 text-muted">{applyPlan.title}</div>
              {applyPlan.details.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-[11px] text-muted">
                  {applyPlan.details.map((d) => <li key={d}>• {d}</li>)}
                </ul>
              )}
            </div>
          ) : null}

          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-xs border-collapse [&_th]:border [&_th]:border-border [&_td]:border [&_td]:border-border min-w-[2200px]">
              {/* หัวตาราง = ชีท "ข้อมูลรายละเอียดสินค้าในตู้" ตรงตัว (owner ปอน 2026-07-14 · "เอาตามนี้เป๊ะๆ
                  ไม่มั่ว"): SM Date … ETA. ไฟล์ packing list ของ MOMO (18 คอลัมน์) ให้ครบทุกช่องยกเว้น
                  SM Number / Note. / Service Fee / Return / ETD / ETA (ทำจาง + ขีด · ไม่เดาค่าใส่).
                  Status = สถานะในระบบเรา (fstatus). 3 คอลัมน์ Total = diff ระบบ→packing (จุดประสงค์ของหน้า). */}
              <thead className="bg-surface-alt/70 text-[11px] font-semibold text-foreground/70 [&_th]:whitespace-nowrap">
                <tr>
                  <th className="px-2 py-2 text-center w-8">#</th>
                  <th className="px-2 py-2 text-center" title="B — วันรับเข้าโกดังจีน (ตามที่ไฟล์เขียน)">SM Date</th>
                  <th className={thNoFeed} title={NO_FEED}>SM Number</th>
                  <th className="px-2 py-2 text-center" title="C — โกดังต้นทาง">Branch</th>
                  <th className="px-2 py-2 text-center" title="D — ชื่อสินค้า (จีน)">Product</th>
                  <th className="px-2 py-2 text-center" title="E">Dum</th>
                  <th className="px-2 py-2 text-center">Type</th>
                  <th className="px-2 py-2 text-center">Code</th>
                  <th className="px-2 py-2 text-center">Tracking</th>
                  <th className="px-2 py-2 text-center" title="กว้าง (ซม.) ต่อกล่อง">W.</th>
                  <th className="px-2 py-2 text-center" title="ยาว (ซม.) ต่อกล่อง">L.</th>
                  <th className="px-2 py-2 text-center" title="สูง (ซม.) ต่อกล่อง">H.</th>
                  <th className="px-2 py-2 text-center">Total Parcel<DiffHint /></th>
                  <th className="px-2 py-2 text-center" title="M — น้ำหนักต่อกล่อง (ค่าที่ไฟล์เขียนมาเอง)">Wt.</th>
                  <th className="px-2 py-2 text-center" title="N — คิวต่อกล่อง (ค่าที่ไฟล์เขียนมาเอง)">Vol.</th>
                  <th className="px-2 py-2 text-center" title="น้ำหนักรวมทั้งแทรค — ค่าที่ใช้คิดเงิน">Total Wt.<DiffHint /></th>
                  <th className="px-2 py-2 text-center" title="คิวรวมทั้งแทรค — ค่าที่ใช้คิดเงิน">Total Vol.<DiffHint /></th>
                  <th className="px-2 py-2 text-center" title="Q — Remark Number (เลขมาร์คกล่อง)">Rem</th>
                  <th className="px-2 py-2 text-center" title="R — CG (พิกัด/HS ที่ MOMO ระบุ)">CG.</th>
                  <th className={thNoFeed} title={NO_FEED}>Note.</th>
                  <th className={thNoFeed} title={NO_FEED}>Service Fee</th>
                  <th className="px-2 py-2 text-center" title="สถานะรายการในระบบเรา (fstatus)">Status</th>
                  <th className={thNoFeed} title={NO_FEED}>Return</th>
                  <th className={thNoFeed} title={NO_FEED_ETD}>ETD</th>
                  <th className={thNoFeed} title={NO_FEED_ETD}>ETA</th>
                  <th className="px-2 py-2 text-center">ผล</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => {
                  const v = VERDICT[r.verdict] ?? VERDICT.ok;
                  const isMissing = r.verdict === "missing";
                  return (
                    <tr key={`${r.baseTracking}-${i}`} className={`border-t border-border align-top ${
                      r.verdict === "not_parcel" ? "bg-slate-50/70 text-slate-500"
                      : r.statusStale ? "bg-rose-50/60"
                      : isMissing ? "bg-red-50/40"
                      : r.verdict === "cab_diff" ? "bg-blue-50/40"
                      : ""
                    }`}>
                      <td className="px-2 py-1.5 text-center text-muted tabular-nums">{i + 1}</td>
                      {/* SM Date (B) */}
                      <td className="px-2 py-1.5 text-center text-[11px] tabular-nums whitespace-nowrap">{r.packingSmDate ?? DASH}</td>
                      {/* SM Number — ไฟล์ MOMO ไม่มี */}
                      <td className={tdNoFeed} title={NO_FEED}>—</td>
                      {/* Branch (C) · Product (D) · Dum (E) */}
                      <td className="px-2 py-1.5 text-center text-[11px] whitespace-nowrap">{r.packingBranch ?? DASH}</td>
                      {/* ชื่อสินค้า (จีน) → โชว์ไทยอัตโนมัติ + กดดูต้นฉบับ (owner 2026-07-20) */}
                      <td className="px-2 py-1.5 text-center text-[11px] whitespace-nowrap" title={r.packingProduct ?? ""}>
                        {r.packingProduct ? <AutoTranslateText text={r.packingProduct} /> : DASH}
                      </td>
                      <td className="px-2 py-1.5 text-right text-[11px] tabular-nums">{r.packingDum ?? DASH}</td>
                      {/* Type (F) */}
                      <td className="px-2 py-1.5 text-center text-[11px] leading-snug">{r.productType ?? DASH}</td>
                      {/* Code — PR ที่แมตช์ได้ / รหัสดิบจาก MOMO ถ้ายังไม่พบ */}
                      <td className="px-2 py-1.5 text-center text-[11px]">
                        {r.matched ? `${r.userid ?? "-"} / ${r.curCab ?? "-"}` : <span className="text-red-500">{r.code ?? "—"} (MOMO)</span>}
                      </td>
                      {/* Tracking (ฐาน — รวมกล่องย่อยแล้ว) */}
                      <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                        {r.baseTracking}
                        {r.subCount > 1 && <span className="ml-1 rounded bg-gray-100 px-1 text-[11px] text-gray-600">{r.subCount} กล่องย่อย</span>}
                      </td>
                      {/* W. L. H. — ขนาดต่อกล่อง (ซม.) จาก packing list */}
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{r.packingWidth ?? DASH}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{r.packingLength ?? DASH}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{r.packingHeight ?? DASH}</td>
                      {/* Total Parcel — diff */}
                      <td className={`px-2 py-1.5 text-right tabular-nums ${r.amtDiff ? "text-orange-700 font-semibold" : "text-muted"}`}>
                        {r.curAmt ?? "—"}→{r.packingBoxes ?? "—"}
                      </td>
                      {/* Wt. (M) / Vol. (N) — ค่าต่อกล่องที่ไฟล์เขียนมาเอง (ไม่คำนวณเอง) */}
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted">{n2(r.packingWtPerBox)}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted">{n3(r.packingCbmPerBox)}</td>
                      {/* Total Wt. / Total Vol. — diff · ค่าที่ใช้คิดเงิน */}
                      <td className={`px-2 py-1.5 text-right tabular-nums ${r.wtDiff ? "text-amber-700 font-semibold" : "text-muted"}`}>
                        {n2(r.curWt)}→{n2(r.packingWeight)}
                      </td>
                      <td className={`px-2 py-1.5 text-right tabular-nums ${r.volDiff ? "text-amber-700 font-semibold" : "text-muted"}`}>
                        {n3(r.curVol)}→{n3(r.packingCbm)}
                      </td>
                      {/* Rem (Q) */}
                      <td className="px-2 py-1.5 text-center font-mono text-[11px] whitespace-nowrap">{r.packingRemark ?? DASH}</td>
                      {/* CG. (R) */}
                      <td className="px-2 py-1.5 text-center font-mono text-[11px] whitespace-nowrap">
                        {r.cg ? <span className="text-sky-700">{r.cg}</span> : DASH}
                      </td>
                      {/* Note. · Service Fee — ไฟล์ MOMO ไม่มี */}
                      <td className={tdNoFeed} title={NO_FEED}>—</td>
                      <td className={tdNoFeed} title={NO_FEED}>—</td>
                      {/* Status = สถานะในระบบเรา */}
                      <td className="px-2 py-1.5 text-center text-[11px]">
                        {r.fstatus ? <span className="text-muted">[{r.fstatus}]</span> : "—"}
                        {r.willAdvanceTo && (
                          <div className="mt-0.5 inline-block rounded bg-indigo-100 px-1 py-0.5 text-[11px] font-semibold text-indigo-700" title="ปิดตู้แล้ว → จะเลื่อนสถานะเป็น กำลังส่งมาไทย (3)">
                            → 3 มาไทย
                          </div>
                        )}
                      </td>
                      {/* Return · ETD · ETA — ไฟล์ MOMO ไม่มี */}
                      <td className={tdNoFeed} title={NO_FEED}>—</td>
                      <td className={tdNoFeed} title={NO_FEED_ETD}>—</td>
                      <td className={tdNoFeed} title={NO_FEED_ETD}>—</td>
                      {/* ผล — ของเรา (ไม่ใช่คอลัมน์ในชีท) */}
                      <td className="px-2 py-1.5 text-center align-top min-w-[15rem]">
                        <span className={`inline-block rounded-full px-1.5 py-0.5 text-[11px] font-medium ${v.cls}`}>
                          {/* 🔴 ไม่พบ — ป้ายต้องบอกตรงว่าสร้างได้หรือไม่ได้ (เดิมเขียน "สร้างได้" ทุกแถว
                              แต่ช่องติ๊กโผล่แค่แถวที่รหัสเป็น PR → คนงงว่าทำไมกดไม่ได้) */}
                          {isMissing && r.createBlockedReason ? "🔴 ไม่พบ — สร้างไม่ได้" : v.label}
                        </span>
                        {/* 🔵 ตู้ไม่ตรง — แปะเพิ่มเมื่อแถวมีความต่างอื่นด้วย เพื่อไม่ให้หายไปในป้ายเดียว */}
                        {r.cabDiff && r.verdict !== "cab_diff" && (
                          <span className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[11px] font-medium ${CAB_CHIP}`}
                            title="เลขตู้ในระบบไม่ตรงกับไฟล์นี้">
                            🔵 ตู้ไม่ตรง
                          </span>
                        )}
                        {/* "ตู้ไหนกันแน่" — คำตอบจาก SOT แพคกิ้ง+staging (ไม่เดา) */}
                        {r.cabDiff && r.containerHint && (
                          <div className="mt-1 text-left text-[11px] leading-snug text-blue-900">{r.containerHint.message}</div>
                        )}
                        {r.containerNote && (
                          <div className="mt-1 text-left text-[11px] leading-snug text-amber-800">⚠ {r.containerNote}</div>
                        )}
                        {/* ⬜ ไม่ใช่พัสดุ — บอกว่าทำไม (หัวตารางในไฟล์ / เลขกระสอบ) */}
                        {r.nonParcelNote && (
                          <div className="mt-1 text-left text-[11px] leading-snug text-slate-500">{r.nonParcelNote}</div>
                        )}
                        {/* 🔴 สร้างไม่ได้ — บอกตัวขัดขวางจริง + ทางไปต่อ */}
                        {isMissing && r.createBlockedReason && (
                          <div className="mt-1 text-left text-[11px] leading-snug text-red-700">{r.createBlockedReason}</div>
                        )}
                        {preview.format === "momo" && isMissing && !r.createBlockedReason && (
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
          {preview.format === "momo" && (
            <p className="text-[11px] text-muted leading-relaxed">
              หัวตาราง = ชีท &quot;ข้อมูลรายละเอียดสินค้าในตู้&quot; · <strong>Wt./Vol.</strong> = ค่าต่อกล่องที่ไฟล์เขียนมาเอง (คอลัมน์ M/N) ·{" "}
              <strong>Total Wt./Total Vol.</strong> = รวมทั้งแทรค = ค่าที่ใช้คิดเงิน · คอลัมน์ที่จางไว้ (SM Number · Note. · Service Fee · Return · ETD · ETA) = ไฟล์ packing list ของกวางโจว ไม่มี (18 คอลัมน์) ·{" "}
              [เลขในวงเล็บ] = สถานะ fstatus ปัจจุบัน · &quot;ระบบ→packing&quot; = ค่าปัจจุบันในระบบ → ค่าจาก packing list (รวมกล่องย่อยแล้ว) ·
              🟠 กล่องขาด = ระบบนับกล่อง/น้ำหนักน้อยกว่า packing → จะแก้ให้ตรง ·
              🔵 <strong>ตู้ไม่ตรง</strong> = เลขตู้ในระบบไม่ตรงกับไฟล์นี้ → ระบบจะบอกใต้ป้ายว่า<strong>ตู้ไหนถูก</strong> (ยึดแพคกิ้งลิสทุกตู้ + ข้อมูล MOMO) ·
              ⚠ ถ้าแพคกิ้งบอกว่าของอยู่<strong>ตู้อื่น</strong> หรือชิปเม้นนั้น MOMO <strong>แยกส่งหลายตู้</strong>แล้วชี้ไม่ได้ → ระบบ<strong>ไม่ทับเลขตู้</strong> (อัปเดตแค่น้ำหนัก/คิว/กล่อง) ·
              🔴 ไม่พบ = กวางโจวมีแต่ระบบไม่รู้จัก → ติ๊ก &quot;สร้าง&quot; เพื่อสร้างรายการให้ (ถ้าไฟล์ไม่มีรหัส PR จะขึ้น &quot;สร้างไม่ได้&quot; พร้อมเหตุผล) ·
              🟣 หลายแถว = ระบบมีหลายรายการยังไม่วางบิลของแทรคเดียว → ไม่แก้อัตโนมัติ (ตรวจเอง กันคิดเงินซ้ำ) · 🔒 วางบิลแล้ว = ข้าม (แก้บิลเอง) ·
              ⬜ ไม่ใช่พัสดุ = หัวตารางที่ติดมาในไฟล์ / เลขกระสอบ (CBX…) → ข้าม ไม่นับเป็น &quot;ไม่พบ&quot; ·
              เมื่อบันทึกจะคิดราคาขายใหม่จากค่าที่อัปเดต · famountcount ถูกตั้งเป็น 1 (คิวรวมอยู่แล้ว)
            </p>
          )}
        </section>
        </TranslateProvider>
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

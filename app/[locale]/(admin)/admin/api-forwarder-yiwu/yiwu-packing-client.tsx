"use client";

/**
 * อี้อู upload-2 — packing list → ผูกตู้ + advance status (MONEY-FREE · ภูม 2026-07-16).
 *
 * Upload the packing list → PREVIEW (writes nothing, shows exactly what will change) →
 * "ผูกตู้ + อัปเดตสถานะ" → applyYiwuPacking. No basis write, no reprice — only the
 * container gets assigned (to empty-cabinet rows) and fstatus advances 1/2 → 3.
 */

import { useRef, useState, useTransition } from "react";
import {
  previewYiwuPacking,
  applyYiwuPacking,
  type YiwuReconcileSummary,
} from "@/actions/admin/yiwu-packing-reconcile";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

export function YiwuPackingClient() {
  const { confirm, dialogs } = useConfirmDialogs();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<YiwuReconcileSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [applying, startApply] = useTransition();
  const [result, setResult] = useState<YiwuReconcileSummary | null>(null);

  async function onPick(file: File | null) {
    setErr(null); setPreview(null); setResult(null);
    if (!file) { setFileName(""); return; }
    setFileName(file.name);
    setPreviewing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await previewYiwuPacking(fd);
      if (!res.ok) setErr(res.error);
      else if (res.data) setPreview(res.data);
    } catch {
      setErr("อ่านไฟล์ไม่สำเร็จ — ลองใหม่");
    } finally {
      setPreviewing(false);
    }
  }

  async function onApply() {
    if (!preview) return;
    const ok = await confirm(
      `ยืนยันผูกตู้ + อัปเดตสถานะ?\n\n` +
      `• ตู้: ${preview.container || "(ไม่มีในไฟล์)"}\n` +
      `• ผูกตู้ให้ ${preview.assigned} แถว · เลื่อนเป็น “กำลังส่งมาไทย” ${preview.advanced} แถว\n` +
      (preview.skipped > 0 ? `• ข้าม ${preview.skipped} เลข (ดูเหตุผลในตาราง)\n` : "") +
      `\nงานนี้ไม่แตะน้ำหนัก/ราคา (มาจากใบส่งของแล้ว)`,
    );
    if (!ok) return;
    const file = fileRef.current?.files?.[0];
    if (!file) { setErr("ไฟล์หาย — เลือกใหม่"); return; }
    startApply(async () => {
      setErr(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await applyYiwuPacking(fd);
        if (!res.ok) setErr(res.error);
        else if (res.data) { setResult(res.data); setPreview(null); }
      } catch {
        setErr("อัปเดตไม่สำเร็จ — ลองใหม่");
      }
    });
  }

  const shown = result ?? preview;

  return (
    <section className="rounded-2xl border border-gray-200 bg-surface p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-xl bg-sky-600 text-white shadow-sm">📦</span>
        <h2 className="text-base font-semibold">ขั้นตอน 2 · จับคู่ packing list (ผูกตู้ + กำลังส่งมาไทย)</h2>
      </div>
      <p className="mb-3 text-[12px] text-muted">
        อัปไฟล์ packing list (.xlsx) ที่พนักงานทำ → ระบบจับคู่เลข 单号 กับออเดอร์ที่อัปใบส่งของไว้ →
        ผูกเลขตู้ + เลื่อนสถานะเป็น <strong>กำลังส่งมาไทย</strong>.{" "}
        <span className="text-sky-700">ไม่แตะน้ำหนัก/ราคา (มาจากใบส่งของแล้ว) — ปลอดภัย 100%</span>
      </p>

      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100">
        <span>📄 เลือกไฟล์ packing list (.xlsx)</span>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>
      {fileName && <span className="ml-2 text-[12px] text-muted">{fileName}</span>}
      {previewing && <p className="mt-2 text-[12px] text-sky-700">⏳ กำลังอ่าน + จับคู่…</p>}
      {err && <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-[12px] text-red-700">⚠ {err}</p>}

      {shown && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-lg bg-gray-100 px-3 py-1 font-medium">
              ตู้: {shown.container || "— (ไม่พบในไฟล์)"}
            </span>
            <span className="rounded-lg bg-emerald-600 px-3 py-1 font-medium text-white">
              {result ? "ผูกตู้แล้ว" : "จะผูกตู้"} {shown.assigned} แถว
            </span>
            <span className="rounded-lg bg-teal-600 px-3 py-1 font-medium text-white">
              {result ? "เลื่อนแล้ว" : "จะเลื่อน"} {shown.advanced} แถว
            </span>
            {shown.skipped > 0 && (
              <span className="rounded-lg bg-amber-500 px-3 py-1 font-medium text-white">ข้าม {shown.skipped} เลข</span>
            )}
          </div>

          <div className="overflow-x-auto scrollbar-x-visible rounded-lg border border-gray-200">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] text-muted">
                  <th className="px-3 py-1.5 font-medium">เลข 单号</th>
                  <th className="px-3 py-1.5 font-medium">ลูกค้า</th>
                  <th className="px-3 py-1.5 font-medium">พบในระบบ</th>
                  <th className="px-3 py-1.5 font-medium">ผูกตู้</th>
                  <th className="px-3 py-1.5 font-medium">เลื่อนสถานะ</th>
                  <th className="px-3 py-1.5 font-medium">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {shown.results.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100 odd:bg-white even:bg-gray-50/60">
                    <td className="px-3 py-1.5 font-medium">{r.base}</td>
                    <td className="px-3 py-1.5">{r.userid ?? "—"}</td>
                    <td className="px-3 py-1.5 text-center tabular-nums">{r.matched ?? "—"}</td>
                    <td className="px-3 py-1.5 text-center tabular-nums">{r.cabinetAssigned || "—"}</td>
                    <td className="px-3 py-1.5 text-center tabular-nums">{r.advanced || "—"}</td>
                    <td className="px-3 py-1.5">
                      {r.ok
                        ? <span className="text-emerald-700">✓ {result ? "ทำแล้ว" : "พร้อม"}</span>
                        : <span className="text-amber-700">⊘ {r.reason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!result && (
            <button
              type="button"
              onClick={onApply}
              disabled={applying || (preview?.assigned === 0 && preview?.advanced === 0)}
              className="mt-3 rounded-xl bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
            >
              {applying ? "⏳ กำลังผูกตู้…" : "🔗 ผูกตู้ + อัปเดตสถานะ"}
            </button>
          )}
          {result && (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
              ✅ เสร็จ — ผูกตู้ {result.assigned} แถว · เลื่อนเป็นกำลังส่งมาไทย {result.advanced} แถว
              {result.skipped > 0 ? ` · ข้าม ${result.skipped} เลข` : ""}
            </p>
          )}
        </div>
      )}

      {dialogs}
    </section>
  );
}

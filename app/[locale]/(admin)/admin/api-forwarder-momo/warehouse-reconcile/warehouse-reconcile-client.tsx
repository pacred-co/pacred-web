"use client";

import { useState, useTransition } from "react";
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
  "no-match":{ label: "ไม่พบในระบบ",      cls: "bg-red-100 text-red-700 border border-red-300" },
  note:      { label: "ยังไม่มีข้อมูล",   cls: "bg-gray-100 text-gray-600 border border-gray-300" },
};

export function TaemReconcileClient() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<TaemReconcilePreview | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();

  function doPreview() {
    setMsg(null);
    setPreview(null);
    start(async () => {
      const res = await previewTaemReconcile({ text });
      if (!res.ok || !res.data) { setMsg({ kind: "err", text: res.ok ? "อ่านไม่สำเร็จ" : res.error }); return; }
      setPreview(res.data);
      if (res.data.rows.length === 0) setMsg({ kind: "err", text: "อ่านไม่พบรายการ — คัดลอกแถวจากชีต MOMO Pacred (รวมหัวตารางได้)" });
    });
  }

  function doApply() {
    if (!preview) return;
    const n = preview.summary.willUpdate;
    if (n === 0) { setMsg({ kind: "err", text: "ไม่มีรายการที่ต้องอัปเดต" }); return; }
    if (!window.confirm(`อัปเดตข้อมูล ${n} แทรคกิ้ง ให้ตรงกับฝั่งแต้ม แล้วคิดราคาขายใหม่?\n(รายการที่วางบิลแล้วจะถูกข้าม)`)) return;
    setMsg(null);
    start(async () => {
      const res = await applyTaemReconcile({ text });
      if (!res.ok || !res.data) { setMsg({ kind: "err", text: res.ok ? "บันทึกไม่สำเร็จ" : res.error }); return; }
      const d = res.data;
      setMsg({
        kind: "ok",
        text: `อัปเดตแล้ว ${d.basisUpdated} แทรคกิ้ง · คิดราคาใหม่ ${d.repriced}` +
          (d.etdEtaUpserted > 0 ? ` · บันทึก ETD/ETA ${d.etdEtaUpserted} ตู้` : "") +
          (d.repriceFailed > 0 ? ` · ⚠ ไม่มีเรท ${d.repriceFailed} (ตั้งราคาเอง)` : "") +
          (d.skippedBilled > 0 ? ` · ข้าม(วางบิลแล้ว) ${d.skippedBilled}` : ""),
      });
      const re = await previewTaemReconcile({ text });
      if (re.ok && re.data) setPreview(re.data);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
        <label className="block text-sm font-medium">วางข้อมูลจากชีตแต้ม (MOMO Pacred)</label>
        <p className="text-xs text-muted">
          เปิด Google ชีต → เลือกแถว (รวมหัวตารางก็ได้) → คัดลอก → วางที่นี่ ระบบจะอ่านคอลัมน์
          ftrackingchn · Container Name · Trans · etd · eta · Code · Total Parcel · Total Wt. · Total Vol.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="วางแถวจากชีตแต้มที่นี่…"
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
          {preview && preview.summary.willUpdate > 0 && (
            <button
              type="button"
              onClick={doApply}
              disabled={pending}
              className="rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              ยืนยันอัปเดต ({preview.summary.willUpdate} แทรคกิ้ง)
            </button>
          )}
        </div>
        {msg && (
          <div className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {msg.text}
          </div>
        )}
      </section>

      {preview && preview.rows.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-gray-100 text-gray-700 px-2 py-0.5">ทั้งหมด {preview.summary.total}</span>
            <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">จะอัปเดต {preview.summary.willUpdate}</span>
            <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">ตรงแล้ว {preview.summary.alreadyOk}</span>
            {preview.summary.billedDiffer > 0 && <span className="rounded-full bg-orange-100 text-orange-800 px-2 py-0.5">⚠ วางบิลแล้วแต่ต่าง {preview.summary.billedDiffer}</span>}
            {preview.summary.noMatch > 0 && <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5">ไม่พบในระบบ {preview.summary.noMatch}</span>}
            {preview.summary.noteRows > 0 && <span className="rounded-full bg-gray-100 text-gray-600 px-2 py-0.5">ยังไม่มีข้อมูล {preview.summary.noteRows}</span>}
          </div>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt/50 text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-2 text-left">แทรคกิ้ง</th>
                  <th className="px-2 py-2 text-left">ลูกค้า/ตู้ (ระบบ)</th>
                  <th className="px-2 py-2 text-left">ตู้ (แต้ม)</th>
                  <th className="px-2 py-2 text-right">นน. ระบบ→แต้ม</th>
                  <th className="px-2 py-2 text-right">คิว ระบบ→แต้ม</th>
                  <th className="px-2 py-2 text-right">กล่อง</th>
                  <th className="px-2 py-2 text-right">ETD/ETA (แต้ม)</th>
                  <th className="px-2 py-2 text-center">ผล</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => {
                  const v = VERDICT[r.verdict] ?? VERDICT.note;
                  return (
                    <tr key={`${r.tracking}-${i}`} className="border-t border-border align-top">
                      <td className="px-2 py-1.5 font-mono">{r.tracking}</td>
                      <td className="px-2 py-1.5 text-[11px]">
                        {r.matched ? `${r.userid ?? "-"} / ${r.curCab ?? "-"}` : <span className="text-gray-400">—</span>}
                        {r.fstatus && <span className="ml-1 text-[11px] text-muted">[{r.fstatus}]</span>}
                      </td>
                      <td className={`px-2 py-1.5 text-[11px] ${r.cabDiff ? "text-amber-700 font-semibold" : ""}`}>
                        {r.isData ? r.taemContainer : <span className="text-gray-500 italic">{r.note}</span>}
                      </td>
                      <td className={`px-2 py-1.5 text-right ${r.wtDiff ? "text-amber-700 font-semibold" : "text-muted"}`}>
                        {r.isData ? `${n2(r.curWt)}→${n2(r.taemWt)}` : "—"}
                      </td>
                      <td className={`px-2 py-1.5 text-right ${r.volDiff ? "text-amber-700 font-semibold" : "text-muted"}`}>
                        {r.isData ? `${n3(r.curVol)}→${n3(r.taemVol)}` : "—"}
                      </td>
                      <td className={`px-2 py-1.5 text-right ${r.amtDiff ? "text-amber-700 font-semibold" : "text-muted"}`}>
                        {r.isData ? `${r.curAmt ?? "—"}→${r.taemParcel ?? "—"}` : "—"}
                      </td>
                      {/* ETD/ETA จากแต้ม — preview shows what will be stored per-container.
                          "—" when แต้ม's packing list has no date for this row. */}
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
            [เลขในวงเล็บ] = สถานะ fstatus ปัจจุบัน · ⚠ วางบิลแล้ว = ข้าม (ตรวจ/แก้บิลเอง) ·
            ยังไม่มีข้อมูล = แต้มยังไม่ปิดตู้/กระสอบรวม/ซ้ำ → ข้าม
          </p>
        </section>
      )}
    </div>
  );
}

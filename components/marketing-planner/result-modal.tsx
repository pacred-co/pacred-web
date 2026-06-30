"use client";

/**
 * Enter/edit a content's measured result (owner brief §2.6). Live performance
 * score + derived status preview as you type. Saves via setResult (which
 * recomputes score/status through enrichResult). Body is keyed by id so its
 * form initialises once per open (lazy useState, no effect).
 */
import { useState } from "react";
import type { ContentResult, ResultStatus, ShouldRepeat } from "@/lib/marketing-planner/types";
import { usePlanner } from "@/lib/marketing-planner/store";
import { enrichResult, RESULT_STATUS_COLOR, RESULT_STATUS_LABEL } from "@/lib/marketing-planner/performance";
import { btnGhost, btnPrimary, cx, Field, inputCls, Modal, Tag } from "./ui";

// Metrics grouped by the marketing goal they prove (ปอน MKT framework §5).
const METRIC_GROUPS: { goal: string; fields: [keyof ContentResult, string][] }[] = [
  { goal: "ให้คนรู้จัก", fields: [["reach", "Reach"], ["impression", "Impression"], ["view", "View"], ["watchTime", "Watch Time (วิ)"]] },
  { goal: "ให้คนเชื่อใจ", fields: [["like", "Like"], ["comment", "Comment"], ["share", "Share"], ["save", "Save"], ["review", "รีวิวจากลูกค้าจริง"]] },
  { goal: "ให้คนค้นหาเจอ", fields: [["organicTraffic", "Organic Traffic"], ["keywordRanking", "อันดับ Keyword"], ["click", "Click"], ["ctr", "CTR (%)"]] },
  { goal: "ให้คนทัก", fields: [["inbox", "ทัก / DM / Inbox"], ["lineAdd", "LINE Add"], ["lead", "Lead"], ["qualifiedLead", "Qualified Lead"], ["quotation", "ใบเสนอราคา"], ["deal", "ปิดการขาย"]] },
  { goal: "ให้ลูกค้าเก่ากลับมา", fields: [["broadcastCtr", "Broadcast CTR (%)"], ["callback", "โทรกลับ"]] },
  { goal: "ให้คนพูดถึงเรา", fields: [["mention", "Mention"], ["backlink", "Backlink"]] },
  { goal: "เงิน (สรุป)", fields: [["revenue", "รายได้ (฿)"], ["cost", "ต้นทุน (฿)"], ["roas", "ROAS"]] },
];

const STATUS_OPTS: ResultStatus[] = ["low", "mid", "high", "repeat", "rework", "waiting"];

export function ResultModal({ id, onClose }: { id?: string; onClose: () => void }) {
  if (!id) return null;
  return <ResultModalBody key={id} id={id} onClose={onClose} />;
}

function ResultModalBody({ id, onClose }: { id: string; onClose: () => void }) {
  const { contents, setResult } = usePlanner();
  const c = contents.find((x) => x.id === id);
  const [form, setForm] = useState<ContentResult>(() => (c?.result ? { ...c.result } : { actualPublishDate: c?.publishDate }));

  const setNum = (k: keyof ContentResult, v: string) => setForm((f) => ({ ...f, [k]: v === "" ? undefined : Number(v) }));
  const setStr = (k: keyof ContentResult, v: string) => setForm((f) => ({ ...f, [k]: v || undefined }));

  const preview = enrichResult(form);

  const save = () => {
    setResult(id, form);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={c ? `วัดผล: ${c.title}` : "วัดผลคอนเทนต์"}
      size="lg"
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>ยกเลิก</button>
          <button type="button" className={btnPrimary} onClick={save}>บันทึกผลลัพธ์</button>
        </>
      }
    >
      {!c ? (
        <p className="py-8 text-center text-sm text-muted">ไม่พบคอนเทนต์</p>
      ) : (
        <div className="space-y-4">
          {/* Live score */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-primary-50/40 p-3 dark:bg-primary-900/10">
            <div>
              <p className="text-[11px] text-muted">Performance Score (คำนวณอัตโนมัติ)</p>
              <p className="text-3xl font-black text-primary-700">{preview.performanceScore}</p>
            </div>
            <Tag color={RESULT_STATUS_COLOR[preview.resultStatus ?? "none"]} label={RESULT_STATUS_LABEL[preview.resultStatus ?? "none"]} />
          </div>

          <Field label="วันที่ลงจริง">
            <input type="date" className={cx(inputCls, "w-auto")} value={form.actualPublishDate ?? ""} onChange={(e) => setStr("actualPublishDate", e.target.value)} />
          </Field>

          <div className="space-y-3">
            {METRIC_GROUPS.map((g) => (
              <div key={g.goal} className="rounded-xl border border-border p-2.5">
                <p className="mb-2 text-[12px] font-semibold text-foreground">📊 {g.goal}</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {g.fields.map(([k, label]) => (
                    <Field key={k} label={label}>
                      <input type="number" min={0} step="any" className={inputCls} value={form[k] === undefined ? "" : String(form[k])} onChange={(e) => setNum(k, e.target.value)} />
                    </Field>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ควรทำซ้ำไหม">
              <select className={inputCls} value={form.shouldRepeat ?? ""} onChange={(e) => setStr("shouldRepeat", e.target.value as ShouldRepeat)}>
                <option value="">— ยังไม่ระบุ —</option>
                <option value="yes">ควรทำซ้ำ</option>
                <option value="no">ไม่ควรทำซ้ำ</option>
                <option value="maybe">อาจจะ</option>
              </select>
            </Field>
            <Field label="กำหนดสถานะผลเอง (ไม่บังคับ)" hint="ปล่อยว่าง = ให้ระบบประเมินจากคะแนน">
              <select className={inputCls} value={form.resultStatusOverride ?? ""} onChange={(e) => setStr("resultStatusOverride", e.target.value as ResultStatus)}>
                <option value="">— อัตโนมัติ —</option>
                {STATUS_OPTS.map((s) => <option key={s} value={s}>{RESULT_STATUS_LABEL[s]}</option>)}
              </select>
            </Field>
          </div>

          <Field label="เหตุผลที่ควร / ไม่ควรทำซ้ำ">
            <input className={inputCls} value={form.repeatReason ?? ""} onChange={(e) => setStr("repeatReason", e.target.value)} />
          </Field>
          <Field label="Insight / สิ่งที่เรียนรู้">
            <textarea className={cx(inputCls, "min-h-[60px] resize-y")} value={form.insight ?? ""} onChange={(e) => setStr("insight", e.target.value)} />
          </Field>
          <Field label="สิ่งที่จะทำต่อ (Next action)">
            <input className={inputCls} value={form.nextAction ?? ""} onChange={(e) => setStr("nextAction", e.target.value)} />
          </Field>
          <Field label="หมายเหตุ">
            <input className={inputCls} value={form.note ?? ""} onChange={(e) => setStr("note", e.target.value)} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

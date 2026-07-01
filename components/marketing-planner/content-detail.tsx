"use client";

/** Read-only detail of a content item (owner brief §2.3 "เปิดรายละเอียด"). */
import { BarChart3, CalendarClock, Pencil } from "lucide-react";
import type { ContentItem } from "@/lib/marketing-planner/types";
import { platformIdsOf, serviceIdsOf } from "@/lib/marketing-planner/types";
import { usePlanner } from "@/lib/marketing-planner/store";
import { RESULT_STATUS_COLOR, RESULT_STATUS_LABEL, isResultEmpty } from "@/lib/marketing-planner/performance";
import { fmtMoney, fmtNum, fmtThaiDateTime } from "@/lib/marketing-planner/util";
import { btnGhost, btnPrimary, Modal, OwnerBadge, SettingTag, Tag } from "./ui";
import { LinkPreview } from "./link-preview";

function Attr({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] text-muted">{label}</p>
      <div className="text-[13px] font-medium text-foreground">{children}</div>
    </div>
  );
}

const METRICS: [keyof NonNullable<ContentItem["result"]>, string, "num" | "money"][] = [
  ["reach", "Reach", "num"], ["view", "View", "num"], ["like", "Like", "num"],
  ["comment", "Comment", "num"], ["share", "Share", "num"], ["save", "Save", "num"],
  ["click", "Click", "num"], ["inbox", "ทัก/DM", "num"], ["lineAdd", "LINE Add", "num"],
  ["lead", "Lead", "num"], ["deal", "ปิดการขาย", "num"], ["revenue", "รายได้", "money"],
  ["cost", "ต้นทุน", "money"], ["roas", "ROAS", "num"], ["organicTraffic", "Organic", "num"],
  ["keywordRanking", "อันดับ KW", "num"], ["review", "รีวิว", "num"], ["mention", "Mention", "num"],
  ["backlink", "Backlink", "num"], ["broadcastCtr", "Broadcast CTR", "num"], ["callback", "โทรกลับ", "num"],
];

export function ContentDetail({ id, onClose, onEdit, onResult }: { id?: string; onClose: () => void; onEdit: (id: string) => void; onResult: (id: string) => void }) {
  const { contents } = usePlanner();
  const c = id ? contents.find((x) => x.id === id) : undefined;
  const r = c?.result;
  const hasResult = !!r && !isResultEmpty(r);

  return (
    <Modal
      open={!!id}
      onClose={onClose}
      title={c?.title ?? "รายละเอียดคอนเทนต์"}
      size="lg"
      footer={
        c && (
          <>
            <button type="button" className={btnGhost} onClick={onClose}>ปิด</button>
            <button type="button" className={btnGhost} onClick={() => onResult(c.id)}><BarChart3 className="h-4 w-4" /> วัดผล</button>
            <button type="button" className={btnPrimary} onClick={() => onEdit(c.id)}><Pencil className="h-4 w-4" /> แก้ไข</button>
          </>
        )
      }
    >
      {!c ? (
        <p className="py-8 text-center text-sm text-muted">ไม่พบคอนเทนต์</p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <SettingTag id={c.statusId} fallback="ไม่มีสถานะ" />
            {platformIdsOf(c).map((pid) => <SettingTag key={pid} id={pid} />)}
            <span className="inline-flex items-center gap-1 text-[12px] text-muted"><CalendarClock className="h-3.5 w-3.5" /> {fmtThaiDateTime(c.publishDate, c.publishTime)}</span>
          </div>

          {(c.topic || c.brief) && (
            <div className="space-y-1">
              {c.topic && <p className="text-[13px] font-semibold text-foreground">{c.topic}</p>}
              {c.brief && <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{c.brief}</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Attr label="ผู้รับผิดชอบ"><OwnerBadge ownerId={c.ownerId} /></Attr>
            <Attr label="ประเภท"><SettingTag id={c.contentTypeId} /></Attr>
            <Attr label="Pillar"><SettingTag id={c.contentPillarId} /></Attr>
            <Attr label="บริการ">
              {serviceIdsOf(c).length ? (
                <span className="flex flex-wrap gap-1">{serviceIdsOf(c).map((sid) => <SettingTag key={sid} id={sid} />)}</span>
              ) : <span className="text-[11px] text-muted">—</span>}
            </Attr>
          </div>

          {c.keyword && (
            <div className="grid grid-cols-2 gap-3">
              <Attr label="Keyword">
                <span className="flex flex-wrap gap-1">
                  {c.keyword.split(",").map((k) => k.trim()).filter(Boolean).map((k) => (
                    <span key={k} className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700 dark:bg-primary-900/30">{k}</span>
                  ))}
                </span>
              </Attr>
            </div>
          )}

          {(c.hook || c.painPoint || c.context || c.storyTelling || c.proof || c.authority || c.visual || c.organicSelling || c.branding || c.esg || c.contact) && (
            <div className="space-y-2 rounded-xl border border-border p-3">
              <p className="text-[12px] font-bold uppercase tracking-wide text-primary-600">องค์ประกอบคอนเทนต์ (Content Craft)</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    ["Hook", c.hook], ["Pain Point", c.painPoint], ["Context", c.context], ["Story Telling", c.storyTelling],
                    ["Proof", c.proof], ["Authority", c.authority], ["Visual", c.visual], ["Organic Selling", c.organicSelling],
                    ["Branding", c.branding], ["ESG", c.esg], ["Contact", c.contact],
                  ] as [string, string | undefined][]
                )
                  .filter(([, v]) => v)
                  .map(([label, v]) => (
                    <div key={label}>
                      <span className="text-[11px] font-semibold text-muted">{label}: </span>
                      <span className="text-[12px] text-foreground">{v}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {c.note && <div className="rounded-lg bg-muted/10 p-2.5 text-[12px] text-muted">📝 {c.note}</div>}

          {c.links.length > 0 && (
            <div className="space-y-2">
              <p className="text-[12px] font-bold uppercase tracking-wide text-primary-600">ลิงก์งาน</p>
              {c.links.map((l) => (
                <div key={l.id} className="space-y-1">
                  <SettingTag id={l.linkTypeId} fallback="ลิงก์" />
                  <LinkPreview url={l.url} title={l.title} compact />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[12px] font-bold uppercase tracking-wide text-primary-600">ผลลัพธ์</p>
            {hasResult && r ? (
              <div className="space-y-3 rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag color={RESULT_STATUS_COLOR[r.resultStatus ?? "none"]} label={RESULT_STATUS_LABEL[r.resultStatus ?? "none"]} />
                  <span className="text-[12px] text-muted">Performance Score</span>
                  <span className="text-lg font-black text-primary-700">{r.performanceScore ?? 0}</span>
                  {r.shouldRepeat === "yes" && <Tag color="#16a34a" label="ควรทำซ้ำ" />}
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {METRICS.filter(([k]) => typeof r[k] === "number").map(([k, label, kind]) => (
                    <div key={k} className="rounded-lg bg-muted/10 px-2 py-1.5">
                      <p className="text-[10px] text-muted">{label}</p>
                      <p className="text-[13px] font-bold text-foreground">{kind === "money" ? fmtMoney(r[k] as number) : fmtNum(r[k] as number)}</p>
                    </div>
                  ))}
                </div>
                {r.insight && <p className="text-[12px] text-muted"><span className="font-semibold text-foreground">Insight:</span> {r.insight}</p>}
                {r.repeatReason && <p className="text-[12px] text-muted"><span className="font-semibold text-foreground">เหตุผล:</span> {r.repeatReason}</p>}
              </div>
            ) : (
              <button type="button" onClick={() => onResult(c.id)} className="w-full rounded-xl border border-dashed border-border py-4 text-[13px] text-muted hover:border-primary-300 hover:text-primary-700">
                + ยังไม่มีผลลัพธ์ — กดเพื่อกรอกผล
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

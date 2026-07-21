"use client";

/**
 * แผง Preview แผนคอนเทนต์ — สิ่งที่เห็นตอนกางแถวในตารางรายวัน.
 *
 * โครงรอบ 4 (owner 2026-07-21): ตัดแถบสรุปหัวแผง + แถบข้อมูลระดับแผน
 * (Keyword/Hashtag/CTA/ลิงก์) ออก → เหลือ **ตารางล้วนอย่างเดียว**.
 * ข้อมูลพวกนั้นซ้ำกับแถวหลักในตารางรายวันอยู่แล้ว และดู/แก้ได้ที่ปุ่ม
 * "ดูรายละเอียดเต็ม" บนแถว — ไม่ได้หายไปไหน.
 *
 * ตาราง = **ตารางเดียวจบ** (owner "ทำให้เป็นเหมือน excel มีแถว มีคอลัมน์ชัด"):
 * ช่องทาง + ชื่องานบนช่องทางนั้น + ชิ้นงานย่อย รวมอยู่ในตารางเดียว โดยจัดกลุ่ม
 * ตามช่องทางด้วย `rowSpan` (ทรงเดียวกับ merge cell ใน Excel) — ชื่องานโชว์ครั้งเดียว
 * คุมแถวลูกทั้งกลุ่ม แทนที่จะ cartesian ซ้ำชื่อทุกแถวจนอ่านไม่ออก.
 *
 * ⚠️ granularity ต่างกัน 2 ระดับ — ตั้งใจ และบอกผู้ใช้ตรงๆ ในตาราง:
 *  - **ชื่องาน** เก็บราย *ช่องทาง* (`platformTitles`) → แก้แล้วเปลี่ยนเฉพาะช่องทางนั้น
 *  - **รายละเอียด/กำหนด/สถานะ** เก็บราย *ชิ้นงาน* (`pieces`) → ชิ้นงานที่ลงหลายช่องทาง
 *    แก้ที่ไหนก็เปลี่ยนหมด (มีป้าย ⇄N เตือนบนแถวนั้น ไม่ปล่อยให้เซอร์ไพรส์)
 */
import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Link as LinkIcon, Pencil } from "lucide-react";
import type { ContentItem, ContentPieceFields, SettingItem } from "@/lib/marketing-planner/types";
import { contentTypeIdsOf, platformContentTypeIdsOf } from "@/lib/marketing-planner/types";
import { derivePieceStage, explainStage, stageInfo, workUrlOf } from "@/lib/marketing-planner/piece-status";
import { usePlanner } from "@/lib/marketing-planner/store";
import { fmtThaiDate } from "@/lib/marketing-planner/util";
import { cx, OwnerBadge, SettingTag } from "./ui";
import { EditableDate, EditableSelect, EditableText } from "./content-grid-cells";
import { PlatformBadge } from "./platform-icon";

// เส้นตารางครบทุกช่อง = ทรง Excel ที่ owner ขอ (ไม่ใช่ borderless list)
const TH = "whitespace-nowrap border border-border bg-muted/15 px-2.5 py-1.5 text-left text-[10.5px] font-bold tracking-wide text-muted";
const TD = "border border-border px-2.5 py-1.5 align-middle text-[11.5px]";

/**
 * ช่อง "ชิ้นงาน" — ชื่อชิ้นงานคือตัวลิงก์เอง กดแล้วเปิดโพสต์จริง + ดินสอไว้แปะ/แก้ลิงก์
 * (owner 2026-07-21 "เอาลิงก์ฝังเข้าไปเลย ให้มีรูปดินสอ ให้กดเพื่อแปะลิงก์ก็ได้").
 *
 * แยกเป็น component เพราะต้องมี state การแก้ไขของตัวเอง (hook เรียกใน loop ไม่ได้).
 * ตอนแก้ input โผล่เป็นบรรทัดล่างในช่องเดิม — ไม่ทำ popover ลอย เพราะตารางอยู่ใน
 * `overflow-x-auto` แล้ว absolute จะโดนตัดหาย (กับดักเดิมที่เจอตอนทำ "+N").
 *
 * กติกาแก้ไขเหมือน cell อื่นทั้งระบบ: Enter/blur = บันทึก · Escape = ยกเลิก.
 */
function PieceNameCell({
  typeId, postUrl, workUrl, isBrief, span, onPatch,
}: {
  typeId: string; postUrl: string; workUrl: string; isBrief: boolean; span: number;
  onPatch: (patch: Partial<ContentPieceFields>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(postUrl);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  // ชื่อชิ้นงานเปิดโพสต์จริงก่อน ถ้ายังไม่มีค่อยเปิดไฟล์งาน
  const jump = postUrl || workUrl;
  const commit = () => {
    setEditing(false);
    if (draft.trim() !== postUrl) onPatch({ postUrl: draft.trim() });
  };

  return (
    <td className={cx(TD, "min-w-[180px]")}>
      <span className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-1">
          {jump ? (
            <a href={jump} target="_blank" rel="noopener noreferrer"
              title={postUrl ? `เปิดโพสต์: ${postUrl}` : `ยังไม่มีลิงก์โพสต์ — เปิดไฟล์งานแทน: ${workUrl}`}
              className="rounded transition hover:opacity-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300">
              <SettingTag id={typeId} />
            </a>
          ) : (
            <span title="ยังไม่มีลิงก์โพสต์/ไฟล์งานให้เปิด"><SettingTag id={typeId} /></span>
          )}
          <button type="button" onClick={() => { setDraft(postUrl); setEditing(true); }}
            title={postUrl ? "แก้ลิงก์โพสต์" : "แปะลิงก์โพสต์ — แปะแล้วสถานะเป็น 'เผยแพร่' อัตโนมัติ"}
            className={cx("rounded p-0.5 transition hover:bg-muted/20",
              postUrl ? "text-green-600" : "text-muted/40 hover:text-muted")}>
            <Pencil className="h-3 w-3" />
          </button>
          {span > 1 && (
            <span className="rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              title={`ชิ้นงานนี้ลง ${span} ช่องทาง — แก้ที่ไหนก็เปลี่ยนทุกช่องทาง`}>
              ⇄{span}
            </span>
          )}
          <button type="button" onClick={() => onPatch({ isBrief: !isBrief })}
            title={isBrief ? "เอาป้ายบรีฟงานออก" : "ทำเครื่องหมายว่าเป็นงานแทรก / มีบรีฟพิเศษ"}
            className={cx("rounded px-1 text-[10px] font-bold transition",
              isBrief ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" : "text-muted/30 hover:bg-muted/15 hover:text-muted")}>
            บรีฟ
          </button>
        </span>
        {editing && (
          <input
            ref={ref}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") { setDraft(postUrl); setEditing(false); }
            }}
            placeholder="วางลิงก์โพสต์ แล้วกด Enter"
            aria-label="ลิงก์โพสต์"
            className="w-full rounded border border-primary-400 bg-white px-1.5 py-0.5 text-[10.5px] outline-none ring-2 ring-primary-200 dark:bg-surface"
          />
        )}
      </span>
    </td>
  );
}

export function PlanPreviewPanel({ c }: { c: ContentItem }) {
  const { updateContent, labelOf, users, currentUserId } = usePlanner();

  // EditableSelect กินรูป SettingItem — ห่อรายชื่อทีมให้เข้ารูปเดียวกัน จะได้ไม่ต้อง
  // ทำ dropdown ตัวที่สองที่ต้องมาไล่แก้ให้เหมือนกันทีหลัง
  const userOpts: SettingItem[] = users.map((u, i) => ({
    id: u.id, group: "owner", name: u.name, order: i, isActive: true, createdAt: "", updatedAt: "",
  }));

  const pids = c.platformIds?.length ? c.platformIds : c.platformId ? [c.platformId] : [];

  // กลุ่มตามช่องทาง — 1 กลุ่ม = 1 ช่องทาง พร้อมชิ้นงานที่ลงช่องทางนั้น
  const groups = pids.map((pid) => ({ pid, types: platformContentTypeIdsOf(c, pid) })).filter((g) => g.types.length > 0);
  // ชิ้นงานที่เลือกไว้แต่ยังไม่ผูกช่องทาง — ต้องโชว์ ไม่งั้นงานหายจากตาราง
  const orphans = contentTypeIdsOf(c).filter((t) => !pids.some((p) => platformContentTypeIdsOf(c, p).includes(t)));
  // ชิ้นงานนี้ลงกี่ช่องทาง — ใช้เตือนว่าแก้แล้วกระทบหลายช่อง
  const spanOf = (typeId: string) => groups.filter((g) => g.types.includes(typeId)).length;

  const patchPiece = (typeId: string, patch: Partial<ContentPieceFields>) =>
    updateContent(c.id, { pieces: { ...(c.pieces ?? {}), [typeId]: { ...(c.pieces?.[typeId] ?? {}), ...patch } } });

  /**
   * แถวทั้งหมดของตาราง — คิดให้เสร็จก่อน render (pure) แล้วค่อยวาด.
   * เลขลำดับต้องมาจาก index ของ list ไม่ใช่ตัวนับที่ ++ ตอน render — React Compiler
   * ห้าม mutate ระหว่าง render (และตัวนับแบบนั้นจะเพี้ยนทันทีที่ React re-render ซ้ำ).
   */
  const rows = [
    ...groups.flatMap((g) => g.types.map((typeId, i) => ({ pid: g.pid as string | null, typeId, first: i === 0, span: g.types.length }))),
    ...orphans.map((typeId, i) => ({ pid: null as string | null, typeId, first: i === 0, span: orphans.length })),
  ].map((r, idx) => ({ ...r, no: idx + 1, key: `${r.pid ?? "none"}-${r.typeId}` }));

  /** ช่องลิงก์ — มีลิงก์แล้วโชว์เป็นลิงก์กดได้ + ปุ่มเปลี่ยน · ยังไม่มีก็วางได้เลย. */
  const linkCell = (typeId: string, url: string, label: string, onSet: (v: string) => void, tone: string) =>
    url ? (
      <span className="inline-flex items-center gap-1">
        <a href={url} target="_blank" rel="noopener noreferrer" className={cx("inline-flex items-center gap-1 font-medium hover:underline", tone)} title={url}>
          <ExternalLink className="h-3.5 w-3.5" />{label}
        </a>
        <EditableText value={url} placeholder="แก้" onCommit={onSet} className="text-[10px] text-muted/60" title="แก้ลิงก์" />
      </span>
    ) : (
      <EditableText value="" placeholder="— วางลิงก์ —" onCommit={(v) => v && onSet(v)} title={`วางลิงก์${label}`} />
    );

  /** แถวชิ้นงาน 1 แถว — คอลัมน์หลังช่องทาง/ชื่องาน. */
  const pieceCells = (typeId: string, rowNo: number) => {
    const p = c.pieces?.[typeId] ?? {};
    const span = spanOf(typeId);
    const stage = derivePieceStage(p);
    const info = stageInfo(stage);
    const work = workUrlOf(p);
    return (
      <>
        <td className={cx(TD, "w-9 text-center font-bold tabular-nums text-muted")}>{rowNo}</td>
        <PieceNameCell
          typeId={typeId}
          postUrl={p.postUrl?.trim() ?? ""}
          workUrl={work}
          isBrief={p.isBrief === true}
          span={span}
          onPatch={(patch) => patchPiece(typeId, patch)}
        />
        <td className={cx(TD, "min-w-[200px]")}>
          <EditableText value={p.detail ?? ""} placeholder="— เพิ่มรายละเอียด —" onCommit={(v) => patchPiece(typeId, { detail: v })} title={`รายละเอียดของ ${labelOf(typeId)}`} />
        </td>
        {/* ถ่าย — ตัวขับสถานะ "รอถ่าย" */}
        <td className={cx(TD, "whitespace-nowrap")}>
          <span className="inline-flex items-center gap-1">
            <EditableDate value={p.shootDate ?? ""} onCommit={(v) => patchPiece(typeId, { shootDate: v })}
              render={(v) => (v ? fmtThaiDate(v) : "—")} title="วันถ่าย — ใส่แล้วสถานะเป็น 'รอถ่าย'" />
            <EditableSelect value={p.shootBy} options={userOpts} colorOf={() => undefined}
              onCommit={(v) => patchPiece(typeId, { shootBy: v })} title="ผู้ถ่าย" />
          </span>
        </td>
        <td className={cx(TD, "whitespace-nowrap")}>
          <span className="inline-flex items-center gap-1">
            <EditableDate value={p.dueDate ?? ""} onCommit={(v) => patchPiece(typeId, { dueDate: v })}
              render={(v) => (v ? fmtThaiDate(v) : c.publishDate ? "ตามแผน" : "—")} title="กำหนดการเผยแพร่ของชิ้นนี้ — ว่าง = ใช้วันลงของแผน" />
            <EditableDate value={p.dueTime ?? ""} type="time" onCommit={(v) => patchPiece(typeId, { dueTime: v })} title="เวลา" />
          </span>
        </td>
        {/* ไฟล์งาน — ตัวขับ "กำลังตรวจสอบ" */}
        <td className={cx(TD, "whitespace-nowrap")}>
          {linkCell(typeId, work, "ไฟล์งาน", (v) => patchPiece(typeId, { workUrl: v }), "text-primary-700")}
        </td>
        {/* ตรวจผ่าน — ตัวขับ "รอเผยแพร่" */}
        <td className={cx(TD, "whitespace-nowrap text-center")}>
          <button type="button" disabled={!work}
            onClick={() => patchPiece(typeId, p.approvedAt ? { approvedAt: "", approvedBy: "" } : { approvedAt: new Date().toISOString(), approvedBy: currentUserId || undefined })}
            title={!work ? "ต้องมีไฟล์งานก่อนถึงจะตรวจได้" : p.approvedAt ? `ตรวจผ่านแล้ว ${fmtThaiDate(p.approvedAt.slice(0, 10))} — กดเพื่อยกเลิก` : "กดเพื่อบันทึกว่าตรวจผ่าน"}
            className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-30",
              p.approvedAt ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "text-muted hover:bg-muted/15")}>
            {p.approvedAt ? <><Check className="h-3.5 w-3.5" />ผ่าน</> : "ยังไม่ตรวจ"}
          </button>
        </td>
        {/* สถานะ — คิดเอง แก้มือไม่ได้ */}
        <td className={cx(TD, "whitespace-nowrap")}>
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: `${info.color}1a`, color: info.color }} title={explainStage(p)}>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: info.color }} />
            {info.label}
          </span>
        </td>
        <td className={cx(TD, "whitespace-nowrap")}>
          {p.ownerId ? <OwnerBadge ownerId={p.ownerId} /> : c.ownerId ? <span className="opacity-60"><OwnerBadge ownerId={c.ownerId} /></span> : <span className="text-muted/50">—</span>}
        </td>
      </>
    );
  };

  return (
    <div className="border-l-[3px] border-primary-600 bg-primary-50/15 px-4 py-3 dark:bg-primary-900/10">
      {rows.length === 0 ? (
        <p className="m-0 rounded-lg bg-muted/10 px-3 py-4 text-center text-[11.5px] italic text-muted">
          ยังไม่ได้เลือกช่องทาง/ประเภทคอนเทนต์ — กด ✎ แก้ไข เพื่อเลือกก่อน แล้วตารางจะขึ้นเอง
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[1400px] border-collapse bg-white dark:bg-surface">
            <thead>
              <tr>
                <th className={TH}>ช่องทาง</th>
                <th className={TH}>ชื่องานบนช่องทางนี้</th>
                <th className={cx(TH, "w-9 text-center")}>#</th>
                <th className={TH}>ชิ้นงาน</th>
                <th className={TH}>รายละเอียด</th>
                <th className={TH}>ถ่าย (วัน · ผู้ถ่าย)</th>
                <th className={TH}>กำหนดการเผยแพร่</th>
                <th className={TH}>ไฟล์งาน</th>
                <th className={cx(TH, "text-center")}>ตรวจผ่าน</th>
                <th className={TH} title="คิดอัตโนมัติจากช่องซ้ายมือ — แก้มือไม่ได้">สถานะ 🔒</th>
                <th className={TH}>ผู้รับผิดชอบ</th>
              </tr>
            </thead>
            <tbody>
              {/* Backlink — แถวเดียวคุมทั้งตาราง เพราะ 1 คอนเทนต์ = 1 backlink
                  ทุกช่องทางยิงเข้าลิงก์เดียวกัน (owner 2026-07-21) */}
              <tr className="bg-amber-50/60 dark:bg-amber-900/15">
                <td className={cx(TD, "font-bold")} colSpan={11}>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                      <LinkIcon className="h-3.5 w-3.5" /> Backlink
                    </span>
                    <span className="text-[10.5px] font-normal text-muted">ทุกช่องทางยิงเข้าลิงก์นี้</span>
                    <span className="min-w-[240px] flex-1 font-normal">
                      {c.backlinkUrl ? (
                        <span className="inline-flex items-center gap-1.5">
                          <a href={c.backlinkUrl} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-primary-700 hover:underline">{c.backlinkUrl}</a>
                          <EditableText value={c.backlinkUrl} placeholder="แก้" onCommit={(v) => updateContent(c.id, { backlinkUrl: v })} className="text-[10px] text-muted/60" title="แก้ backlink" />
                        </span>
                      ) : (
                        <EditableText value="" placeholder="— วาง backlink (ลิงก์ปลายทางที่แปะในคอนเทนต์) —" onCommit={(v) => v && updateContent(c.id, { backlinkUrl: v })} title="Backlink ของคอนเทนต์นี้" />
                      )}
                    </span>
                  </span>
                </td>
              </tr>
              {rows.map((r) => (
                <tr key={r.key} className="hover:bg-primary-50/20">
                  {r.first && (r.pid ? (
                    <>
                      <td className={cx(TD, "whitespace-nowrap align-top")} rowSpan={r.span}>
                        <PlatformBadge id={r.pid} />
                      </td>
                      <td className={cx(TD, "min-w-[220px] align-top")} rowSpan={r.span}>
                        <EditableText
                          value={c.platformTitles?.[r.pid] ?? ""}
                          placeholder={`— ใช้ชื่อหลัก: ${c.title}`}
                          onCommit={(v) => updateContent(c.id, { platformTitles: { ...(c.platformTitles ?? {}), [r.pid as string]: v } })}
                          className={c.platformTitles?.[r.pid] ? "font-medium text-foreground" : ""}
                          title={`ชื่องานสำหรับ ${labelOf(r.pid)}`}
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={cx(TD, "whitespace-nowrap align-top italic text-muted/70")} rowSpan={r.span}>ยังไม่ระบุช่องทาง</td>
                      <td className={cx(TD, "align-top italic text-muted/70")} rowSpan={r.span}>— เลือกช่องทางก่อน</td>
                    </>
                  ))}
                  {pieceCells(r.typeId, r.no)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

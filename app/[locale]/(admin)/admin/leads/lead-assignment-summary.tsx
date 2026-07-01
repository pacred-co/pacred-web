"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, ChevronDown, ClipboardList, Loader2 } from "lucide-react";
import {
  getImportedLeadAssignmentSummary,
  getImportedLeadAssignmentDetail,
  type ImportedLeadAssignmentRow,
  type ImportedLeadReportDetailRow,
} from "@/actions/admin/imported-leads";
import { LeadCallReport } from "./lead-call-report";
import type { AssignRep } from "./lead-assign-bar";

const digits = (p: string) => (p ?? "").replace(/\D/g, "");

// status label/style (kept local — decoupled from the sibling report files, which
// each carry their own copy too).
const STATUS_LABEL: Record<string, string> = {
  closed: "ปิดได้",
  callback: "รอติดต่อกลับ",
  no_answer: "ไม่รับสาย",
  not_interested: "ไม่สนใจ",
  other_rep: "ลูกค้าเซลล์อื่น",
  called: "โทรแล้ว (รอผล)",
};
const STATUS_STYLE: Record<string, string> = {
  closed: "border-green-300 bg-green-50 text-green-700",
  callback: "border-purple-300 bg-purple-50 text-purple-700",
  no_answer: "border-amber-300 bg-amber-50 text-amber-700",
  not_interested: "border-rose-300 bg-rose-50 text-rose-700",
  other_rep: "border-slate-300 bg-slate-100 text-slate-700",
  called: "border-sky-300 bg-sky-50 text-sky-700",
};
// The outcome breakdown shown as chips inside the drill-down (not main columns).
const BREAKDOWN_COLS = ["closed", "callback", "no_answer", "not_interested", "other_rep", "called"] as const;

/**
 * "งานที่มอบหมาย — ภาพรวมต่อเซลล์" (owner 2026-06-30) — the standing assignment
 * workload per sales rep: how many leads each was DISTRIBUTED + progress
 * (ยังไม่โทร vs ติดตามแล้ว vs ปิดได้). NOT date-ranged (unlike LeadCallReport) — it
 * answers "I split work to these reps; how much have they worked through?". Backed
 * by getImportedLeadAssignmentSummary. `mine` = a เซลล์ viewing their OWN assigned
 * workload (self-scoped · one row, auto-expanded) vs the cross-rep distributor view.
 */
export function LeadAssignmentSummary({ reps, mine = false }: { reps: AssignRep[]; mine?: boolean }) {
  const [rows, setRows] = useState<ImportedLeadAssignmentRow[]>([]);
  const [total, setTotal] = useState<ImportedLeadAssignmentRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Drill-down: click a rep → see the actual assigned leads behind the numbers.
  // The chips inside FILTER the list by bucket (owner 2026-06-30 "กดแล้วกรองได้ด้วย").
  const [expandedRep, setExpandedRep] = useState<string | null>(null);
  const [bucketByRep, setBucketByRep] = useState<Record<string, string>>({}); // rep → active bucket ('all' default)
  const [detailCache, setDetailCache] = useState<Record<string, ImportedLeadReportDetailRow[]>>({}); // key = `${rep}::${bucket}`
  const [detailLoadingKey, setDetailLoadingKey] = useState<string | null>(null);
  // One-shot guard for the self-view auto-expand (reset on each reload).
  const autoExpandedRef = useRef(false);

  void reps; // names resolved server-side; prop kept for signature parity / future filter

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setExpandedRep(null);
    setBucketByRep({});
    setDetailCache({});
    autoExpandedRef.current = false; // re-arm the self-view auto-expand for this load
    try {
      const res = await getImportedLeadAssignmentSummary({ mine });
      if (res.ok && res.data) {
        setRows(res.data.rows);
        setTotal(res.data.total);
      } else {
        setRows([]);
        setTotal(null);
        setErr(res.ok ? null : res.error ?? "error");
      }
    } catch (e) {
      // Never leave an infinite spinner — a thrown action surfaces a real error.
      setRows([]);
      setTotal(null);
      setErr(e instanceof Error ? e.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, [mine]);

  // Defer so the fetch's setState isn't synchronous in the effect.
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  // Fetch (rep, bucket) once → cache by `${rep}::${bucket}` so toggling chips back
  // and forth is instant after the first load.
  const loadDetail = useCallback(
    async (rep: string, bucket: string) => {
      const key = `${rep}::${bucket}`;
      if (detailCache[key]) return;
      setDetailLoadingKey(key);
      try {
        const res = await getImportedLeadAssignmentDetail({ rep, bucket, mine });
        if (res.ok && res.data) setDetailCache((c) => ({ ...c, [key]: res.data!.rows }));
      } catch {
        // swallow — the empty-state copy covers a failed drill-down fetch
      } finally {
        setDetailLoadingKey((cur) => (cur === key ? null : cur));
      }
    },
    [detailCache, mine],
  );

  // Self view (one row) → auto-expand ONCE so the rep sees their list immediately;
  // a manual collapse afterwards stays collapsed (the one-shot ref guards re-expand).
  useEffect(() => {
    if (mine && !autoExpandedRef.current && rows.length === 1) {
      autoExpandedRef.current = true;
      const only = rows[0].legacyId;
      setExpandedRep(only);
      void loadDetail(only, "all");
    }
  }, [mine, rows, loadDetail]);

  const toggleRep = useCallback(
    (legacyId: string) => {
      const willOpen = expandedRep !== legacyId;
      setExpandedRep(willOpen ? legacyId : null);
      if (willOpen) void loadDetail(legacyId, bucketByRep[legacyId] ?? "all");
    },
    [expandedRep, bucketByRep, loadDetail],
  );

  // Click a chip → filter the list to that bucket; click the active one again → ทั้งหมด.
  const setBucket = useCallback(
    (rep: string, bucket: string) => {
      const next = (bucketByRep[rep] ?? "all") === bucket ? "all" : bucket;
      setBucketByRep((b) => ({ ...b, [rep]: next }));
      void loadDetail(rep, next);
    },
    [bucketByRep, loadDetail],
  );

  const worked = total ? total.total - total.untouched : 0;

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted">
        {mine ? (
          <>สรุปงานที่ <b className="text-foreground">มอบหมายให้คุณ</b> <b className="text-foreground">ณ ปัจจุบัน</b> — ได้รับมากี่ราย · ติดตามไปแล้วแค่ไหน · เหลือค้างเท่าไร · กดชิปเพื่อกรองรายชื่อ</>
        ) : (
          <>ภาพรวมงานที่มอบหมายให้เซลล์แต่ละคน <b className="text-foreground">ณ ปัจจุบัน</b> (ไม่อิงช่วงวันที่) — มอบไปแล้วกี่ราย · ทำไปแล้วแค่ไหน · เหลือค้างเท่าไร · กดแถวเพื่อดูรายชื่อลูกค้า</>
        )}
        {loading ? <span className="ml-2 inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> กำลังโหลด…</span> : null}
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-white p-4 dark:bg-surface">
          <p className="text-xs text-muted">{mine ? "มอบหมายให้ฉัน (ราย)" : "มอบหมายรวม (ราย)"}</p>
          <p className="mt-1 text-2xl font-bold">{total ? total.total.toLocaleString("th-TH") : "—"}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 dark:bg-surface">
          <p className="text-xs text-muted">ติดตามแล้ว</p>
          <p className="mt-1 text-2xl font-bold text-sky-700">{total ? worked.toLocaleString("th-TH") : "—"}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 dark:bg-surface">
          <p className="text-xs text-muted">ยังไม่โทร (ค้าง)</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{total ? total.untouched.toLocaleString("th-TH") : "—"}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 dark:bg-surface">
          <p className="text-xs text-muted">ปิดการขายได้</p>
          <p className="mt-1 text-2xl font-bold text-green-700">{total ? (total.byStatus.closed ?? 0).toLocaleString("th-TH") : "—"}</p>
        </div>
      </div>

      {err ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">โหลดสรุปไม่สำเร็จ: {err}</div> : null}

      {/* Per-rep breakdown */}
      <div className="overflow-auto rounded-2xl border border-border">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-surface-alt text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">เซลล์</th>
              <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">มอบหมาย</th>
              <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">ยังไม่โทร</th>
              <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">ติดตามแล้ว</th>
              <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">ปิดได้</th>
              <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">คืบหน้า</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-muted">{loading ? "กำลังโหลด…" : mine ? "คุณยังไม่ได้รับมอบหมายลูกค้า" : "ยังไม่มีรายชื่อที่มอบหมาย"}</td></tr>
            ) : rows.map((r) => {
              const open = expandedRep === r.legacyId;
              const activeBucket = bucketByRep[r.legacyId] ?? "all";
              const detailKey = `${r.legacyId}::${activeBucket}`;
              const detail = detailCache[detailKey];
              const detailLoading = detailLoadingKey === detailKey;
              const repWorked = r.total - r.untouched;
              const pct = r.total > 0 ? Math.round((repWorked / r.total) * 100) : 0;
              const closed = r.byStatus.closed ?? 0;
              const isPool = !r.legacyId;
              return (
                <Fragment key={r.legacyId || "(none)"}>
                  <tr className="border-t border-border cursor-pointer hover:bg-surface-alt/40" onClick={() => toggleRep(r.legacyId)}>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <ChevronDown className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
                        <span className={isPool ? "text-muted italic" : ""}>{r.name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold">{r.total.toLocaleString("th-TH")}</td>
                    <td className={`px-3 py-2.5 text-right ${r.untouched > 0 ? "font-semibold text-amber-700" : "text-muted"}`}>{r.untouched.toLocaleString("th-TH")}</td>
                    <td className="px-3 py-2.5 text-right text-sky-700">{repWorked.toLocaleString("th-TH")}</td>
                    <td className={`px-3 py-2.5 text-right ${closed > 0 ? "font-semibold text-green-700" : "text-muted"}`}>{closed.toLocaleString("th-TH")}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="inline-flex items-center gap-2">
                        <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-alt sm:inline-block">
                          <span className="block h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="tabular-nums text-muted">{r.total > 0 ? `${pct}%` : "—"}</span>
                      </span>
                    </td>
                  </tr>
                  {open ? (
                    <tr className="bg-surface-alt/30">
                      <td colSpan={6} className="px-4 py-3">
                        {/* outcome chips — CLICK to filter the list (owner 2026-06-30 "กดแล้วกรองได้ด้วย") */}
                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                          <button type="button" onClick={() => setBucket(r.legacyId, "all")} aria-pressed={activeBucket === "all"} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition ${activeBucket === "all" ? "border-primary-500 bg-primary-600 text-white" : "border-border bg-white text-muted hover:bg-surface-alt dark:bg-surface"}`}>
                            ทั้งหมด {r.total.toLocaleString("th-TH")}
                          </button>
                          {[
                            ...BREAKDOWN_COLS.map((s) => ({ key: s as string, label: STATUS_LABEL[s] ?? s, count: r.byStatus[s] ?? 0, style: STATUS_STYLE[s] ?? "border-border text-muted" })),
                            { key: "untouched", label: "ยังไม่โทร", count: r.untouched, style: "border-amber-300 bg-amber-50 text-amber-700" },
                          ]
                            .filter((c) => c.count > 0)
                            .map((c) => {
                              const on = activeBucket === c.key;
                              return (
                                <button key={c.key} type="button" onClick={() => setBucket(r.legacyId, c.key)} aria-pressed={on} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition ${c.style} ${on ? "ring-2 ring-primary-400 ring-offset-1" : "opacity-90 hover:opacity-100"}`}>
                                  {c.label} {c.count.toLocaleString("th-TH")}
                                </button>
                              );
                            })}
                        </div>
                        {detailLoading && !detail ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังโหลดรายชื่อลูกค้า…</span>
                        ) : !detail || detail.length === 0 ? (
                          <span className="text-xs text-muted">{activeBucket === "all" ? "ไม่มีรายชื่อลูกค้าที่มอบหมาย" : "ไม่มีลูกค้าในสถานะที่กรอง"}</span>
                        ) : (
                          <ul className="space-y-1.5">
                            {detail.map((d) => (
                              <li key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                                <span className="font-semibold text-foreground">{d.name || "— ไม่มีชื่อ —"}</span>
                                {digits(d.phone) ? <a href={`tel:${digits(d.phone)}`} onClick={(e) => e.stopPropagation()} className="font-mono text-primary-600 hover:underline">{digits(d.phone)}</a> : <span className="text-muted">ไม่มีเบอร์</span>}
                                <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[11px] font-semibold ${d.callStatus ? STATUS_STYLE[d.callStatus] ?? "border-border text-muted" : "border-amber-300 bg-amber-50 text-amber-700"}`}>{d.callStatus ? STATUS_LABEL[d.callStatus] ?? d.callStatus : "ยังไม่โทร"}</span>
                                {d.lastCalledAt ? <span className="text-muted">· {new Date(d.lastCalledAt).toLocaleString("th-TH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span> : null}
                                {d.callCount > 0 ? <span className="text-muted">· โทร {d.callCount} ครั้ง</span> : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
          {total && rows.length > 0 ? (
            <tfoot className="border-t-2 border-border bg-surface-alt/60 font-semibold">
              <tr>
                <td className="px-3 py-2.5">รวมทั้งหมด</td>
                <td className="px-3 py-2.5 text-right">{total.total.toLocaleString("th-TH")}</td>
                <td className="px-3 py-2.5 text-right text-amber-700">{total.untouched.toLocaleString("th-TH")}</td>
                <td className="px-3 py-2.5 text-right text-sky-700">{worked.toLocaleString("th-TH")}</td>
                <td className="px-3 py-2.5 text-right text-green-700">{(total.byStatus.closed ?? 0).toLocaleString("th-TH")}</td>
                <td className="px-3 py-2.5 text-right text-muted">{total.total > 0 ? `${Math.round((worked / total.total) * 100)}%` : "—"}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <p className="text-[11px] text-muted">* นับลูกค้าที่มอบหมายอยู่ตอนนี้ (1 ราย = 1 · ตัดเบอร์ซ้ำ ตรงกับลิสต์) · &quot;ติดตามแล้ว&quot; = โทร/มีผลแล้ว · &quot;ยังไม่โทร&quot; = ยังไม่ได้เริ่ม</p>
    </div>
  );
}

/**
 * The "ประวัติ + สรุป" tab body — toggles between the new standing assignment
 * overview (default · owner 2026-06-30) and the date-ranged call-activity report.
 */
export function LeadReportPanel({ reps }: { reps: AssignRep[] }) {
  const [view, setView] = useState<"assigned" | "calls">("assigned");
  const btn = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${active ? "bg-primary-600 text-white" : "text-muted hover:bg-surface-alt"}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-surface-alt/40 p-1">
        <button type="button" onClick={() => setView("assigned")} className={btn(view === "assigned")}>
          <ClipboardList className="h-4 w-4" /> งานที่มอบหมาย (ภาพรวม)
        </button>
        <button type="button" onClick={() => setView("calls")} className={btn(view === "calls")}>
          <BarChart3 className="h-4 w-4" /> สรุปการโทร (ช่วงวันที่)
        </button>
      </div>
      {view === "assigned" ? <LeadAssignmentSummary reps={reps} /> : <LeadCallReport reps={reps} />}
    </div>
  );
}

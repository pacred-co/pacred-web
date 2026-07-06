"use client";

/**
 * Client island for /admin/billing-run/consolidate (pop-spec #3 · owner 2026-07-06).
 *
 * Renders the per-customer consolidation table + the batch tray. NO money math —
 * every ฿ arrives pre-computed on ConsolidationCandidateRow (rolled up server-side
 * from listEligibleForwarders). Two workflows:
 *   แบบ 1: a "วางบิลเดี่ยว →" link per row → /admin/billing-run/add?userid=<uid>.
 *   แบบ 2: a checkbox per fully-ready customer + a sticky "วางบิลที่เลือกทั้งหมด"
 *          bar → §0f confirm → createBatchBillingRunInvoices → per-customer result.
 *
 * "เลือกทั้งหมด" ticks ONLY fully-ready customers (is_fully_ready). A not-ready
 * customer (ขาด / ฿0-transport / missing ค่าส่งไทย) is shown but NOT auto-ticked and
 * badged "ตรวจก่อน — วางบิลเดี่ยว" — it must go via the single /add form.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  createBatchBillingRunInvoices,
  type ConsolidationCandidateRow,
  type BatchBillingResult,
} from "@/actions/admin/billing-run";
import { confirm } from "@/components/ui/confirm";

function thbFmt(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function ConsolidateClient({ rows }: { rows: ConsolidationCandidateRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [results, setResults] = useState<BatchBillingResult[] | null>(null);
  const [batchErr, setBatchErr] = useState<string | null>(null);

  const readyRows = useMemo(() => rows.filter((r) => r.is_fully_ready), [rows]);
  const blockedRows = useMemo(() => rows.filter((r) => !r.is_fully_ready), [rows]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.userid)),
    [rows, selected],
  );
  const selectedTotal = useMemo(
    () => selectedRows.reduce((s, r) => s + r.ready_total_thb, 0),
    [selectedRows],
  );

  function toggle(userid: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(userid);
      else next.delete(userid);
      return next;
    });
  }

  function toggleAllReady(checked: boolean) {
    // Ticks ONLY fully-ready customers — never a ขาด/฿0/no-TH-cost row.
    if (checked) setSelected(new Set(readyRows.map((r) => r.userid)));
    else setSelected(new Set());
  }

  const allReadyTicked =
    readyRows.length > 0 && readyRows.every((r) => selected.has(r.userid));

  async function onBatch() {
    setBatchErr(null);
    setResults(null);
    if (selected.size === 0) {
      setBatchErr("กรุณาเลือกลูกค้าอย่างน้อย 1 ราย");
      return;
    }
    // Defensive — the UI only lets ready rows be ticked, but guard anyway so the
    // batch never fires on a not-ready customer (the server would reject them, but
    // fail early + clearer).
    const notReady = selectedRows.filter((r) => !r.is_fully_ready);
    if (notReady.length > 0) {
      setBatchErr(
        `มี ${notReady.length} ลูกค้าที่ยังตรวจไม่ครบ (${notReady
          .map((r) => r.userid)
          .join(", ")}) — กรุณาวางบิลเดี่ยวสำหรับลูกค้าเหล่านี้`,
      );
      return;
    }

    // §0f confirm-before-mutate (money action · ออกใบวางบิลจริงหลายใบ).
    const ok = await confirm(
      `ยืนยันวางบิลให้ลูกค้าที่เลือกทั้งหมด?\n` +
        `จำนวน: ${selected.size} ราย (1 ใบต่อ 1 ลูกค้า)\n` +
        `ยอดรวมทั้งหมด: ฿${thbFmt(selectedTotal)}\n\n` +
        `รายชื่อ:\n${selectedRows.map((r) => `• ${r.userid} · ${r.ready_count} รายการ · ฿${thbFmt(r.ready_total_thb)}`).join("\n")}`,
    );
    if (!ok) return;

    startTransition(async () => {
      const res = await createBatchBillingRunInvoices({ userids: Array.from(selected) });
      if (res.ok) {
        setResults(res.data!.results);
        // Clear only the ones that succeeded (leave failures ticked for retry/fix).
        const okUsers = new Set(res.data!.results.filter((r) => r.ok).map((r) => r.userid));
        setSelected((prev) => new Set([...prev].filter((u) => !okUsers.has(u))));
        router.refresh();
      } else {
        setBatchErr(res.error);
      }
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-10 text-center space-y-2">
        <div className="text-4xl opacity-60" aria-hidden>📦</div>
        <p className="text-sm text-muted">
          ไม่มีลูกค้าที่มีรายการรอวางบิล — ตรวจตู้ที่{" "}
          <Link href="/admin/report-cnt?page=succeed" className="text-primary-600 hover:underline">
            report-cnt
          </Link>{" "}
          ก่อน
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Batch result banner (after a run) */}
      {results && (
        <BatchResults results={results} />
      )}
      {batchErr && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {batchErr}
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="ลูกค้าทั้งหมด" value={`${rows.length} ราย`} tone="neutral" />
        <SummaryCard label="✅ พร้อมวางบิล (ครบ)" value={`${readyRows.length} ราย`} tone="emerald" />
        <SummaryCard label="⚠️ ต้องตรวจก่อน" value={`${blockedRows.length} ราย`} tone="amber" />
        <SummaryCard label="เลือกไว้" value={`${selected.size} ราย`} tone="primary" />
      </div>

      {/* Table */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
            <thead className="bg-surface-alt/60 text-xs font-medium text-muted">
              <tr>
                <th className="px-3 py-2 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={allReadyTicked}
                    onChange={(e) => toggleAllReady(e.target.checked)}
                    disabled={readyRows.length === 0}
                    title="เลือกเฉพาะลูกค้าที่ตรวจครบทุกตู้แล้ว"
                  />
                </th>
                <th className="px-3 py-2 text-left">ลูกค้า</th>
                <th className="px-3 py-2 text-center">ประเภท</th>
                <th className="px-3 py-2 text-right">รายการ</th>
                <th className="px-3 py-2 text-center">สถานะตรวจตู้</th>
                <th className="px-3 py-2 text-right">ยอดรวม (฿)</th>
                <th className="px-3 py-2 text-center">การทำงาน</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ready = r.is_fully_ready;
                const isSel = selected.has(r.userid);
                return (
                  <tr
                    key={r.userid}
                    className={`border-t border-border hover:bg-surface-alt/30 ${
                      isSel ? "bg-primary-50/30" : ready ? "" : "bg-amber-50/30"
                    }`}
                  >
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={isSel}
                        disabled={!ready}
                        onChange={(e) => toggle(r.userid, e.target.checked)}
                        title={
                          ready
                            ? "เลือกเพื่อวางบิลพร้อมกัน"
                            : "ตรวจก่อน — วางบิลเดี่ยว (มีตู้ขาด / ค่าขนส่ง ฿0 / ยังไม่กรอกค่าส่งไทย)"
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-foreground">{r.userid}</div>
                      <div className="text-[11px] text-muted truncate max-w-[22rem]">
                        {r.display_name}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center text-xs">
                      {r.is_juristic ? (
                        <span className="inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700">
                          นิติบุคคล
                        </span>
                      ) : (
                        <span className="text-muted">บุคคล</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.ready_count}</td>
                    <td className="px-3 py-2 text-center">
                      <CompletenessBadge row={r} />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {thbFmt(r.ready_total_thb)}
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <Link
                        href={`/admin/billing-run/add?userid=${encodeURIComponent(r.userid)}`}
                        className="inline-flex items-center gap-1 rounded-md border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs text-primary-700 hover:bg-primary-100"
                        title="เปิดฟอร์มวางบิลของลูกค้ารายนี้ (รวมทุกตู้เป็นใบเดียว · แก้ค่าส่ง/override ได้)"
                      >
                        วางบิลเดี่ยว →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sticky batch tray */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-white/95 dark:bg-surface/95 backdrop-blur shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex flex-col text-xs leading-tight">
            <span className="text-muted">
              เลือก <strong className="text-foreground">{selected.size}</strong> ราย
              {readyRows.length > 0 && (
                <> · พร้อมวางบิล {readyRows.length} ราย</>
              )}
            </span>
            <span className="text-base font-bold mt-0.5">
              ยอดรวมที่เลือก: <span className="text-amber-700">฿{thbFmt(selectedTotal)}</span>
            </span>
          </div>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => toggleAllReady(!allReadyTicked)}
              disabled={readyRows.length === 0}
              className="rounded-lg border border-border bg-white dark:bg-surface px-4 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
            >
              {allReadyTicked ? "ยกเลิกเลือกทั้งหมด" : `เลือกทั้งหมด (${readyRows.length})`}
            </button>
            <button
              type="button"
              onClick={onBatch}
              disabled={pending || selected.size === 0}
              className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {pending
                ? "กำลังวางบิล..."
                : `🧾 วางบิลที่เลือกทั้งหมด (${selected.size} ราย · ฿${thbFmt(selectedTotal)})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ครบ/ขาด completeness badge ────────────────────────────────────────────
function CompletenessBadge({ row }: { row: ConsolidationCandidateRow }) {
  const parts: React.ReactNode[] = [];
  if (row.complete_containers > 0) {
    parts.push(
      <span
        key="complete"
        className="inline-block rounded bg-white border border-emerald-200 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700"
      >
        ตู้ครบ {row.complete_containers}
      </span>,
    );
  }
  if (row.incomplete_containers > 0) {
    parts.push(
      <span
        key="incomplete"
        className="inline-block rounded bg-pink-100 px-1.5 py-0.5 text-[11px] font-semibold text-pink-700"
        title="ยังยิงรับไม่ครบ — ให้โกดังยิงรับให้ครบก่อนวางบิล"
      >
        ขาด {row.incomplete_containers} ตู้
      </span>,
    );
  }
  if (row.has_zero_transport) {
    parts.push(
      <span
        key="zero"
        className="inline-block rounded bg-amber-200 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900"
        title="มีรายการค่าขนส่ง ฿0 — ยังไม่ได้วัด/ตั้งราคา · วางบิลเดี่ยวเพื่อแก้"
      >
        ⚠️ ค่าขนส่ง ฿0
      </span>,
    );
  }
  if (row.has_th_ship_missing) {
    parts.push(
      <span
        key="thship"
        className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800"
        title="ยังไม่กรอกค่าส่งไทย · วางบิลเดี่ยวเพื่อแก้/ยืนยัน"
      >
        🚚 ยังไม่กรอกค่าส่งไทย
      </span>,
    );
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex flex-wrap justify-center gap-1">{parts}</div>
      {!row.is_fully_ready && (
        <span className="text-[11px] font-medium text-amber-700">ตรวจก่อน — วางบิลเดี่ยว</span>
      )}
    </div>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────
function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "emerald" | "amber" | "primary";
}) {
  const cls: Record<typeof tone, string> = {
    neutral: "border-border bg-white dark:bg-surface",
    emerald: "border-emerald-200 bg-emerald-50/40",
    amber: "border-amber-200 bg-amber-50/40",
    primary: "border-primary-200 bg-primary-50/40",
  };
  return (
    <div className={`rounded-xl border ${cls[tone]} p-3`}>
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-lg font-bold mt-0.5">{value}</div>
    </div>
  );
}

// ── Batch result banner ───────────────────────────────────────────────────
function BatchResults({ results }: { results: BatchBillingResult[] }) {
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2">
      <p className="text-sm font-semibold text-emerald-800">
        ✅ วางบิลสำเร็จ {ok.length} ใบ
        {failed.length > 0 && (
          <span className="text-amber-700"> · ล้มเหลว {failed.length} ราย</span>
        )}
      </p>
      {ok.length > 0 && (
        <ul className="text-xs text-emerald-700 space-y-0.5">
          {ok.map((r) => (
            <li key={r.userid}>
              • {r.userid} · {r.count} รายการ →{" "}
              {r.invoiceId ? (
                <Link
                  href={`/admin/billing-run/${r.invoiceId}`}
                  className="font-mono text-emerald-800 hover:underline"
                >
                  {r.docNo}
                </Link>
              ) : (
                r.docNo
              )}
            </li>
          ))}
        </ul>
      )}
      {failed.length > 0 && (
        <ul className="text-xs text-amber-700 space-y-0.5">
          {failed.map((r) => (
            <li key={r.userid}>
              • {r.userid} — {r.error ?? "ไม่ทราบสาเหตุ"} (ลองวางบิลเดี่ยว)
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

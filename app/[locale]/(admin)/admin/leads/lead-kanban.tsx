"use client";

/**
 * <LeadKanban> — pipeline board view of the cold-lead queue (CRM depth ·
 * 2026-06-08). A view mode on /admin/leads (?view=board), grouped by each
 * lead's latest lead_call_log status into 5 columns:
 *   ยังไม่ติดต่อ (null) · ติดต่อแล้ว · นัดโทรกลับ · ปิดการขาย · ไม่สนใจ
 *
 * Each card has a per-card status-set dropdown — picking a new status writes a
 * logLeadCall row (the same mutation the list view uses) and moves the card to
 * the new column. §0f confirm-before-mutate: moving to "ปิดการขาย" (a money/
 * handoff state) confirms first; the other moves are cheap call-logging and
 * apply directly (a status pick is an explicit, reversible choice).
 *
 * Reuses getLeadQueue's rows (passed in from the page) so the board can't drift
 * from the table. No new table — the column is derived from callStatus.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { PhoneCall, Loader2 } from "lucide-react";
import { confirm } from "@/components/ui/confirm";
import { logLeadCall } from "@/actions/admin/leads";
import type { LeadCallStatus, LeadQueueRow } from "@/actions/admin/leads-types";
import { TagChips } from "@/components/admin/tag-chips";

// Column order + labels. `uncontacted` (never-called · status null) is its own
// first column. The BOARD shows 5 columns; `no_answer` rows render under the
// "ติดต่อแล้ว" column (an attempt was made) — see colOf(). ColKey is the set of
// the 5 column buckets (NOT every LeadCallStatus — no_answer has no own column).
type ColKey = "uncontacted" | "called" | "callback" | "closed" | "not_interested";
const COLUMNS: { key: ColKey; label: string; head: string }[] = [
  { key: "uncontacted",    label: "ยังไม่ติดต่อ", head: "bg-gray-100 text-gray-700" },
  { key: "called",         label: "ติดต่อแล้ว",   head: "bg-blue-100 text-blue-700" },
  { key: "callback",       label: "นัดโทรกลับ",   head: "bg-purple-100 text-purple-700" },
  { key: "closed",         label: "ปิดการขาย",    head: "bg-green-100 text-green-700" },
  { key: "not_interested", label: "ไม่สนใจ",      head: "bg-gray-200 text-gray-600" },
];

const DROPDOWN_STATUSES: { value: LeadCallStatus; label: string }[] = [
  { value: "called",         label: "ติดต่อแล้ว" },
  { value: "no_answer",      label: "ไม่รับสาย" },
  { value: "callback",       label: "นัดโทรกลับ" },
  { value: "closed",         label: "ปิดการขาย" },
  { value: "not_interested", label: "ไม่สนใจ" },
];

function colOf(status: LeadCallStatus | null): ColKey {
  switch (status) {
    case "called":
    case "no_answer":      // an attempt was made → "ติดต่อแล้ว" column
      return "called";
    case "callback":       return "callback";
    case "closed":         return "closed";
    case "not_interested": return "not_interested";
    default:               return "uncontacted"; // null / unknown = never-called
  }
}

export function LeadKanban({
  rows,
  tagsByUser = {},
}: {
  rows: LeadQueueRow[];
  /** userid → tag strings, for the per-card chips. */
  tagsByUser?: Record<string, string[]>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  // Local override of a card's column after a successful status set (optimistic).
  const [moved, setMoved] = useState<Record<string, LeadCallStatus>>({});

  function setStatus(userid: string, status: LeadCallStatus) {
    startTransition(async () => {
      if (status === "closed") {
        // §0f — closing a deal triggers a sales→CS handoff; confirm first.
        const ok = await confirm(`ทำเครื่องหมาย “ปิดการขาย” ให้ลูกค้า ${userid}?`, {
          title: "ปิดการขาย",
          confirmLabel: "ยืนยัน",
          cancelLabel: "ยกเลิก",
        });
        if (!ok) return;
      }
      setBusyId(userid);
      const res = await logLeadCall({ userid, status });
      if (res.ok) {
        setMoved((m) => ({ ...m, [userid]: status }));
        router.refresh();
      }
      setBusyId(null);
    });
  }

  // Group rows into columns, honoring optimistic moves.
  const byCol: Record<ColKey, LeadQueueRow[]> = {
    uncontacted: [], called: [], callback: [], closed: [], not_interested: [],
  };
  for (const r of rows) {
    const eff = moved[r.userid] ?? r.callStatus;
    byCol[colOf(eff)].push(r);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-start">
      {COLUMNS.map((col) => {
        const list = byCol[col.key];
        return (
          <div key={col.key} className="rounded-2xl border border-border bg-surface-alt/30 p-2">
            <div className={`mb-2 flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold ${col.head}`}>
              <span>{col.label}</span>
              <span className="rounded-full bg-white/70 px-1.5 text-[11px] tabular-nums">{list.length}</span>
            </div>
            <div className="space-y-2 max-h-[70vh] overflow-y-auto scrollbar-x-visible">
              {list.length === 0 ? (
                <p className="py-6 text-center text-[11px] text-muted/70">— ว่าง —</p>
              ) : (
                list.map((r) => (
                  <div key={r.userid} className="rounded-xl border border-border bg-white dark:bg-surface p-2.5 shadow-sm space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r.name}</p>
                        <Link
                          href={`/admin/customers?q=${encodeURIComponent(r.userid)}`}
                          className="font-mono text-[11px] text-primary-600 hover:underline"
                        >
                          {r.userid}
                        </Link>
                      </div>
                      {r.orderCount > 0 ? (
                        <span className="rounded-full bg-surface-alt px-1.5 py-0.5 text-[11px] tabular-nums shrink-0">
                          {r.orderCount.toLocaleString("th-TH")} นำเข้า
                        </span>
                      ) : null}
                    </div>

                    {r.tel ? (
                      <a href={`tel:${r.tel}`} className="inline-flex items-center gap-1 text-xs font-mono text-primary-600 hover:underline">
                        <PhoneCall className="w-3 h-3" /> {r.tel}
                      </a>
                    ) : (
                      <span className="text-[11px] text-muted">— ไม่มีเบอร์ —</span>
                    )}

                    {/* Tags */}
                    <TagChips userid={r.userid} initialTags={tagsByUser[r.userid] ?? []} compact />

                    {/* Per-card status set (the move control) */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      {pending && busyId === r.userid ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted" />
                      ) : null}
                      <select
                        value=""
                        disabled={pending && busyId === r.userid}
                        onChange={(e) => {
                          const v = e.target.value as LeadCallStatus | "";
                          if (v) setStatus(r.userid, v);
                        }}
                        className="w-full rounded-md border border-border bg-white dark:bg-surface px-1.5 py-1 text-[11px]"
                      >
                        <option value="">เปลี่ยนสถานะ…</option>
                        {DROPDOWN_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

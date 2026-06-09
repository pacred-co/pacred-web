"use client";

/**
 * <CustomerActivityTimeline> — the merged calls + notes feed (CRM depth ·
 * 2026-06-08). "เห็นว่าคุยอะไร · คนมาทำงานต่อได้".
 *
 * Renders the chronological timeline (newest-first) + an add-note box. Used on:
 *   - /admin/crm customer-360 panel
 *   - /admin/customers/[id]
 *
 * The add-note action returns the refreshed timeline, so the component holds
 * local state and re-renders off the server's authoritative response. Adding a
 * note is non-destructive → no confirm needed (§0f applies to mutate/edit/
 * delete; this is an append).
 */

import { useState, useTransition } from "react";
import { PhoneCall, StickyNote, Loader2, Send } from "lucide-react";
import { relativeTimeTh } from "@/lib/utils/relative-time";
import { addCustomerNote } from "@/actions/admin/customer-activity";
import type { ActivityEntry } from "@/actions/admin/customer-activity-types";

// Thai labels for the lead_call_log statuses (mirror /admin/leads).
const CALL_STATUS_LABEL: Record<string, string> = {
  called: "ติดต่อแล้ว",
  no_answer: "ไม่รับสาย",
  closed: "ปิดการขาย",
  callback: "นัดโทรกลับ",
  not_interested: "ไม่สนใจ",
};
const CALL_STATUS_BADGE: Record<string, string> = {
  called: "bg-blue-100 text-blue-700",
  no_answer: "bg-amber-100 text-amber-700",
  closed: "bg-green-100 text-green-700",
  callback: "bg-purple-100 text-purple-700",
  not_interested: "bg-gray-200 text-gray-600",
};

export function CustomerActivityTimeline({
  userid,
  initialEntries = [],
}: {
  userid: string;
  initialEntries?: ActivityEntry[];
}) {
  const [entries, setEntries] = useState<ActivityEntry[]>(initialEntries);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    const text = draft.trim();
    if (!text) return;
    setErr(null);
    startTransition(async () => {
      const res = await addCustomerNote(userid, text);
      if (res.ok) {
        setEntries(res.data ?? []);
        setDraft("");
      } else {
        setErr(res.error ?? "บันทึกโน้ตไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Add-note box */}
      <div className="rounded-lg border border-border bg-white dark:bg-surface p-2 space-y-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="เพิ่มโน้ต — คุยอะไรกับลูกค้า / ต้องตามอะไรต่อ"
          className="w-full resize-y rounded-md border border-border px-2.5 py-2 text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          {err ? (
            <p className="text-[11px] text-red-700">{err}</p>
          ) : (
            <span className="text-[10px] text-muted/70">{draft.trim().length}/2000</span>
          )}
          <button
            type="button"
            disabled={pending || !draft.trim()}
            onClick={submit}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            บันทึกโน้ต
          </button>
        </div>
      </div>

      {/* Timeline */}
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted">
          ยังไม่มีกิจกรรม — เพิ่มโน้ต หรือบันทึกผลโทรในคิวโทรลูกค้า
        </p>
      ) : (
        <ol className="space-y-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className="relative rounded-lg border border-border bg-white dark:bg-surface px-3 py-2"
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${
                    e.kind === "call" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
                  }`}
                >
                  {e.kind === "call" ? <PhoneCall className="w-3.5 h-3.5" /> : <StickyNote className="w-3.5 h-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-medium">
                      {e.kind === "call" ? "บันทึกการโทร" : "โน้ต"}
                    </span>
                    {e.kind === "call" && e.callStatus ? (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          CALL_STATUS_BADGE[e.callStatus] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {CALL_STATUS_LABEL[e.callStatus] ?? e.callStatus}
                      </span>
                    ) : null}
                    <span className="ml-auto text-[10px] text-muted/80">{relativeTimeTh(e.at)}</span>
                  </div>
                  {e.body ? (
                    <p className="mt-1 text-xs whitespace-pre-wrap break-words text-foreground/90">{e.body}</p>
                  ) : e.kind === "call" ? (
                    <p className="mt-1 text-xs text-muted italic">— ไม่มีโน้ต —</p>
                  ) : null}
                  {e.by ? (
                    <p className="mt-1 text-[10px] text-muted/70 font-mono">โดย {e.by}</p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

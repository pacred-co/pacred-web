"use client";

/**
 * Lead ownership controls (owner 2026-06-22) — on each /admin/leads row:
 *   • <LeadRepCell>  — shows who holds the lead, a one-tap "รับเอง" (self-claim),
 *                      and change/release (dropdown incl. "— ปลด —").
 *   • <LeadCsCell>   — shows + sets/clears the CS.
 * Talk to the leads-scoped actions (claimLead / setLeadRep / setLeadCs) which
 * allow the leads roles (incl. plain `sales`) so a rep can own + hand off their
 * own book. router.refresh() after each write so the row reflects the change.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, UserPlus, UserMinus, Pencil, X, Headphones } from "lucide-react";
import { claimLead, setLeadRep, setLeadCs } from "@/actions/admin/leads";
import type { CrmRep, CrmCsRep } from "@/lib/admin/crm-types";

const ERR_TH: Record<string, string> = {
  invalid_rep: "เซลล์ที่เลือกไม่ถูกต้อง/ไม่ได้เปิดใช้งาน",
  invalid_cs: "CS ที่เลือกไม่ถูกต้อง/ไม่ได้เปิดใช้งาน",
  customer_not_found: "ไม่พบลูกค้า",
  missing_userid: "ไม่พบรหัสลูกค้า",
};
function errText(code: string): string {
  return ERR_TH[code] ?? code ?? "เกิดข้อผิดพลาด";
}

// ── Sales-rep cell — holder + รับเอง + change/release ──────────────────────
export function LeadRepCell({
  userid,
  currentRep,
  myLegacyId,
  reps,
}: {
  userid: string;
  currentRep: string;
  /** the viewing admin's own legacy rep id (null = not bridged → can't claim) */
  myLegacyId: string | null;
  reps: CrmRep[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rep, setRep] = useState(currentRep);
  const [err, setErr] = useState<string | null>(null);

  const holder = reps.find((r) => r.legacyId === rep);
  const mine = !!myLegacyId && rep === myLegacyId;
  const label = mine ? "คุณ" : holder?.name || rep || "— ยังไม่มี —";

  // Self-serve only (owner 2026-06-22): a user can take the lead for THEMSELVES
  // ("รับเอง") or drop their own ("ปลด"). The pick-any-other-rep dropdown was
  // removed — assigning a customer to a specific OTHER rep is a manager action
  // (done on the customer profile / CRM), not here.
  function claim() {
    setErr(null);
    start(async () => {
      const res = await claimLead(userid);
      if (!res.ok) { setErr(errText(res.error)); return; }
      setRep(res.data?.rep ?? myLegacyId ?? "");
      router.refresh();
    });
  }
  function release() {
    setErr(null);
    start(async () => {
      const res = await setLeadRep({ userid, legacyId: "" });
      if (!res.ok) { setErr(errText(res.error)); return; }
      setRep("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`text-xs ${mine ? "font-semibold text-primary-700" : rep ? "text-foreground" : "text-muted"}`}>
          {label}
        </span>
        {mine ? (
          <button
            type="button"
            onClick={release}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-alt/50 px-2 py-0.5 text-[11px] font-medium text-muted hover:bg-surface-alt disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserMinus className="h-3 w-3" />} ปลด
          </button>
        ) : myLegacyId ? (
          <button
            type="button"
            onClick={claim}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-full border border-primary-300 bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700 hover:bg-primary-100 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />} รับเอง
          </button>
        ) : null}
      </div>
      {err && <p className="text-[11px] text-red-600">{err}</p>}
    </div>
  );
}

// ── CS cell — holder + change/clear ────────────────────────────────────────
export function LeadCsCell({
  userid,
  currentCs,
  csReps,
}: {
  userid: string;
  currentCs: string;
  csReps: CrmCsRep[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cs, setCs] = useState(currentCs);
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState(currentCs);
  const [err, setErr] = useState<string | null>(null);

  const holder = csReps.find((r) => r.adminID === cs);
  const label = holder ? holder.nickname || holder.name : cs || "— ยังไม่มี —";

  function save() {
    setErr(null);
    start(async () => {
      const res = await setLeadCs({ userid, adminID: choice });
      if (!res.ok) { setErr(errText(res.error)); return; }
      setCs(choice);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      {!editing ? (
        <div className="flex items-center gap-1.5">
          <Headphones className="h-3 w-3 shrink-0 text-muted" />
          <span className={`text-xs ${cs ? "text-foreground" : "text-muted"}`}>{label}</span>
          <button
            type="button"
            onClick={() => { setChoice(cs); setEditing(true); }}
            disabled={pending}
            className="text-muted hover:text-primary-600 disabled:opacity-50"
            aria-label="เปลี่ยน/ปลด CS"
            title="เปลี่ยน/ปลด CS"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            disabled={pending}
            className="max-w-[160px] rounded border border-border bg-white px-1.5 py-1 text-xs dark:bg-surface"
          >
            <option value="">— ไม่มี CS —</option>
            {csReps.map((r) => (
              <option key={r.adminID} value={r.adminID}>
                {r.nickname ? `${r.nickname} · ` : ""}{r.name} · {r.ownedCount} ลูกค้า
              </option>
            ))}
          </select>
          <button type="button" onClick={save} disabled={pending} className="text-primary-600 disabled:opacity-50" aria-label="บันทึก">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={() => setEditing(false)} disabled={pending} className="text-muted hover:text-foreground" aria-label="ยกเลิก">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {err && <p className="text-[11px] text-red-600">{err}</p>}
    </div>
  );
}

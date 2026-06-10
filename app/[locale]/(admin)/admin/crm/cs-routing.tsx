"use client";

/**
 * CS-routing control — the customer-360's second mutation: see + set the
 * owning CS for a linked customer (tb_users.adminIDCS · migration 0141).
 * Mirror of rep-routing.tsx (the sales control) over the LEGACY CS pool
 * (tb_admin adminStatusA='1' + adminStatusCS='1') — the same pool
 * pickLeastLoadedCsRep auto-assigns from on logLeadCall('closed'). This
 * control is the MANUAL OVERRIDE of that handoff: CEO brief — sale/CS
 * ownership is flexible (a CS can run a job solo; sales can take the CS
 * role), so assigning, changing AND clearing are all allowed.
 *
 * §0f confirm-before-mutate: changing a customer's CS re-routes who follows
 * the customer's orders → confirm dialog before the write.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/ui/confirm";
import { setCustomerCsRep } from "@/actions/admin/crm";
import type { CrmCsRep } from "@/lib/admin/crm-types";
import { Check, Headphones, Loader2 } from "lucide-react";

export function CsRouting({
  userid,
  currentCsId,
  currentCsName,
  reps,
  gateNote,
  canEdit,
}: {
  userid: string;
  /** tb_users.adminIDCS (tb_admin.adminID), or null = no CS. */
  currentCsId: string | null;
  /** Resolved display name for the current CS (fallback when the current CS
   *  isn't in the active pool — e.g. deactivated), or null. */
  currentCsName: string | null;
  reps: CrmCsRep[];
  gateNote: string | null;
  /** false → senior-only action; render read-only with a hint. */
  canEdit: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>(currentCsId ?? "");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const dirty = selected !== (currentCsId ?? "");

  function save() {
    setMsg(null);
    startTransition(async () => {
      // §0f — confirm before mutate (re-routes who follows this customer).
      const target = selected ? reps.find((r) => r.adminID === selected) : null;
      const message = selected
        ? `เปลี่ยน CS ผู้ดูแลของลูกค้า ${userid} เป็น “${target?.name ?? selected}”?`
        : `ล้าง CS ผู้ดูแลของลูกค้า ${userid}?\n(ลูกค้าจะไม่มี CS จนกว่าจะมอบหมายใหม่ หรือระบบมอบหมายอัตโนมัติตอนปิดการขาย)`;
      const ok = await confirm(message, { title: "เปลี่ยน CS ผู้ดูแล" });
      if (!ok) return;

      const res = await setCustomerCsRep({ userid, adminID: selected });
      if (res.ok) {
        setMsg({ kind: "ok", text: "บันทึก CS ผู้ดูแลแล้ว" });
        router.refresh();
      } else {
        setMsg({ kind: "err", text: `บันทึกไม่สำเร็จ: ${res.error}` });
      }
    });
  }

  // No assignable CS → explain the gate (don't render a dead dropdown).
  if (reps.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
        {gateNote ?? "ยังไม่มี CS ให้มอบหมาย"}
      </div>
    );
  }

  if (!canEdit) {
    // Read-only for non-senior roles: show who owns it; no write control.
    const cur = reps.find((r) => r.adminID === currentCsId);
    return (
      <div className="text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <Headphones className="w-3.5 h-3.5" />
          CS ผู้ดูแล: <span className="font-medium text-foreground">{cur?.name ?? currentCsName ?? currentCsId ?? "— ยังไม่มี —"}</span>
        </span>
        <p className="mt-1 text-[10px] text-muted/80">เฉพาะหัวหน้า/ผู้จัดการเปลี่ยน CS ผู้ดูแลได้</p>
      </div>
    );
  }

  // Current CS not in the active pool (deactivated / flag removed) → keep it
  // selectable as-is so the dropdown shows the truth instead of silently
  // jumping to "ไม่มี" (§0f badge-accuracy).
  const currentMissingFromPool =
    Boolean(currentCsId) && !reps.some((r) => r.adminID === currentCsId);

  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-medium text-muted">
        <Headphones className="inline w-3.5 h-3.5 mr-1" />
        CS ผู้ดูแลลูกค้ารายนี้
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={pending}
          className="min-w-0 flex-1 rounded-lg border border-border bg-white dark:bg-surface px-2.5 py-2 text-sm"
        >
          <option value="">— ไม่มี CS ดูแล —</option>
          {currentMissingFromPool && currentCsId && (
            <option value={currentCsId}>
              {currentCsName ?? currentCsId} (ไม่อยู่ในพูล CS แล้ว)
            </option>
          )}
          {reps.map((r) => (
            <option key={r.adminID} value={r.adminID}>
              {r.name}
              {r.nickname ? ` (${r.nickname})` : ""} · {r.ownedCount.toLocaleString("th-TH")} ลูกค้า
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          บันทึก
        </button>
      </div>
      {msg && (
        <p className={`text-[11px] ${msg.kind === "ok" ? "text-green-700" : "text-red-700"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

"use client";

/**
 * Rep-routing control — the CRM's ONE mutation: see + set the owning sales rep
 * for a linked customer (tb_users.adminIDSale). Used inside the customer-360
 * panel. Renders a rep <select> + a "บันทึก" button; on save it calls
 * setCustomerSalesRep, shows a toast, and refreshes the route (revalidatePath
 * in the action re-pulls the 360 panel + conversation list).
 *
 * When no assignable reps exist (the 13-admin recreate per ADR-0022 hasn't
 * happened), we show the gate note instead of a broken dropdown.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCustomerSalesRep } from "@/actions/admin/crm";
import type { CrmRep } from "@/lib/admin/crm-types";
import { Check, UserCog, Loader2 } from "lucide-react";

export function RepRouting({
  userid,
  currentRepLegacyId,
  reps,
  gateNote,
  canEdit,
}: {
  userid: string;
  currentRepLegacyId: string | null;
  reps: CrmRep[];
  gateNote: string | null;
  /** false → senior-only action; render read-only with a hint. */
  canEdit: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>(currentRepLegacyId ?? "");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const dirty = selected !== (currentRepLegacyId ?? "");

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await setCustomerSalesRep({ userid, legacyId: selected });
      if (res.ok) {
        setMsg({ kind: "ok", text: "บันทึกเซลล์ผู้ดูแลแล้ว" });
        router.refresh();
      } else {
        setMsg({ kind: "err", text: `บันทึกไม่สำเร็จ: ${res.error}` });
      }
    });
  }

  // No assignable reps → explain the gate (don't render a dead dropdown).
  if (reps.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
        {gateNote ?? "ยังไม่มีเซลล์ให้มอบหมาย"}
      </div>
    );
  }

  if (!canEdit) {
    // Read-only for non-senior roles: show who owns it; no write control.
    const cur = reps.find((r) => r.legacyId === currentRepLegacyId);
    return (
      <div className="text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <UserCog className="w-3.5 h-3.5" />
          เซลล์ผู้ดูแล: <span className="font-medium text-foreground">{cur?.name ?? currentRepLegacyId ?? "— ยังไม่มี —"}</span>
        </span>
        <p className="mt-1 text-[10px] text-muted/80">เฉพาะหัวหน้า/ผู้จัดการเปลี่ยนเซลล์ผู้ดูแลได้</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-medium text-muted">
        <UserCog className="inline w-3.5 h-3.5 mr-1" />
        เซลล์ผู้ดูแลลูกค้ารายนี้
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={pending}
          className="min-w-0 flex-1 rounded-lg border border-border bg-white dark:bg-surface px-2.5 py-2 text-sm"
        >
          <option value="">— ไม่มีเซลล์ดูแล —</option>
          {reps.map((r) => (
            <option key={r.legacyId} value={r.legacyId}>
              {r.name} ({r.ownedCount.toLocaleString("th-TH")} ลูกค้า)
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

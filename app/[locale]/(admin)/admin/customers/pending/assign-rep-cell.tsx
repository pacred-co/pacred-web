"use client";

/**
 * AssignRepCell — per-row sales + CS assignment for the pending-approval queue.
 *
 * Owner directive (2026-06-11): when a customer signs up they must surface at
 * /admin/customers so sales can "ตรวจสอบ + โทรกลับ + แบ่ง cs ดูแล" RIGHT FROM
 * THIS PAGE — without opening the detail screen first. This compact cell wires
 * the two existing CRM mutations (setCustomerSalesRep · setCustomerCsRep) into
 * each pending row.
 *
 * Reuses:
 *   - getCrmReps / getCrmCsReps lists (loaded once in the page server component,
 *     passed down) — NO new assignment logic.
 *   - confirm() (global host mounted in the root layout) for §0f
 *     confirm-before-mutate.
 *
 * Gating: rendered only when `canAssign` (super / manager / sales_admin —
 * matches ROUTING_ROLES in actions/admin/crm.ts). Other roles see a static
 * "ดูเท่านั้น" hint so the column stays aligned.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/ui/confirm";
import { setCustomerSalesRep, setCustomerCsRep } from "@/actions/admin/crm";
import type { CrmRep, CrmCsRep } from "@/lib/admin/crm-types";
import { Check, Loader2, UserCog, Headset } from "lucide-react";

export function AssignRepCell({
  userid,
  currentRepLegacyId,
  currentCsAdminId,
  reps,
  csReps,
  repsGateNote,
  csGateNote,
  canAssign,
}: {
  userid: string;
  currentRepLegacyId: string | null;
  currentCsAdminId: string | null;
  reps: CrmRep[];
  csReps: CrmCsRep[];
  repsGateNote: string | null;
  csGateNote: string | null;
  /** false → render read-only hint (non-senior role). */
  canAssign: boolean;
}) {
  const router = useRouter();
  const [sale, setSale] = useState<string>(currentRepLegacyId ?? "");
  const [cs, setCs] = useState<string>(currentCsAdminId ?? "");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  if (!canAssign) {
    const repName = reps.find((r) => r.legacyId === currentRepLegacyId)?.name ?? currentRepLegacyId;
    const csName = csReps.find((r) => r.adminID === currentCsAdminId)?.name ?? currentCsAdminId;
    return (
      <div className="text-[11px] text-muted leading-relaxed">
        <div>เซล: <span className="text-foreground">{repName || "—"}</span></div>
        <div>CS: <span className="text-foreground">{csName || "—"}</span></div>
        <p className="mt-0.5 text-[11px] text-muted/70">เฉพาะหัวหน้า/เซลแอดมินมอบหมายได้</p>
      </div>
    );
  }

  const saleDirty = sale !== (currentRepLegacyId ?? "");
  const csDirty = cs !== (currentCsAdminId ?? "");
  const dirty = saleDirty || csDirty;

  function save() {
    setMsg(null);
    startTransition(async () => {
      // §0f — confirm before mutate (assigns who owns/serves this customer).
      const repName = sale ? reps.find((r) => r.legacyId === sale)?.name ?? sale : null;
      const csName = cs ? csReps.find((r) => r.adminID === cs)?.name ?? cs : null;
      const lines: string[] = [];
      if (saleDirty) lines.push(repName ? `เซลผู้ดูแล → “${repName}”` : "ล้างเซลผู้ดูแล");
      if (csDirty) lines.push(csName ? `CS ผู้ดูแล → “${csName}”` : "ล้าง CS ผู้ดูแล");
      const ok = await confirm(
        `มอบหมายลูกค้า ${userid}?\n\n${lines.join("\n")}`,
        { title: "มอบหมายผู้ดูแล" },
      );
      if (!ok) return;

      // Apply only the dirty field(s). Both share tb_users; run sequentially so
      // a partial failure is clear.
      let failed: string | null = null;
      if (saleDirty) {
        const res = await setCustomerSalesRep({ userid, legacyId: sale });
        if (!res.ok) failed = `เซล: ${res.error}`;
      }
      if (!failed && csDirty) {
        const res = await setCustomerCsRep({ userid, adminID: cs });
        if (!res.ok) failed = `CS: ${res.error}`;
      }

      if (failed) {
        setMsg({ kind: "err", text: `บันทึกไม่สำเร็จ — ${failed}` });
      } else {
        setMsg({ kind: "ok", text: "มอบหมายแล้ว" });
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-1.5 min-w-[180px]">
      {/* Sales rep */}
      {reps.length === 0 ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400">
          {repsGateNote ?? "ยังไม่มีเซลให้มอบหมาย"}
        </p>
      ) : (
        <label className="flex items-center gap-1">
          <UserCog className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="เซลผู้ดูแล" />
          <select
            value={sale}
            onChange={(e) => setSale(e.target.value)}
            disabled={pending}
            className="w-full rounded border border-border bg-white dark:bg-surface px-1.5 py-1 text-[11px]"
            aria-label={`เซลผู้ดูแลของ ${userid}`}
          >
            <option value="">— เลือกเซล —</option>
            {reps.map((r) => (
              <option key={r.legacyId} value={r.legacyId}>
                {r.name} ({r.ownedCount})
              </option>
            ))}
          </select>
        </label>
      )}

      {/* CS rep */}
      {csReps.length === 0 ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400">
          {csGateNote ?? "ยังไม่มี CS ให้มอบหมาย"}
        </p>
      ) : (
        <label className="flex items-center gap-1">
          <Headset className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="CS ผู้ดูแล" />
          <select
            value={cs}
            onChange={(e) => setCs(e.target.value)}
            disabled={pending}
            className="w-full rounded border border-border bg-white dark:bg-surface px-1.5 py-1 text-[11px]"
            aria-label={`CS ผู้ดูแลของ ${userid}`}
          >
            <option value="">— เลือก CS —</option>
            {csReps.map((r) => (
              <option key={r.adminID} value={r.adminID}>
                {r.nickname ? `${r.nickname} (${r.name})` : r.name} ({r.ownedCount})
              </option>
            ))}
          </select>
        </label>
      )}

      <button
        type="button"
        onClick={save}
        disabled={!dirty || pending}
        className="inline-flex items-center gap-1 rounded bg-primary-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        บันทึกผู้ดูแล
      </button>

      {msg && (
        <p className={`text-[11px] ${msg.kind === "ok" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

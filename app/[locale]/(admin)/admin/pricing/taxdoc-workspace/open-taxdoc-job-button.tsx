"use client";

/**
 * <OpenTaxdocJobButton> — materialise a tb_cargo_taxdoc_job row for an
 * arrived import-forwarder (or shop order) that has a doc-mode preference
 * but no workspace job yet, then navigate to its detail. Idempotent on the
 * server (ensureJobRow). Confirm-before-mutate (AGENTS.md §0f).
 *
 * Opening a job is a no-money, no-issuance bookkeeping action — it just
 * stands up the 4-role workflow record. The server re-checks RBAC.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPlus } from "lucide-react";
import { adminEnsureCargoTaxdocJob } from "@/actions/admin/cargo-taxdoc-workspace";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

export function OpenTaxdocJobButton({ fid, hno }: { fid?: number; hno?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const { confirm, dialogs } = useConfirmDialogs();

  async function onClick() {
    setErr(null);
    const ok = await confirm(
      "เปิดงานออกเอกสาร (Tax-doc Workspace) สำหรับออเดอร์นี้?\n" +
        "จะสร้างบันทึกงาน 4 บทบาท (CS / Pricing / Docs / Account) — ไม่กระทบเงิน/สถานะ/แจ้งเตือน.",
    );
    if (!ok) return;

    startTransition(async () => {
      const res = await adminEnsureCargoTaxdocJob({ fid, hno });
      if (res.ok && res.data?.id) {
        router.push(`/admin/pricing/taxdoc-workspace/${res.data.id}`);
      } else {
        setErr(res.ok ? "ไม่ได้รับรหัสงาน" : res.error);
      }
    });
  }

  return (
    <>
      {dialogs}
      <button
        type="button"
        disabled={pending}
        onClick={onClick}
        className="inline-flex items-center gap-1 rounded-md bg-primary-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
      >
        <ClipboardPlus className="h-3.5 w-3.5" />
        {pending ? "กำลังเปิด…" : "เปิดงาน"}
      </button>
      {err && <p className="mt-1 text-[10px] text-red-600">⚠ {err}</p>}
    </>
  );
}

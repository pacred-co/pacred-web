"use client";

/**
 * <TaxdocStageActions> — the 4-role state machine UI for one CARGO tax-doc
 * job. Each stage (CS / Pricing / Docs / Account) shows its current status +
 * advance buttons (เริ่ม → เสร็จ / รีเซ็ต). Only the viewer's authorised
 * stages are interactive; the rest are read-only. The ACCOUNT stage cannot
 * be set "done" until CS + Pricing are both done (mirrors the server gate).
 *
 * Confirm-before-mutate (AGENTS.md §0f). Each advance calls ONLY
 * adminAdvanceCargoTaxdocStage — no money / issuance / comms.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminAdvanceCargoTaxdocStage,
  type TaxdocStage,
  type TaxdocStageStatus,
} from "@/actions/admin/cargo-taxdoc-workspace";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

const STAGE_META: Record<TaxdocStage, { label: string; num: string; tone: string; accent: string }> = {
  cs:      { label: "CS · ขาย (SELLING)",      num: "1", tone: "text-blue-700",    accent: "border-blue-200 bg-blue-50/40" },
  pricing: { label: "Pricing · ต้นทุน (COST)", num: "2", tone: "text-emerald-700", accent: "border-emerald-200 bg-emerald-50/40" },
  docs:    { label: "Docs · สำแดง (DECLARED)", num: "3", tone: "text-purple-700",  accent: "border-purple-200 bg-purple-50/40" },
  account: { label: "Account · ปิดงาน (PEAK)", num: "4", tone: "text-amber-700",   accent: "border-amber-200 bg-amber-50/40" },
};

function statusLabel(s: TaxdocStageStatus): string {
  if (s === "done") return "เสร็จแล้ว";
  if (s === "in_progress") return "กำลังทำ";
  return "ยังไม่เริ่ม";
}
function statusCls(s: TaxdocStageStatus): string {
  if (s === "done") return "bg-green-100 text-green-700 border-green-300";
  if (s === "in_progress") return "bg-amber-100 text-amber-700 border-amber-300";
  return "bg-gray-100 text-gray-500 border-gray-200";
}

export function TaxdocStageActions({
  jobId,
  csStatus, pricingStatus, docsStatus, accountStatus,
  canCs, canPricing, canDocs, canAccount,
  accountUnlocked,
}: {
  jobId: string;
  csStatus: TaxdocStageStatus;
  pricingStatus: TaxdocStageStatus;
  docsStatus: TaxdocStageStatus;
  accountStatus: TaxdocStageStatus;
  canCs: boolean;
  canPricing: boolean;
  canDocs: boolean;
  canAccount: boolean;
  accountUnlocked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const { confirm, dialogs } = useConfirmDialogs();

  const stages: Array<{ stage: TaxdocStage; status: TaxdocStageStatus; canEdit: boolean; locked?: boolean }> = [
    { stage: "cs",      status: csStatus,      canEdit: canCs },
    { stage: "pricing", status: pricingStatus, canEdit: canPricing },
    { stage: "docs",    status: docsStatus,    canEdit: canDocs },
    { stage: "account", status: accountStatus, canEdit: canAccount, locked: !accountUnlocked },
  ];

  async function advance(stage: TaxdocStage, status: TaxdocStageStatus) {
    setErr(null);
    const meta = STAGE_META[stage];
    const ok = await confirm(
      `อัปเดตสถานะ "${meta.label}" → ${statusLabel(status)}?\n` +
        "ภายในเท่านั้น · ไม่กระทบเงิน/เอกสารจริง/แจ้งเตือนลูกค้า · บันทึก audit.",
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await adminAdvanceCargoTaxdocStage({ jobId, stage, status });
      if (res.ok) router.refresh();
      else setErr(res.error);
    });
  }

  return (
    <div className="space-y-3">
      {dialogs}
      {err && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">⚠ {err}</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {stages.map(({ stage, status, canEdit, locked }) => {
          const meta = STAGE_META[stage];
          return (
            <div key={stage} className={`rounded-2xl border ${meta.accent} p-3.5`}>
              <div className="flex items-center justify-between gap-2">
                <p className={`text-sm font-bold ${meta.tone}`}>
                  <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px]">{meta.num}</span>
                  {meta.label}
                </p>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusCls(status)}`}>
                  {statusLabel(status)}
                </span>
              </div>

              {locked && (
                <p className="mt-2 text-[11px] text-amber-700">🔒 ปิดงานได้เมื่อ CS + Pricing เสร็จก่อน</p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {canEdit ? (
                  <>
                    {status !== "in_progress" && status !== "done" && (
                      <button type="button" disabled={pending}
                        onClick={() => advance(stage, "in_progress")}
                        className="rounded-md border border-border bg-white px-2.5 py-1 text-[11px] font-medium hover:bg-surface-alt disabled:opacity-50">
                        เริ่มทำ
                      </button>
                    )}
                    {status !== "done" && (
                      <button type="button"
                        disabled={pending || (stage === "account" && !!locked)}
                        onClick={() => advance(stage, "done")}
                        className="rounded-md bg-primary-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
                        ทำเสร็จ ✓
                      </button>
                    )}
                    {status !== "" && (
                      <button type="button" disabled={pending}
                        onClick={() => advance(stage, "")}
                        className="rounded-md border border-border px-2.5 py-1 text-[11px] text-muted hover:bg-surface-alt disabled:opacity-50">
                        รีเซ็ต
                      </button>
                    )}
                  </>
                ) : (
                  <span className="text-[11px] text-muted">อ่านอย่างเดียว (ไม่มีสิทธิ์บทบาทนี้)</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

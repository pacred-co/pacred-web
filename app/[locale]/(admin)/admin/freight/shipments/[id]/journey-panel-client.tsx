"use client";

/**
 * <FreightJourneyPanel> — the per-flavour JOURNEY timeline + advance control on
 * the shipment detail page (G2/G7/G8 · brief §1c/§1e).
 *
 * Renders the 3-phase stage strip (ต้นทาง → ระหว่างทาง → ปลายทาง · 🟢 done / 🔵
 * current / เทา future) fed by the SOT (journey-catalog) + the shipment's
 * journey_status + milestone dates, PLUS:
 *   - the advance-status control: ONLY the codes this role may set are offered
 *     (server-authoritative `settableCodes` passed in) · §0f confirm before fire
 *   - the RED-overlay control (issue_flag + reason) · §0f confirm
 *
 * §0g self-explaining · §0h text ≥ 11px + size/weight/colour hierarchy.
 *
 * MONEY-UNTOUCHED: this panel calls only advanceFreightStatus / setFreightRedFlag,
 * which mutate journey/issue/milestone columns only — never money.
 */

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import {
  advanceFreightStatus,
  setFreightRedFlag,
} from "@/actions/admin/freight-shipment-workflow";
import {
  JOURNEY_CODE_META,
  ISSUE_FLAG_LABEL,
  ISSUE_FLAGS,
  type JourneyCode,
  type IssueFlag,
} from "@/lib/freight/journey-catalog";
import type { JourneyStepView } from "@/lib/freight/shipment-journey-view";

const TONE_DOT: Record<JourneyStepView["tone"], string> = {
  neutral: "bg-gray-400",
  info:    "bg-blue-500",
  action:  "bg-amber-500",
  ok:      "bg-emerald-500",
  danger:  "bg-red-500",
};

function stepDot(step: JourneyStepView): string {
  if (step.state === "done") return "bg-emerald-500";
  if (step.state === "current") return `${TONE_DOT[step.tone]} animate-pulse`;
  return "bg-gray-300";
}

export function FreightJourneyPanel({
  shipmentId,
  modeLabel,
  headline,
  steps,
  current,
  settableCodes,
  issueFlag,
  issueNote,
  canFlag,
}: {
  shipmentId: string;
  modeLabel: string;
  headline: string;
  steps: JourneyStepView[];
  current: JourneyCode | null;
  /** Codes the CALLER may advance to (server-authoritative). */
  settableCodes: JourneyCode[];
  issueFlag: IssueFlag;
  issueNote: string | null;
  /** Whether the caller may raise/clear the RED flag. */
  canFlag: boolean;
}) {
  const router = useRouter();
  const { confirm, alert, dialogs } = useConfirmDialogs();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<JourneyCode | "">("");
  const [milestoneDate, setMilestoneDate] = useState("");
  const [note, setNote] = useState("");

  // RED-flag form state
  const [flagSel, setFlagSel] = useState<IssueFlag>(issueFlag);
  const [flagReason, setFlagReason] = useState(issueNote ?? "");

  function doAdvance() {
    if (!selected) return;
    const meta = JOURNEY_CODE_META[selected];
    startTransition(async () => {
      const ok = await confirm(
        `ยืนยันเปลี่ยนสถานะงานเป็น "${meta.labelTh}"?\n` +
          (meta.milestoneField
            ? `จะบันทึกวันที่ ${milestoneDate || "วันนี้"} เป็น milestone ของขั้นตอนนี้`
            : "ขั้นตอนนี้ไม่มีการบันทึกวันที่ milestone"),
      );
      if (!ok) return;
      const res = await advanceFreightStatus({
        shipmentId,
        toStatus: selected,
        note: note.trim() || undefined,
        milestoneDate: milestoneDate || undefined,
      });
      if (!res.ok) {
        await alert(`เปลี่ยนสถานะไม่สำเร็จ: ${humanError(res.error)}`);
        return;
      }
      setSelected("");
      setMilestoneDate("");
      setNote("");
      router.refresh();
    });
  }

  function doSetFlag() {
    startTransition(async () => {
      const label = ISSUE_FLAG_LABEL[flagSel];
      const ok = await confirm(
        flagSel === "none"
          ? "ยืนยันเคลียร์สถานะปัญหา (กลับเป็นปกติ)?"
          : `ยืนยันตั้งธงปัญหา "${label}" ทับสถานะปัจจุบัน?`,
      );
      if (!ok) return;
      const res = await setFreightRedFlag({
        shipmentId,
        flag: flagSel,
        reason: flagSel === "none" ? undefined : flagReason.trim() || undefined,
      });
      if (!res.ok) {
        await alert(`ตั้งธงปัญหาไม่สำเร็จ: ${humanError(res.error)}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
      {dialogs}

      {/* Header band — the at-a-glance "ถึงไหนแล้ว" answer + RED overlay */}
      <div
        className={`rounded-t-2xl px-4 lg:px-6 py-3 border-b border-border ${
          issueFlag !== "none" ? "bg-red-50 dark:bg-red-900/20" : "bg-surface-alt/40"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold flex items-center gap-2">🗺️ เส้นทางงาน (Journey)</h2>
          <span className="text-[11px] text-muted">{modeLabel}</span>
        </div>
        <p className="mt-1 text-sm font-medium text-foreground">{headline}</p>
        {current == null && (
          <p className="mt-0.5 text-[11px] text-muted">
            งานนี้ยังไม่ได้ตั้งสถานะเส้นทาง — เลือกขั้นตอนแรกทางด้านขวา
          </p>
        )}
        {issueFlag !== "none" && (
          <p className="mt-1 text-sm font-semibold text-red-700 dark:text-red-300">
            {ISSUE_FLAG_LABEL[issueFlag]}
            {issueNote && <span className="font-normal"> — {issueNote}</span>}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 lg:p-6">
        {/* ── Timeline (2/3) ── */}
        <div className="lg:col-span-2">
          {steps.length === 0 ? (
            <p className="text-sm text-muted">ไม่พบ pipeline ของประเภทขนส่งนี้</p>
          ) : (
            <ol className="relative">
              {steps.map((s, i) => {
                const isLast = i === steps.length - 1;
                return (
                  <li key={s.code} className="relative flex gap-3 pb-4 last:pb-0">
                    {/* phase divider */}
                    {s.phaseStart && (
                      <span className="absolute -top-1 left-8 text-[11px] font-semibold uppercase tracking-wide text-muted">
                        {s.phaseLabel}
                      </span>
                    )}
                    {!isLast && (
                      <span
                        aria-hidden
                        className={`absolute left-[11px] top-6 bottom-0 w-px ${
                          s.state === "done" ? "bg-emerald-300" : "bg-border"
                        }`}
                      />
                    )}
                    <span
                      aria-hidden
                      className={`relative z-10 ${s.phaseStart ? "mt-5" : "mt-0.5"} h-6 w-6 shrink-0 rounded-full ring-4 ${
                        s.state === "current" ? "ring-blue-100" : s.state === "done" ? "ring-emerald-100" : "ring-gray-100"
                      } ${stepDot(s)}`}
                    />
                    <div className={`min-w-0 flex-1 ${s.phaseStart ? "mt-5" : ""}`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <span
                          className={`text-sm ${
                            s.state === "current"
                              ? "font-semibold text-blue-700"
                              : s.state === "done"
                                ? "text-foreground"
                                : "text-muted"
                          }`}
                        >
                          {s.labelTh}
                          {!s.showCustomer && (
                            <span className="ml-1.5 rounded bg-gray-100 px-1 py-0.5 text-[11px] font-normal text-gray-500">
                              ภายใน
                            </span>
                          )}
                        </span>
                        <span
                          className={`text-xs ${
                            s.date ? "text-emerald-700 font-medium" : "text-muted"
                          }`}
                        >
                          {s.date ?? (s.state === "pending" ? "—" : "")}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* ── Controls (1/3) ── */}
        <div className="lg:col-span-1 space-y-4">
          {/* Advance status */}
          <div className="rounded-xl border border-border bg-surface-alt/30 p-3">
            <p className="text-sm font-semibold mb-2">เปลี่ยนสถานะงาน</p>
            {settableCodes.length === 0 ? (
              <p className="text-[11px] text-muted">
                คุณไม่มีสิทธิ์เปลี่ยนสถานะในขั้นตอนถัดไปของงานนี้ (ตามตำแหน่ง)
              </p>
            ) : (
              <div className="space-y-2">
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value as JourneyCode | "")}
                  disabled={pending}
                  className="w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm"
                >
                  <option value="">— เลือกขั้นตอนถัดไป —</option>
                  {settableCodes.map((c) => (
                    <option key={c} value={c}>
                      {JOURNEY_CODE_META[c].labelTh}
                    </option>
                  ))}
                </select>
                {selected && JOURNEY_CODE_META[selected].milestoneField && (
                  <label className="block text-[11px] text-muted">
                    วันที่ milestone (เว้นว่าง = วันนี้)
                    <input
                      type="date"
                      value={milestoneDate}
                      onChange={(e) => setMilestoneDate(e.target.value)}
                      disabled={pending}
                      className="mt-0.5 w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm"
                    />
                  </label>
                )}
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="หมายเหตุ (ไม่บังคับ)"
                  disabled={pending}
                  maxLength={1000}
                  className="w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={doAdvance}
                  disabled={pending || !selected}
                  className="w-full rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {pending ? "กำลังบันทึก…" : "บันทึกสถานะ"}
                </button>
              </div>
            )}
          </div>

          {/* RED overlay flag */}
          {canFlag && (
            <div className="rounded-xl border border-border bg-surface-alt/30 p-3">
              <p className="text-sm font-semibold mb-2">ธงปัญหา (ทับสถานะ)</p>
              <div className="space-y-2">
                <select
                  value={flagSel}
                  onChange={(e) => setFlagSel(e.target.value as IssueFlag)}
                  disabled={pending}
                  className="w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm"
                >
                  {ISSUE_FLAGS.map((f) => (
                    <option key={f} value={f}>
                      {ISSUE_FLAG_LABEL[f]}
                    </option>
                  ))}
                </select>
                {flagSel !== "none" && (
                  <input
                    type="text"
                    value={flagReason}
                    onChange={(e) => setFlagReason(e.target.value)}
                    placeholder="เหตุผล (อย่างน้อย 3 ตัวอักษร)"
                    disabled={pending}
                    maxLength={1000}
                    className="w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm"
                  />
                )}
                <button
                  type="button"
                  onClick={doSetFlag}
                  disabled={pending}
                  className={`w-full rounded-lg px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50 ${
                    flagSel === "none" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
                  }`}
                >
                  {pending ? "กำลังบันทึก…" : flagSel === "none" ? "เคลียร์ธงปัญหา" : "ตั้งธงปัญหา"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function humanError(code: string): string {
  switch (code) {
    case "schema_not_migrated":
      return "ฟีเจอร์สถานะ journey ยังไม่ถูกเปิดใช้ในฐานข้อมูล (รอ migration)";
    case "role_not_permitted_for_status":
      return "ตำแหน่งของคุณไม่มีสิทธิ์ตั้งสถานะนี้";
    case "already_at_status":
      return "งานอยู่ที่สถานะนี้แล้ว";
    case "shipment_cancelled":
      return "งานนี้ถูกยกเลิกแล้ว";
    case "not_found":
      return "ไม่พบงาน";
    default:
      return code;
  }
}

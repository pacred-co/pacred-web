"use client";

/**
 * <ForwarderDocTierConfirmClient> — the per-order doc-tier-discount ติ๊กยืนยัน
 * (owner-locked · ภูม 2026-06-18 · C · mig 0188).
 *
 * The owner-locked cargo doc-tier discount (฿800/CBM off เรือ 3,700→2,900 /
 * รถ 5,700→4,900) needs ALL THREE: ฝากโอน AND ฝากนำเข้า AND (ใบกำกับ OR ใบขน). C1
 * (ฝากโอน) is not derivable from a tb_forwarder row, so a pricing-authority admin
 * confirms it per-order here (writes tb_forwarder.doc_tier_confirmed via the
 * audited adminSetForwarderDocTierConfirmed). This is the C1 signal the pricing
 * engine ANDs (lib/forwarder/doc-tier-discount.ts::isDocTierEligible).
 *
 * DORMANT-SAFE: the toggle only sets the flag; the discount stays ฿0 until the
 * owner flips business_config cargo.doc_tier_discount.enabled. The hint makes the
 * dormant-vs-live state explicit so staff aren't misled.
 *
 * §0f confirm-before-mutate: flipping the flag (a money-discount decision) goes
 * through a confirm dialog.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, AlertTriangle, Info } from "lucide-react";
import { adminSetForwarderDocTierConfirmed } from "@/actions/admin/forwarders-field-edits";
import { confirm } from "@/components/ui/confirm";

type Props = {
  fId: number;
  initialConfirmed: boolean;
  /** C3 — tax_doc_pref ∈ {ใบกำกับ, ใบขน}. */
  taxDocEligible: boolean;
  /** ฿/CBM discount amount (raw config · may be shown even while dormant). */
  discountCbm: number;
  /** Whether the discount is LIVE (business_config enabled) vs dormant. */
  enabled: boolean;
};

function fmt(n: number): string {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

export function ForwarderDocTierConfirmClient({
  fId,
  initialConfirmed,
  taxDocEligible,
  discountCbm,
  enabled,
}: Props) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // All 3 conditions met → would qualify (C2 ฝากนำเข้า is implicit for any
  // tb_forwarder row). The actual ฿ effect ALSO needs the discount enabled.
  const allConditionsMet = confirmed && taxDocEligible;

  async function onToggle() {
    setError(null);
    const next = !confirmed;
    const msg = next
      ? `ยืนยันว่าออเดอร์ #${fId} เข้าเงื่อนไขส่วนลดเอกสาร?\n\nต้องครบ 3 เงื่อนไข:\n• ฝากโอน (โอนหยวน)\n• ฝากนำเข้า\n• เปิดใบกำกับ/ใบขน\n\n(${enabled ? `ระบบจะลดค่าขนส่ง ฿${fmt(discountCbm)}/คิว ตอนคำนวณราคาครั้งถัดไป` : "ส่วนลดยังไม่เปิดใช้งาน — ยืนยันไว้ก่อนได้"})`
      : `ยกเลิกการยืนยันส่วนลดเอกสารของออเดอร์ #${fId}?`;
    if (!(await confirm(msg))) return;

    startTransition(async () => {
      const res = await adminSetForwarderDocTierConfirmed({ fId, confirmed: next });
      if (!res.ok) {
        setError(res.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setConfirmed(next);
      router.refresh();
    });
  }

  // ── Status line (the smart hint) ──
  let hint: { cls: string; icon: React.ReactNode; text: string };
  if (allConditionsMet && enabled && discountCbm > 0) {
    hint = {
      cls: "border-emerald-200 bg-emerald-50 text-emerald-800",
      icon: <FileCheck2 className="h-4 w-4 text-emerald-600" />,
      text: `เข้าเงื่อนไขครบ — ลดค่าขนส่ง ฿${fmt(discountCbm)}/คิว (มีผลตอนคำนวณราคาครั้งถัดไป)`,
    };
  } else if (allConditionsMet && !enabled) {
    hint = {
      cls: "border-amber-200 bg-amber-50 text-amber-800",
      icon: <Info className="h-4 w-4 text-amber-600" />,
      text: `เข้าเงื่อนไขครบแล้ว — แต่ส่วนลดเอกสารยังไม่เปิดใช้งาน (รอเปิดระบบ · ยืนยันไว้ก่อนได้)`,
    };
  } else if (confirmed && !taxDocEligible) {
    hint = {
      cls: "border-amber-200 bg-amber-50 text-amber-800",
      icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
      text: `ยืนยันฝากโอนแล้ว — แต่ยังต้องเปลี่ยนเอกสารเป็น “ใบกำกับ/ใบขน” ให้ครบเงื่อนไข`,
    };
  } else if (!confirmed && taxDocEligible) {
    hint = {
      cls: "border-sky-200 bg-sky-50 text-sky-800",
      icon: <Info className="h-4 w-4 text-sky-600" />,
      text: `อาจเข้าเงื่อนไขส่วนลดเอกสาร${discountCbm > 0 ? ` (฿${fmt(discountCbm)}/คิว)` : ""} — ติ๊กยืนยันถ้าลูกค้า ฝากโอน + ฝากนำเข้า + เปิดใบกำกับ/ใบขน ครบ`,
    };
  } else {
    hint = {
      cls: "border-border bg-surface-alt/40 text-muted",
      icon: <Info className="h-4 w-4 text-muted" />,
      text: `ออเดอร์นี้ยังไม่เข้าเงื่อนไขส่วนลดเอกสาร (ต้องเปิดใบกำกับ/ใบขน + ฝากโอน)`,
    };
  }

  const cond = (ok: boolean, label: string) => (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border bg-white text-muted"}`}>
      {ok ? "✓" : "○"} {label}
    </span>
  );

  return (
    <section className="rounded-2xl border border-border border-l-4 border-l-teal-400 bg-white dark:bg-surface shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileCheck2 className="h-4 w-4 text-teal-500" />
        <h3 className="text-sm font-semibold tracking-wide">ส่วนลดเอกสาร (doc-tier) · ยืนยันเงื่อนไข</h3>
        {!enabled && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">ยังไม่เปิดใช้งาน</span>
        )}
      </div>

      {/* 3-condition checklist */}
      <div className="flex flex-wrap gap-1.5">
        {cond(true, "ฝากนำเข้า")}
        {cond(taxDocEligible, "ใบกำกับ/ใบขน")}
        {cond(confirmed, "ยืนยันฝากโอน")}
      </div>

      {/* smart hint */}
      <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${hint.cls}`}>
        <span className="mt-0.5 shrink-0">{hint.icon}</span>
        <span>{hint.text}</span>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">⚠ {error}</div>}

      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${
          confirmed
            ? "border border-border bg-white text-foreground hover:bg-surface-alt"
            : "bg-teal-600 text-white hover:bg-teal-700"
        }`}
      >
        {pending ? "กำลังบันทึก..." : confirmed ? "ยกเลิกการยืนยัน" : "✓ ยืนยันเข้าเงื่อนไขส่วนลด"}
      </button>
    </section>
  );
}

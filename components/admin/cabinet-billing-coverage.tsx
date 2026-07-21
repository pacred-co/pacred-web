/**
 * <CabinetBillingCoverageStrip> / <CabinetBillingCoverageChip> — "ตู้นี้ MOMO บิลครบยัง".
 *
 * MOMO bills us PER TRACKING in rounds; we คตัดจ่าย per CONTAINER once. This surfaces, at a
 * glance, whether MOMO has finished billing a container — so an accountant does not pay the
 * container total while some rows still carry an ESTIMATED cost (partial-round overpay).
 *
 * Presentation only (no I/O · no "use client"). Coverage is computed by
 * lib/admin/cabinet-billing-coverage.ts and passed in as props. Money figures (Σ real / Σ
 * stored) render ONLY when `showMoney` — the ครบ/ขาด state itself is never a ฿ figure.
 *
 * The "ยังไม่มีข้อมูลใบ" state = a container costed BEFORE the provenance table existed
 * (legacy / estimated cost). It is rendered as neutral, NEVER as a false "ขาด".
 *
 * §0g self-explaining · §0h readable type (≥ text-[11px]).
 */

import type { CabinetBillingCoverage, CabinetBillingState } from "@/lib/admin/cabinet-billing-coverage";

const baht = (n: number) =>
  `฿${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// state → chip color (solid, reads at-a-glance per §0h) + neutral tone for "no data".
const STATE_CHIP: Record<CabinetBillingState, string> = {
  covered: "bg-emerald-600 text-emerald-50 border border-emerald-700",
  partial: "bg-amber-500 text-amber-950 border border-amber-700",
  no_invoice_data: "bg-slate-200 text-slate-600 border border-slate-300",
};

/**
 * A single small pill — for the cnt-hs LIST rows (a tb_cnt payment spanning N ตู้ rolls up
 * to one chip via rollupCabinetCoverages). Decoupled from the full coverage shape.
 */
export function CabinetBillingCoverageChip({
  state,
  label,
  title,
}: {
  state: CabinetBillingState;
  label: string;
  title?: string;
}) {
  return (
    <span
      title={title ?? "ความครบของใบแจ้งหนี้ MOMO — MOMO บิลเราเป็นแทรคกิ้ง แต่จ่ายเป็นตู้"}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATE_CHIP[state]}`}
    >
      {label}
    </span>
  );
}

/**
 * The full strip — one self-explaining row per container. Mounted BEFORE staff คตัดจ่าย
 * (report-cnt actionPay panel) and on the cnt-hs/[id] payment detail.
 */
export function CabinetBillingCoverageStrip({
  coverages,
  showMoney,
  title = "ความครบของใบแจ้งหนี้ MOMO (ตัดจ่ายค่าตู้)",
}: {
  coverages: CabinetBillingCoverage[];
  showMoney: boolean;
  title?: string;
}) {
  if (coverages.length === 0) return null;
  const anyPartial = coverages.some((c) => c.state === "partial");

  return (
    <section className="rounded-xl border border-border bg-white dark:bg-surface p-3 space-y-2 text-[11px]">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <span className="text-[11px] text-muted">MOMO บิลเราเป็นแทรคกิ้ง · เราจ่ายเป็นตู้</span>
      </div>

      <ul className="space-y-1.5">
        {coverages.map((c) => (
          <li
            key={c.cabinet}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border/60 px-2 py-1.5"
          >
            <span className="font-mono text-xs font-semibold text-foreground">{c.cabinet}</span>
            <CabinetBillingCoverageChip state={c.state} label={c.chipLabel} />
            {c.state === "no_invoice_data" ? (
              <span className="text-muted">ลงต้นทุนก่อนมีระบบติดตามใบ — ยังไม่รู้ว่า MOMO บิลครบยัง</span>
            ) : (
              <span className="text-muted">
                MOMO บิลจริงแล้ว <span className="font-semibold text-foreground">{c.billedRows}/{c.totalRows}</span> แทรคกิ้ง
                {c.state === "partial" && ` · เหลืออีก ${c.remainingRows}`}
              </span>
            )}
            {showMoney && c.state !== "no_invoice_data" && (
              <span className="ml-auto font-mono text-muted">
                บิลจริง <span className="font-semibold text-foreground">{baht(c.billedForRealThb)}</span>
                {" · "}ต้นทุนที่บันทึก {baht(c.storedCostThb)}
                {c.state === "partial" && (
                  <span className="text-amber-700"> (อาจมีต้นทุนประเมินปน)</span>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>

      {anyPartial && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-amber-900">
          ⚠️ บางตู้ MOMO ยังบิลไม่ครบทุกแทรคกิ้ง — <span className="font-semibold">ระบบให้ตัดจ่ายตู้ละครั้งเดียว</span>{" "}
          รอบหน้าที่ MOMO บิลส่วนที่เหลือจะบันทึกเข้าตู้นี้ไม่ได้ · จ่ายตามยอดที่ MOMO เรียกเก็บรอบนี้ อย่าจ่ายเหมารวมทั้งตู้
        </p>
      )}
    </section>
  );
}

/**
 * Margin advisory — CEO directive 2026-06-01 §4.
 *
 * "กำไรไม่เกิน 15,000 บาท/ตู้" — keep per-container profit reasonable so the
 * customer feels they got value (this is what wins repeat business + referrals).
 *
 * ⚠️ This is a SOFT advisory ONLY. It NEVER blocks a save, a quote, or a payment.
 * It surfaces a gentle, dismissible-feeling note so the pricer can *decide*.
 * The owner was explicit: "ไม่ต้อง lock เขาจริง แค่มี note ไว้เล็กๆ แนะนำดีๆเบาๆก็พอ
 * ห้าม block เด็ดขาด" — a small kind nudge, never a hard gate.
 *
 * Pure + side-effect-free so it can run in a Server Component render or a
 * Server Action and be unit-tested without a DB.
 */

/** The CEO's soft profit ceiling per container (THB). Guidance, not a limit. */
export const MARGIN_CAP_PER_CONTAINER_THB = 15_000;

export type MarginAdvisoryLevel = "ok" | "over";

export interface MarginAdvisory {
  level: MarginAdvisoryLevel;
  /** Gentle Thai note to show when over the soft cap; null when within. */
  message: string | null;
  /** How much the profit exceeds the cap (THB); 0 when within. */
  overByThb: number;
  /** The cap that was applied (THB). */
  capThb: number;
  /** Always false — this advisory never blocks. Kept explicit so callers
   *  can't accidentally treat it as a gate. */
  readonly blocks: false;
}

export interface MarginAdvisoryOpts {
  /** Override the soft cap (THB). Defaults to MARGIN_CAP_PER_CONTAINER_THB. */
  capThb?: number;
  /** Unit label for the note, e.g. "ตู้" (default) or "งาน" / "shipment". */
  unit?: string;
}

const fmtThb = (n: number) =>
  new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(Math.round(n));

/**
 * Returns a soft margin advisory for a per-container (per-job) profit figure.
 * Never returns a blocking signal — `blocks` is always `false`.
 *
 * @param profitThb  the computed profit for ONE container/job (THB). NaN / non-finite
 *                   / negative → treated as "ok" (nothing to advise).
 */
export function getMarginAdvisory(
  profitThb: number,
  opts: MarginAdvisoryOpts = {},
): MarginAdvisory {
  const capThb = opts.capThb ?? MARGIN_CAP_PER_CONTAINER_THB;
  const unit = opts.unit ?? "ตู้";

  // Guard: only advise on a finite, positive profit that exceeds the cap.
  if (!Number.isFinite(profitThb) || profitThb <= capThb) {
    return { level: "ok", message: null, overByThb: 0, capThb, blocks: false };
  }

  const overByThb = profitThb - capThb;
  return {
    level: "over",
    message:
      `💡 กำไร ฿${fmtThb(profitThb)}/${unit} เกินแนวทาง ฿${fmtThb(capThb)}/${unit} ` +
      `อยู่ ฿${fmtThb(overByThb)} — พิจารณาปรับให้ลูกค้าคุ้มค่ายิ่งขึ้น (คำแนะนำ ไม่บังคับ)`,
    overByThb,
    capThb,
    blocks: false,
  };
}

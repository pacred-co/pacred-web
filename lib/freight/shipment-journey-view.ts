/**
 * Freight shipment JOURNEY view-model — pure builder.
 *
 * Folds a shipment's `journey_status` + flavour + milestone dates into an ordered
 * 3-phase stage strip (ต้นทาง → ระหว่างทาง → ปลายทาง) the detail page renders as a
 * vertical timeline (the brief's customer timeline + the staff detail strip).
 * Internal steps (show_customer=false) are tagged so a customer view can hide
 * them; the staff strip shows everything.
 *
 * ⚠️ PLAIN module (NOT "use server") — const/type + pure fn only.
 * READ-ONLY / PURE — no DB client, no mutation, unit-testable.
 */

import {
  JOURNEY_CODE_META,
  JOURNEY_PHASE_LABEL,
  pipelineFor,
  type JourneyCode,
  type JourneyMode,
  type JourneyPhase,
} from "./journey-catalog";

/** Resolved render-state for one journey step. */
export type JourneyStepState = "done" | "current" | "pending";

export type JourneyStepView = {
  code: JourneyCode;
  labelTh: string;
  customerLabelTh: string;
  phase: JourneyPhase;
  phaseLabel: string;
  showCustomer: boolean;
  state: JourneyStepState;
  /** Resolved milestone date for this step (yyyy-mm-dd) or null. */
  date: string | null;
  tone: "neutral" | "info" | "action" | "ok" | "danger";
  /** First step of its phase in the pipeline (for phase dividers). */
  phaseStart: boolean;
};

export type ShipmentJourneyView = {
  mode: JourneyMode;
  current: JourneyCode | null;
  steps: JourneyStepView[];
  /** A short Thai "ถึงไหนแล้ว" headline. */
  headline: string;
};

/** Milestone columns the builder may read off the shipment row. */
export type MilestoneDates = Partial<Record<NonNullable<typeof JOURNEY_CODE_META[JourneyCode]["milestoneField"]>, string | null>>;

function dateOnly(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  return s === "" ? null : s.slice(0, 10);
}

/**
 * Build the journey strip.
 *
 * @param mode       the resolved journey flavour
 * @param current    the shipment's current journey_status (null = not started)
 * @param milestones a map of milestone-date column → value (off the shipment row)
 */
export function buildShipmentJourneyView(
  mode: JourneyMode,
  current: JourneyCode | null,
  milestones: MilestoneDates = {},
): ShipmentJourneyView {
  const pipeline = pipelineFor(mode);
  const curIdx = current ? pipeline.indexOf(current) : -1;

  let lastPhase: JourneyPhase | null = null;
  const steps: JourneyStepView[] = pipeline.map((code, i) => {
    const meta = JOURNEY_CODE_META[code];
    const state: JourneyStepState = i < curIdx ? "done" : i === curIdx ? "current" : "pending";
    const date = meta.milestoneField ? dateOnly(milestones[meta.milestoneField] ?? null) : null;
    const phaseStart = meta.phase !== lastPhase;
    lastPhase = meta.phase;
    return {
      code,
      labelTh: meta.labelTh,
      customerLabelTh: meta.customerLabelTh,
      phase: meta.phase,
      phaseLabel: JOURNEY_PHASE_LABEL[meta.phase],
      showCustomer: meta.showCustomer,
      state,
      date,
      tone: meta.tone,
      phaseStart,
    };
  });

  const headline =
    current == null
      ? "ยังไม่เริ่มดำเนินการ"
      : current === "DELIVERED" || current === "CLOSED"
        ? "งานนี้ส่งมอบเรียบร้อยแล้ว"
        : current === "CANCELLED"
          ? "งานนี้ถูกยกเลิก"
          : `ขั้นตอนปัจจุบัน: ${JOURNEY_CODE_META[current].labelTh}`;

  return { mode, current, steps, headline };
}

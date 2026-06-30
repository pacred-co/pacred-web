/**
 * 🧭 Freight CUSTOMER-JOURNEY status SOT (owner 2026-06-30 · customer-portal lane).
 *
 * The freight spine stores ONE status column — `freight_shipments.status` ∈
 * {draft, confirmed, in_progress, cleared, delivered, cancelled} (migration 0050).
 * That enum mixes an INTERNAL state (`draft` — the job is still being shaped by
 * staff) with the real customer journey. This module is the single place that
 * decides, for the CUSTOMER view:
 *
 *   1) which raw statuses a customer may even SEE  →  isCustomerVisible()
 *   2) the friendly journey STAGE a visible status maps to  →  JOURNEY_STAGES
 *   3) the RED "delay / hold / cleared-customs-pending" note  →  resolveJourney()
 *
 * BUILD-TRAP note: this is a PLAIN module (NOT "use server") so both the
 * customer pages AND the unit test import its consts directly. It is READ-only
 * logic — no DB, no mutation.
 *
 * Why a journey ≠ the raw enum: the customer should follow an order →
 * confirmed → in-transit → customs → delivered ladder, NOT see "draft" (an
 * internal not-yet-real job) and NOT be shown a scary "cancelled" raw label —
 * a held/cancelled job is surfaced as a friendly "ล่าช้า / รอเคลียร์" note so
 * the customer knows to contact their sales rep, not panic.
 */

import type { FreightShipmentStatus } from "@/lib/validators/freight-shipment";

// ────────────────────────────────────────────────────────────
// 1) Customer visibility — hide the internal `draft` state.
// ────────────────────────────────────────────────────────────

/**
 * The raw `freight_shipments.status` values a CUSTOMER is allowed to see in the
 * journey UI. `draft` is an internal staging state (the job is not yet a real
 * commitment) → hidden. Everything else is part of the real journey.
 *
 * NOTE: RLS (migration 0050) lets a customer SELECT their own row at ANY status,
 * incl. draft — visibility here is a PRESENTATION decision, not a security one.
 * A draft row that slips through is rendered as the neutral "กำลังจัดเตรียม"
 * placeholder rather than exposing the internal label.
 */
export const CUSTOMER_VISIBLE_STATUSES: readonly FreightShipmentStatus[] = [
  "confirmed",
  "in_progress",
  "cleared",
  "delivered",
  "cancelled",
] as const;

/** Is this raw shipment status one the customer journey UI should surface? */
export function isCustomerVisible(status: FreightShipmentStatus): boolean {
  return CUSTOMER_VISIBLE_STATUSES.includes(status);
}

// ────────────────────────────────────────────────────────────
// 2) Journey stages — the customer-facing ladder.
// ────────────────────────────────────────────────────────────

/**
 * The ordered customer journey. These are the ONLY stages a customer sees in
 * the stepper. The internal `draft` status has NO stage (it is hidden); a
 * `cancelled`/held job does not advance the ladder — it shows the delay note.
 */
export const FREIGHT_JOURNEY_STAGE_KEYS = [
  "booked",     // job created / quote accepted → a real job exists
  "confirmed",  // staff confirmed booking + logistics terms
  "in_transit", // goods moving (sea/air/road)
  "customs",    // arrived TH, customs clearance
  "delivered",  // handed over to the customer
] as const;
export type FreightJourneyStageKey = (typeof FREIGHT_JOURNEY_STAGE_KEYS)[number];

/** i18n key + lucide icon name per stage (the page resolves the glyph). */
export interface FreightJourneyStage {
  key: FreightJourneyStageKey;
  /** next-intl key under `customerFreight` for the stage label. */
  labelKey: string;
  /** lucide-react icon name the page maps to a component. */
  icon: "PackageCheck" | "ClipboardCheck" | "Ship" | "Landmark" | "Home";
}

export const JOURNEY_STAGES: readonly FreightJourneyStage[] = [
  { key: "booked",     labelKey: "stageBooked",    icon: "PackageCheck"   },
  { key: "confirmed",  labelKey: "stageConfirmed", icon: "ClipboardCheck" },
  { key: "in_transit", labelKey: "stageInTransit", icon: "Ship"           },
  { key: "customs",    labelKey: "stageCustoms",   icon: "Landmark"       },
  { key: "delivered",  labelKey: "stageDelivered", icon: "Home"           },
] as const;

/**
 * How far the journey has progressed for a given raw status — the index of the
 * LAST stage the customer can consider reached (0-based into
 * FREIGHT_JOURNEY_STAGE_KEYS). A stage is "done" if its index ≤ this value, the
 * stage at index+1 (if any) is "current".
 *
 *   draft       → -1  (no stage reached; hidden — shown as "กำลังจัดเตรียม")
 *   confirmed   → 1   (booked + confirmed done)
 *   in_progress → 2   (in-transit)
 *   cleared     → 3   (customs cleared)
 *   delivered   → 4   (all done)
 *   cancelled   → frozen at the last reached pre-hold stage (see resolveJourney)
 */
const STATUS_TO_REACHED_INDEX: Record<FreightShipmentStatus, number> = {
  draft:       -1,
  confirmed:    1,
  in_progress:  2,
  cleared:      3,
  delivered:    4,
  cancelled:    1, // a held job keeps its booked/confirmed history; transit+ is paused
};

// ────────────────────────────────────────────────────────────
// 3) Resolve the whole customer journey for one shipment.
// ────────────────────────────────────────────────────────────

export type JourneyStageState = "done" | "current" | "upcoming" | "paused";

export interface ResolvedJourneyStage extends FreightJourneyStage {
  state: JourneyStageState;
  /** The real milestone date for this stage, if a stamp exists; else null. */
  date: string | null;
}

/**
 * A friendly "delay / hold / awaiting clearance" note — non-alarming. The
 * customer should never see the raw "cancelled" word; a held/cancelled job is
 * "ล่าช้า/รอเคลียร์ — โปรดติดต่อเซล". Also surfaces a customs-pending note when
 * the goods are at the customs stage but not yet cleared.
 */
export interface JourneyHoldNote {
  kind: "hold" | "customs_pending";
  /** next-intl key under `customerFreight`. */
  messageKey: string;
}

export interface ResolvedJourney {
  stages: ResolvedJourneyStage[];
  /** Index of the current stage (0-based), or -1 when none reached / hidden. */
  currentIndex: number;
  /** The friendly delay/hold note, when the job is held or awaiting clearance. */
  holdNote: JourneyHoldNote | null;
  /** True when the raw status is the internal draft (UI shows a placeholder). */
  isPreparing: boolean;
}

/** Milestone-timestamp inputs available on a `freight_shipments` row. */
export interface JourneyTimestamps {
  /** job created → the "booked" milestone. */
  created_at: string | null;
  /** staff confirmed the booking → "confirmed". */
  confirmed_at: string | null;
  /** handed to the customer → "delivered". */
  delivered_at: string | null;
}

/**
 * Build the resolved, customer-safe journey for one shipment.
 *
 * Only the customer-visible journey stages are returned. The raw status decides
 * how far the ladder advanced; real timestamps decorate the milestones that
 * have one (we NEVER invent an ETD/ETA the DB doesn't hold — a stage with no
 * stamp shows no date). `cancelled` → a friendly hold note + the post-confirm
 * stages shown "paused", not "cancelled".
 */
export function resolveJourney(
  status: FreightShipmentStatus,
  ts: JourneyTimestamps,
): ResolvedJourney {
  const isPreparing = status === "draft";
  const isHeld = status === "cancelled";
  const reached = STATUS_TO_REACHED_INDEX[status];

  // Real milestone dates by stage key (only those the schema actually stamps).
  const dateByKey: Partial<Record<FreightJourneyStageKey, string | null>> = {
    booked:    ts.created_at,
    confirmed: ts.confirmed_at,
    delivered: ts.delivered_at,
  };

  const stages: ResolvedJourneyStage[] = JOURNEY_STAGES.map((stage, idx) => {
    let state: JourneyStageState;
    if (idx <= reached) {
      // Reached stages are "done", except the last reached one is "current".
      state = idx === reached ? "current" : "done";
    } else if (isHeld) {
      // Held job: stages beyond the frozen point are paused, not upcoming.
      state = "paused";
    } else {
      state = "upcoming";
    }
    return { ...stage, state, date: dateByKey[stage.key] ?? null };
  });

  let holdNote: JourneyHoldNote | null = null;
  if (isHeld) {
    holdNote = { kind: "hold", messageKey: "journeyHeldNote" };
  } else if (status === "in_progress") {
    // Goods moving toward TH customs → gentle "arriving, clearance ahead" note.
    holdNote = { kind: "customs_pending", messageKey: "journeyClearanceAheadNote" };
  }

  return {
    stages,
    currentIndex: reached >= 0 ? Math.min(reached, JOURNEY_STAGES.length - 1) : -1,
    holdNote,
    isPreparing,
  };
}

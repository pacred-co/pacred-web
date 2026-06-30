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
import {
  JOURNEY_CODE_META,
  ISSUE_FLAGS,
  MAIN_STATUS_LABEL,
  mainStatusForCustomer,
  type JourneyCode,
  type IssueFlag,
  type MainStatus,
} from "./journey-catalog";
import { FREIGHT_SHIPMENT_STATUS_LABEL } from "@/lib/validators/freight-shipment";

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
  /**
   * The rich current-step customer label (journey-catalog `customerLabelTh`),
   * when the journey was derived from `journey_status` and the current code is a
   * customer-visible step. null on the 6-state fallback, on the draft
   * placeholder, on internal steps, and on the cancelled terminal — so the page
   * never surfaces an internal-step label.
   */
  currentJourneyLabelTh: string | null;
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
    currentJourneyLabelTh: null,
  };
}

// ────────────────────────────────────────────────────────────
// 4) Rich journey → customer ladder (derive from journey_status, the SOT).
// ────────────────────────────────────────────────────────────

/**
 * The ADMIN operational journey (lib/freight/journey-catalog.ts · mig 0233's
 * `freight_shipments.journey_status`) is a 15-19-step pipeline per transport
 * flavour. The CUSTOMER, however, follows the same friendly 5-stage ladder
 * (booked → confirmed → in-transit → customs → delivered). This section
 * PROJECTS a rich journey code down onto that ladder so the customer sees the
 * progression staff drive — without leaking the 38 internal step labels.
 *
 * The projection is `customerStageOf(code)`:
 *   - codes with `showCustomer === false` are NEVER shown a stage of their own
 *     (the #1 invariant — no internal-step leak); the customer simply sees the
 *     ladder frozen at the last customer-visible milestone.
 *   - a customer-visible code maps to a ladder index via its `mainStatus`
 *     rollup bucket (journey-catalog §1a/§1b).
 *   - the rich `customerLabelTh` of the *current* code is surfaced separately
 *     (`currentJourneyLabelTh`) so the page can show "ถึงด่านชายแดน" etc. as a
 *     detail under the current ladder stage, while the at-a-glance stepper
 *     stays the familiar 5-step shape.
 */

/**
 * Map a journey code's MAIN-status bucket to a customer-ladder index
 * (0=booked … 4=delivered). The customer collapses the rich phases:
 *   pending / await_confirm  → 0 booked   (a real job exists, not yet confirmed)
 *   prep_docs / origin_ops   → 1 confirmed (confirmed; origin handling under way)
 *   in_transit               → 2 in_transit
 *   arrived / await_billing  → 3 customs   (at TH, clearance/handover ahead)
 *   closed                   → 4 delivered (only when the code itself is DELIVERED/CLOSED)
 *
 * The DELIVERED / CLOSED journey codes resolve to index 4 explicitly so the
 * "ส่งสำเร็จ" stage only completes when delivery actually happened — `arrived`
 * codes (still in customs/handover) never jump to delivered.
 */
function ladderIndexForMainStatus(main: MainStatus): number {
  switch (main) {
    case "pending":
    case "await_confirm":
      return 0;
    case "prep_docs":
    case "origin_ops":
      return 1;
    case "in_transit":
      return 2;
    case "arrived":
    case "await_billing":
      return 3;
    case "closed":
      return 4;
    case "cancelled":
      return 1; // a held job keeps its booked/confirmed history (mirrors the 6-state path)
    default:
      return 0;
  }
}

/**
 * The customer-ladder index a journey code projects onto, or `null` when the
 * code is internal (`showCustomer === false`) — internal codes do NOT advance
 * the customer ladder; the customer view stays at its last visible milestone.
 *
 * Exported for the unit test (assert the no-leak gate per code).
 */
export function customerLadderIndexOf(code: JourneyCode): number | null {
  const meta = JOURNEY_CODE_META[code];
  if (!meta) return null;
  if (!meta.showCustomer) return null;
  if (code === "DELIVERED" || code === "CLOSED") return 4;
  return ladderIndexForMainStatus(meta.mainStatus);
}

/**
 * Milestone dates available on a `freight_shipments` row (mig 0233). The
 * customer ladder only decorates the 5 stages it knows: booked uses
 * `created_at`, confirmed uses `confirmed_at`, in-transit uses the first real
 * departure stamp, customs uses the TH-clearance/arrival stamp, delivered uses
 * `delivered_at`. We NEVER invent a date the row doesn't hold.
 */
export interface RichJourneyTimestamps {
  created_at:              string | null;
  confirmed_at:            string | null;
  /** earliest real "moving" stamp (atd/etd/departed) → in-transit milestone. */
  atd_at?:                 string | null;
  etd_at?:                 string | null;
  departed_at?:            string | null;
  /** TH-side arrival/clearance stamp → customs milestone. */
  th_cleared_at?:          string | null;
  ata_at?:                 string | null;
  arrived_th_warehouse_at?: string | null;
  delivered_at:            string | null;
}

/** Pick the first non-null of a list of candidate stamps. */
function firstStamp(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) if (v) return v;
  return null;
}

/**
 * Map a RED `issue_flag` overlay (journey-catalog ISSUE_FLAGS) to the customer
 * hold note. The customer NEVER sees the internal "delay / hold / problem"
 * wording verbatim — every red flag surfaces the same friendly
 * "ล่าช้า/รอเคลียร์ — ติดต่อเซล" message (`journeyHeldNote`).
 */
function holdNoteForIssueFlag(flag: IssueFlag): JourneyHoldNote | null {
  if (flag === "none") return null;
  return { kind: "hold", messageKey: "journeyHeldNote" };
}

/**
 * Normalise a raw `freight_shipments.journey_status` / `issue_flag` string to
 * a typed value (the column is `text`; an unknown value is treated as absent).
 */
export function parseJourneyCode(raw: string | null | undefined): JourneyCode | null {
  if (!raw) return null;
  return raw in JOURNEY_CODE_META ? (raw as JourneyCode) : null;
}
export function parseIssueFlag(raw: string | null | undefined): IssueFlag {
  if (!raw) return "none";
  return (ISSUE_FLAGS as readonly string[]).includes(raw) ? (raw as IssueFlag) : "none";
}

/**
 * Build the customer journey from the rich `journey_status` code (the SOT).
 *
 * Returns the SAME `ResolvedJourney` shape as `resolveJourney` so the existing
 * <FreightJourney> component renders it unchanged — the 5-stage ladder, with:
 *   - the ladder advanced to the customer-projection of `code` (internal codes
 *     keep the ladder at its last visible step — NO internal-step leak),
 *   - the current code's friendly `customerLabelTh` surfaced as
 *     `currentJourneyLabelTh` (a detail under the current stage),
 *   - a RED `issue_flag` → the friendly hold note (+ the post-current stages
 *     shown "paused"),
 *   - milestone dates decorating only the stages the row actually stamps.
 *
 * A CANCELLED code → the friendly hold note + paused stages (never the raw
 * "ยกเลิก" word in the ladder), mirroring the 6-state path.
 */
export function resolveJourneyFromCode(
  code: JourneyCode,
  issueFlag: IssueFlag,
  ts: RichJourneyTimestamps,
): ResolvedJourney {
  const isCancelled = code === "CANCELLED";
  const meta = JOURNEY_CODE_META[code];

  // How far the customer ladder advanced. Internal (non-showCustomer) codes do
  // NOT advance it — fall back to the code's mainStatus projection so the ladder
  // still reflects roughly where the job is, but never surfaces the internal
  // step's own label (currentJourneyLabelTh stays hidden for internal codes).
  const projected = customerLadderIndexOf(code);
  const reached = isCancelled
    ? 1 // held job freezes at booked/confirmed history
    : projected ?? ladderIndexForMainStatus(meta?.mainStatus ?? "pending");
  const isHeld = isCancelled || issueFlag !== "none";

  // Real milestone dates by ladder stage (only stamps the row actually holds).
  const dateByKey: Partial<Record<FreightJourneyStageKey, string | null>> = {
    booked:     ts.created_at,
    confirmed:  ts.confirmed_at,
    in_transit: firstStamp(ts.atd_at, ts.etd_at, ts.departed_at),
    customs:    firstStamp(ts.th_cleared_at, ts.ata_at, ts.arrived_th_warehouse_at),
    delivered:  ts.delivered_at,
  };

  const stages: ResolvedJourneyStage[] = JOURNEY_STAGES.map((stage, idx) => {
    let state: JourneyStageState;
    if (idx <= reached) {
      state = idx === reached ? "current" : "done";
    } else if (isHeld) {
      state = "paused";
    } else {
      state = "upcoming";
    }
    return { ...stage, state, date: dateByKey[stage.key] ?? null };
  });

  // Hold/clearance note. A red flag (or cancelled) → friendly hold; otherwise an
  // in-transit ladder position shows the gentle clearance-ahead note.
  let holdNote: JourneyHoldNote | null = null;
  if (isCancelled || issueFlag !== "none") {
    holdNote = holdNoteForIssueFlag(issueFlag === "none" ? "hold" : issueFlag);
  } else if (reached === 2) {
    holdNote = { kind: "customs_pending", messageKey: "journeyClearanceAheadNote" };
  }

  // The rich current-step label — ONLY for a customer-visible, non-cancelled
  // code (internal steps + the cancelled terminal never leak a step label).
  const currentJourneyLabelTh =
    !isCancelled && meta?.showCustomer ? meta.customerLabelTh : null;

  return {
    stages,
    currentIndex: Math.min(reached, JOURNEY_STAGES.length - 1),
    holdNote,
    isPreparing: false,
    currentJourneyLabelTh,
  };
}

/**
 * The customer journey for a shipment — DERIVES FROM `journey_status` (the SOT)
 * when present, with a graceful FALLBACK to the legacy 6-state `status` when
 * `journey_status` is null/unknown (legacy rows · mig-0233-pre data).
 *
 * This is the single entry point the customer pages should call.
 */
export function resolveCustomerJourney(args: {
  status: FreightShipmentStatus;
  journeyStatus: string | null | undefined;
  issueFlag: string | null | undefined;
  timestamps: RichJourneyTimestamps;
}): ResolvedJourney {
  const code = parseJourneyCode(args.journeyStatus);
  if (code) {
    return resolveJourneyFromCode(code, parseIssueFlag(args.issueFlag), args.timestamps);
  }
  // Fallback: the legacy 6-state ladder (no journey_status set).
  return resolveJourney(args.status, {
    created_at:   args.timestamps.created_at,
    confirmed_at: args.timestamps.confirmed_at,
    delivered_at: args.timestamps.delivered_at,
  });
}

/**
 * The customer-facing JOB-STATUS chip label for a list row — DERIVES from the
 * rich `journey_status` (its customer MAIN-status bucket, journey-catalog §1b)
 * when set, falling back to the 6-state `status` label otherwise.
 *
 * A CANCELLED journey code maps to the same friendly "ล่าช้า / รอเคลียร์"
 * wording as a held job — the customer never sees a raw "ยกเลิก" chip from the
 * journey axis. (The 6-state fallback's own "ยกเลิก" label is unchanged for
 * legacy rows — out of scope here; this only governs the journey projection.)
 */
export function customerJobStatusLabel(
  status: FreightShipmentStatus,
  journeyStatus: string | null | undefined,
): string {
  const code = parseJourneyCode(journeyStatus);
  if (!code) return FREIGHT_SHIPMENT_STATUS_LABEL[status];
  if (code === "CANCELLED") return "ล่าช้า / รอเคลียร์";
  const meta = JOURNEY_CODE_META[code];
  const main: MainStatus = mainStatusForCustomer(meta?.mainStatus ?? "pending");
  return MAIN_STATUS_LABEL[main];
}

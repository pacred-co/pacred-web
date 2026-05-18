/**
 * BK-1 — booking-flow Zod schemas.
 *
 * Per design [docs/research/booking-flow-system-2026-05-18.md] §5/§6 and
 * the type contracts in [types/booking.ts].
 *
 * Surface area:
 *   - bookingOptionStateSchema   — the 5-selector state held by the booking
 *                                  detail page (labor / tractor / pin /
 *                                  attached docs / doc-mode + upgrades)
 *   - createBookingDraftSchema   — anon/customer-callable; persists the
 *                                  draft + the picked options server-side
 *                                  (the server recomputes the estimate
 *                                  from `booking_rates` — never trusts the
 *                                  client total)
 *   - submitBookingSchema        — review-step submit; requires the draft
 *                                  bookingId + the customer contact block
 *
 * All enums are kept in lockstep with:
 *   - migration 0079_bookings.sql (DB CHECK constraints)
 *   - types/booking.ts            (front-end / action types)
 *   - lib/booking/service-config.ts (per-service selector manifest)
 *
 * No DB / network IO — pure validator. Runs in <50ms in the unit test.
 */

import { z } from "zod";

// ════════════════════════════════════════════════════════════
// Enums — must stay in lockstep with types/booking.ts
// ════════════════════════════════════════════════════════════

/** The 8 bookable service slugs the booking detail page supports. */
export const BOOKING_SERVICE_SLUGS = [
  "customs-clearance",
  "import-china-lcl",
  "import-china-fcl",
  "import-china-truck",
  "import-china-air",
  "china-shopping",
  "yuan-transfer",
  "export",
] as const;
export type BookingServiceSlug = (typeof BOOKING_SERVICE_SLUGS)[number];

/** Tractor / truck-head class — selector #2. */
export const BOOKING_TRACTOR_CLASSES = [
  "none",
  "truck_4w",
  "truck_6w",
  "truck_10w",
  "trailer",
] as const;
export type BookingTractorClass = (typeof BOOKING_TRACTOR_CLASSES)[number];

/** Document-handling mode — selector #5; matches the DB CHECK. */
export const BOOKING_DOC_MODES = [
  "none",
  "tax_invoice",
  "customs_declaration",
] as const;
export type BookingDocMode = (typeof BOOKING_DOC_MODES)[number];

/** transport_mode column values — sub-pattern by service. */
export const BOOKING_TRANSPORT_MODES = [
  "sea_lcl",
  "sea_fcl",
  "truck",
  "air",
  "sourcing",
  "customs",
  "remit",
] as const;
export type BookingTransportMode = (typeof BOOKING_TRANSPORT_MODES)[number];

/** Lifecycle status (audit / reads — never written by the customer-side actions). */
export const BOOKING_STATUSES = [
  "draft",
  "submitted",
  "contacted",
  "quoted",
  "won",
  "lost",
  "cancelled",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

// ════════════════════════════════════════════════════════════
// Sub-schema — bookingOptionStateSchema (the 5-selector state)
// ════════════════════════════════════════════════════════════

/** Lat/lng or null — the pin-picker fields (selector #3). BK-1 ships an
 *  address input + a basic map; BK-2 upgrades to draggable pins. */
const latSchema = z
  .number()
  .min(-90, "lat ออกนอกขอบเขต")
  .max(90, "lat ออกนอกขอบเขต")
  .nullable();
const lngSchema = z
  .number()
  .min(-180, "lng ออกนอกขอบเขต")
  .max(180, "lng ออกนอกขอบเขต")
  .nullable();

const pinSchema = z.object({
  lat:     latSchema,
  lng:     lngSchema,
  address: z.string().trim().max(500, "ที่อยู่ยาวเกิน 500 ตัวอักษร").default(""),
});

export const bookingOptionStateSchema = z.object({
  /** 0..N workers. The labor row = quantity × labor-rate. */
  labor: z
    .number()
    .int("จำนวนแรงงานต้องเป็นจำนวนเต็ม")
    .min(0, "จำนวนแรงงานต้องไม่ติดลบ")
    .max(20, "จำนวนแรงงานสูงสุด 20 คน"),
  /** "+ ยกของหนัก" toggle on top of labor. */
  laborHeavyLift: z.boolean().default(false),
  /** Tractor class — selector #2. */
  tractor: z.enum(BOOKING_TRACTOR_CLASSES),
  /** Pin pickup + drop-off — selector #3. */
  pickup:  pinSchema,
  dropoff: pinSchema,
  /** Document-handling — selector #5 (radio, one-of-three). */
  docMode: z.enum(BOOKING_DOC_MODES),
  /** Attached document ids (selector #4) — refs into the documents table. */
  attachedDocumentIds: z
    .array(z.string().uuid("attached document id ไม่ใช่ uuid"))
    .max(20, "แนบเอกสารได้สูงสุด 20 ไฟล์")
    .default([]),
  /** Side-rail upgrade rate-keys (booking_rates.scope='upgrade'). */
  upgrades: z
    .array(z.string().trim().min(1).max(64))
    .max(10, "อัปเกรดเลือกได้สูงสุด 10 รายการ")
    .default([]),
});
export type BookingOptionStateInput = z.infer<typeof bookingOptionStateSchema>;

// ════════════════════════════════════════════════════════════
// createBookingDraftSchema — anon/customer-callable
// ════════════════════════════════════════════════════════════

export const createBookingDraftSchema = z.object({
  serviceSlug:   z.enum(BOOKING_SERVICE_SLUGS),
  routeSlug:     z
    .string()
    .trim()
    .min(1)
    .max(64)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  transportMode: z
    .enum(BOOKING_TRANSPORT_MODES)
    .nullable()
    .optional(),
  options:       bookingOptionStateSchema,
  /** Base service charge in THB — the calculator's `calc*` output. The
   *  action recomputes Σ rows server-side and overwrites the persisted
   *  estimate; this value seeds the first row. */
  baseAmount:    z
    .number()
    .min(0, "baseAmount ต้องไม่ติดลบ")
    .max(9_999_999.99, "baseAmount เกินเพดาน 9,999,999.99"),
  baseLabel:     z.string().trim().min(1, "baseLabel ห้ามว่าง").max(120),
  sourceChannel: z.string().trim().max(64).optional().or(z.literal("").transform(() => undefined)),
  sourceUrl:     z.string().trim().max(2048).optional().or(z.literal("").transform(() => undefined)),
});
export type CreateBookingDraftInput = z.infer<typeof createBookingDraftSchema>;

// ════════════════════════════════════════════════════════════
// submitBookingSchema — review-step submit (auth-required)
// ════════════════════════════════════════════════════════════

/** Digit-only phone, 9..15 digits after normalisation. */
const phoneSchema = z
  .string()
  .trim()
  .min(1, "กรุณากรอกเบอร์โทร")
  .refine(
    (s) => {
      const digits = s.replace(/\D/g, "");
      return digits.length >= 9 && digits.length <= 15;
    },
    { message: "เบอร์โทรไม่ถูกต้อง (ต้องมี 9-15 ตัวเลข)" },
  );

export const submitBookingSchema = z.object({
  bookingId:    z.string().uuid("bookingId ไม่ใช่ uuid"),
  contactName:  z
    .string()
    .trim()
    .min(2, "กรุณากรอกชื่อให้ครบ")
    .max(100, "ชื่อยาวเกิน 100 ตัวอักษร"),
  contactPhone: phoneSchema,
  contactLine:  z
    .string()
    .trim()
    .max(100)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  customerNote: z
    .string()
    .trim()
    .max(500, "บันทึกเพิ่มเติมยาวเกิน 500 ตัวอักษร")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type SubmitBookingInput = z.infer<typeof submitBookingSchema>;

// ════════════════════════════════════════════════════════════
// updateBookingDraftSchema — review-step option-tweak (auth-optional)
// ════════════════════════════════════════════════════════════

export const updateBookingDraftSchema = z.object({
  bookingId:  z.string().uuid("bookingId ไม่ใช่ uuid"),
  options:    bookingOptionStateSchema,
  baseAmount: z
    .number()
    .min(0, "baseAmount ต้องไม่ติดลบ")
    .max(9_999_999.99, "baseAmount เกินเพดาน 9,999,999.99"),
});
export type UpdateBookingDraftInput = z.infer<typeof updateBookingDraftSchema>;

// ════════════════════════════════════════════════════════════
// Status / label maps — for the admin view + the customer portal
// ════════════════════════════════════════════════════════════

export const BOOKING_STATUS_LABEL_TH: Record<BookingStatus, string> = {
  draft:     "ฉบับร่าง",
  submitted: "รับเรื่องแล้ว",
  contacted: "ติดต่อกลับแล้ว",
  quoted:    "ออกใบเสนอราคาแล้ว",
  won:       "ปิดดีลแล้ว",
  lost:      "ยกเลิก (ลูกค้าไม่เอา)",
  cancelled: "ยกเลิก",
};

/** Open statuses — surfaced first in the customer portal list. */
export const BOOKING_OPEN_STATUSES: readonly BookingStatus[] = [
  "submitted",
  "contacted",
  "quoted",
  "draft",
];

/** Terminal statuses — sorted below the open ones in lists. */
export const BOOKING_CLOSED_STATUSES: readonly BookingStatus[] = [
  "won",
  "lost",
  "cancelled",
];

/**
 * Map a tractor class to its `booking_rates.rate_key`. Used by the action
 * layer to look up the per-class rate when recomputing the estimate.
 * Returns null for 'none' — no row should be inserted in that case.
 */
export function tractorClassToRateKey(
  cls: BookingTractorClass,
): string | null {
  if (cls === "none") return null;
  return cls; // truck_4w | truck_6w | truck_10w | trailer
}

/**
 * Map a doc-mode to its `booking_rates.rate_key`. Returns null for 'none'.
 */
export function docModeToRateKey(mode: BookingDocMode): string | null {
  if (mode === "none") return null;
  return mode; // tax_invoice | customs_declaration
}

/** Per-service intake priority for the spawned work_item (§6.5). */
export function intakePriorityForService(
  serviceSlug: BookingServiceSlug,
): "low" | "normal" | "high" | "urgent" {
  // Customs / export are time-sensitive — they cost the customer money
  // (per-day storage charges, missed sailings) every hour the rep delays.
  if (serviceSlug === "customs-clearance" || serviceSlug === "export") {
    return "high";
  }
  return "normal";
}

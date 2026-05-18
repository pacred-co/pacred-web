export type TabMode = 'sea' | 'truck' | 'air' | 'customs' | 'sourcing' | 'remit';
export type SeaMode = 'lcl' | 'fcl';
export type Term = 'ddp' | 'exw' | 'fob';
export type LclDoc = 'invoice' | 'customs' | 'none';
export type FclSize = '20ft' | '40ft';
export type TruckSub = 'share' | 'full';

export interface SalesCard {
  name: string;
  slogan: string;
  phone: string;
  image: string;
  alt: string;
  link: string;
  button: string;
}

export interface DropdownChip {
  value: string;
  label: string;
}

export interface DropdownSection {
  heading: string;
  chips: DropdownChip[];
}

export interface CalcRow {
  label: string;
  value: string;
}

export interface CalcResult {
  amount: number;
  currency: string;
  label: string;
  rows: CalcRow[];
  note: string;
}

/**
 * The slice of a calculated booking quote carried from the public
 * `BookingCalculator` into the protected order flow (G-F-2). Built per-mode
 * in `BookingCalculator` and passed to `ResultBox` → `QuoteCTA` → the
 * `/start-order` query string → the order-form pre-fill.
 */
export interface QuoteCarry {
  mode: TabMode;
  /** Calculated total (THB). 0 when the calc returned no priceable result. */
  price: number;
  weightKg?: number;
  volumeCbm?: number;
  /** sea modes only — incoterm. */
  term?: Term;
  /** FCL only — container size. */
  size?: FclSize;
  /** truck only — share-truck vs full-truck. */
  sub?: TruckSub;
  /** the service-import transport_type the mode resolves to. */
  transport?: "ship" | "truck" | "air";
}

export interface LCLForm {
  origin: string;
  originLabel: string;
  productType: string;
  productLabel: string;
  weight: string;
  cbm: string;
  cif: string;
  dateStart: string;
  dateEnd: string;
}

export interface FCLForm {
  origin: string;
  originLabel: string;
  productType: string;
  productLabel: string;
  cbm: string;
  weight: string;
  cif: string;
  date: string;
}

export interface TruckForm {
  origin: string;
  originLabel: string;
  dest: string;
  destLabel: string;
  productType: string;
  productLabel: string;
  weight: string;
  cbm: string;
  date: string;
}

export interface AirForm {
  origin: string;
  dest: string;
  weight: string;
  w: string;
  l: string;
  h: string;
}

export interface CustomsForm {
  port: string;
  portLabel: string;
  country: string;
  countryLabel: string;
  productType: string;
  productLabel: string;
  awb: string;
  contact: string;
}

export interface SourcingForm {
  platform: string;
  platformLabel: string;
  url: string;
  qty: string;
  budget: string;
}

export interface RemitForm {
  currency: string;
  currencyLabel: string;
  amount: string;
  country: string;
  purpose: string;
}

// ════════════════════════════════════════════════════════════
// BK-1 — booking-flow types
// Design: docs/research/booking-flow-system-2026-05-18.md §4-§6
// ════════════════════════════════════════════════════════════

/** The 7 lifecycle states a `bookings` row moves through. */
export type BookingStatus =
  | "draft"
  | "submitted"
  | "contacted"
  | "quoted"
  | "won"
  | "lost"
  | "cancelled";

/**
 * The bookable service slugs the booking detail page supports.  Must stay
 * in lockstep with `lib/booking/service-config.ts` (the per-service
 * selector manifest) + the `bookings.service_slug` text column.
 *
 * Matches the existing service-catalogue + the `BookingCalculator` modes:
 *   - sea modes (sea_lcl / sea_fcl) → 'import-china-lcl' | 'import-china-fcl'
 *   - truck mode                    → 'import-china-truck'
 *   - air mode                      → 'import-china-air'
 *   - customs mode                  → 'customs-clearance'
 *   - sourcing mode                 → 'china-shopping'
 *   - remit mode                    → 'yuan-transfer'
 *   - export (no calculator mode)   → 'export'
 */
export type BookingServiceSlug =
  | "customs-clearance"
  | "import-china-lcl"
  | "import-china-fcl"
  | "import-china-truck"
  | "import-china-air"
  | "china-shopping"
  | "yuan-transfer"
  | "export";

/** The 5 selector keys the per-service manifest enables/disables (§4.3). */
export type BookingSelectorKey =
  | "labor"
  | "tractor"
  | "pin"
  | "doc_attach"
  | "doc_mode";

/** Document-handling mode (§4.3 selector #5) — radio, one-of-three. */
export type BookingDocMode = "none" | "tax_invoice" | "customs_declaration";

/** Tractor / truck-head class (§4.3 selector #2). */
export type BookingTractorClass =
  | "none"
  | "truck_4w"
  | "truck_6w"
  | "truck_10w"
  | "trailer";

/** One line in the quotation receipt (§4.4 — the live itemised total). */
export interface QuoteLine {
  /** Stable key — drives React keys + DB write to booking_options.option_key. */
  key: string;
  /** TH/EN-resolved label — what the customer sees. */
  label: string;
  /** Short detail under the label — '×2 คน' / 'หัวลาก 10 ล้อ'. */
  detail?: string;
  /** Quantity (1 for most rows; the labor row is N). */
  quantity?: number;
  /** Per-unit rate (snapshot). */
  unitAmount?: number;
  /** Line amount in THB. */
  amount: number;
}

/** The live quotation receipt — the heart of the booking detail page. */
export interface QuoteBreakdown {
  rows: QuoteLine[];
  total: number;
  /** Always true for BK-1 — the estimate-honesty rule (§4.7). */
  isEstimate: true;
  currency: "THB";
}

/** A `booking_rates` row as the front-end / actions consume it. */
export interface BookingRate {
  id: string;
  scope: "labor" | "tractor" | "doc" | "upgrade";
  rateKey: string;
  serviceSlug: string | null;
  labelTh: string;
  labelEn: string;
  unitAmount: number;
  active: boolean;
}

/**
 * The option-selection state held by the booking detail page.  Sent to
 * `createDraftBooking` + replayed on the review step (§5.4 — the carry).
 */
export interface BookingOptionState {
  labor: number;                       // 0..N — workers
  laborHeavyLift: boolean;
  tractor: BookingTractorClass;
  pickup: { lat: number | null; lng: number | null; address: string };
  dropoff: { lat: number | null; lng: number | null; address: string };
  docMode: BookingDocMode;
  attachedDocumentIds: string[];       // documents.id refs (member-docs)
  upgrades: string[];                  // selected upgrade rate_key list
}

/**
 * The payload `createDraftBooking()` accepts — service + options + the
 * front-end-computed estimate snapshot (the server recomputes + validates
 * before persisting).
 */
export interface CreateBookingDraftInput {
  serviceSlug: BookingServiceSlug;
  routeSlug?: string;
  transportMode?: TabMode | null;
  options: BookingOptionState;
  /** Base service charge (THB) — from the shipped calc* functions. */
  baseAmount: number;
  baseLabel: string;
  sourceChannel?: string;
  sourceUrl?: string;
}

/**
 * The payload `submitBooking()` accepts on the review step — the draft id
 * + the customer contact block (pre-filled from the profile, editable).
 */
export interface SubmitBookingInput {
  bookingId: string;
  contactName: string;
  contactPhone: string;
  contactLine?: string;
  customerNote?: string;
}

/** What `submitBooking()` returns to the confirmation page. */
export interface SubmitBookingResult {
  bookingId: string;
  bookingNo: string;
}

// ── BK-1.5 (G1) — booking-attachment document types ──
/**
 * The 6 document slot kinds the review-step file uploader accepts.
 * Match the `booking_*` values added to `documents.doc_type` CHECK in
 * migration 0081_booking_documents.sql.
 */
export type BookingDocKind =
  | "booking_invoice"          // ใบกำกับสินค้า / commercial invoice
  | "booking_packing_list"     // ใบรายการบรรจุภัณฑ์ / packing list
  | "booking_certificate"      // ใบรับรอง (Form E, CO etc.)
  | "booking_vat_paw20"        // ภพ.20 (VAT registration certificate)
  | "booking_national_id"      // บัตรประชาชน
  | "booking_passport";        // หนังสือเดินทาง

/**
 * A booking attachment row as the UI consumes it.  `signedUrl` is a
 * short-lived Supabase storage signed URL (~1 hr) — re-fetch via
 * listBookingDocuments() if it expires.
 */
export interface BookingDocument {
  id: string;
  bookingId: string;
  kind: BookingDocKind;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedAt: string;
  /** Short-lived signed URL (~1h) for download/preview.  Re-list to refresh. */
  signedUrl: string | null;
}

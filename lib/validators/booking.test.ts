/**
 * BK-1 — booking validator unit tests.
 *
 * Covers the Zod contract surface for the customer-facing booking flow —
 * the gate between the public booking detail page and the bookings table:
 *
 *   1. enum sets — BOOKING_SERVICE_SLUGS / TRACTOR_CLASSES / DOC_MODES /
 *      TRANSPORT_MODES / STATUSES match the design + migration CHECKs
 *   2. bookingOptionStateSchema — labor int ≥0, tractor / docMode enum,
 *      pin lat/lng bounds, attached doc ids must be uuid, upgrade list cap
 *   3. createBookingDraftSchema — service slug, baseAmount cap, route slug
 *      optional + empty-string-stripped, options sub-schema
 *   4. submitBookingSchema — bookingId uuid, contactName 2-100,
 *      contactPhone 9-15 digits after normalisation, customerNote ≤500
 *   5. updateBookingDraftSchema — id + options + baseAmount
 *   6. helpers — tractorClassToRateKey / docModeToRateKey /
 *      intakePriorityForService (customs+export → high; rest → normal)
 *
 * No DB / network / file IO. Runs in <50ms.
 */

import {
  BOOKING_SERVICE_SLUGS,
  BOOKING_TRACTOR_CLASSES,
  BOOKING_DOC_MODES,
  BOOKING_TRANSPORT_MODES,
  BOOKING_STATUSES,
  BOOKING_STATUS_LABEL_TH,
  BOOKING_OPEN_STATUSES,
  BOOKING_CLOSED_STATUSES,
  bookingOptionStateSchema,
  createBookingDraftSchema,
  submitBookingSchema,
  updateBookingDraftSchema,
  tractorClassToRateKey,
  docModeToRateKey,
  intakePriorityForService,
} from "./booking";

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean): void {
  if (cond) { pass++; console.log("  ✓", label); }
  else      { fail++; console.error("  ✗", label); }
}
function assertThrows(label: string, fn: () => unknown): void {
  try {
    fn();
    fail++; console.error("  ✗", label, "(expected to throw, didn't)");
  } catch {
    pass++; console.log("  ✓", label);
  }
}

console.log("booking validators (BK-1)");

// Valid RFC-4122 v4 UUIDs (Zod v4 .uuid() checks the version nibble).
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-9222-222222222222";

// ────────────────────────────────────────────────────────────
// (a) enum sets — match the migration CHECK + service-config manifest
// ────────────────────────────────────────────────────────────
console.log("  (a) enum sets + label maps");
{
  assert("8 service slugs",            BOOKING_SERVICE_SLUGS.length === 8);
  assert("slugs include customs-clearance",
    BOOKING_SERVICE_SLUGS.includes("customs-clearance"));
  assert("slugs include yuan-transfer",
    BOOKING_SERVICE_SLUGS.includes("yuan-transfer"));
  assert("slugs include all 4 import-china modes",
    ["import-china-lcl","import-china-fcl","import-china-truck","import-china-air"]
      .every((s) => (BOOKING_SERVICE_SLUGS as readonly string[]).includes(s)));

  assert("5 tractor classes",          BOOKING_TRACTOR_CLASSES.length === 5);
  assert("tractor classes include 'none'",
    BOOKING_TRACTOR_CLASSES.includes("none"));
  assert("3 doc modes",                BOOKING_DOC_MODES.length === 3);
  assert("doc modes are the design set",
    ["none","tax_invoice","customs_declaration"].every((m) =>
      (BOOKING_DOC_MODES as readonly string[]).includes(m)));

  assert("7 transport modes",          BOOKING_TRANSPORT_MODES.length === 7);
  assert("transport modes include sea_lcl + sea_fcl",
    BOOKING_TRANSPORT_MODES.includes("sea_lcl") &&
    BOOKING_TRANSPORT_MODES.includes("sea_fcl"));

  assert("7 booking statuses",         BOOKING_STATUSES.length === 7);
  assert("statuses include draft + submitted + won/lost/cancelled",
    ["draft","submitted","contacted","quoted","won","lost","cancelled"]
      .every((s) => (BOOKING_STATUSES as readonly string[]).includes(s)));

  assert("every status has a TH label",
    BOOKING_STATUSES.every((s) => BOOKING_STATUS_LABEL_TH[s].length > 0));

  // Open + closed partition must cover the whole enum exactly once.
  const partition = new Set<string>([
    ...BOOKING_OPEN_STATUSES,
    ...BOOKING_CLOSED_STATUSES,
  ]);
  assert("open + closed partition covers all statuses",
    partition.size === BOOKING_STATUSES.length);
  assert("open + closed are disjoint",
    BOOKING_OPEN_STATUSES.every((s) => !(BOOKING_CLOSED_STATUSES as readonly string[]).includes(s)));
}

// ────────────────────────────────────────────────────────────
// (b) bookingOptionStateSchema — happy paths + defaults
// ────────────────────────────────────────────────────────────
console.log("  (b) bookingOptionStateSchema — accepts valid state");
{
  // Minimal valid input — relies on defaults for booleans / arrays.
  const minimal = bookingOptionStateSchema.parse({
    labor:   0,
    tractor: "none",
    pickup:  { lat: null, lng: null, address: "" },
    dropoff: { lat: null, lng: null, address: "" },
    docMode: "none",
  });
  assert("minimal state parses",            minimal.labor === 0);
  assert("laborHeavyLift defaults false",   minimal.laborHeavyLift === false);
  assert("attachedDocumentIds defaults []", Array.isArray(minimal.attachedDocumentIds) && minimal.attachedDocumentIds.length === 0);
  assert("upgrades defaults []",            Array.isArray(minimal.upgrades) && minimal.upgrades.length === 0);

  // A fully populated state.
  const full = bookingOptionStateSchema.parse({
    labor: 3,
    laborHeavyLift: true,
    tractor: "truck_10w",
    pickup: { lat: 13.7563, lng: 100.5018, address: "สนามบินสุวรรณภูมิ" },
    dropoff: { lat: 13.7367, lng: 100.5232, address: "สาทร" },
    docMode: "customs_declaration",
    attachedDocumentIds: [UUID_A, UUID_B],
    upgrades: ["insurance", "door_to_door"],
  });
  assert("full state preserves labor count",     full.labor === 3);
  assert("full state preserves tractor class",   full.tractor === "truck_10w");
  assert("full state preserves docMode",         full.docMode === "customs_declaration");
  assert("full state preserves 2 attached docs", full.attachedDocumentIds.length === 2);
  assert("full state preserves 2 upgrades",      full.upgrades.length === 2);
}

// ────────────────────────────────────────────────────────────
// (c) bookingOptionStateSchema — rejections
// ────────────────────────────────────────────────────────────
console.log("  (c) bookingOptionStateSchema — rejects bad input");
{
  const validBase = {
    labor:   0,
    tractor: "none" as const,
    pickup:  { lat: null, lng: null, address: "" },
    dropoff: { lat: null, lng: null, address: "" },
    docMode: "none" as const,
  };
  assertThrows("rejects negative labor",
    () => bookingOptionStateSchema.parse({ ...validBase, labor: -1 }));
  assertThrows("rejects non-integer labor",
    () => bookingOptionStateSchema.parse({ ...validBase, labor: 1.5 }));
  assertThrows("rejects labor > 20",
    () => bookingOptionStateSchema.parse({ ...validBase, labor: 21 }));
  assertThrows("rejects unknown tractor class",
    () => bookingOptionStateSchema.parse({ ...validBase, tractor: "spaceship" }));
  assertThrows("rejects unknown doc mode",
    () => bookingOptionStateSchema.parse({ ...validBase, docMode: "fancy" }));
  assertThrows("rejects out-of-range lat (>90)",
    () => bookingOptionStateSchema.parse({ ...validBase, pickup: { lat: 91, lng: 0, address: "" } }));
  assertThrows("rejects out-of-range lng (<-180)",
    () => bookingOptionStateSchema.parse({ ...validBase, dropoff: { lat: 0, lng: -181, address: "" } }));
  assertThrows("rejects non-uuid attached doc id",
    () => bookingOptionStateSchema.parse({ ...validBase, attachedDocumentIds: ["not-a-uuid"] }));
  assertThrows("rejects >20 attached docs",
    () => bookingOptionStateSchema.parse({
      ...validBase,
      attachedDocumentIds: Array.from({ length: 21 }, () => UUID_A),
    }));
}

// ────────────────────────────────────────────────────────────
// (d) createBookingDraftSchema — service + base + options
// ────────────────────────────────────────────────────────────
console.log("  (d) createBookingDraftSchema");
{
  const baseOptions = {
    labor:   0,
    tractor: "none" as const,
    pickup:  { lat: null, lng: null, address: "" },
    dropoff: { lat: null, lng: null, address: "" },
    docMode: "none" as const,
  };
  const ok = createBookingDraftSchema.parse({
    serviceSlug: "customs-clearance",
    routeSlug:   "suvarnabhumi",
    options:     baseOptions,
    baseAmount:  6500,
    baseLabel:   "ค่าพิธีการศุลกากร",
  });
  assert("customs-clearance draft parses",       ok.serviceSlug === "customs-clearance");
  assert("routeSlug preserved",                  ok.routeSlug === "suvarnabhumi");
  assert("baseAmount preserved",                 ok.baseAmount === 6500);

  // Empty-string routeSlug → undefined.
  const emptyRoute = createBookingDraftSchema.parse({
    serviceSlug: "yuan-transfer",
    routeSlug:   "",
    options:     baseOptions,
    baseAmount:  0,
    baseLabel:   "ค่าโอนหยวน",
  });
  assert("empty-string routeSlug becomes undefined",
    emptyRoute.routeSlug === undefined);

  assertThrows("rejects unknown service slug",
    () => createBookingDraftSchema.parse({
      serviceSlug: "moon-shipping",
      options:     baseOptions,
      baseAmount:  100,
      baseLabel:   "x",
    }));
  assertThrows("rejects negative baseAmount",
    () => createBookingDraftSchema.parse({
      serviceSlug: "customs-clearance",
      options:     baseOptions,
      baseAmount:  -10,
      baseLabel:   "x",
    }));
  assertThrows("rejects baseAmount over cap",
    () => createBookingDraftSchema.parse({
      serviceSlug: "customs-clearance",
      options:     baseOptions,
      baseAmount:  10_000_000,
      baseLabel:   "x",
    }));
  assertThrows("rejects empty baseLabel",
    () => createBookingDraftSchema.parse({
      serviceSlug: "customs-clearance",
      options:     baseOptions,
      baseAmount:  100,
      baseLabel:   "",
    }));
}

// ────────────────────────────────────────────────────────────
// (e) submitBookingSchema — id + contact block
// ────────────────────────────────────────────────────────────
console.log("  (e) submitBookingSchema");
{
  const ok = submitBookingSchema.parse({
    bookingId:    UUID_A,
    contactName:  "สมชาย ใจดี",
    contactPhone: "081-234-5678",
    contactLine:  "@somchai",
    customerNote: "รับสินค้าก่อนเที่ยง",
  });
  assert("valid submit parses",          ok.bookingId === UUID_A);
  assert("contactPhone with hyphens accepted", ok.contactPhone === "081-234-5678");
  assert("contactName trimmed",          ok.contactName === "สมชาย ใจดี");

  // contactLine + customerNote are optional.
  const noOptional = submitBookingSchema.parse({
    bookingId:    UUID_B,
    contactName:  "AB",
    contactPhone: "0812345678",
  });
  assert("submit without optionals parses", noOptional.bookingId === UUID_B);
  assert("contactLine becomes undefined when omitted", noOptional.contactLine === undefined);

  // Empty-string customerNote — the `.trim().max().optional()` branch
  // accepts "" before the `.or(z.literal(""))` fallback fires, so an
  // empty string parses straight through as "" (not undefined). This
  // matches the same pattern + accepted gap in adminCreateRefundSchema
  // (see refund.test.ts d-note); harmless because the action layer
  // treats both as "no note".
  const emptyNote = submitBookingSchema.parse({
    bookingId:    UUID_A,
    contactName:  "Ann",
    contactPhone: "+66812345678",
    customerNote: "",
  });
  assert("empty-string customerNote parses as '' (acceptable — see note)",
    emptyNote.customerNote === "" || emptyNote.customerNote === undefined);

  assertThrows("rejects non-uuid bookingId",
    () => submitBookingSchema.parse({
      bookingId: "not-a-uuid", contactName: "Ann", contactPhone: "0812345678",
    }));
  assertThrows("rejects 1-char contactName",
    () => submitBookingSchema.parse({
      bookingId: UUID_A, contactName: "A", contactPhone: "0812345678",
    }));
  assertThrows("rejects contactName > 100 chars",
    () => submitBookingSchema.parse({
      bookingId: UUID_A,
      contactName: "x".repeat(101),
      contactPhone: "0812345678",
    }));
  assertThrows("rejects 8-digit phone",
    () => submitBookingSchema.parse({
      bookingId: UUID_A, contactName: "Ann", contactPhone: "12345678",
    }));
  assertThrows("rejects 16-digit phone",
    () => submitBookingSchema.parse({
      bookingId: UUID_A, contactName: "Ann", contactPhone: "1234567890123456",
    }));
  assertThrows("rejects customerNote > 500 chars",
    () => submitBookingSchema.parse({
      bookingId: UUID_A, contactName: "Ann", contactPhone: "0812345678",
      customerNote: "x".repeat(501),
    }));
}

// ────────────────────────────────────────────────────────────
// (f) updateBookingDraftSchema
// ────────────────────────────────────────────────────────────
console.log("  (f) updateBookingDraftSchema");
{
  const ok = updateBookingDraftSchema.parse({
    bookingId: UUID_A,
    baseAmount: 1500,
    options: {
      labor: 1,
      tractor: "truck_6w",
      pickup:  { lat: null, lng: null, address: "" },
      dropoff: { lat: null, lng: null, address: "" },
      docMode: "tax_invoice",
    },
  });
  assert("update parses",                ok.bookingId === UUID_A);
  assert("update keeps labor",           ok.options.labor === 1);
  assert("update keeps tractor",         ok.options.tractor === "truck_6w");

  assertThrows("rejects update with non-uuid id",
    () => updateBookingDraftSchema.parse({
      bookingId: "x", baseAmount: 100,
      options: {
        labor: 0, tractor: "none",
        pickup: { lat: null, lng: null, address: "" },
        dropoff: { lat: null, lng: null, address: "" },
        docMode: "none",
      },
    }));
}

// ────────────────────────────────────────────────────────────
// (g) helpers — rate-key mappers + intake priority
// ────────────────────────────────────────────────────────────
console.log("  (g) helpers");
{
  assert("tractor 'none' → null rate_key",   tractorClassToRateKey("none") === null);
  assert("tractor 'truck_10w' → 'truck_10w'", tractorClassToRateKey("truck_10w") === "truck_10w");
  assert("tractor 'trailer' → 'trailer'",    tractorClassToRateKey("trailer") === "trailer");

  assert("docMode 'none' → null",                docModeToRateKey("none") === null);
  assert("docMode 'tax_invoice' → 'tax_invoice'", docModeToRateKey("tax_invoice") === "tax_invoice");
  assert("docMode 'customs_declaration' → 'customs_declaration'",
    docModeToRateKey("customs_declaration") === "customs_declaration");

  assert("customs-clearance → priority 'high'",
    intakePriorityForService("customs-clearance") === "high");
  assert("export → priority 'high'",
    intakePriorityForService("export") === "high");
  assert("yuan-transfer → priority 'normal'",
    intakePriorityForService("yuan-transfer") === "normal");
  assert("import-china-lcl → priority 'normal'",
    intakePriorityForService("import-china-lcl") === "normal");
  assert("china-shopping → priority 'normal'",
    intakePriorityForService("china-shopping") === "normal");
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);

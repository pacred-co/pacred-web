/**
 * Zod schema + shared types for the PUBLIC freight quote-request wizard
 * (`/freight-quote` — ported from the AXELRA "AX BOOKING" 5-step prototype).
 *
 * This validates an inbound RFQ / lead that lands in the `freight_quote`
 * table (singular — the public funnel). It is DISTINCT from
 * `lib/validators/freight-quote.ts`, which validates the admin-issued B2B
 * QUOTATION (the plural `freight_quotes` entity, V-E6). Kept in a plain
 * module (NOT a "use server" file) so the client wizard can import the
 * option lists + types without pulling the server action.
 */

import { z } from "zod";

// ── Option vocabularies (mirror the 0134 migration CHECK constraints) ─────
export const CUSTOMER_TYPES = ["person", "company"] as const;
export const RFQ_SERVICES = ["import", "export", "customs", "nondoc", "clearance"] as const;
export const RFQ_TRANSPORTS = ["sea", "air", "truck"] as const;
export const RFQ_INCOTERMS = ["EXW", "FOB", "CIF", "DDP", "CFR"] as const;
export const RFQ_LOAD_TYPES = ["FCL", "LCL"] as const;
export const RFQ_CONTAINER_SIZES = ["20GP", "40GP", "40HC", "45HC"] as const;
export const RFQ_CONTACT_PREFS = ["form", "call", "line"] as const;

export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export type RfqService = (typeof RFQ_SERVICES)[number];
export type RfqTransport = (typeof RFQ_TRANSPORTS)[number];
export type RfqIncoterm = (typeof RFQ_INCOTERMS)[number];
export type RfqLoadType = (typeof RFQ_LOAD_TYPES)[number];
export type RfqContainerSize = (typeof RFQ_CONTAINER_SIZES)[number];
export type RfqContactPref = (typeof RFQ_CONTACT_PREFS)[number];

/**
 * Numeric coercion that treats "", null, undefined as "not provided".
 * The wizard sends strings from <input type="number">.
 */
const optNum = z.preprocess(
  (v) => {
    if (v === "" || v === null || v === undefined) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  },
  z.number().nonnegative().max(1_000_000_000).optional(),
);

const optStr = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal("").transform(() => undefined));

export const freightRfqSchema = z.object({
  // Step 1
  customerType: z.enum(CUSTOMER_TYPES).default("person"),
  service:      z.enum(RFQ_SERVICES).default("import"),

  // Step 2
  transport:     z.enum(RFQ_TRANSPORTS).optional(),
  incoterm:      z.enum(RFQ_INCOTERMS).optional(),
  loadType:      z.enum(RFQ_LOAD_TYPES).optional(),
  containerSize: z.enum(RFQ_CONTAINER_SIZES).optional(),
  carrier:       optStr(80),

  // Step 3
  origin:        optStr(120),
  destination:   optStr(120),
  product:       optStr(300),
  goodsValueUsd: optNum,
  cbm:           optNum,
  weightKg:      optNum,

  // Step 4
  addons: z.array(z.string().trim().max(60)).max(30).default([]),

  // Estimate snapshot (client-side rough estimate — sales context only)
  estTotalThb: optNum,

  // Step 5 (the only required fields — it's a lead form)
  contactName:  z.string().trim().min(1, "กรุณากรอกชื่อ").max(200),
  contactPhone: z.string().trim().min(6, "กรุณากรอกเบอร์โทร").max(40),
  contactLine:  optStr(120),
  contactEmail: optStr(200),
  contactPref:  z.enum(RFQ_CONTACT_PREFS).default("form"),
  note:         optStr(4000),
});

/**
 * Wire type — what the client wizard SENDS (numeric fields arrive as strings
 * from <input>, coerced by the schema's z.preprocess). Use this for the action
 * input + the client payload.
 */
export type FreightRfqInput = z.input<typeof freightRfqSchema>;

/** Parsed type — what `freightRfqSchema.parse()` RETURNS (numbers coerced). */
export type FreightRfqParsed = z.infer<typeof freightRfqSchema>;

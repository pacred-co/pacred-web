/**
 * Shareable-quotation state codec (owner 2026-06-22).
 *
 * The ใบเสนอราคา tab (quote-tab.tsx) is a PURE-CLIENT document — no DB row. To
 * let a sales rep "แชร์ลิงก์ใบเสนอราคา", we encode the full quote state into a
 * URL-safe blob and render it back on the public `/q/[token]` page. Stateless:
 * the link IS the quote (no DB write, no migration — matches the tab's
 * prod-safe design). The blob is self-contained customer-facing quote data
 * (no secret), so it is NOT signed — tampering only misleads the tamperer; the
 * real quote is what the rep sent.
 *
 * Pure module (no React / no "use server") so both the client editor and the
 * public render can import it.
 */

import {
  MODE_KEYS,
  WAREHOUSE_KEYS,
  type QuoteMode,
  type WarehouseKey,
} from "@/lib/quote/cargo-promo-packages";

export type QuoteView = "compare" | "calc";

/** Every input the quote render needs — captured at share time. */
export type QuoteInputs = {
  view: QuoteView;
  pkgId: string;
  licensed: boolean;
  juristic: boolean;
  warehouse: WarehouseKey;
  mode: QuoteMode;
  cbm: string;
  kg: string;
  comparison: string;
  ratePerCbm: string;
  ratePerKg: string;
  customs: number[];
  issueTax: boolean;
  showCustomsInfo: boolean;
  refNo: string;
  dateLabel: string;
  validUntil: string;
  customerCode: string;
  buyerName: string;
  buyerTaxId: string;
  buyerAddress: string;
  buyerPhone: string;
  salesName: string;
  salesTel: string;
  extraNote: string;
};

const VERSION = 1;

// ── UTF-8-safe base64url (Thai-aware · works in browser btoa + node Buffer) ──
function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = typeof atob !== "undefined" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Encode quote inputs → a URL-safe token (the `[token]` path segment). */
export function encodeQuoteState(inputs: QuoteInputs): string {
  return toBase64Url(JSON.stringify({ v: VERSION, ...inputs }));
}

const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const bool = (v: unknown): boolean => v === true;

/**
 * Decode + SANITISE an untrusted token (it came from a URL). Returns a fully-
 * defaulted QuoteInputs, or null on any malformed / wrong-version blob. Every
 * field is coerced to a safe shape — an invalid warehouse/mode/view falls back
 * to a sane default rather than breaking the render.
 */
export function decodeQuoteState(token: string): QuoteInputs | null {
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(token.trim()));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== VERSION) return null;

  const warehouse = (WAREHOUSE_KEYS as readonly string[]).includes(str(o.warehouse))
    ? (o.warehouse as WarehouseKey)
    : WAREHOUSE_KEYS[0];
  const mode = (MODE_KEYS as readonly string[]).includes(str(o.mode))
    ? (o.mode as QuoteMode)
    : MODE_KEYS[0];
  const customs = Array.isArray(o.customs)
    ? o.customs.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0)
    : [];

  return {
    view: o.view === "calc" ? "calc" : "compare",
    pkgId: str(o.pkgId),
    licensed: bool(o.licensed),
    juristic: bool(o.juristic),
    warehouse,
    mode,
    cbm: str(o.cbm),
    kg: str(o.kg),
    comparison: str(o.comparison),
    ratePerCbm: str(o.ratePerCbm),
    ratePerKg: str(o.ratePerKg),
    customs,
    issueTax: o.issueTax === undefined ? true : bool(o.issueTax),
    showCustomsInfo: bool(o.showCustomsInfo),
    refNo: str(o.refNo),
    dateLabel: str(o.dateLabel),
    validUntil: str(o.validUntil),
    customerCode: str(o.customerCode),
    buyerName: str(o.buyerName),
    buyerTaxId: str(o.buyerTaxId),
    buyerAddress: str(o.buyerAddress),
    buyerPhone: str(o.buyerPhone),
    salesName: str(o.salesName),
    salesTel: str(o.salesTel),
    extraNote: str(o.extraNote),
  };
}

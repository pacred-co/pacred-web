/**
 * Canonical Thai-bank list — a dropdown source so admin slip/payment forms
 * offer a SELECT instead of free-text (owner 2026-06-26: "ตัวเลือกธนาคาร
 * เอาเป็นตัวเลือก ไม่ต้องพิมพ์").
 *
 * Each entry: a stable numeric `code` (matches the legacy `nameBank()` map in
 * lib/admin/bank-names.ts — codes 1..16), the Thai display `name`, and a short
 * `abbr` for the option label. The STORED value on the wallet/slip forms is the
 * Thai `name` string (the consumer columns — e.g. tb_wallet_hs.depositnamebank
 * — are free-text varchar that the admin wallet detail renders verbatim:
 * "โอนเข้าบัญชี: <value>"). Storing the readable Thai name keeps the value a
 * plain string AND keeps the display human-readable — backward-compatible with
 * the prior free-text rows.
 *
 * Pure module — safe to import from server + client components.
 */

export type ThaiBank = {
  /** stable numeric code (aligns with legacy nameBank() codes 1..16) */
  code: string;
  /** Thai display name — THIS is the value stored in the slip/bank text column */
  name: string;
  /** short label / abbreviation shown beside the Thai name in the dropdown */
  abbr: string;
};

/**
 * The canonical list. Order = the common Thai banks first, then the rest.
 * Codes mirror lib/admin/bank-names.ts so a stored name round-trips with the
 * legacy code map where both are in play.
 */
export const THAI_BANKS: ThaiBank[] = [
  { code: "2",  name: "กสิกรไทย",        abbr: "KBANK" },
  { code: "5",  name: "ไทยพาณิชย์",       abbr: "SCB" },
  { code: "1",  name: "กรุงเทพ",          abbr: "BBL" },
  { code: "3",  name: "กรุงไทย",          abbr: "KTB" },
  { code: "6",  name: "กรุงศรีอยุธยา",     abbr: "BAY" },
  { code: "4",  name: "ทหารไทยธนชาต",     abbr: "TTB" },
  { code: "11", name: "ยูโอบี",           abbr: "UOB" },
  { code: "13", name: "ออมสิน",           abbr: "GSB" },
  { code: "8",  name: "ซีไอเอ็มบีไทย",     abbr: "CIMBT" },
  { code: "9",  name: "ทิสโก้",           abbr: "TISCO" },
  { code: "7",  name: "เกียรตินาคินภัทร",  abbr: "KKP" },
  { code: "12", name: "แลนด์ แอนด์ เฮ้าส์", abbr: "LHB" },
  { code: "16", name: "ไอซีบีซี (ไทย)",    abbr: "ICBC" },
  { code: "14", name: "ธ.ก.ส.",           abbr: "BAAC" },
  { code: "15", name: "อาคารสงเคราะห์",    abbr: "GHB" },
  { code: "17", name: "อิสลามแห่งประเทศไทย", abbr: "ISBT" },
];

/** Sentinel value the form uses to switch to the free-text fallback input. */
export const BANK_OTHER = "__other__";

/** Option label for the dropdown — "กสิกรไทย (KBANK)". */
export function bankOptionLabel(b: ThaiBank): string {
  return `${b.name} (${b.abbr})`;
}

/**
 * Is the given stored name one of the canonical banks? Used by a form to decide
 * whether to preselect the dropdown or fall back to the "อื่นๆ" free-text input
 * (so editing an existing free-text row never silently loses its value).
 */
export function isKnownBankName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim();
  return THAI_BANKS.some((b) => b.name === n);
}

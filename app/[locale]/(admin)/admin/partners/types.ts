/**
 * Shared partner-type constants for the /admin/partners UI.
 *
 * Plain module (no "use client"/"use server") so both the server page and
 * the client form/row-actions can import it. Mirrors the CHECK list in
 * migration 0136 (public.partners.partner_type).
 */

export const PARTNER_TYPES = [
  "cargo_consolidator",
  "freight",
  "customs",
  "warehouse",
  "last_mile",
  "messenger",
  "api_provider",
  "other",
] as const;

export type PartnerType = (typeof PARTNER_TYPES)[number];

/** TH labels for the dropdown + the list chip. */
export const PARTNER_TYPE_LABELS_TH: Record<string, string> = {
  cargo_consolidator: "ผู้รวบรวมสินค้า (Cargo)",
  freight:            "ฟอร์เวิร์ดเดอร์ (Freight)",
  customs:            "ตัวแทนออกของ (ศุลกากร)",
  warehouse:          "โกดัง (จีน/ไทย)",
  last_mile:          "ขนส่งปลายทาง",
  messenger:          "แมสเซ็นเจอร์",
  api_provider:       "ผู้ให้บริการ API",
  other:              "อื่นๆ",
};

export type PartnerInitial = {
  name:          string;
  name_en:       string;
  partner_type:  string;
  contact_name:  string;
  contact_phone: string;
  contact_email: string;
  note:          string;
  sort:          number;
};

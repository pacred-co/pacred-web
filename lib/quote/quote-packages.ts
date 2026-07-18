/**
 * โหลดแพ็กเกจใบเสนอราคาแบบแก้ได้ (owner ปอน 2026-07-18) — server-only.
 *
 * อ่าน business_config json key `pricing.quote_packages` (แพ็กเกจที่ super/accounting
 * แก้ไว้) แล้ว validate/normalize ผ่าน `parseQuotePackages`. ถ้าไม่มี key / รูปไม่ถูก /
 * ว่างเปล่า → fallback ไป `seedQuotePackages()` (3 แพ็กโปรฯ เดิม map เป็นกริดเต็ม) →
 * ของเก่าไม่หาย. NEVER throws — พังยังไงก็ยังได้แพ็ก seed.
 *
 * key ไม่ถูก migration-seed (owner: ไม่ต้อง migration) → upsert ตอน super กด save
 * ครั้งแรก (actions/admin/quote-packages.ts). Server-only (reads business_config) —
 * ห้าม import จาก Client Component; client รับ QuotePackage[] เป็น prop จาก server page.
 */

import "server-only";

import { getBusinessConfig } from "@/lib/business-config";
import {
  parseQuotePackages,
  seedQuotePackages,
  type QuotePackage,
} from "./quote-packages-shared";

/** The business_config json key holding the editable quote-package collection. */
export const QUOTE_PACKAGES_KEY = "pricing.quote_packages";

export type { QuotePackage } from "./quote-packages-shared";

/**
 * Resolve the live quote-package collection: the `pricing.quote_packages`
 * business_config key (validated), else the seed derived from the hardcoded
 * CARGO_PROMO_PACKAGES. NEVER throws — a missing/broken key degrades to seed.
 */
export async function getQuotePackages(): Promise<QuotePackage[]> {
  try {
    const stored = await getBusinessConfig<unknown>(QUOTE_PACKAGES_KEY, null);
    const parsed = parseQuotePackages(stored);
    if (parsed && parsed.length > 0) return parsed;
  } catch (e) {
    console.error("[getQuotePackages] failed — falling back to seed", e);
  }
  return seedQuotePackages();
}

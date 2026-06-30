/**
 * ใบขนสินค้า (customs declaration) SERVICE-FEE schedule — SOT.
 *
 * Source: AXELRA "ตารางราคาออกใบขน นำเข้าทางรถ" (owner-confirmed 2026-06-30 ·
 * the freight-side fee card · อิงได้). Two tiers:
 *   - regular (ขาประจำ)  — the DEFAULT we charge most customers.
 *   - retail  (ราคาแรก)  — quote this to a NEW customer first.
 *
 * NOT the import freight rate (the PCS รูป-3 matrix is OLD/stale — Pacred's freight
 * rates changed; this module is ONLY the customs-declaration service fees). These
 * are display/quote figures — billing is issued through the existing audited paths.
 */

export type DeclarationFeeTier = "regular" | "retail";

/** The AXELRA fee card (฿ · owner-confirmed 2026-06-30). */
export const DECLARATION_FEES = {
  /** ลงทะเบียน — once per customer (not per declaration). */
  registration: 1_500,
  /** พิธีการใบขน — the core clearance service. */
  clearance: { retail: 3_500, regular: 2_500 } as Record<DeclarationFeeTier, number>,
  /** Form E (ACFTA C/O) — only when the shipment uses Form E. */
  formE: { retail: 2_500, regular: 1_500 } as Record<DeclarationFeeTier, number>,
  /** ค่าธรรมเนียมกรมศุลกากร — flat. */
  customsFee: 200,
  /** ค่าส่งตัว EDI — flat. */
  edi: 150,
} as const;

export type DeclarationFeeLine = { key: string; label: string; amount: number };
export type DeclarationFeeQuote = {
  tier: DeclarationFeeTier;
  lines: DeclarationFeeLine[];
  total: number;
};

/**
 * Compute the ใบขน service fee for a tier.
 * @param tier            regular (default) | retail (new customer)
 * @param withFormE       include the Form E fee (shipment uses Form E)
 * @param withRegistration include the one-time ลงทะเบียน (first declaration for this customer)
 */
export function computeDeclarationFee(
  tier: DeclarationFeeTier = "regular",
  { withFormE = true, withRegistration = true }: { withFormE?: boolean; withRegistration?: boolean } = {},
): DeclarationFeeQuote {
  const lines: DeclarationFeeLine[] = [];
  if (withRegistration) lines.push({ key: "registration", label: "ลงทะเบียน (ครั้งเดียว)", amount: DECLARATION_FEES.registration });
  lines.push({ key: "clearance", label: "พิธีการใบขน", amount: DECLARATION_FEES.clearance[tier] });
  if (withFormE) lines.push({ key: "formE", label: "Form E (ACFTA)", amount: DECLARATION_FEES.formE[tier] });
  lines.push({ key: "customsFee", label: "ค่าธรรมเนียมกรมศุลกากร", amount: DECLARATION_FEES.customsFee });
  lines.push({ key: "edi", label: "ค่าส่งตัว EDI", amount: DECLARATION_FEES.edi });
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { tier, lines, total };
}

export const DECLARATION_FEE_TIER_LABEL: Record<DeclarationFeeTier, string> = {
  regular: "ขาประจำ",
  retail: "ราคาแรก (ลูกค้าใหม่)",
};

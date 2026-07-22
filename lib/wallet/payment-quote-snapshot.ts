/**
 * Parser for migration 0274's immutable customer-payment quote.
 *
 * The database CHECK is authoritative. This parser repeats the accounting
 * invariants at read boundaries so admin UI/approval never silently falls back
 * to repricing a malformed or partially selected snapshot.
 */

export type FrozenWalletPaymentLine = {
  forwarderId: number;
  amountSatang: number;
};

export type FrozenWalletPaymentQuote = {
  grossSatang: number;
  vatSatang: number;
  whtSatang: number;
  netSatang: number;
  cashbackSatang: number;
  bankSatang: number;
  maoFeeSatang: number;
  isJuristic: boolean;
  billingIdentity: {
    name: string;
    taxId: string;
    address: string;
    isJuristic: boolean;
  };
  lines: FrozenWalletPaymentLine[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeInteger(value: unknown, min = 0): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min
    ? value
    : null;
}

export function parseFrozenWalletPaymentQuote(
  snapshot: unknown,
): FrozenWalletPaymentQuote | null {
  if (!isRecord(snapshot) || snapshot.schema_version !== 1 || snapshot.currency !== "THB") {
    return null;
  }

  const grossSatang = safeInteger(snapshot.gross_satang);
  const vatSatang = safeInteger(snapshot.vat_satang);
  const whtSatang = safeInteger(snapshot.wht_satang);
  const netSatang = safeInteger(snapshot.net_satang, 1);
  const cashbackSatang = safeInteger(snapshot.cashback_satang);
  const bankSatang = safeInteger(snapshot.bank_satang);
  if (
    grossSatang === null
    || vatSatang === null
    || whtSatang === null
    || netSatang === null
    || cashbackSatang === null
    || bankSatang === null
    || grossSatang + vatSatang - whtSatang !== netSatang
    || bankSatang + cashbackSatang !== netSatang
  ) {
    return null;
  }

  if (!Array.isArray(snapshot.lines) || snapshot.lines.length < 1 || snapshot.lines.length > 50) {
    return null;
  }
  const lines: FrozenWalletPaymentLine[] = [];
  const seen = new Set<number>();
  let lineTotal = 0;
  for (const rawLine of snapshot.lines) {
    if (!isRecord(rawLine)) return null;
    const forwarderId = safeInteger(rawLine.forwarder_id, 1);
    const amountSatang = safeInteger(rawLine.amount_satang, 1);
    if (forwarderId === null || amountSatang === null || seen.has(forwarderId)) return null;
    seen.add(forwarderId);
    lines.push({ forwarderId, amountSatang });
    lineTotal += amountSatang;
  }
  if (!Number.isSafeInteger(lineTotal) || lineTotal !== netSatang) return null;

  if (!isRecord(snapshot.submission) || typeof snapshot.submission.apply_niti !== "boolean") {
    return null;
  }
  if (
    !isRecord(snapshot.billing_identity)
    || typeof snapshot.billing_identity.name !== "string"
    || !snapshot.billing_identity.name.trim()
    || typeof snapshot.billing_identity.tax_id !== "string"
    || typeof snapshot.billing_identity.address !== "string"
    || !snapshot.billing_identity.address.trim()
    || typeof snapshot.billing_identity.is_juristic !== "boolean"
    || snapshot.billing_identity.is_juristic !== snapshot.submission.apply_niti
    || (snapshot.billing_identity.is_juristic && !snapshot.billing_identity.tax_id.trim())
  ) {
    return null;
  }
  const metadata = isRecord(snapshot.metadata) ? snapshot.metadata : {};
  const maoFeeSatang = metadata.mao_fee_satang === undefined
    ? 0
    : safeInteger(metadata.mao_fee_satang);
  if (maoFeeSatang === null || maoFeeSatang > grossSatang) return null;

  return {
    grossSatang,
    vatSatang,
    whtSatang,
    netSatang,
    cashbackSatang,
    bankSatang,
    maoFeeSatang,
    isJuristic: snapshot.submission.apply_niti,
    billingIdentity: {
      name: snapshot.billing_identity.name.trim(),
      taxId: snapshot.billing_identity.tax_id.trim(),
      address: snapshot.billing_identity.address.trim(),
      isJuristic: snapshot.billing_identity.is_juristic,
    },
    lines,
  };
}

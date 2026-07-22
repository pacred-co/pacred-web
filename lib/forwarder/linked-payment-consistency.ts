import type { ForwarderDebitBatch } from "./forwarder-debit-total";

export type StoredLinkedPaymentLine = { reforder: string | null; amount: number | string | null };

const cents = (value: number | string | null | undefined): number =>
  Math.round(Number(value ?? 0) * 100);

export function checkLinkedPaymentConsistency(
  storedTotal: number | string | null,
  storedLines: ReadonlyArray<StoredLinkedPaymentLine>,
  batch: ForwarderDebitBatch,
): { ok: true } | { ok: false; expectedTotal: number; differences: string[] } {
  const differences: string[] = [];
  if (cents(storedTotal) !== cents(batch.total_thb)) {
    differences.push(`total:${Number(storedTotal ?? 0).toFixed(2)}!=${batch.total_thb.toFixed(2)}`);
  }

  const storedById = new Map(storedLines.map((line) => [String(line.reforder ?? ""), line.amount]));
  for (const line of batch.lines) {
    const stored = storedById.get(line.id);
    if (stored === undefined) differences.push(`missing:${line.id}`);
    else if (cents(stored) !== cents(line.price_thb)) {
      differences.push(`${line.id}:${Number(stored).toFixed(2)}!=${line.price_thb.toFixed(2)}`);
    }
  }
  for (const ref of storedById.keys()) {
    if (!batch.lines.some((line) => line.id === ref)) differences.push(`unexpected:${ref}`);
  }

  return differences.length === 0
    ? { ok: true }
    : { ok: false, expectedTotal: batch.total_thb, differences };
}

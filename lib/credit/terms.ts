/**
 * Credit-term date helpers.
 *
 * `tb_users.userCreditDate` is the customer's default term in calendar days.
 * `tb_forwarder.fcreditdate` is the binding due date once a shipment is granted
 * credit.  Keep the arithmetic on ISO calendar dates so Bangkok/UTC offsets and
 * DST on a developer machine can never move a due date by one day.
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function normaliseCreditTermsDays(
  value: number | string | null | undefined,
): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) return 0;
  return Math.min(3650, Math.max(0, Math.trunc(n)));
}

export function isIsoCalendarDate(value: string): boolean {
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function addCalendarDays(isoDate: string, days: number): string {
  if (!isIsoCalendarDate(isoDate)) throw new Error("invalid_iso_date");
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + normaliseCreditTermsDays(days));
  return date.toISOString().slice(0, 10);
}

export function creditDueDate(
  issuedOn: string,
  termsDays: number | string | null | undefined,
): string {
  return addCalendarDays(issuedOn, normaliseCreditTermsDays(termsDays));
}

/** Earliest stored per-shipment due date is the conservative bill-level due. */
export function earliestCreditDueDate(
  values: Array<string | null | undefined>,
): string | null {
  const dates = values
    .map((value) => String(value ?? "").slice(0, 10))
    .filter(isIsoCalendarDate)
    .sort();
  return dates[0] ?? null;
}

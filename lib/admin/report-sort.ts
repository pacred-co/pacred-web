/**
 * /admin/system-reports — server-side column sorting (ปอน 2026-07-29).
 *
 * ตารางค่าคอมทุกตัวเรียงลำดับได้โดยกดหัวคอลัมน์ (?sort=KEY&dir=asc|desc). การเรียง
 * ทำที่ data function **ก่อน paginate** → เรียงทั้ง dataset ไม่ใช่แค่ 50 แถวในหน้า.
 * pure functions · แชร์ทั้ง sales/purchase report.
 */

export type SortDir = "asc" | "desc";

export function normalizeDir(v: string | undefined | null): SortDir {
  return v === "desc" ? "desc" : "asc";
}

/** validate the URL sort key against a table's allowed columns (fallback if unknown/absent). */
export function pickSortKey<T>(
  candidate: string | undefined | null,
  allowed: readonly (keyof T)[],
  fallback: keyof T,
): keyof T {
  return (allowed as readonly string[]).includes(candidate ?? "")
    ? (candidate as keyof T)
    : fallback;
}

/** number↔number = ตัวเลข · else = string (numeric-aware · null→"" ไปท้าย). */
function compareValues(av: unknown, bv: unknown): number {
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  const as = av == null ? "" : String(av);
  const bs = bv == null ? "" : String(bv);
  return as.localeCompare(bs, undefined, { numeric: true });
}

/**
 * Sort the FULL row array in place by `key` (dir), with a deterministic tiebreak
 * on `tieKey` (always asc) so pagination stays stable across pages.
 */
export function sortRows<T>(rows: T[], key: keyof T, dir: SortDir, tieKey: keyof T): void {
  const sign = dir === "desc" ? -1 : 1;
  rows.sort((a, b) => {
    const c = compareValues(a[key], b[key]);
    if (c !== 0) return c * sign;
    return compareValues(a[tieKey], b[tieKey]);
  });
}

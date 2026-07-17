/**
 * report-cnt container-level bucketing (0261 · 2026-07-18 · "any arrived")
 *
 * /admin/report-cnt groups tb_forwarder rows by cabinet (ตู้) and shows each ตู้
 * in ONE of two tabs. Owner directive 2026-07-18: a ตู้ moves to "เข้าโกดังไทยแล้ว"
 * the moment ANY tracking in it is scanned-received into TH (ยิงรับเข้าแม้แต่ชิ้น
 * เดียว) — decided by the CONTAINER-WIDE most-advanced tracking, MAX(fstatus):
 *
 *   waiting (รอเข้าโกดังไทย)  ⟺  MAX(fstatus) <  '4'   (none arrived yet)
 *   succeed (เข้าโกดังไทยแล้ว) ⟺  MAX(fstatus) >= '4'   (≥1 tracking arrived)
 *
 * (Supersedes the 0243 MIN model = "all arrived". The BUCKET now uses MAX; the
 * row's REPRESENTATIVE display status stays MIN = least-advanced tracking.)
 *
 * fstatus is a single-char varchar '1'..'7' → a lexical string compare equals
 * the numeric one. The cancel sentinel '99' is excluded upstream (WHERE), so it
 * never pins MAX. An empty-string max → waiting (conservative — a ตู้ with only
 * blank trackings hasn't been scanned in). This mirrors the SQL RPC's HAVING
 * branch (get_container_summary / count_distinct_cabinets, migration 0261) so
 * the SQL path and the JS fallback bucket identically.
 */

export type ReportCntPage = "waiting" | "succeed";

/**
 * Is a container (identified by its container-wide MAX fstatus) in the given tab?
 * @param maxFstatus MAX(fstatus) over all the ตู้'s trackings (may be "" if all blank).
 */
export function isContainerInBucket(maxFstatus: string, page: ReportCntPage): boolean {
  if (page === "succeed") return maxFstatus !== "" && maxFstatus >= "4";
  // waiting — nothing scanned-received into TH yet, incl. an empty/blank max.
  return maxFstatus === "" || maxFstatus < "4";
}

/**
 * report-cnt container-level bucketing (0243 · 2026-07-07)
 *
 * /admin/report-cnt groups tb_forwarder rows by cabinet (ตู้) and shows each ตู้
 * in ONE of two tabs. The bucket is decided by the CONTAINER-WIDE least-advanced
 * tracking — MIN(fstatus) across all the ตู้'s rows — because a container only
 * advances once EVERY tracking has advanced (the 0189 model):
 *
 *   waiting (รอเข้าโกดังไทย)  ⟺  MIN(fstatus) <  '4'
 *   succeed (เข้าโกดังไทยแล้ว) ⟺  MIN(fstatus) >= '4'
 *
 * fstatus is a single-char varchar '1'..'7' → a lexical string compare equals
 * the numeric one. The cancel sentinel '99' is excluded upstream (WHERE), so it
 * never pins MIN. An empty-string min → waiting (conservative — a ตู้ with a
 * blank tracking hasn't fully arrived). This mirrors the SQL RPC's HAVING branch
 * (get_container_summary / count_distinct_cabinets, migration 0243) so the SQL
 * path and the JS fallback bucket identically.
 */

export type ReportCntPage = "waiting" | "succeed";

/**
 * Is a container (identified by its container-wide MIN fstatus) in the given tab?
 * @param minFstatus MIN(fstatus) over all the ตู้'s trackings (may be "" if blank).
 */
export function isContainerInBucket(minFstatus: string, page: ReportCntPage): boolean {
  if (page === "succeed") return minFstatus !== "" && minFstatus >= "4";
  // waiting — everything not fully arrived, incl. an empty/blank min.
  return minFstatus === "" || minFstatus < "4";
}

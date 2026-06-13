/**
 * FREE_SHIPPING_ZIPS — the canonical free-last-mile ZIP list.
 *
 * The dedup'd union of the 6 legacy `$arrZIPCode*` arrays from
 * `pcs-admin/include/pages/header-theme.php` (the ZIPs where Pacred ships
 * last-mile for free → carrier should be PCSF). It drives two CS error
 * queues on `/admin/forwarder-action`:
 *   - NotShipFree      — ZIP IN this list  AND fshipby NOT IN ('PCSF','PCS')  → should be free but isn't
 *   - NotShipFreeError — ZIP NOT IN this list AND fshipby = 'PCSF'            → marked free but shouldn't be
 *
 * SINGLE SOURCE OF TRUTH (2026-06-14 forwarder-fidelity audit): previously
 * copy-pasted into `forwarder-action/page.tsx`, `export/forwarder-action.ts`,
 * and (as a placeholder-0) `top-menu-report.tsx`. Three copies of a
 * money-queue-affecting list = drift hazard — import from here everywhere.
 *
 * Stored as strings because `tb_forwarder.faddresszipcode` is varchar(5) and
 * Supabase `.in()` requires matching types.
 */
export const FREE_SHIPPING_ZIPS: string[] = [
  // Bangkok (26 unique)
  "10100", "10110", "10120", "10140", "10150", "10160", "10170",
  "10200", "10210", "10220", "10230", "10240", "10250", "10260",
  "10300", "10310", "10330", "10400", "10500", "10510", "10520",
  "10530", "10600", "10700", "10800", "10900",
  // Nakhon Pathom
  "73110", "73170",
  // Nonthaburi
  "11000", "11110", "11120", "11130", "11140", "11150",
  // Samut Prakan
  "10130", "10270", "10290", "10540", "10560",
  // Samut Sakhon
  "74000", "74110",
];

/** PostgREST `.not("col","in", FREE_SHIPPING_ZIPS_IN_CLAUSE)` value form: `(a,b,c)`. */
export const FREE_SHIPPING_ZIPS_IN_CLAUSE = `(${FREE_SHIPPING_ZIPS.join(",")})`;

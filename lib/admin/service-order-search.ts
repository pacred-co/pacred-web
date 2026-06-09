/**
 * E5 — multi-axis admin search (shop-order) helpers.
 *
 * Legacy `pcs-admin/shop-search.php` (250 LOC) lets staff search by
 * `?keyType=` over 4 axes (hNo · cTrackingNumber · cShippingNumber ·
 * userID). The Pacred list page's existing keyword search only matches
 * hno/htitle/userid in `tb_header_order` — when staff paste a TRACKING
 * NUMBER ("YT3045123456789") or a CHINA SHOP ORDER NUMBER, nothing
 * matches because both live on `tb_order` rows (the line items), not on
 * the header.
 *
 * Strategy:
 *   1. `looksLikeTrackingOrShipping(term)` returns true when the
 *      keyword shape matches a tracking number (Chinese carriers
 *      typically: 2 letters + 9-12 digits, or 10+ all-digits) or a
 *      China shop order number (long all-digit string from MOMO /
 *      Taobao). This is a heuristic — when true the page ALSO queries
 *      `tb_order.(ctrackingnumber,cshippingnumber)` to look up matching
 *      `hno` values, then UNIONs those hnos with the existing header
 *      text search. When false we keep the cheap text-only path.
 *   2. The page calls `findHnosByTrackingOrShipping()` (in page.tsx,
 *      using the admin client) to get the matching hno list, then
 *      passes that to the main header query via `.in("hno", [...])`
 *      OR `.or()` together with the existing `hno/htitle/userid`
 *      ilike search — preserving the legacy `?keyType=all` UNION.
 *
 * Why a separate helper file?
 *   - The detection regex needs unit tests (false positives = wide
 *     scan = slow; false negatives = staff feature dead). Pure
 *     functions in a server-only consumer can't be tested in
 *     isolation easily; a plain TS module ships with the
 *     `service-order-search.test.ts` companion.
 *   - The page is already 700 LOC — extracting the heuristic keeps
 *     it focused on the query orchestration.
 */

// ────────────────────────────────────────────────────────────────
// Detection
// ────────────────────────────────────────────────────────────────

/**
 * True when `term` looks like a tracking number or a China shop
 * order number — i.e. worth also searching `tb_order.(ctrackingnumber,
 * cshippingnumber)`.
 *
 * Heuristic rules (the ones that survived audit of real legacy data):
 *   - all-digit string ≥ 10 chars (taobao/momo shop order numbers
 *     are typically 14-20 digits; YT/SF/JT tracking IDs strip the
 *     letter prefix to ≥ 10 digits too)
 *   - 1-3 leading letters + ≥ 8 alphanumerics (covers `YT12345...`,
 *     `SF1234567...`, `JT3045...`, `KSTHGZ06031234567`)
 *   - mixed letters + digits totalling ≥ 9 chars, must contain
 *     at least one digit AND at least one letter
 *
 * What we EXCLUDE on purpose:
 *   - bare hNo like "P12345" / "P26060001" (still detected by the
 *     header-side text search via `hno.ilike.%P12345%` — we WANT it
 *     to fall into the cheap path)
 *   - bare member_code like "PR123" / "PR10683" (same — userid.ilike
 *     handles it)
 *   - thai/latin names ("สมชาย", "John Doe") — clearly not codes
 *
 * Note: hNo / PR codes that happen to also look code-shaped (`P26060001`
 * is 9 chars including digits + 1 letter) WILL trigger the tracking
 * sweep — that's fine; the extra `tb_order` query just returns 0 hnos
 * and the page falls back to the header text search anyway. The cost
 * is one indexed lookup; the win is staff don't have to switch UIs.
 */
export function looksLikeTrackingOrShipping(term: string): boolean {
  const t = term.trim();
  if (!t) return false;

  // Bare PR/PCS member codes — let the userid.ilike path handle these.
  // (legacy heuristic: pure "PR"+digits / "PCS"+digits = identity, not tracking)
  if (/^(PR|PCS)\d{1,8}$/i.test(t)) return false;

  // Bare hNo — `P<digits>` only (P26060001) or short `H` prefixes.
  // Tracking numbers DO often start with a single letter too, but
  // hNo format is `P` + 8 digits exactly (legacy `hno char(20)` but
  // 9-char `P{YYMMDD}{NNNN}` in practice). We let the header text
  // search match it on its own.
  if (/^P\d{1,9}$/i.test(t)) return false;

  // All-digit string ≥ 10 chars — China shop order or stripped tracking.
  if (/^\d{10,}$/.test(t)) return true;

  // 1-3 leading letters + ≥ 8 alphanumerics — typical carrier prefix
  // (YT/SF/JT/EMS/TH/CN/HK) + body. Total length ≥ 9.
  if (/^[A-Za-z]{1,3}[A-Za-z0-9]{8,}$/.test(t)) return true;

  // Mixed letters + digits totalling ≥ 9 chars (catches MOMO container
  // codes like `KSTHGZ06031234567` — letters anywhere, must contain
  // at least one digit and one letter).
  if (t.length >= 9 && /\d/.test(t) && /[A-Za-z]/.test(t)) {
    // exclude pure-text strings that just happen to have a digit
    // (e.g. address fragments) — require at least 4 digits in the
    // total length to avoid matching "office 123" type input.
    const digitCount = (t.match(/\d/g) ?? []).length;
    if (digitCount >= 4) return true;
  }

  return false;
}

// ────────────────────────────────────────────────────────────────
// Hint text for the search box label
// ────────────────────────────────────────────────────────────────

/** The placeholder/help-text axes hint shown under the search box. */
export const SEARCH_AXES_HINT =
  "ค้นหา: เลข hNo · PR · ชื่อ · เลข tracking · เลขสั่งจีน";

// ────────────────────────────────────────────────────────────────
// Escape — drop PostgREST .or() filter-injection chars
// ────────────────────────────────────────────────────────────────

/**
 * Escape a user keyword for safe use inside a PostgREST `.ilike.%X%`
 * filter inside a `.or(...)` group. Drops `%, * ( ) ,` — the chars
 * that change the meaning of the filter syntax. We do NOT use
 * `encodeURIComponent` here because the consumer feeds the result
 * straight into the supabase-js `.or(...)` string builder, which
 * does its own encoding.
 */
export function sanitizeSearchTerm(term: string): string {
  return term.replace(/[%,*()]/g, "");
}

/**
 * The general/default customer-tier company code.
 *
 * Legacy PCS Cargo used `coID='PCS'` for the default (non-VIP) tier — the
 * bucket that reads the general tiered rate card (`tb_rate_g_kg`/`tb_rate_g_cbm`).
 * Pacred rebranded it to **'PR'**: new signups already write `coID='PR'`
 * (`lib/auth/legacy-bridge-tb-users.ts`), and migration 0182 renamed every
 * legacy 'PCS' → 'PR' across `tb_users` / `tb_co` / `tb_rate_g_*` /
 * `tb_register` so the whole platform is consistent on 'PR'.
 *
 * The VIP groups (THADA.VIP / SIN.VIP / OOAEOM.VIP / SWAN / VIP1-5 / PRO*) are
 * NOT general — they keep their own coID and read `tb_rate_vip_*`. They were
 * never 'PCS', so the rebrand left them untouched.
 *
 * Single source of truth for the rate-tier sentinel so no surface re-hardcodes
 * the literal and drifts (the camelCase/coID family is money-path · ADR-0029).
 */
export const GENERAL_COID = "PR";

/**
 * True when a customer's coID is the **general/default** tier (i.e. NOT a VIP
 * group → reads the tiered general rate card, not a VIP flat rate).
 *
 * Accepts:
 *  - `'PR'`   — the canonical Pacred general code (post-0182 · new signups).
 *  - `'PCS'`  — the legacy alias. Defensive: a not-yet-migrated row must still
 *               resolve as general (else it falls through to the VIP branch,
 *               finds no VIP card, and shows "ไม่มีเรต"). Lets the code deploy
 *               and the data migration land in either order without breaking
 *               the 8,700+ general customers.
 *  - empty/null — no coID set → treat as default tier.
 *
 * Note: the general rate-card LOOKUP still keys on the customer's own coID
 * (`.eq("coid", coID)`), which is why an atomic 0182 (customers + card renamed
 * together) keeps both sides matched. This predicate only governs which BRANCH
 * (general vs VIP) the resolver takes.
 */
export function isGeneralCoid(coid: string | null | undefined): boolean {
  const c = (coid ?? "").trim();
  return c === "" || c === GENERAL_COID || c === "PCS";
}

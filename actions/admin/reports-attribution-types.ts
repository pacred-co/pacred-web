/**
 * Lead-source / acquisition attribution — shared types + label maps.
 *
 * Co-located NON-"use server" module (the sibling `reports-attribution.ts`
 * is a `"use server"` file and so may only export async functions — type
 * aliases + const maps + pure helpers live here; same split as
 * `reports-profit-types.ts` and `lib/admin/reports/types.ts` per the
 * CLAUDE_TECHNICAL.md "use server" rule).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT REAL DATA THIS READS — scope honesty (2026-06-09).
 *
 * There is NO ad-spend / Meta-Ads / UTM / fb_ad_touchpoints table in the DB
 * (grepped supabase/migrations + lib + actions + app — only the LINE-OA inbox
 * tables exist for marketing capture, and those carry no campaign/spend
 * dimension). So this dashboard does NOT and CANNOT show ROAS / cost-per-lead
 * — those columns are omitted rather than fabricated (prompt directive).
 *
 * The real acquisition-source dimensions that DO exist live on `tb_users`
 * (legacy PCS schema · migration 0081 · ALL LOWERCASE columns):
 *   • userregisterwith varchar(3)  — "วิธีสมัครสมาชิก": PCS=ในระบบ · F=เฟสบุ๊ก · L=ไลน์
 *                                    (the registration CHANNEL — the closest
 *                                    real source dimension we have)
 *   • channel          varchar(2)  — legacy acquisition-channel code (NOT NULL;
 *                                    populated for imported customers, "" for
 *                                    Pacred-native registrations)
 *   • userrecom        varchar(20) — referral / recommender (who referred this
 *                                    customer — a referral-source dimension)
 *   • adminidsale      varchar(20) — sales-rep attribution (kept for context;
 *                                    a dedicated /admin/reports/sales-by-rep
 *                                    report already owns the rep cut)
 *   • useractive       varchar(1)  — ''=cold lead (never contacted) · '1'=active
 *   • userregistered   timestamp   — signup date (the report keys date range off this)
 *
 * The funnel joins each source bucket to downstream orders via `userid`:
 *   tb_users.userid → tb_forwarder.userid (ฝากนำเข้า) — counted as "converted".
 * Revenue per source = Σ tb_forwarder.ftotalprice for that bucket's customers.
 */

/** A single acquisition-source bucket (grouped by registration channel). */
export type SourceRow = {
  /** Stable React key + group key (raw `userregisterwith` value, "" → "unknown"). */
  key: string;
  /** Display label for the channel. */
  label: string;
  /** Total customers acquired via this channel (within the date range). */
  leads: number;
  /** Of those, how many are cold (never contacted · useractive=''). */
  cold: number;
  /** Of those, how many placed ≥1 forwarder order (joined by userid). */
  converted: number;
  /** Σ forwarder revenue (ftotalprice) attributable to this channel's customers. */
  revenue: number;
  /** converted / leads × 100 (0 when leads is 0). */
  conv_pct: number;
};

/** A referral-source bucket (grouped by `userrecom`). */
export type ReferralRow = {
  key: string;
  label: string;
  leads: number;
};

/** The full attribution report payload. */
export type AttributionReport = {
  /** Per-registration-channel rows (the headline source→lead→order funnel). */
  sources: SourceRow[];
  /** Top referrers (userrecom) — who's bringing customers in. */
  referrals: ReferralRow[];
  /** Grand totals across all sources. */
  totalLeads: number;
  totalCold: number;
  totalConverted: number;
  totalRevenue: number;
  /** True when the date-window pull hit the row cap (results may undercount). */
  capped: boolean;
  /** True when NO customers were found in range (drives the empty-state copy). */
  empty: boolean;
};

/**
 * Registration-channel labels — `tb_users.userregisterwith` per the legacy
 * column comment (migration 0081): "วิธีสมัครสมาชิก PCS=สมาชิกในระบบ,F=เฟสบุ๊ก,L=ไลน์".
 * Unknown / empty values fall through to "ไม่ระบุแหล่งที่มา".
 */
export const REGISTER_WITH_LABEL: Record<string, string> = {
  PCS: "สมัครในระบบ (เว็บ)",
  F: "Facebook",
  L: "LINE",
  email: "อีเมล (Pacred)",
  facebook: "Facebook",
  line: "LINE",
  google: "Google",
};

/** Map a raw `userregisterwith` value to a display label. */
export function registerWithLabel(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "ไม่ระบุแหล่งที่มา";
  return REGISTER_WITH_LABEL[v] ?? `ช่องทาง: ${v}`;
}

/** Map a raw `userrecom` referral value to a display label. */
export function referralLabel(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "ไม่มีผู้แนะนำ";
  return v;
}

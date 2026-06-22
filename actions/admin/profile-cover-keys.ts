/**
 * Plain constants for the customer-profile cover feature. Kept OUT of the
 * "use server" action file (which may only export async functions) so both the
 * server action and the server component (legacy-view) can import them.
 */

export const PROFILE_COVER_KEY = "customer_profile.cover_path";
export const PROFILE_COVER_BUCKET = "member-docs";

/**
 * Per-customer cover key (owner 2026-06-22) — each customer can set their OWN
 * cover on /profile, independent of the GLOBAL admin banner (PROFILE_COVER_KEY).
 * Stored as a self-seeding `business_config` row (no migration · same mechanism
 * as the global cover). The customer's own cover wins; an unset one falls back
 * to the global banner, then the bundled default.
 */
export function customerCoverKey(memberCode: string): string {
  return `${PROFILE_COVER_KEY}.member.${memberCode}`;
}

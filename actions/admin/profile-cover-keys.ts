/**
 * Plain constants for the customer-profile cover feature. Kept OUT of the
 * "use server" action file (which may only export async functions) so both the
 * server action and the server component (legacy-view) can import them.
 */

export const PROFILE_COVER_KEY = "customer_profile.cover_path";
export const PROFILE_COVER_BUCKET = "member-docs";

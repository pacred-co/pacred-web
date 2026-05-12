/**
 * TOS (Terms of Service) versioning.
 *
 * Bump CURRENT_TOS_VERSION whenever the customer-facing terms change.
 * The (protected) layout reads profile.tos_accepted_version and shows
 * a blocking modal until the user re-accepts.
 *
 * Version format: YYYY-MM-DD of publication.
 */

export const CURRENT_TOS_VERSION = "2026-05-12";

/** True if the user has accepted the current version. */
export function isTosCurrent(acceptedVersion: string | null | undefined): boolean {
  return acceptedVersion === CURRENT_TOS_VERSION;
}

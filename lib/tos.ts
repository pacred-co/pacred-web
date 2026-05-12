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

/**
 * True if the user has accepted the current version.
 *
 * `undefined` means the profile object doesn't carry the column at all
 * (migration 0006 hasn't been applied yet to this DB). Treat as
 * accepted so the gate doesn't appear on un-migrated dev environments
 * — production must apply all migrations before launch.
 */
export function isTosCurrent(acceptedVersion: string | null | undefined): boolean {
  if (acceptedVersion === undefined) return true;
  return acceptedVersion === CURRENT_TOS_VERSION;
}

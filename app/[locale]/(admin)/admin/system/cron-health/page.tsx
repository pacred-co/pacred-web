import { redirect } from "next/navigation";

/**
 * Sprint-11 P2.3.C — /admin/system/cron-health alias.
 *
 * The cron-health dashboard already lives at /admin/system/crons (with
 * its trigger-button companion + cron_invocations + lib/cron/registry +
 * lib/cron/instrument wiring). The sprint spec asks for /cron-health as
 * the path; rather than fork or duplicate, this alias redirects to the
 * single canonical implementation.
 *
 * If someone bookmarks /cron-health (the more discoverable name), they
 * land on the working dashboard. If sidebar entries point at /crons,
 * those still work too. One implementation, two URLs.
 *
 * Coverage of all vercel.json crons is provided by lib/cron/registry.ts.
 * (dispatch-line-notify entry removed 2026-05-26 with the dead LINE
 * Notify stack — see docs/learnings/partner-apis-quirks.md.)
 */
export default function CronHealthAliasPage() {
  redirect("/admin/system/crons");
}

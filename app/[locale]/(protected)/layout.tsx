import { requireAuth } from "@/lib/auth/require-auth";
import { NavBar } from "@/components/sections/navbar";
import { ProtectedSidebar } from "@/components/sections/protected-sidebar";
import { TosGate } from "@/components/tos-gate";
import { FloatingActionMenu } from "@/components/floating-action-menu";
import { isTosCurrent, getActiveTosVersion } from "@/lib/tos";
import { getSidebarData } from "@/lib/sidebar-data";

/**
 * Layout for routes under (protected).
 * Redirects:
 *   - to /login if not signed in
 *   - to /complete-profile if signed in but profile incomplete
 * Renders TosGate modal if profile.tos_accepted_version doesn't match
 * the ACTIVE version (V-G4.1 — DB-driven with site.ts fallback).
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireAuth();

  // V-G4.1 — resolve active TOS version from DB (with hardcoded fallback).
  // Never throws — getActiveTosVersion swallows errors and returns the
  // constant if DB is unreachable / empty.
  const activeTos = await getActiveTosVersion("all");
  const needsTosAccept = !!profile && !isTosCurrent(profile.tos_accepted_version, activeTos.version_no);

  // Fetch sidebar badges + sales rep; tolerate any DB-shape skew silently.
  let sidebarData: Awaited<ReturnType<typeof getSidebarData>> = {
    badges: {},
    salesRep: null,
  };
  if (profile) {
    try {
      sidebarData = await getSidebarData(profile.id);
    } catch {
      /* keep defaults */
    }
  }

  return (
    <>
      <NavBar />
      <div className="protected-content pb-16 lg:pb-0">{children}</div>
      <ProtectedSidebar badges={sidebarData.badges} salesRep={sidebarData.salesRep} />
      <FloatingActionMenu />
      {needsTosAccept && (
        <TosGate
          versionNo={activeTos.version_no}
          title={activeTos.title}
          bodyMd={activeTos.body_md}
        />
      )}
    </>
  );
}

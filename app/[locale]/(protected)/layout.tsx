import { requireAuth } from "@/lib/auth/require-auth";
import { NavBar } from "@/components/sections/navbar";
import { ProtectedSidebar } from "@/components/sections/protected-sidebar";
import { TosGate } from "@/components/tos-gate";
import { isTosCurrent } from "@/lib/tos";

/**
 * Layout for routes under (protected).
 * Redirects:
 *   - to /login if not signed in
 *   - to /complete-profile if signed in but profile incomplete
 * Renders TosGate modal if profile.tos_accepted_version doesn't match
 * lib/tos.ts CURRENT_TOS_VERSION (B6).
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireAuth();
  const needsTosAccept = !!profile && !isTosCurrent(profile.tos_accepted_version);

  return (
    <>
      <NavBar />
      <div className="protected-content">{children}</div>
      <ProtectedSidebar />
      {needsTosAccept && <TosGate />}
    </>
  );
}

import { requireAuth } from "@/lib/auth/require-auth";
import { NavBar } from "@/components/sections/navbar";
import { ProtectedSidebar } from "@/components/sections/protected-sidebar";

/**
 * Layout for routes under (protected).
 * Redirects:
 *   - to /login if not signed in
 *   - to /complete-profile if signed in but profile incomplete
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();
  return (
    <>
      <NavBar />
      <div className="protected-content">{children}</div>
      <ProtectedSidebar />
    </>
  );
}

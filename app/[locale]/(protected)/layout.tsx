import { requireAuth } from "@/lib/auth/require-auth";
import { TosGate } from "@/components/tos-gate";
import { ImpersonationBanner } from "@/components/sections/impersonation-banner";
import { isTosCurrent } from "@/lib/tos";
import { getActiveTosVersion } from "@/lib/tos-server";

/**
 * Layout for routes under (protected) — the D1 faithful-port customer portal.
 *
 * MINIMAL wrapper by design (owner's 1:1 directive). It does the auth gate +
 * the TOS gate, then renders the screen — and NOTHING else. The Pacred app
 * chrome (NavBar · the protected sidebar / mobile bottom-nav · the floating
 * action menu) is intentionally NOT rendered: every customer screen here is a
 * 1:1 transcription of a legacy PCS `member/*.php` page and carries the
 * legacy chrome itself — the `menu.php` launchpad IS the navigation. Pacred
 * chrome layered on top would double the nav and break the 1:1 fidelity.
 *
 * Redirects (via requireAuth): → /login if not signed in · → /complete-profile
 * if signed in but the profile is incomplete.
 *
 * NOTE — `TosGate` is a Pacred-added compliance gate the legacy PCS portal did
 * not have. It is kept for legal consent; whether strict 1:1 should drop it is
 * a เดฟ/ก๊อต call (flagged in the faithful-port plan).
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireAuth();

  // Resolve the active TOS version from DB (hardcoded fallback; never throws).
  const activeTos = await getActiveTosVersion("all");
  const needsTosAccept =
    !!profile && !isTosCurrent(profile.tos_accepted_version, activeTos.version_no);

  return (
    <>
      <ImpersonationBanner />
      {children}
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

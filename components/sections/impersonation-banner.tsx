/**
 * G-4 · Impersonation banner — red overlay shown on every protected
 * page while admin is viewing-as-customer.
 *
 * Mounts inside (protected)/layout.tsx. Server Component — pulls the
 * effective user state directly so it's invisible during normal use
 * (no client-side flash, no extra round-trip).
 *
 * The "exit" button calls the adminEndImpersonation server action via
 * a small client wrapper (ImpersonationExitButton). Banner copy is
 * Thai-first to match the rest of the admin chrome.
 */

import { getEffectiveUser } from "@/lib/auth/get-user";
import { ImpersonationExitButton } from "./impersonation-exit-button";
import { ImpersonationCountdown } from "./impersonation-countdown";

export async function ImpersonationBanner() {
  const eff = await getEffectiveUser();
  if (!eff || !eff.isImpersonating) return null;
  const p = eff.profile;
  if (!p._impersonating) return null;  // narrow — never true given check above

  const displayName = p.account_type === "juristic" && p.company_name
    ? p.company_name
    : `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "ลูกค้า";

  return (
    <div
      role="alert"
      className="sticky top-0 z-[60] w-full bg-red-600 text-white shadow-lg border-b-2 border-red-800"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden className="text-base">⚠️</span>
          <span className="font-semibold">
            ดูในมุมของ {displayName}
            {p.member_code ? (
              <span className="ml-1.5 font-mono text-xs opacity-90">({p.member_code})</span>
            ) : null}
          </span>
          {/* Time-remaining display lives in the client child below —
              React 19's purity rule rejects Date.now() in Server
              Components, and the value would be stale by hydration
              anyway. The child ticks once per minute. */}
          <ImpersonationCountdown expiresAt={p._expires_at} />
        </div>
        <ImpersonationExitButton />
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { LinkLineClient } from "./link-line-client";

/**
 * D-1-LIFF — LINE customer→profile linkage entrypoint.
 *
 * Spec: Part Q in PORT_PLAN.md.  Without this page, every push from
 * `lib/notifications/index.ts` to a customer is a silent no-op because
 * `profiles.line_user_id` stays NULL forever (no other populator exists).
 *
 * Flow:
 *   1. Customer (must already be signed in to Pacred) opens this URL —
 *      typically from "เชื่อม LINE OA" CTA at /profile, or from a LINE OA
 *      rich menu / push that links here.
 *   2. Client component initialises @line/liff with NEXT_PUBLIC_LIFF_ID,
 *      triggers liff.login() if needed, then liff.getProfile() to obtain
 *      the LINE userId.
 *   3. POSTs the userId to actions/profile.ts → linkLineAccount() which
 *      writes profiles.line_user_id + line_linked_at.
 *
 * The Pacred-session check is enforced *here* (server) — the LIFF SDK
 * itself only proves the user is a LINE user, not which Pacred account to
 * attach the linkage to.
 *
 * `allowIncomplete: true` so a user mid-onboarding can still link LINE; the
 * server action does the same auth check independently anyway.
 */
export default async function LiffLinkPage() {
  const { user, profile } = await requireAuth({ allowIncomplete: true });

  if (profile?.status === "suspended") {
    // Same posture as the rest of the protected layouts — never let a
    // suspended account take any action.
    redirect("/login");
  }

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID ?? null;
  const t = await getTranslations("liff");

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-surface p-6 shadow-[0_8px_40px_rgba(0,0,0,0.10)] space-y-4">
        <header className="space-y-1">
          <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </header>

        <LinkLineClient
          liffId={liffId}
          alreadyLinked={!!profile?.line_user_id}
          accountLabel={profile?.first_name ?? user.email ?? user.id.slice(0, 8)}
        />
      </div>
    </main>
  );
}

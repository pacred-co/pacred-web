"use client";

/**
 * G-4 · "Exit impersonation" pill — sits inside ImpersonationBanner.
 *
 * Client Component because it invokes the adminEndImpersonation
 * server action + refreshes the router so the banner unmounts and
 * the admin's own session is reflected immediately.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminEndImpersonation } from "@/actions/admin/impersonation";

export function ImpersonationExitButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function exit() {
    startTransition(async () => {
      await adminEndImpersonation();
      // Send admin back to the customer detail page they came from.
      // Best-effort — if that route is unavailable, /admin works too.
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={exit}
      disabled={pending}
      className="rounded-md bg-white/15 hover:bg-white/25 disabled:opacity-60 px-3 py-1 text-xs font-semibold tracking-wide transition-colors"
    >
      {pending ? "กำลังออก…" : "ออกจากโหมดดูแทน →"}
    </button>
  );
}

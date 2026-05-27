"use client";

/**
 * G-4 · "View as customer" button — sits in the admin customer detail
 * header. Calls adminBeginImpersonation + navigates the admin into the
 * customer portal (/orders is a safe landing because it's a read-only
 * list every customer can see).
 *
 * Only super + ops see this button (server-side roles gate at mount).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminBeginImpersonation } from "@/actions/admin/impersonation";

type Props = {
  targetProfileId: string;
  targetDisplayName: string;
};

export function ViewAsCustomerButton({ targetProfileId, targetDisplayName }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function begin() {
    setErr(null);
    startTransition(async () => {
      const res = await adminBeginImpersonation({ target_profile_id: targetProfileId });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      // Land on the customer portal launchpad — `/` is the PUBLIC marketing
      // home, which doesn't even render the `(protected)/layout.tsx` shell,
      // so the impersonation banner that lives in that layout would never
      // appear. `/dashboard` is the (protected) entry. Aligned with the
      // post-login redirect fix 2026-05-26 (login + register personal +
      // juristic + OAuth callback all default to /dashboard per
      // d1-fidelity-customer.md §2).
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={begin}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-60 transition-colors"
        title={`เปิดหน้าจอลูกค้าในมุมของ ${targetDisplayName} (อ่านอย่างเดียว · 30 นาที)`}
      >
        <span aria-hidden>👁️</span>
        ดูในมุมลูกค้า
      </button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

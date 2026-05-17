"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminArchiveContainerCost } from "@/actions/admin/container-costs";

/**
 * U2-2: per-row controls for the rate-card list. V1 is archive-only —
 * full edit (extending effective_to without closing) can land in V1.1
 * if staff asks.
 */

export function ContainerCostRowControls({
  id,
  isActive,
}: {
  id:       string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function doArchive() {
    if (!confirm("ปิดใช้ rate card นี้? (effective_to = วันนี้)")) return;
    startTransition(async () => {
      const res = await adminArchiveContainerCost({ id });
      if (res.ok) {
        router.refresh();
      } else {
        alert(`ปิดไม่สำเร็จ: ${res.error}`);
      }
    });
  }

  if (!isActive) {
    return <span className="text-[11px] text-muted italic">ปิดแล้ว</span>;
  }

  return (
    <button
      type="button"
      onClick={doArchive}
      disabled={pending}
      className="text-[11px] underline text-red-600 hover:text-red-800 disabled:opacity-50"
    >
      ปิดใช้
    </button>
  );
}

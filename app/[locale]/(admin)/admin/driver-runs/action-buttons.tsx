"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { driverUpdateOwnAssignmentStatus } from "@/actions/admin/forwarder-drivers";

// CT-7 — driver-self accept (1→2) / complete (2→4) + jump-to-scan for status 2.

export function DriverActionButtons({
  assignmentId,
  status,
  shipmentCode,
}: {
  assignmentId: string;
  status:       number;
  shipmentCode: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function act(action: "accept" | "complete") {
    setErr(null);
    if (action === "complete" && !confirm("ยืนยันส่งงานนี้สำเร็จ ?")) return;
    startTransition(async () => {
      const res = await driverUpdateOwnAssignmentStatus({ id: assignmentId, action });
      if (res.ok) {
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 1 && (
        <button
          type="button"
          onClick={() => act("accept")}
          disabled={pending}
          className="rounded-lg bg-blue-600 text-white px-4 py-2 text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก..." : "✓ รับงาน"}
        </button>
      )}
      {status === 2 && (
        <>
          <Link
            href="/admin/barcode/driver"
            className="rounded-lg bg-primary-500 text-white px-4 py-2 text-xs font-bold hover:bg-primary-600"
          >
            📦 สแกนส่ง
          </Link>
          <button
            type="button"
            onClick={() => act("complete")}
            disabled={pending}
            className="rounded-lg border border-green-300 bg-green-50 text-green-800 px-4 py-2 text-xs font-bold hover:bg-green-100 disabled:opacity-50"
          >
            {pending ? "กำลังบันทึก..." : "✅ ยืนยันส่งสำเร็จ"}
          </button>
        </>
      )}
      {shipmentCode && (
        <Link
          href={`/shipments/${shipmentCode}`}
          className="rounded-lg border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          🚚 ดู timeline
        </Link>
      )}
      {err && <span className="text-[10px] text-red-700">{err}</span>}
    </div>
  );
}

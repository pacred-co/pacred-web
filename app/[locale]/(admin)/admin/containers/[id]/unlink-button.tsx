"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUnlinkForwarder } from "@/actions/admin/containers";

export function UnlinkButton({ id, fNo }: { id: string; fNo: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function unlink() {
    if (!confirm(`ปลดผูก ${fNo} ออกจากตู้นี้?`)) return;
    startTransition(async () => {
      const res = await adminUnlinkForwarder({ forwarder_id: id });
      if (res.ok) router.refresh();
      else alert(res.error);
    });
  }

  return (
    <button
      type="button"
      onClick={unlink}
      disabled={pending}
      className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] text-red-700 hover:bg-red-100 disabled:opacity-40"
    >
      {pending ? "..." : "ปลด"}
    </button>
  );
}

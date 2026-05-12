"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Eye, CheckCircle, Ban, Loader2 } from "lucide-react";
import { approveCustomer, suspendCustomer } from "@/actions/admin-customers";

type Props = {
  id: string;
  status: string;
};

export function CustomerRowActions({ id, status }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function handleApprove() {
    start(async () => {
      await approveCustomer(id);
    });
  }

  function handleSuspend() {
    start(async () => {
      await suspendCustomer(id);
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => router.push(`/admin/customers/${id}` as Parameters<typeof router.push>[0])}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground transition-colors"
        title="ดูรายละเอียด"
      >
        <Eye className="h-4 w-4" />
      </button>

      {(status === "incomplete" || status === "suspended") && (
        <button
          type="button"
          disabled={pending}
          onClick={handleApprove}
          className="flex h-7 items-center gap-1 rounded-lg bg-green-50 dark:bg-green-900/20 px-2 text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-100 disabled:opacity-50 transition-colors"
          title="Approve"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
          Approve
        </button>
      )}

      {status === "active" && (
        <button
          type="button"
          disabled={pending}
          onClick={handleSuspend}
          className="flex h-7 items-center gap-1 rounded-lg bg-red-50 dark:bg-red-900/20 px-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 disabled:opacity-50 transition-colors"
          title="ระงับ"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
          ระงับ
        </button>
      )}
    </div>
  );
}

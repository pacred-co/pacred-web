"use client";

/**
 * Per-row actions on `/admin/customers` — ดูรายละเอียด · Approve · ระงับ.
 *
 * Wave 23 P0 #3 (Task #156 · 2026-05-27 night): the red ⊘ "ระงับ" button
 * used to mutate `tb_users.userstatus → '0'` on a single bare click — Agent K
 * accidentally suspended PR10899 during yesterday's audit by misclicking.
 * We now gate BOTH Approve + ระงับ behind a PacredDialog confirm step:
 *   - Suspend → destructive (locks out an active customer immediately)
 *   - Approve → destructive in the other direction (a misclick re-activates
 *     a customer whose suspension was intentional)
 * The "ดูรายละเอียด" eye button stays bare — it's a pure navigation, no
 * server mutation. Server-action errors are surfaced via the shared `alert()`
 * from the same hook (per AGENTS.md §0c — never silent-swallow).
 */

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Eye, CheckCircle, Ban, Loader2 } from "lucide-react";
import { approveCustomer, suspendCustomer } from "@/actions/admin/customers";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

type Props = {
  id: string;
  status: string;
};

export function CustomerRowActions({ id, status }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { confirm, alert, dialogs } = useConfirmDialogs();

  async function handleApprove() {
    const ok = await confirm(
      `ต้องการ Approve ลูกค้า ${id} จริงๆ?\n\nลูกค้าจะกลับมาใช้งานระบบได้ทันที — ถ้าก่อนหน้านี้ถูกระงับโดยตั้งใจ การกดยืนยันจะยกเลิกการระงับนั้น.`,
    );
    if (!ok) return;
    start(async () => {
      const res = await approveCustomer(id);
      if (!res.ok) await alert(`Approve ไม่สำเร็จ: ${res.error}`);
    });
  }

  async function handleSuspend() {
    const ok = await confirm(
      `ต้องการระงับลูกค้า ${id} จริงๆ?\n\nลูกค้าจะไม่สามารถ login เข้าระบบได้จนกว่าจะถูก Approve ใหม่.`,
    );
    if (!ok) return;
    start(async () => {
      const res = await suspendCustomer(id);
      if (!res.ok) await alert(`ระงับไม่สำเร็จ: ${res.error}`);
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

      {dialogs}
    </div>
  );
}

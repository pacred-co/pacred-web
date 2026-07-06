"use client";

/**
 * "รันเลข PR ลูกค้าใหม่" — ULTRA-ONLY button (rendered next to รีเซ็ตรหัสผ่าน in the
 * customer Danger Zone). Re-assigns the customer a NEW PR code = the LOWEST
 * VACANT gap, moves ALL data, frees the old code. Login + receipts + everything
 * keep working — only the number changes.
 *
 * §0f confirm-before-mutate: a dialog states old → (auto lowest-vacant) + the
 * consequence "ย้ายข้อมูลทั้งหมด · เลขเก่าจะว่าง" before firing. On success it shows
 * the new code + moved-row summary and offers to jump to the new customer page
 * (the old code page now 404s).
 *
 * The server action re-checks the ultra role — this button only renders for
 * ultra (parent gates on `roles.includes("ultra")`); the client visibility is a
 * convenience, the action is the real gate.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Hash, ArrowRight, X } from "lucide-react";
import { confirm } from "@/components/ui/confirm";
import { adminReassignCustomerCode } from "@/actions/admin/reassign-customer-code";

type Props = {
  /** Current member code (tb_users.userID). */
  userid: string;
  /** Customer name — shown in the confirm dialog + result. */
  customerName?: string;
};

type Done = { toCode: string; movedRows: number; tableCount: number; authWarning?: string };

export function ReassignCodeButton({ userid, customerName }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState<Done | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleClick() {
    setErr(null);
    setDone(null);
    const who = customerName ? `${customerName} (${userid})` : userid;
    const ok = await confirm(
      `จะย้ายลูกค้า ${who} ไปเลข PR ใหม่ (เลขต่ำสุดที่ว่างอยู่)\n\n` +
        `• ย้ายข้อมูลทั้งหมดไปเลขใหม่ (ออเดอร์ · กระเป๋าเงิน · ใบเสร็จ · ที่อยู่ ฯลฯ)\n` +
        `• เลขเก่า ${userid} จะว่าง (นำไปใช้ใหม่ได้)\n` +
        `• ลูกค้ายัง login + ออกใบเสร็จ ได้เหมือนเดิม (รหัสผ่านไม่เปลี่ยน)\n\n` +
        `ยืนยันดำเนินการ?`,
      {
        title: "รันเลข PR ลูกค้าใหม่",
        confirmLabel: "รันเลขใหม่",
        cancelLabel: "ยกเลิก",
      },
    );
    if (!ok) return;

    start(async () => {
      const res = await adminReassignCustomerCode({ memberCode: userid });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setDone({
        toCode: res.data!.toCode,
        movedRows: res.data!.movedRows,
        tableCount: res.data!.tableCount,
        authWarning: res.data!.authWarning,
      });
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className="flex h-7 items-center gap-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 px-2 text-xs font-medium text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
        title="รันเลข PR ลูกค้าใหม่ (เลขต่ำสุดที่ว่าง) — เฉพาะ Ultra Admin Z"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Hash className="h-3 w-3" />}
        รันเลข PR ลูกค้าใหม่
      </button>

      {err && (
        <span className="ml-2 text-[11px] text-red-600" role="alert">
          {err}
        </span>
      )}

      {done && (
        <div
          className="fixed bottom-6 right-6 z-50 w-[min(92vw,440px)] rounded-xl border border-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 dark:border-indigo-700 p-4 shadow-lg"
          role="alert"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2 min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                <span className="font-mono">{userid}</span>
                <ArrowRight className="h-3.5 w-3.5" />
                <span className="font-mono text-sm font-bold">{done.toCode}</span>
              </p>
              <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
                ย้าย {done.movedRows.toLocaleString("th-TH")} แถว · {done.tableCount} ตาราง เสร็จแล้ว ·
                เลข {userid} ว่างแล้ว · ลูกค้า login/ออกใบเสร็จได้เหมือนเดิม
              </p>
              {done.authWarning && (
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  ⚠ ย้ายข้อมูลแล้ว แต่ปรับอีเมล login ไม่สำเร็จ — แจ้งเดฟให้ realign auth email ({done.authWarning})
                </p>
              )}
              <button
                type="button"
                onClick={() => router.push(`/admin/customers/${done.toCode}`)}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-white dark:bg-surface px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
              >
                เปิดหน้าลูกค้า {done.toCode} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setDone(null)}
              className="text-indigo-700 hover:text-indigo-900"
              title="ปิด"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

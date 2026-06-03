"use client";

/**
 * Client island for the per-row "ลบรายการ" + "พิมพ์บิลรวม" actions on
 * the combine-bill list page (`/admin/forwarders/combine-bill`).
 *
 * The list page itself is a Server Component; this island carries the
 * onClick handlers + confirm dialog + Server Action call.
 *
 * Wave 23 P0 fix #4 (Task #153, 2026-05-26 ค่ำ): two bugs the audit
 * caught replaced here:
 *   1. `<a href="#">` placeholder on the delete button. Buttons that
 *      do nothing on first click + then jump-scroll to top on second
 *      click. Replaced with a real `<button>` element (no href).
 *   2. Native `window.confirm()` chrome was off-brand. Replaced with
 *      the shared `useConfirmDialogs()` hook from `components/ui/
 *      pacred-dialog.tsx` (the same kit used by Wave 22's
 *      admin-profile-client + customers/suspend flows).
 *
 * Print button also migrated: legacy `<a target="_blank">` wrapping a
 * `<span class="btn ...">` (Bootstrap chrome) → real `<a>` styled with
 * Pacred Tailwind (matches the surrounding page rewrite from Wave 20).
 *
 * Mutation gate: the page only renders this island when the user has
 * the mutation roles, so client-side defence is unnecessary; the
 * Server Action enforces auth again per ADR-0002.
 */

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { adminDeleteCombineBill } from "@/actions/admin/combine-bill";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

type Props = {
  billId: number;
  printHref: string;
  /** When false (bill has 0 items) print is disabled — clicking would 404
   *  the print page since it requires ?id[]=… ≥ 1 to render. ภูม flag
   *  2026-06-03: catch this at the row-action layer so staff sees a clear
   *  "0 รายการ" hint instead of the print-page error message. */
  hasItems?: boolean;
};

export function CombineBillRowActions({ billId, printHref, hasItems = true }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { confirm, alert, dialogs } = useConfirmDialogs();

  async function handleDelete() {
    const ok = await confirm(
      `ลบบิลรวม #${billId} ?\nรายการฝากนำเข้าในบิลนี้จะถูกถอดออก แต่ไม่ลบรายการฝากนำเข้าเอง`,
    );
    if (!ok) return;

    start(async () => {
      const res = await adminDeleteCombineBill({ billId });
      if (!res.ok) {
        await alert(`ผิดพลาด: ${res.error ?? "กรุณาลองใหม่ภายหลัง"}`);
        return;
      }
      // Server action revalidates the path; router.refresh() re-fetches
      // the Server Component on the client side too so the UI updates
      // immediately without a full reload.
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "กำลังลบ…" : "ลบรายการ"}
      </button>
      {hasItems ? (
        <a
          href={printHref}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-primary-300 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
        >
          พิมพ์บิลรวม
        </a>
      ) : (
        <span
          title="บิลนี้ยังไม่มีรายการฝากนำเข้า — เพิ่มรายการก่อนถึงจะพิมพ์ได้"
          className="rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-400 cursor-not-allowed"
        >
          พิมพ์บิลรวม
        </span>
      )}
      {dialogs}
    </>
  );
}

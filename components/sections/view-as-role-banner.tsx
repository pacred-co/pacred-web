"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearViewAsRole } from "@/actions/admin/view-as-role";

/**
 * 👁 View-as-role banner — an amber bar at the top of the admin content while a
 * role preview is active (mirrors the impersonation banner). In normal document
 * flow so it pushes content down (no overlap). It makes the preview obvious +
 * gives a prominent exit; the header picker also exits. Real permissions are
 * unchanged — this is display-only (see lib/admin/view-as-role.ts).
 */
export function ViewAsRoleBanner({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function exit() {
    startTransition(async () => {
      await clearViewAsRole();
      router.refresh();
    });
  }

  return (
    <div
      role="alert"
      className="print:hidden sticky top-14 z-[55] border-b-2 border-amber-500 bg-amber-300 text-amber-950 shadow-sm"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
        <span className="flex items-center gap-2 min-w-0">
          <span aria-hidden className="text-base">👁</span>
          <span className="font-medium">
            กำลังดูมุมมองของ role: <b className="font-bold">{label}</b>
            <span className="ml-1.5 text-xs opacity-80">
              — เห็นเฉพาะหน้าตา (เมนู/ต้นทุน) · สิทธิ์จริงของคุณยังเป็น Ultra Admin Z
            </span>
          </span>
        </span>
        <button
          type="button"
          onClick={exit}
          disabled={pending}
          className="shrink-0 rounded-full bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-50 hover:bg-amber-900 disabled:opacity-60"
        >
          {pending ? "กำลังออก…" : "ออกจากพรีวิว ✕"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { setViewAsRole, clearViewAsRole } from "@/actions/admin/view-as-role";

/**
 * 👁 View-as-role picker — lives ONLY on /admin/board/inbox (ภูม's own page ·
 * gated by the dev-cockpit allowlist AD008/admin_poom, so พี่ป๊อป never sees it).
 * Selecting a role sets the display-only preview cookie, then router.refresh()
 * re-renders the admin layout so the sidebar + cost-blur switch to that role's
 * view. "ตัวเอง (Ultra)" clears it. Real permissions never change — see
 * lib/admin/view-as-role.ts. Options come from the server so this client file
 * doesn't import the server-only lib. Styled as a light panel (2026-07-22 · was
 * white-on-red for the old shared header).
 */
export function ViewAsRoleSwitcher({
  options,
  active,
}: {
  options: ReadonlyArray<{ v: string; l: string }>;
  active: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(v: string) {
    startTransition(async () => {
      if (v === "") await clearViewAsRole();
      else await setViewAsRole(v);
      router.refresh();
    });
  }

  return (
    <section
      className={`rounded-2xl border p-4 shadow-sm transition ${
        active ? "border-amber-400 bg-amber-50" : "border-border bg-white dark:bg-surface"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
            active ? "bg-amber-400 text-amber-950" : "bg-surface-alt text-primary-600"
          }`}
          aria-hidden
        >
          <Eye className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight">👁 ดูมุมมองแบบแผนกอื่น</p>
          <p className="text-[11px] text-muted leading-tight">
            เครื่องมือตรวจงานของภูม · เห็นเฉพาะหน้าตา (เมนู/ต้นทุน) · สิทธิ์จริงยังเป็น Ultra Admin Z
          </p>
        </div>
      </div>

      <label className="mt-3 block">
        <span className="sr-only">เลือก role ที่จะดูมุมมอง</span>
        <select
          value={active ?? ""}
          disabled={pending}
          onChange={(e) => onChange(e.target.value)}
          aria-label="ดูมุมมองแบบ role อื่น"
          className={`w-full cursor-pointer rounded-lg border px-3 py-2 text-sm outline-none transition ${
            active
              ? "border-amber-400 bg-white font-semibold text-amber-950"
              : "border-border bg-white dark:bg-surface"
          } ${pending ? "opacity-60" : ""}`}
        >
          <option value="">ดูมุมมอง: ตัวเอง (Ultra Admin Z)</option>
          {options.map((o) => (
            <option key={o.v} value={o.v}>
              👁 {o.l}
            </option>
          ))}
        </select>
      </label>

      {active && (
        <p className="mt-2 text-[11px] font-medium text-amber-800">
          ● กำลังพรีวิว — sidebar + ต้นทุนของแผนกนี้จะโชว์ทุกหน้า จนกว่าจะเลือก “ตัวเอง” หรือกดออกจากแถบด้านบน
        </p>
      )}
    </section>
  );
}

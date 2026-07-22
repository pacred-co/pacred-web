"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { setViewAsRole, clearViewAsRole } from "@/actions/admin/view-as-role";

/**
 * 👁 View-as-role picker — sits in the admin header (god-only · gated by the
 * layout). Selecting a role sets the display-only preview cookie, then
 * router.refresh() re-renders the layout so the sidebar + cost-blur switch to
 * that role's view. "ตัวเอง (Ultra)" clears it. Real permissions never change —
 * see lib/admin/view-as-role.ts. The options list is passed from the server so
 * this client file doesn't import the server-only lib.
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
    <label
      title="ดูหน้าตา (sidebar) แบบ role อื่น — เพื่อตรวจงานแต่ละแผนก · สิทธิ์จริงของคุณไม่เปลี่ยน"
      className={`hidden md:flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
        active
          ? "border-amber-300 bg-amber-400/95 text-amber-950 font-semibold"
          : "border-white/40 bg-white/10 text-white hover:bg-white/20"
      } ${pending ? "opacity-60" : ""}`}
    >
      <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <select
        value={active ?? ""}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        aria-label="ดูมุมมองแบบ role อื่น"
        className={`max-w-[13rem] cursor-pointer bg-transparent pr-1 outline-none ${
          active ? "text-amber-950" : "text-white [&>option]:text-slate-800"
        }`}
      >
        <option value="">ดูมุมมอง: ตัวเอง (Ultra)</option>
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            👁 {o.l}
          </option>
        ))}
      </select>
    </label>
  );
}

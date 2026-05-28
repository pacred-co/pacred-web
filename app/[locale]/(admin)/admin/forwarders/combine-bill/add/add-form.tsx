"use client";

/**
 * Client island for the "เพิ่มรายการรวมบิล" form on
 * `/admin/forwarders/combine-bill/add`.
 *
 * Faithful-port mapping (logic preserved per AGENTS §0a):
 *   - The legacy form (forwarder-bill.php L472-487) is one `<input>`
 *     accepting a comma-separated forwarder-ID list + a single submit
 *     button. Same logic here; the onSubmit hooks into
 *     adminCreateCombineBill instead of the legacy `<form action>` POST.
 *   - The legacy success SweetAlert (L516-526) becomes a `window.alert`
 *     (the SweetAlert lift is a follow-up across admin UI). Same UX
 *     shape (success → redirect to the list page; error → message popup
 *     + stay on the form so the user can fix it).
 *
 * Wave 23 P2 (2026-05-27): Bootstrap-4 markup (form-control · input-group ·
 * btn btn-color-main · font-14) → Tailwind utilities. Pattern source:
 * /admin/reports/payment filter form. Page chrome already Tailwind
 * (Wave 20 P1-b) — this finishes the form-internals sweep.
 */

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { adminCreateCombineBill } from "@/actions/admin/combine-bill";

export function CombineBillAddForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    const raw = value.trim();
    if (!raw) {
      setError("กรุณากรอกเลขที่ออเดอร์อย่างน้อย 1 รายการ");
      return;
    }
    start(async () => {
      const res = await adminCreateCombineBill({ forwarderIds: raw });
      if (!res.ok) {
        setError(res.error ?? "กรุณาลองใหม่ภายหลัง");
        return;
      }
      // Faithful: legacy redirects back to the list view + flashes a
      // success SweetAlert (forwarder-bill.php L516-526). Mirror that
      // here with a redirect + a small notification.
      window.alert("สำเร็จ\nเพิ่มรายการรวมบิลแล้ว");
      router.push("/admin/forwarders/combine-bill");
    });
  }

  return (
    <form
      id="form"
      className="space-y-3"
      autoComplete="off"
      onSubmit={handleSubmit}
    >
      <p className="text-xs text-muted">
        กรอกเลขที่ออเดอร์นำเข้า โดยใช้เครื่องหมายคอมมาคั่นรายการ EX. 1,5,6
      </p>
      <div>
        <input
          type="text"
          id="search-tracking"
          name="ID"
          className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          placeholder="กรอกเลขที่ออเดอร์นำเข้า EX. 1,5,6"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
        />
      </div>
      {error && (
        <div className="text-center">
          <span className="text-xs text-red-700">{error}</span>
        </div>
      )}
      <div className="text-center pt-2">
        <button
          type="submit"
          name="add"
          className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600 disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={pending}
        >
          {pending ? "กำลังสร้าง…" : "สร้างรายการ"}
        </button>
      </div>
    </form>
  );
}

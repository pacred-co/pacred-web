"use client";

/**
 * Client island for the "เพิ่มรายการรวมบิล" form on
 * `/admin/forwarders/combine-bill/add`.
 *
 * Faithful-port mapping:
 *   - The legacy form (forwarder-bill.php L472-487) is one `<input>`
 *     accepting a comma-separated forwarder-ID list + a single submit
 *     button. Identical markup here; the onSubmit hooks into
 *     adminCreateCombineBill instead of the legacy `<form action>` POST.
 *   - The legacy success SweetAlert (L516-526) becomes a `window.alert`
 *     (the SweetAlert lift is a follow-up across admin UI). Same UX
 *     shape (success → redirect to the list page; error → message popup
 *     + stay on the form so the user can fix it).
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
      className="my-2 my-lg-0 justify-content-center"
      style={{ paddingTop: "30%" }}
      autoComplete="off"
      onSubmit={handleSubmit}
    >
      <h3 className="text-center text-color-main">เพิ่มรายการรวมบิล</h3>
      <div className="input-group mb-1">
        <span className="font-14">
          {" "}กรอกเลขที่ออเดอร์นำเข้า โดยใช้เครื่องหมายคอมมาคั่นรายการ EX.
          1,5,6
        </span>
      </div>
      <div className="input-group">
        <div className="w-100">
          <input
            type="text"
            id="search-tracking"
            name="ID"
            className="w-100 form-control product-search br-30"
            placeholder="กรอกเลขที่ออเดอร์นำเข้า EX. 1,5,6"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
          />
        </div>
      </div>
      {error && (
        <div className="text-center pt-1">
          <span className="text-danger font-14">{error}</span>
        </div>
      )}
      <div className="text-center pt-2">
        <button
          type="submit"
          name="add"
          className="btn btn-color-main round btn-min-width waves-effect"
          disabled={pending}
        >
          {pending ? "กำลังสร้าง…" : "สร้างรายการ"}
        </button>
      </div>
    </form>
  );
}

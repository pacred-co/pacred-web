"use client";

// M-1 (Wave A · 2026-06-01) — the per-row "ตั้งเป็นที่อยู่หลัก" button, rewired
// from the inert `data-legacy-onclick="setMainAddress(...)"` marker to the real
// server action. Non-destructive (upserts the single tb_address_main pointer),
// so no confirm. Rendered only on the non-main rows (the main row shows a static
// "ที่อยู่หลัก" pill). Dropped into both the mobile-card and desktop-table paths.

import { useTranslations } from "next-intl";
import { setMainAddressAction } from "./add-address-action";

export function SetMainAddressButton({ addressId }: { addressId: number }) {
  const t = useTranslations("addressPage");
  return (
    <form action={setMainAddressAction} className="inline-block">
      <input type="hidden" name="addressId" value={addressId} />
      <button
        type="submit"
        className="rounded-full border border-sky-300 px-3 py-1 text-xs font-medium text-sky-600 hover:bg-sky-50"
      >
        {t("setMain")}
      </button>
    </form>
  );
}

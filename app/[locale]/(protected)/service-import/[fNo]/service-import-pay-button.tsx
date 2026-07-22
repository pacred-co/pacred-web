"use client";

/**
 * "ชำระเงิน" button on the forwarder-detail page (forwarder.php L2140).
 *
 * Faithful 1:1 with the legacy `payForwarder([id])` AJAX call that opens
 * the multi-bill payment modal `#list-payment2`. Pacred reuses the same
 * <ForwarderPayModal> Client Component that the list-view pay-bar uses,
 * but seeded with this single forwarder row only.
 *
 * The legacy modal renders one itemised block per ticked row + a
 * PromptPay QR + slip upload; for a single-row detail-page click the
 * displayed bill = this row's price net.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ForwarderPayModal } from "../forwarder-pay-modal";
import type { ForwarderRow } from "../forwarder-row-view";

type Props = {
  /** EVERY payable row of this shipment (owner 2026-07-22 "1 การจ่าย = ทั้ง
   *  ชิปเม้น") — the [fNo] page seeds the clicked row + its payable siblings
   *  so the bill the modal shows == the whole-shipment ยอดเก็บจริง on the page. */
  rows: ForwarderRow[];
  isJuristic: boolean;
};

export function ServiceImportPayButton({ rows, isJuristic }: Props) {
  const t = useTranslations("serviceImportPayButton");
  const [open, setOpen] = useState(false);

  return (
    <>
      <a
        href="javascript:void(0)"
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        <span className="inline-flex w-full md:w-auto items-center justify-center gap-1.5 rounded-full bg-red-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm shadow-red-600/25 hover:bg-red-700 active:scale-[0.98] transition-all">
          <i className="mdi mdi-check-circle-outline"></i> {t("pay")}
          {rows.length > 1 ? ` (${rows.length} รายการในชิปเม้น)` : ""}
        </span>
      </a>
      <ForwarderPayModal
        rows={rows}
        isJuristic={isJuristic}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

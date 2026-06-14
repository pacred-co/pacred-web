"use client";

/**
 * <MarkPrintedOnMount> — fires markShopOrdersPrinted once when the print view
 * loads, flipping tb_header_order.hPrintBill/hPrintBill2 → '1' (faithful to
 * printShop.php, which flips on the print GET). Renders nothing.
 */

import { useEffect, useRef } from "react";
import { markShopOrdersPrinted } from "@/actions/admin/shop-print-flag";

export function MarkPrintedOnMount({ hNos, isReceipt }: { hNos: string[]; isReceipt: boolean }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || hNos.length === 0) return;
    done.current = true;
    void markShopOrdersPrinted({ hNos, isReceipt });
  }, [hNos, isReceipt]);
  return null;
}

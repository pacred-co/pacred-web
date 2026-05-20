"use client";

/**
 * Client island for the per-row "ลบรายการ" + "พิมพ์บิลรวม" actions on
 * the combine-bill list page (`/admin/forwarders/combine-bill`).
 *
 * The list page itself is a Server Component; this island carries the
 * onClick handlers + browser confirm() prompt + Server Action call.
 *
 * Faithful behaviour: legacy uses a SweetAlert (forwarder-bill.php
 * L319-351). Without SweetAlert in the Pacred stack we fall back to the
 * native `confirm()` — identical UX shape (confirm → delete → reload),
 * different chrome. A SweetAlert lift is a follow-up across the admin
 * UI; this island's API doesn't change when that lands.
 *
 * Mutation gate: the page only renders this island when the user has
 * the mutation roles, so client-side defence is unnecessary; the Server
 * Action enforces auth again per ADR-0002.
 */

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { adminDeleteCombineBill } from "@/actions/admin/combine-bill";

type Props = {
  billId: number;
  printHref: string;
};

export function CombineBillRowActions({ billId, printHref }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function handleDelete() {
    const ok = window.confirm(
      `คุณแน่ใจเหรอ?\nต้องลบรายการเลขที่ #${billId} นี้ออกจากรายการรวมบิล`,
    );
    if (!ok) return;

    start(async () => {
      const res = await adminDeleteCombineBill({ billId });
      if (!res.ok) {
        window.alert(`ผิดพลาด: ${res.error ?? "กรุณาลองใหม่ภายหลัง"}`);
        return;
      }
      // Faithful: legacy SweetAlert auto-closes + reloads; we refresh
      // the router so the Server Component re-fetches.
      router.refresh();
    });
  }

  return (
    <>
      <a
        href="#"
        data-action-delete-bill={billId}
        onClick={(e) => {
          e.preventDefault();
          if (!pending) handleDelete();
        }}
      >
        <span
          className="btn btn-sm btn-outline-danger round"
          style={pending ? { opacity: 0.5, pointerEvents: "none" } : undefined}
        >
          {pending ? "กำลังลบ…" : "ลบรายการ"}
        </span>
      </a>{" "}
      <a target="_blank" href={printHref} rel="noreferrer">
        <span className="mt-1 btn btn-sm btn-color-main round waves-effect">
          พิมพ์บิลรวม
        </span>
      </a>
    </>
  );
}

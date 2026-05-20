"use client";

/**
 * Client island for the per-row "ลบยิงเข้า" + "ค้นหาและเชื่อมรายการ"
 * actions on the warehouse-history page
 * (`/admin/forwarders/warehouse-history`).
 *
 * Faithful-port mapping:
 *   - "ลบยิงเข้า" — calls adminDeleteScan after a native confirm()
 *     (legacy uses SweetAlert at forwarder-import-warehouse.php
 *     L513-543; SweetAlert lift is a follow-up).
 *   - "ค้นหาและเชื่อมรายการ" — opens the relink modal (controlled by
 *     `WarehouseHistoryRelinkModal`) seeded with the orphan scan's
 *     `keysearch` tracking string + the scan ID. The legacy modal
 *     opener fires an AJAX call that fetches the modal HTML
 *     (forwarder-import-warehouse.php L545-554 +
 *     getListForwarderIm.php). The Pacred port keeps a singleton modal
 *     mounted at page root via `WarehouseHistoryModalHost`; per-row
 *     buttons publish open events through `openRelinkModal`.
 *
 * Variants:
 *   - "orphan" — relink + delete buttons (legacy L821-843).
 *   - "matched" — delete + ดูข้อมูล + อัปเดต buttons (legacy L1052-1074).
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter, Link } from "@/i18n/navigation";
import { adminDeleteScan } from "@/actions/admin/warehouse-history";
import { WarehouseHistoryRelinkModal } from "./warehouse-history-relink-modal";

// ────────────────────────────────────────────────────────────
// Cross-island event channel — per-row buttons → singleton modal host.
// Avoids context plumbing through the Server Component table.
// ────────────────────────────────────────────────────────────

type RelinkOpenDetail = { scanId: number; keysearch: string };
const RELINK_EVENT = "warehouse-history-open-relink";

export function openRelinkModal(detail: RelinkOpenDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<RelinkOpenDetail>(RELINK_EVENT, { detail }),
  );
}

// ────────────────────────────────────────────────────────────
// Singleton modal host — mounted once per page at root.
// ────────────────────────────────────────────────────────────

type RelinkContext = { scanId: number; keysearch: string } | null;

export function WarehouseHistoryModalHost() {
  const [ctx, setCtx] = useState<RelinkContext>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<RelinkOpenDetail>).detail;
      if (detail) setCtx({ scanId: detail.scanId, keysearch: detail.keysearch });
    };
    window.addEventListener(RELINK_EVENT, handler);
    return () => window.removeEventListener(RELINK_EVENT, handler);
  }, []);

  return (
    <WarehouseHistoryRelinkModal
      open={ctx !== null}
      onClose={() => setCtx(null)}
      scanId={ctx?.scanId ?? null}
      initialQuery={ctx?.keysearch ?? ""}
    />
  );
}

// ────────────────────────────────────────────────────────────
// Orphan-row actions — split into two siblings so the page can keep the
// "เชื่อมรายการ" button in the detail cell (legacy col 5) and the
// "ลบยิงเข้า" button in the action cell (legacy col 10).
// ────────────────────────────────────────────────────────────

type RelinkButtonProps = {
  scanId: number;
  keysearch: string;
};

export function WarehouseHistoryRelinkButton({
  scanId,
  keysearch,
}: RelinkButtonProps) {
  return (
    <a
      href="#"
      data-action-search={scanId}
      onClick={(e) => {
        e.preventDefault();
        openRelinkModal({ scanId, keysearch });
      }}
    >
      <p className="btn btn-sm font-12 btn-danger btn-rounded">
        ค้นหาและเชื่อมรายการ
      </p>
    </a>
  );
}

type DeleteScanButtonProps = {
  scanId: number;
};

export function WarehouseHistoryDeleteButton({
  scanId,
}: DeleteScanButtonProps) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function handleDelete() {
    const ok = window.confirm(
      `คุณแน่ใจเหรอ?\nต้องลบรายการเลขที่ #${scanId} นี้ออกจากรายการสินค้าเข้าโกดัง`,
    );
    if (!ok) return;
    start(async () => {
      const res = await adminDeleteScan({ scanId });
      if (!res.ok) {
        window.alert(`ผิดพลาด: ${res.error ?? "กรุณาลองใหม่ภายหลัง"}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <a
      href="#"
      data-action-delete={scanId}
      onClick={(e) => {
        e.preventDefault();
        if (!pending) handleDelete();
      }}
    >
      <p
        className="btn btn-sm font-12 btn-danger btn-rounded"
        style={pending ? { opacity: 0.5 } : undefined}
      >
        {pending ? "กำลังลบ…" : "ลบยิงเข้า"}
      </p>
    </a>
  );
}

// ────────────────────────────────────────────────────────────
// Matched-row actions — delete + ดูข้อมูล + อัปเดต (last is conditional).
// Re-uses WarehouseHistoryDeleteButton so the confirm/delete behaviour
// is single-sourced.
// ────────────────────────────────────────────────────────────

type MatchedProps = {
  scanId: number;
  forwarderId: number | null;
  forwarderStatus: string | null;
};

export function WarehouseHistoryMatchedActions({
  scanId,
  forwarderId,
  forwarderStatus,
}: MatchedProps) {
  return (
    <>
      <WarehouseHistoryDeleteButton scanId={scanId} />
      <Link href={`/admin/forwarder/detail/${forwarderId ?? ""}`}>
        <p className="btn btn-sm font-12 btn-outline-success btn-rounded p-05">
          {" "}ดูข้อมูล{" "}
        </p>
      </Link>
      {forwarderStatus !== "7" && (
        <Link href={`/admin/forwarder/update/${forwarderId ?? ""}`}>
          <p className="btn btn-sm font-12 btn-warning btn-rounded p-05">
            {" "}อัปเดต
          </p>
        </Link>
      )}
    </>
  );
}

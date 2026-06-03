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
import { confirm, alert } from "@/components/ui/confirm";

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
  // Wave 20 P1 — Tailwind rewrite; was Bootstrap `btn btn-sm btn-danger`.
  return (
    <button
      type="button"
      data-action-search={scanId}
      onClick={() => openRelinkModal({ scanId, keysearch })}
      className="mt-1 inline-flex items-center rounded-md bg-rose-600 text-white px-2 py-1 text-[11px] font-medium hover:bg-rose-700 transition-colors"
    >
      🔗 ค้นหาและเชื่อมรายการ
    </button>
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

  async function handleDelete() {
    const ok = await confirm(
      `คุณแน่ใจเหรอ?\nต้องลบรายการเลขที่ #${scanId} นี้ออกจากรายการสินค้าเข้าโกดัง`,
    );
    if (!ok) return;
    start(async () => {
      const res = await adminDeleteScan({ scanId });
      if (!res.ok) {
        await alert(`ผิดพลาด: ${res.error ?? "กรุณาลองใหม่ภายหลัง"}`);
        return;
      }
      router.refresh();
    });
  }

  // Wave 20 P1 — Tailwind rewrite; was Bootstrap `btn btn-sm btn-danger`.
  return (
    <button
      type="button"
      data-action-delete={scanId}
      onClick={() => { if (!pending) handleDelete(); }}
      disabled={pending}
      className={`inline-flex items-center justify-center rounded-md bg-rose-600 text-white px-2 py-1 text-[11px] font-medium hover:bg-rose-700 transition-colors ${pending ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {pending ? "กำลังลบ…" : "🗑 ลบยิงเข้า"}
    </button>
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
  // Wave 20 P1 — Tailwind rewrite. The legacy paths /admin/forwarder/detail/<id>
  // + /admin/forwarder/update/<id> (singular `forwarder`) DO NOT exist in
  // Pacred — the actual detail route is /admin/forwarders/[fNo]/page.tsx
  // (plural). The previous stale links 404'd; this fix points them at the
  // real route. There's no separate "update" route yet (the [fNo] detail
  // page has inline edit controls — Wave 12-D); the อัปเดต button is now
  // a stub with the same anchor.
  return (
    <div className="inline-flex flex-col gap-1">
      <WarehouseHistoryDeleteButton scanId={scanId} />
      <Link
        href={`/admin/forwarders/${forwarderId ?? ""}`}
        className="inline-flex items-center justify-center rounded-md border border-emerald-500 bg-white text-emerald-700 px-2 py-1 text-[11px] font-medium hover:bg-emerald-50 transition-colors"
      >
        ดูข้อมูล
      </Link>
      {forwarderStatus !== "7" && (
        <Link
          href={`/admin/forwarders/${forwarderId ?? ""}#edit`}
          className="inline-flex items-center justify-center rounded-md bg-amber-500 text-white px-2 py-1 text-[11px] font-medium hover:bg-amber-600 transition-colors"
        >
          อัปเดต
        </Link>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/ui/confirm";
import {
  bulkUpdateStatus,
  bulkAssignDriver,
  bulkCancel,
  type TbForwarderStatus,
} from "@/actions/admin/forwarders-bulk";
import { searchDriversByQuery, type DriverSearchHit } from "@/actions/admin/forwarder-drivers";

/**
 * V-G1 bulk-actions toolbar — sticky bar atop the forwarders table when
 * ≥1 row is checked. Mirrors `service-order-bulk-actions.tsx` (Sprint-9
 * commit 065b51b) shape; uses the legacy "modal-fade" semantics inline.
 *
 * Action set ports `forwarder-action.php` (L162-189 status tabs + the
 * AJAX-driven modal in `include/pages/forwarder-action/`):
 *   - เปลี่ยน status — pick target legacy fstatus ('1'..'7','99'); calls bulkUpdateStatus
 *   - มอบหมายคนขับ — fuzzy driver search + pick + endTime hr; calls bulkAssignDriver
 *   - ยกเลิก       — required reason ≥ 3 chars; calls bulkCancel
 *
 * Result rendering: every action returns `{ succeeded, failed }`; the
 * toolbar shows "สำเร็จ N รายการ" green banner + a yellow per-row failure
 * list (max 3 lines + "+M more") so the operator can act on the failures.
 *
 * P1-1/P1-2 (2026-05-30 night · open task #41): swapped status enum from
 * the rebuilt-string keys to the legacy numeric chars (`1`..`7`,`99`) —
 * single source of truth matches `tb_forwarder.fstatus` directly. The
 * `selectedFNos` prop is now stringified `tb_forwarder.id` values (not
 * `f_no`/UUID); parent components pass `Array.from(Set<number>).map(String)`.
 *
 * NOTE on reachability (AGENTS.md §0d): this component is currently NOT
 * mounted anywhere — the live /admin/forwarders page uses an inline
 * bulk-bar inside `forwarders-table.tsx`. Once the inline bar is migrated
 * to this component, the wiring will land. The retarget here is so the
 * action wiring is correct when that happens.
 */

type Props = {
  /**
   * Selected `tb_forwarder.id` values (bigint, stringified) — NOT f_no/UUID.
   * Renamed from `selectedFNos` for clarity but the prop name stays for
   * caller-side compat (parents pass `Array.from(Set<number>).map(String)`).
   */
  selectedFNos: string[];
  onClearSelection: () => void;
};

// Legacy fstatus matrix — matches `tb_forwarder.fstatus` (varchar(2) NOT NULL,
// default '1', schema citation 0081_pcs_legacy_schema.sql L1601). The labels
// mirror `forwarders-table.tsx` BULK_STATUS_OPTIONS verbatim.
const STATUSES: TbForwarderStatus[] = ["1", "2", "3", "4", "5", "6", "7", "99"];
const STATUS_LABEL: Record<TbForwarderStatus, string> = {
  "1":  "1 · รอเข้าโกดังจีน",
  "2":  "2 · ถึงโกดังจีนแล้ว",
  "3":  "3 · กำลังส่งมาไทย",
  "4":  "4 · ถึงไทยแล้ว",
  "5":  "5 · รอชำระเงิน",
  "6":  "6 · เตรียมส่ง",
  "7":  "7 · ส่งแล้ว",
  "99": "99 · สถานะพิเศษ",
};

type Mode = "idle" | "status" | "driver" | "cancel";
type Outcome = {
  succeededCount: number;
  failed: { fNo: string; error: string }[];
} | null;

export function BulkActionsToolbar({ selectedFNos, onClearSelection }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [topErr, setTopErr] = useState<string | null>(null);

  // Status mode
  const [targetStatus, setTargetStatus] = useState<TbForwarderStatus | "">("");
  const [statusNote, setStatusNote] = useState("");

  // Driver mode
  const [driverQuery, setDriverQuery] = useState("");
  const [driverHits, setDriverHits] = useState<DriverSearchHit[]>([]);
  const [pickedDriver, setPickedDriver] = useState<DriverSearchHit | null>(null);
  const [driverSearching, setDriverSearching] = useState(false);
  // Driver mode — endTime selector (legacy `addFrom.php` 17/24/30 hr select).
  // Default 17h matches the single-row driver assignment flow.
  const [driverEndTimeHours, setDriverEndTimeHours] = useState<17 | 24 | 30>(17);

  // Cancel mode
  const [cancelReason, setCancelReason] = useState("");

  function reset() {
    setMode("idle");
    setOutcome(null);
    setTopErr(null);
    setTargetStatus("");
    setStatusNote("");
    setDriverQuery("");
    setDriverHits([]);
    setPickedDriver(null);
    setDriverEndTimeHours(17);
    setCancelReason("");
  }

  function applyResult(res: Awaited<ReturnType<typeof bulkUpdateStatus>>) {
    if (!res.ok) {
      setTopErr(res.error);
      return;
    }
    const succeededCount = res.data?.succeeded.length ?? 0;
    setOutcome({
      succeededCount,
      failed: res.data?.failed ?? [],
    });
    if (succeededCount > 0) {
      onClearSelection();
      router.refresh();
    }
  }

  function runStatus() {
    if (!targetStatus) return;
    setTopErr(null);
    setOutcome(null);
    startTransition(async () => {
      const res = await bulkUpdateStatus(
        selectedFNos,
        targetStatus,
        statusNote.trim() || undefined,
      );
      applyResult(res);
    });
  }

  function runDriverSearch(q: string) {
    setDriverQuery(q);
    setPickedDriver(null);
    if (q.trim().length < 1) {
      setDriverHits([]);
      return;
    }
    setDriverSearching(true);
    void searchDriversByQuery({ q })
      .then((res) => {
        if (res.ok) setDriverHits(res.data?.hits ?? []);
        else        setDriverHits([]);
      })
      .finally(() => setDriverSearching(false));
  }

  function runDriverAssign() {
    if (!pickedDriver) return;
    setTopErr(null);
    setOutcome(null);
    startTransition(async () => {
      const res = await bulkAssignDriver(selectedFNos, pickedDriver.profile_id, driverEndTimeHours);
      applyResult(res);
    });
  }

  async function runCancel() {
    if (cancelReason.trim().length < 3) {
      setTopErr("เหตุผลต้องยาว ≥ 3 ตัวอักษร");
      return;
    }
    if (!(await confirm(`ยืนยันการยกเลิก ${selectedFNos.length} รายการ?`))) return;
    setTopErr(null);
    setOutcome(null);
    startTransition(async () => {
      const res = await bulkCancel(selectedFNos, cancelReason.trim());
      applyResult(res);
    });
  }

  return (
    <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-primary-700">
          เลือก {selectedFNos.length} รายการ
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => { reset(); setMode("status"); }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              mode === "status" ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border hover:bg-surface-alt"
            }`}
          >
            เปลี่ยน status
          </button>
          <button
            type="button"
            onClick={() => { reset(); setMode("driver"); }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              mode === "driver" ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border hover:bg-surface-alt"
            }`}
          >
            มอบหมายคนขับ
          </button>
          <button
            type="button"
            onClick={() => { reset(); setMode("cancel"); }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              mode === "cancel" ? "bg-red-500 text-white border-red-500" : "bg-white border-border hover:bg-surface-alt"
            }`}
          >
            ยกเลิก
          </button>
        </div>
        <button
          type="button"
          onClick={() => { reset(); onClearSelection(); }}
          className="ml-auto text-xs text-muted hover:text-foreground"
        >
          ยกเลิกเลือก
        </button>
      </div>

      {/* Status mode */}
      {mode === "status" && (
        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-primary-100">
          <select
            value={targetStatus}
            onChange={(e) => setTargetStatus(e.target.value as TbForwarderStatus | "")}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm"
          >
            <option value="">— เลือกสถานะปลายทาง —</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <input
            type="text"
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
            placeholder="หมายเหตุ (ถ้า rollback ต้องระบุ ≥ 3 ตัว)"
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm flex-1 min-w-[200px]"
          />
          <button
            type="button"
            onClick={runStatus}
            disabled={!targetStatus || pending}
            className="rounded-lg bg-primary-500 text-white px-4 py-1.5 text-sm font-medium hover:bg-primary-600 disabled:opacity-40"
          >
            {pending ? "กำลังอัพเดท..." : "ยืนยัน"}
          </button>
        </div>
      )}

      {/* Driver mode */}
      {mode === "driver" && (
        <div className="space-y-2 pt-1 border-t border-primary-100">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={driverQuery}
              onChange={(e) => runDriverSearch(e.target.value)}
              placeholder="ค้นหาคนขับ (member_code / ชื่อ / เบอร์)"
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm flex-1 min-w-[220px]"
            />
            {/* endTime hr selector — legacy addFrom.php 17/24/30 hr <select>. */}
            <select
              value={driverEndTimeHours}
              onChange={(e) => setDriverEndTimeHours(Number(e.target.value) as 17 | 24 | 30)}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm"
            >
              <option value={17}>17 ชม.</option>
              <option value={24}>24 ชม.</option>
              <option value={30}>30 ชม.</option>
            </select>
            <button
              type="button"
              onClick={runDriverAssign}
              disabled={!pickedDriver || pending}
              className="rounded-lg bg-primary-500 text-white px-4 py-1.5 text-sm font-medium hover:bg-primary-600 disabled:opacity-40"
            >
              {pending ? "กำลังมอบหมาย..." : "มอบหมาย"}
            </button>
          </div>
          {pickedDriver && (
            <div className="text-xs text-primary-800 bg-primary-100 px-2 py-1 rounded">
              เลือก: <span className="font-mono">{pickedDriver.display}</span>
            </div>
          )}
          {driverHits.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-white">
              {driverHits.map((h) => (
                <button
                  key={h.profile_id}
                  type="button"
                  onClick={() => { setPickedDriver(h); setDriverHits([]); }}
                  className="block w-full text-left px-3 py-1.5 text-xs hover:bg-surface-alt border-b border-border last:border-b-0"
                >
                  <span className="font-mono">{h.display}</span>
                </button>
              ))}
            </div>
          )}
          {driverSearching && (
            <div className="text-xs text-muted">กำลังค้นหา...</div>
          )}
          {!driverSearching && driverQuery.length > 0 && driverHits.length === 0 && !pickedDriver && (
            <div className="text-xs text-muted">ไม่พบคนขับที่ตรงกับคำค้น</div>
          )}
        </div>
      )}

      {/* Cancel mode */}
      {mode === "cancel" && (
        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-primary-100">
          <input
            type="text"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="เหตุผลการยกเลิก (≥ 3 ตัวอักษร)"
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm flex-1 min-w-[200px]"
          />
          <button
            type="button"
            onClick={runCancel}
            disabled={cancelReason.trim().length < 3 || pending}
            className="rounded-lg bg-red-500 text-white px-4 py-1.5 text-sm font-medium hover:bg-red-600 disabled:opacity-40"
          >
            {pending ? "กำลังยกเลิก..." : "ยืนยันยกเลิก"}
          </button>
        </div>
      )}

      {/* Top-level error (from action invocation, not per-row) */}
      {topErr && (
        <div className="rounded-lg bg-red-100 text-red-800 text-xs px-2 py-1.5">
          {topErr}
        </div>
      )}

      {/* Outcome banner — per-row partial failure breakdown */}
      {outcome && (
        <div className="space-y-1.5">
          {outcome.succeededCount > 0 && (
            <div className="rounded-lg bg-green-100 text-green-800 text-xs px-2 py-1.5">
              สำเร็จ {outcome.succeededCount} รายการ
            </div>
          )}
          {outcome.failed.length > 0 && (
            <div className="rounded-lg bg-yellow-100 text-yellow-900 text-xs px-2 py-1.5 space-y-1">
              <div className="font-medium">ล้มเหลว {outcome.failed.length} รายการ:</div>
              {outcome.failed.slice(0, 3).map((f) => (
                <div key={f.fNo} className="font-mono">
                  · {f.fNo}: {f.error}
                </div>
              ))}
              {outcome.failed.length > 3 && (
                <div className="text-muted">+ อีก {outcome.failed.length - 3} รายการ</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * /admin/api-forwarder-momo/review — client UI (review grid + commit).
 *
 * Synthesis G1 SOT: docs/research/legacy-deep-dive/_SYNTHESIS.md §3.
 *
 * The "feels automatic" UX from legacy api-forwarder-momo.php:
 *   1. Per-row prefilled inputs (userID guess · shipBy default · productsType default)
 *   2. Per-row commit button → ONE atomic INSERT (status + cabinet + dates together)
 *   3. Bulk "สร้างทั้งหมด" button — commits every row that has userID + shipBy filled
 *   4. Committed rows disappear from the grid (via revalidate)
 *
 * Per AGENTS.md §0a — workflow stolen from legacy, Tailwind chrome (no Bootstrap).
 * Per AGENTS.md §0c — every Supabase query checked for error (the parent server
 * page); the commit action returns AdminActionResult so errors surface to UI.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Truck, RefreshCw, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { confirm, alert } from "@/components/ui/confirm";
import {
  commitMomoRowToForwarder,
  commitMomoRowsBatch,
} from "@/actions/admin/momo-commit";
// Import the input TYPE directly from the auth-agnostic core, NOT from the
// "use server" file. Re-exporting the type from a `"use server"` module hits
// a Turbopack server-actions-analyzer bug where the type-only re-export
// emits a value re-export against a non-existent binding → runtime
// `ReferenceError: CommitMomoRowInput is not defined` on bulk commit.
import type { CommitMomoRowInput } from "@/lib/admin/commit-momo-row-core";

// ─────────────────────────────────────────────────────────────
// Types (also re-exported for the server page)
// ─────────────────────────────────────────────────────────────

export type PendingRow = {
  id:                 string;
  momoTrackingNo:     string | null;
  /**
   * MOMO's INTERNAL routing batch ID (e.g. "PR20260527-SEA02") — kept
   * as audit-trail. NOT the cabinet PCS staff/customers know.
   */
  momoContainerNo:    string | null;
  /**
   * The REAL cabinet name (e.g. "GZS260525-2"), joined from
   * momo_container_closed.cid via sync step 2.5 (cabinet propagate).
   * Column name matches momo_container_closed.container_batch_no
   * (per migration 0119 + 0126). NULL until the container_closed sync
   * has processed this tracking.
   */
  containerBatchNo:   string | null;
  momoSackNo:         string | null;
  shipmentStatus:     string | null;
  adminStatusText:    string | null;
  phase:              string | null;
  /** Guessed from MOMO `user_group + user_code` (e.g. "PR032") — admin verifies. */
  guessedUserId:      string | null;
  /**
   * Bug 2a pre-validation: does this guessed userID actually exist in
   * tb_users? null = no MOMO guess; true = exists; false = missing.
   * Server-side probe in page.tsx — admin sees the warning before
   * clicking commit, and commitAll auto-skips invalid rows.
   */
  userIdValid:        boolean | null;
  guessedShipBy:      string | null;
  qty:                number | null;
  lastSyncedAt:       string | null;
  momoUpdatedAt:      string | null;
  /**
   * 2026-06-04 (ภูม flag) — รูปป้ายแปะที่ MOMO ถ่ายตอนรับของลงโกดัง.
   * URL list สกัดจาก raw.images. ใช้ตรวจสอบว่า MOMO กรอก user_code ถูกต้อง
   * มั้ย (เคสจริง: MOMO กรอก "023" แต่ป้ายของจริงเขียน "PR025") · admin
   * คลิกรูปเพื่อ quick-zoom ตอนตรวจสอบก่อน commit.
   */
  imageUrls:          string[];
};

type CommittedRow = {
  id:                    string;
  momoTrackingNo:        string | null;
  momoContainerNo:       string | null;
  committedAt:           string | null;
  committedForwarderId:  number | null;
  commitUserId:          string | null;
};

/** Per-row form state — admin overrides the prefilled defaults. */
type RowFormState = {
  userID:        string;
  fShipBy:       string;
  fProductsType: "1" | "2" | "3" | "4";
};

// Reuse the same ship-by option list as the manual-form (Wave 17 P1).
const SHIP_BY_OPTIONS: { value: string; label: string }[] = [
  { value: "PCS",  label: "รับเองโกดัง Pacred (สมุทรสาคร)"  },
  { value: "2",    label: "Flash Express"           },
  { value: "3",    label: "J.K. เอ็กซ์เพรส"          },
  { value: "21",   label: "นิ่มซี่เส็งขนส่ง"            },
  { value: "5",    label: "Nim Express"             },
  { value: "11",   label: "ไปรษณีย์ไทย"              },
  { value: "24",   label: "J&T Express"             },
  { value: "1",    label: "DHL Express"             },
  { value: "4",    label: "Kerry Express"           },
];

const PRODUCT_TYPE_OPTIONS: { value: "1" | "2" | "3" | "4"; label: string }[] = [
  { value: "1", label: "ทั่วไป"   },
  { value: "2", label: "มอก."     },
  { value: "3", label: "อย./น้ำยา" },
  { value: "4", label: "พิเศษ"    },
];

// ─────────────────────────────────────────────────────────────
// Top-level component
// ─────────────────────────────────────────────────────────────

export function ReviewGridClient({
  pendingRows,
  recentCommitted,
  pendingError,
}: {
  pendingRows:     PendingRow[];
  recentCommitted: CommittedRow[];
  pendingError:    string | null;
}) {
  const router = useRouter();

  // Per-row form state — keyed by momo_import_tracks.id (UUID).
  const [formState, setFormState] = useState<Record<string, RowFormState>>(() => {
    const m: Record<string, RowFormState> = {};
    for (const r of pendingRows) {
      // Prefill with the MOMO-guessed userID (admin verifies).
      // PCS is a safe default for fShipBy — it bypasses address lookup.
      m[r.id] = {
        userID:        r.guessedUserId ?? "",
        fShipBy:       "PCS",
        fProductsType: "1",
      };
    }
    return m;
  });

  // Per-row result (after commit) — keyed by row id.
  const [rowResults, setRowResults] = useState<Record<string, {
    ok:           boolean;
    message:      string;
    forwarderId?: number;
  }>>({});

  // Track which rows are committing (in-flight) so we disable their buttons.
  const [pending, startTransition] = useTransition();
  const [committingRow, setCommittingRow] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkSummary, setBulkSummary] = useState<{
    total: number; succeeded: number; failed: number;
  } | null>(null);
  // 2026-06-04 (ภูม flag) — lightbox state สำหรับ quick-zoom ป้าย MOMO.
  // Carries the FULL `urls: string[]` (some MOMO rows have multiple labels)
  // + current `index` for prev/next navigation inside the modal.
  const [zoomImage, setZoomImage] = useState<{
    urls: string[];
    tracking: string;
    index: number;
  } | null>(null);

  // Set the form value for one row.
  const setRowField = <K extends keyof RowFormState>(
    rowId: string,
    field: K,
    value: RowFormState[K],
  ) => {
    setFormState((s) => ({
      ...s,
      [rowId]: { ...s[rowId], [field]: value },
    }));
  };

  // Single-row commit handler.
  //
  // Wrapped in try/catch/finally so an unhandled server-action throw
  // (e.g., requireAdmin re-auth fail · Supabase network drop · withAdmin
  // path that bubbles instead of returning {ok:false}) NEVER leaves the
  // button stuck on "กำลัง...". The `finally` is the load-bearing line —
  // without it the previous version froze the row indefinitely whenever
  // the action rejected (since `setCommittingRow(null)` was after the
  // `await` and never ran on throw).
  const commitOne = async (rowId: string) => {
    const f = formState[rowId];
    if (!f) return;

    const input: CommitMomoRowInput = {
      rowId,
      userID:        f.userID.toUpperCase(),
      fShipBy:       f.fShipBy,
      fProductsType: f.fProductsType,
    };

    setCommittingRow(rowId);
    try {
      const res = await commitMomoRowToForwarder(input);
      if (res.ok) {
        setRowResults((m) => ({
          ...m,
          [rowId]: {
            ok:          true,
            message:     `สร้างสำเร็จ → tb_forwarder #${res.data?.forwarderId}`,
            forwarderId: res.data?.forwarderId,
          },
        }));
        // Reload server data so the row disappears from pending.
        startTransition(() => router.refresh());
      } else {
        setRowResults((m) => ({
          ...m,
          [rowId]: { ok: false, message: res.error },
        }));
      }
    } catch (err) {
      console.error("[commitMomoRowToForwarder] threw", err);
      setRowResults((m) => ({
        ...m,
        [rowId]: {
          ok:      false,
          message: err instanceof Error
            ? `Action error: ${err.message}`
            : "Action error: unknown (ดู console)",
        },
      }));
    } finally {
      setCommittingRow(null);
    }
  };

  // Bulk commit — every row that has userID + fShipBy filled.
  //
  // ภูม flag (bug 2a): also pre-skip rows whose userID is known to be
  // absent from tb_users (server-validated userIdValid === false). This
  // is the most common bulk-fail cause — and the error message after
  // commit ("ไม่พบสมาชิก") is identical for every skipped row, making
  // the failures opaque. Mark them ahead of time so admin sees what's
  // about to skip BEFORE the confirm dialog.
  const commitAll = async () => {
    // Pre-compute the per-row status of every row.
    const candidates = pendingRows.map((r) => {
      const f = formState[r.id];
      if (!f) return { row: r, kind: "missing-form" as const };
      const userID = f.userID.trim().toUpperCase();
      if (!/^PR\d+$/i.test(userID) || !f.fShipBy) {
        return { row: r, kind: "incomplete" as const };
      }
      // If the admin typed the same guessedUserId that's known-missing →
      // pre-skip. If admin typed a DIFFERENT userID → trust them (they may
      // have done a manual lookup elsewhere).
      const typedMatchesGuess =
        r.guessedUserId &&
        userID === r.guessedUserId.toUpperCase();
      if (typedMatchesGuess && r.userIdValid === false) {
        return { row: r, kind: "user-missing" as const, userID };
      }
      return {
        row:  r,
        kind: "ok" as const,
        input: {
          rowId:         r.id,
          userID,
          fShipBy:       f.fShipBy,
          fProductsType: f.fProductsType,
        },
      };
    });

    const validRows = candidates
      .filter((c): c is Extract<typeof c, { kind: "ok" }> => c.kind === "ok")
      .map((c) => c.input);
    const userMissingRows = candidates.filter((c) => c.kind === "user-missing");

    if (validRows.length === 0) {
      const baseMsg = userMissingRows.length > 0
        ? `ทุก row ที่กรอกครบ มี userID ที่ไม่มีอยู่ใน tb_users (${userMissingRows.length} row) — ` +
          "แก้ userID เป็นเลขที่ถูกต้องก่อน หรือคลิก 'สร้างใหม่' รายตัว"
        : "ยังไม่มี row ใดที่กรอก userID + บริษัทขนส่งครบ — กรอกอย่างน้อย 1 row ก่อน";
      await alert(baseMsg);
      return;
    }
    const skipNote = userMissingRows.length > 0
      ? `\n(จะข้าม ${userMissingRows.length} row ที่ userID ไม่มีในระบบ)`
      : "";
    if (!(await confirm(
      `ยืนยัน commit ${validRows.length} row พร้อมกัน?${skipNote}\n` +
      `(action นี้จะ INSERT ${validRows.length} row ลง tb_forwarder · ส่งเมล/LINE ถ้าเปิด)`,
    ))) {
      return;
    }
    // Pre-mark the user-missing rows so they don't sit silent during bulk.
    if (userMissingRows.length > 0) {
      setRowResults((m) => {
        const out = { ...m };
        for (const u of userMissingRows) {
          out[u.row.id] = {
            ok:      false,
            message: `ข้าม: userID ${u.row.guessedUserId} ไม่มีในระบบ (กรอก userID ที่ถูกต้องก่อน)`,
          };
        }
        return out;
      });
    }

    setBulkRunning(true);
    let res;
    try {
      res = await commitMomoRowsBatch({ rows: validRows });
    } catch (err) {
      console.error("[commitMomoRowsBatch] threw", err);
      await alert(`bulk commit threw: ${err instanceof Error ? err.message : "unknown"}`);
      setBulkRunning(false);
      return;
    }
    setBulkRunning(false);

    // TS narrowing — AdminActionResult is a discriminated union on `ok`.
    // Treat `ok: false` first so `res.error` is accessible; then the
    // `ok: true` arm has access to `res.data` (still optional but safe).
    if (!res.ok) {
      await alert(`bulk commit failed: ${res.error}`);
      return;
    }
    if (!res.data) {
      await alert("bulk commit returned no data");
      return;
    }
    // Apply per-row results onto rowResults map.
    const newResults: typeof rowResults = { ...rowResults };
    for (const r of res.data.results) {
      if (r.ok) {
        newResults[r.rowId] = {
          ok:          true,
          message:     `สร้างสำเร็จ → tb_forwarder #${r.forwarderId}`,
          forwarderId: r.forwarderId,
        };
      } else {
        newResults[r.rowId] = {
          ok:      false,
          message: r.error ?? "unknown error",
        };
      }
    }
    setRowResults(newResults);
    setBulkSummary({
      total:     res.data.total,
      succeeded: res.data.succeeded,
      failed:    res.data.failed,
    });
    // Reload — committed rows disappear from pending grid.
    startTransition(() => router.refresh());
  };

  // Counts for header.
  const totalPending = pendingRows.length;
  // "พร้อม commit" = form filled AND (no MOMO guess OR guess is known
  // valid OR admin overrode with a different value). Bug 2a — don't count
  // known-missing-userID rows in the bulk badge.
  const totalReady = useMemo(
    () =>
      pendingRows.filter((r) => {
        const f = formState[r.id];
        if (!f) return false;
        const userID = f.userID.trim().toUpperCase();
        if (!/^PR\d+$/i.test(userID) || !f.fShipBy) return false;
        const typedMatchesGuess =
          r.guessedUserId && userID === r.guessedUserId.toUpperCase();
        if (typedMatchesGuess && r.userIdValid === false) return false;
        return true;
      }).length,
    [pendingRows, formState],
  );
  const totalUserMissing = useMemo(
    () => pendingRows.filter((r) => r.userIdValid === false).length,
    [pendingRows],
  );

  return (
    <div className="space-y-5">
      {/* Bulk action bar */}
      <section className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          {/* Stat chips — at-a-glance counts */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-alt px-3.5 py-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-200 text-slate-700">
                <Truck className="h-4 w-4" />
              </span>
              <span className="leading-tight">
                <span className="block text-lg font-extrabold tabular-nums text-foreground">{totalPending}</span>
                <span className="block text-[11px] text-muted">รอ commit</span>
              </span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3.5 py-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-100 text-primary-700">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <span className="leading-tight">
                <span className="block text-lg font-extrabold tabular-nums text-primary-700">{totalReady}</span>
                <span className="block text-[11px] text-primary-700/70">พร้อม commit · มี userID + ขนส่ง</span>
              </span>
            </div>
            {totalUserMissing > 0 && (
              <div className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-red-100 text-red-600">
                  <AlertCircle className="h-4 w-4" />
                </span>
                <span className="leading-tight">
                  <span className="block text-lg font-extrabold tabular-nums text-red-600">{totalUserMissing}</span>
                  <span className="block text-[11px] text-red-600/80">userID ไม่อยู่ในระบบ</span>
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => router.refresh()}
              disabled={pending || bulkRunning}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-3.5 py-2.5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
              รีเฟรช
            </button>
            <button
              type="button"
              onClick={commitAll}
              disabled={bulkRunning || pending || totalReady === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary-700 bg-primary-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Truck className="h-4 w-4" />
              {bulkRunning
                ? `กำลัง commit ${totalReady}…`
                : `สร้างทั้งหมด (${totalReady})`}
            </button>
          </div>
        </div>
      </section>

      {/* Bulk result banner */}
      {bulkSummary && (
        <div className={`flex items-start gap-2.5 rounded-2xl border p-3.5 text-sm shadow-sm ${
          bulkSummary.failed === 0
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}>
          {bulkSummary.failed === 0
            ? <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" />
            : <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-500" />}
          <div>
            <strong>Bulk commit เสร็จ:</strong>{" "}
            ทั้งหมด {bulkSummary.total} · สำเร็จ {bulkSummary.succeeded}
            {bulkSummary.failed > 0 ? ` · ล้มเหลว ${bulkSummary.failed} (ดู message ในแต่ละ row)` : ""}
          </div>
        </div>
      )}

      {/* Pending error banner */}
      {pendingError && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-900 shadow-sm">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
          <div><strong>Load failed:</strong> {pendingError}</div>
        </div>
      )}

      {/* Empty state */}
      {totalPending === 0 && !pendingError && (
        <section className="rounded-2xl border border-dashed border-border bg-white px-6 py-12 text-center shadow-sm">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-9 w-9 text-emerald-500" />
          </span>
          <p className="mt-4 text-base font-semibold text-foreground">เคลียร์หมดแล้ว!</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
            ไม่มีรายการรอ commit — sync ใหม่จาก{" "}
            <Link href="/admin/api-forwarder-momo/sync" className="font-semibold text-primary-700 underline underline-offset-2 hover:text-primary-800">
              /sync
            </Link>{" "}
            เพื่อนำรายการเข้า momo_import_tracks
          </p>
        </section>
      )}

      {/* Pending grid */}
      {totalPending > 0 && (
        <section className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-alt/40 px-4 py-3">
            <h3 className="text-sm font-bold text-foreground">รายการรอ commit เข้าระบบ</h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-2.5 py-1 text-[11px] font-medium text-muted">
              ⇆ เลื่อนซ้าย-ขวาเพื่อดูทุกคอลัมน์
            </span>
          </header>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-xs border-collapse min-w-[1100px]">
              <thead className="bg-surface-alt sticky top-0 z-10">
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="text-left px-3 py-3 border-b border-border w-8">#</th>
                  <th className="text-left px-3 py-3 border-b border-border">Tracking</th>
                  <th className="text-left px-3 py-3 border-b border-border">ตู้ / Sack</th>
                  <th className="text-center px-3 py-3 border-b border-border w-20">
                    รูปป้าย
                    <div className="text-[9px] font-normal normal-case tracking-normal text-muted">(คลิกซูม · ตรวจ user_code)</div>
                  </th>
                  <th className="text-left px-3 py-3 border-b border-border">Phase</th>
                  <th className="text-left px-3 py-3 border-b border-border">Qty</th>
                  <th className="text-left px-3 py-3 border-b border-border w-32">userID *</th>
                  <th className="text-left px-3 py-3 border-b border-border w-44">บริษัทขนส่ง *</th>
                  <th className="text-left px-3 py-3 border-b border-border w-32">ประเภท</th>
                  <th className="text-left px-3 py-3 border-b border-border w-44">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingRows.map((r, idx) => {
                  const f = formState[r.id];
                  const result = rowResults[r.id];
                  const isCommitting = committingRow === r.id;
                  const isReady = !!f && /^PR\d+$/i.test(f.userID.trim()) && !!f.fShipBy;

                  return (
                    <tr key={r.id} className={`border-b border-border align-top transition-colors ${
                      result?.ok ? "bg-emerald-50/60" : "hover:bg-surface-alt/40"
                    }`}>
                      <td className="px-3 py-3 font-semibold text-muted tabular-nums">{idx + 1}</td>
                      <td className="px-3 py-3 font-mono font-semibold text-foreground">{r.momoTrackingNo ?? "—"}</td>
                      <td className="px-3 py-3 font-mono">
                        {/*
                          Cabinet display — prefer the REAL cabinet from
                          container_closed.cid (containerBatchNo). Show the
                          routing batch ID only as a faint audit line.
                        */}
                        {r.containerBatchNo ? (
                          <>
                            <div className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-700">{r.containerBatchNo}</div>
                            {r.momoContainerNo && r.momoContainerNo !== r.containerBatchNo && (
                              <div className="mt-0.5 text-[10px] text-muted">
                                MOMO batch: {r.momoContainerNo}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="text-foreground">{r.momoContainerNo ?? "—"}</div>
                            {r.momoContainerNo && (
                              <div className="mt-0.5 text-[10px] text-amber-600">
                                ⏳ ยังไม่ join cabinet (รอ container_closed sync)
                              </div>
                            )}
                          </>
                        )}
                        {r.momoSackNo && (
                          <div className="mt-0.5 text-[10px] text-muted">sack: {r.momoSackNo}</div>
                        )}
                      </td>
                      {/* 2026-06-04 (ภูม flag) — รูปป้ายแปะ thumbnail ที่
                          MOMO ถ่ายตอนรับของลงโกดัง · admin คลิกเพื่อ
                          quick-zoom ตรวจว่า user_code ที่ MOMO กรอกตรงกับ
                          ป้ายของจริงรึเปล่า (เคสจริง: MOMO กรอก "023" แต่
                          ป้ายเขียน "PR025"). */}
                      <td className="px-2 py-3 text-center">
                        {r.imageUrls.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setZoomImage({
                              urls:     r.imageUrls,
                              tracking: r.momoTrackingNo ?? "—",
                              index:    0,
                            })}
                            className="group relative inline-block"
                            title={r.imageUrls.length > 1
                              ? `คลิกเพื่อ quick-zoom (${r.imageUrls.length} รูป · เลื่อนใน modal ได้)`
                              : "คลิกเพื่อ quick-zoom"}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={r.imageUrls[0]}
                              alt={`MOMO label · ${r.momoTrackingNo ?? "—"}`}
                              className="h-12 w-12 rounded-lg border border-border object-cover shadow-sm transition-all group-hover:ring-2 group-hover:ring-primary-400 group-hover:shadow-md"
                              loading="lazy"
                            />
                            {r.imageUrls.length > 1 && (
                              <span className="absolute -top-1.5 -right-1.5 rounded-full bg-primary-500 text-white text-[9px] px-1.5 py-0.5 font-bold shadow-sm">
                                +{r.imageUrls.length - 1}
                              </span>
                            )}
                          </button>
                        ) : (
                          <span className="text-[10px] text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-foreground">{r.phase ?? "—"}</div>
                        {r.adminStatusText && (
                          <div className="mt-0.5 text-[10px] text-muted">
                            {r.adminStatusText}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex min-w-[1.75rem] justify-center rounded-md bg-surface-alt px-2 py-0.5 font-semibold tabular-nums text-foreground">
                          {r.qty ?? 1}
                        </span>
                      </td>

                      {/* userID input */}
                      <td className="px-3 py-3">
                        <input
                          type="text"
                          value={f?.userID ?? ""}
                          onChange={(e) =>
                            setRowField(r.id, "userID", e.target.value)
                          }
                          placeholder="PR12345"
                          disabled={isCommitting || !!result?.ok}
                          className="w-full rounded-lg border border-border bg-white px-2.5 py-1.5 font-mono text-xs uppercase shadow-sm transition-colors focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:bg-surface-alt disabled:opacity-70"
                        />
                        {r.guessedUserId && f?.userID !== r.guessedUserId && (
                          <button
                            type="button"
                            onClick={() =>
                              setRowField(r.id, "userID", r.guessedUserId ?? "")
                            }
                            className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-sky-600 underline underline-offset-2 hover:text-sky-700"
                          >
                            ใช้ค่าจาก MOMO: {r.guessedUserId}
                          </button>
                        )}
                        {/*
                          ภูม flag (bug 2a): pre-validation chip — server-
                          side probe of tb_users. Shows BEFORE bulk-commit
                          so admin knows the row will skip / fail.
                        */}
                        {r.userIdValid === false && r.guessedUserId && (
                          <div className="mt-1 inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                            <AlertCircle className="h-2.5 w-2.5" />
                            ไม่มี {r.guessedUserId} ในระบบ
                          </div>
                        )}
                        {r.userIdValid === true && (
                          <div className="mt-1 inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            พบใน tb_users
                          </div>
                        )}
                      </td>

                      {/* ship-by select */}
                      <td className="px-3 py-3">
                        <select
                          value={f?.fShipBy ?? "PCS"}
                          onChange={(e) =>
                            setRowField(r.id, "fShipBy", e.target.value)
                          }
                          disabled={isCommitting || !!result?.ok}
                          className="w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs shadow-sm transition-colors focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:bg-surface-alt disabled:opacity-70"
                        >
                          {SHIP_BY_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* products-type select */}
                      <td className="px-3 py-3">
                        <select
                          value={f?.fProductsType ?? "1"}
                          onChange={(e) =>
                            setRowField(
                              r.id,
                              "fProductsType",
                              e.target.value as RowFormState["fProductsType"],
                            )
                          }
                          disabled={isCommitting || !!result?.ok}
                          className="w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs shadow-sm transition-colors focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:bg-surface-alt disabled:opacity-70"
                        >
                          {PRODUCT_TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* commit button + result */}
                      <td className="px-3 py-3">
                        {result?.ok ? (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-100 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            #{result.forwarderId}
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => commitOne(r.id)}
                              disabled={
                                !isReady ||
                                isCommitting ||
                                bulkRunning ||
                                pending
                              }
                              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary-300 bg-primary-50 px-2 py-2 text-xs font-bold text-primary-700 shadow-sm transition-colors hover:bg-primary-100 hover:border-primary-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                              title={
                                isReady
                                  ? "INSERT ลง tb_forwarder (atomic)"
                                  : "กรอก userID และเลือก บ.ขนส่ง ก่อน"
                              }
                            >
                              {isCommitting
                                ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> กำลัง...</>
                                : <><CheckCircle2 className="h-3.5 w-3.5" /> สร้างใหม่</>}
                            </button>
                            {result && !result.ok && (
                              <div className="mt-1.5 flex items-start gap-1 rounded-md bg-red-50 px-1.5 py-1 text-[10px] text-red-700">
                                <AlertCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                                <span>{result.message}</span>
                              </div>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent committed strip (history) */}
      {recentCommitted.length > 0 && (
        <section className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
          <header className="flex items-center gap-2 border-b border-border bg-surface-alt/40 px-4 py-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-bold text-foreground">
              commit ล่าสุด <span className="font-normal text-muted">({recentCommitted.length}) — landed ใน tb_forwarder</span>
            </h3>
          </header>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-surface-alt">
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="text-left px-3 py-2.5 border-b border-border">Tracking</th>
                  <th className="text-left px-3 py-2.5 border-b border-border">ตู้</th>
                  <th className="text-left px-3 py-2.5 border-b border-border">userID</th>
                  <th className="text-left px-3 py-2.5 border-b border-border">tb_forwarder id</th>
                  <th className="text-left px-3 py-2.5 border-b border-border">เวลา</th>
                </tr>
              </thead>
              <tbody>
                {recentCommitted.map((c) => (
                  <tr key={c.id} className="border-b border-border transition-colors hover:bg-surface-alt/40">
                    <td className="px-3 py-2.5 font-mono font-semibold text-foreground">{c.momoTrackingNo ?? "—"}</td>
                    <td className="px-3 py-2.5 font-mono">{c.momoContainerNo ?? "—"}</td>
                    <td className="px-3 py-2.5 font-mono">{c.commitUserId ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {c.committedForwarderId ? (
                        <Link
                          href={`/admin/forwarders/${c.committedForwarderId}`}
                          className="font-bold text-primary-700 underline underline-offset-2 hover:text-primary-800"
                        >
                          #{c.committedForwarderId}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {c.committedAt
                        ? new Date(c.committedAt).toLocaleString("th-TH")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 2026-06-04 (ภูม flag) — Quick-zoom lightbox สำหรับรูปป้าย MOMO.
          v2 (ภูม fix): บาง row มีหลายรูป (ภูมเตือน) → modal ตอนนี้
          navigate ระหว่างรูปได้ · keyboard ← / → · thumbnail strip
          ล่างสุด + counter "N/M". */}
      {zoomImage && (
        <ZoomLightbox
          urls={zoomImage.urls}
          index={zoomImage.index}
          tracking={zoomImage.tracking}
          onIndexChange={(i) => setZoomImage((z) => z ? { ...z, index: i } : null)}
          onClose={() => setZoomImage(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ZoomLightbox — 2026-06-04 (ภูม flag v2)
// ─────────────────────────────────────────────────────────────
// Full-screen overlay for the MOMO label image(s). Supports navigation
// when the row has multiple images (ภูม catch · บาง row มี 2 รูป).
// Features:
//   - Keyboard arrows ← / → · Esc to close
//   - Prev / Next buttons on left/right edges (hide when only 1 image)
//   - Counter "N / M" + thumbnail strip below the main image
//   - "เปิดในแท็บใหม่" link to the CURRENT image (not just the first)

function ZoomLightbox({
  urls,
  index,
  tracking,
  onIndexChange,
  onClose,
}: {
  urls: string[];
  index: number;
  tracking: string;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const total = urls.length;
  const safeIndex = Math.max(0, Math.min(index, total - 1));
  const currentUrl = urls[safeIndex];
  const hasMany = total > 1;

  const goPrev = () => {
    if (!hasMany) return;
    onIndexChange((safeIndex - 1 + total) % total);
  };
  const goNext = () => {
    if (!hasMany) return;
    onIndexChange((safeIndex + 1) % total);
  };

  // Keyboard navigation — bind to document so it works regardless of focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft" && hasMany) {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight" && hasMany) {
        e.preventDefault();
        goNext();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIndex, total]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 cursor-zoom-out"
      onClick={onClose}
      role="button"
      tabIndex={-1}
    >
      <div
        className="relative max-w-5xl w-full max-h-[92vh] flex flex-col gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 text-white">
          <div>
            <div className="text-xs text-white/60">รูปป้ายที่ MOMO แนบ</div>
            <div className="font-mono text-sm font-bold">
              {tracking}
              {hasMany && (
                <span className="ml-2 text-xs font-normal text-white/70">
                  · รูป {safeIndex + 1} / {total}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs"
            >
              เปิดในแท็บใหม่ ↗
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs inline-flex items-center gap-1"
              aria-label="ปิด"
            >
              <X className="h-3 w-3" /> ปิด (Esc)
            </button>
          </div>
        </div>

        {/* Main image + side nav arrows */}
        <div className="relative flex items-center justify-center">
          {hasMany && (
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-2 z-10 rounded-full bg-white/10 hover:bg-white/30 p-2 text-white"
              aria-label="รูปก่อนหน้า (←)"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentUrl}
            alt={`MOMO label · ${tracking} · ${safeIndex + 1}/${total}`}
            className="max-w-full max-h-[75vh] rounded-lg object-contain"
          />
          {hasMany && (
            <button
              type="button"
              onClick={goNext}
              className="absolute right-2 z-10 rounded-full bg-white/10 hover:bg-white/30 p-2 text-white"
              aria-label="รูปถัดไป (→)"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>

        {/* Thumbnail strip — only when multi */}
        {hasMany && (
          <div className="flex gap-2 justify-center pt-1 overflow-x-auto">
            {urls.map((u, i) => (
              <button
                key={u + i}
                type="button"
                onClick={() => onIndexChange(i)}
                className={`shrink-0 rounded border-2 transition-all ${
                  i === safeIndex
                    ? "border-primary-400 ring-2 ring-primary-300"
                    : "border-white/20 hover:border-white/50 opacity-70 hover:opacity-100"
                }`}
                aria-label={`เปิดรูปที่ ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={u}
                  alt={`thumb ${i + 1}`}
                  className="h-14 w-14 object-cover rounded-sm"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}

        <p className="text-[10px] text-white/60 text-center">
          ⚠️ ตรวจสอบเลข user_code บนป้ายให้ตรงกับ Pacred userID ก่อน commit ·
          ถ้าไม่ตรง → แจ้งเซลให้ MOMO update
          {hasMany && <span className="block">⌨ ใช้ ← / → เปลี่ยนรูปได้</span>}
        </p>
      </div>
    </div>
  );
}

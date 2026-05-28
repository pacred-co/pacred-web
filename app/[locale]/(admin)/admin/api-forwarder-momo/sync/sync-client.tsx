"use client";

/**
 * /admin/api-forwarder-momo/sync — Client UI.
 *
 * Brief 2026-05-28 §10 (ปอน). Date range + sack lookup + 7 buttons
 * (Import Track / Container Closed / Sack Info / Sync Preview / Sync
 * to MOMO tables) + result viewer.
 *
 * ⚠️ Writes ONLY hit /api/admin/momo/sync — that route upserts to
 *    momo_* tables. NO direct DB access from this client.
 */

import { useState } from "react";
// IMPORTANT: import from "./types" directly — the barrel index.ts re-exports
// client.ts which is `"server-only"`. Client Components can pull types +
// pure data maps, but not the HTTP client.
import {
  MOMO_STATUS_TH,
  MOMO_STATUS_BADGE,
  type MomoBadgeColor,
  type MomoInternalAdminRecord,
  type MomoShipmentStatus,
} from "@/lib/integrations/momo-isolated/types";

type DbRow = {
  momo_tracking_no?: string | null;
  momo_sack_no?: string | null;
  momo_container_no?: string | null;
  shipment_status?: string | null;
  admin_status_text?: string | null;
  last_synced_at?: string | null;
};

type SyncResponse = {
  ok: boolean;
  dryRun?: boolean;
  start?: string | null;
  end?: string | null;
  sackNo?: string | null;
  importTrackCount?: number;
  containerClosedCount?: number;
  sackInfoCount?: number;
  mappedCount?: number;
  unmappedCount?: number;
  upsertedCount?: number;
  failedCount?: number;
  errors?: Array<{ scope: string; error: string; message: string }>;
  preview?: {
    importTrack:     MomoInternalAdminRecord[];
    containerClosed: MomoInternalAdminRecord[];
    sackInfo:        MomoInternalAdminRecord[];
  };
  error?: string;
  message?: string;
};

type BackfillResponse = {
  ok: boolean;
  importTracksScanned?:      number;
  importTracksUpdated?:      number;
  containerClosedScanned?:   number;
  containerClosedUpdated?:   number;
  containerTracksUpserted?:  number;
  errors?:                   Array<{ scope: string; message: string }>;
};

const BADGE_CLS: Record<MomoBadgeColor, string> = {
  yellow: "bg-amber-100 text-amber-700 border-amber-200",
  blue:   "bg-sky-100 text-sky-700 border-sky-200",
  green:  "bg-emerald-100 text-emerald-700 border-emerald-200",
  red:    "bg-red-100 text-red-700 border-red-200",
};

function StatusBadge({ status }: { status: MomoShipmentStatus | string | null | undefined }) {
  if (!status) return <span className="text-muted text-xs">—</span>;
  const isKnown = status in MOMO_STATUS_TH;
  const color = isKnown
    ? MOMO_STATUS_BADGE[status as MomoShipmentStatus]
    : ("blue" as MomoBadgeColor);
  const label = isKnown ? MOMO_STATUS_TH[status as MomoShipmentStatus] : String(status);
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${BADGE_CLS[color]}`}>
      {label}
    </span>
  );
}

export function MomoSyncClient({ initialDbRows }: { initialDbRows: {
  importTrack:     DbRow[];
  containerClosed: DbRow[];
  sackInfo:        DbRow[];
} }) {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart]  = useState(today);
  const [end, setEnd]      = useState(today);
  const [sackNo, setSackNo] = useState("");

  const [busy, setBusy]    = useState<string | null>(null);
  const [result, setResult] = useState<SyncResponse | null>(null);
  const [backfillResult, setBackfillResult] = useState<BackfillResponse | null>(null);
  const [rawOpen, setRawOpen] = useState<Record<string, boolean>>({});

  async function callApi(path: string, init?: RequestInit, label?: string) {
    setBusy(label ?? path);
    try {
      const r = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
        cache: "no-store",
      });
      const j: SyncResponse = await r.json().catch(() => ({ ok: false, error: "PARSE_ERROR", message: "JSON parse failed" }));
      setResult(j);
    } catch (e) {
      setResult({
        ok: false,
        error: "NETWORK_ERROR",
        message: e instanceof Error ? e.message : "network error",
      });
    } finally {
      setBusy(null);
    }
  }

  function onFetchImportTrack() {
    callApi(`/api/admin/momo/import-track?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, undefined, "import-track");
  }
  function onFetchContainerClosed() {
    callApi(`/api/admin/momo/container-closed?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, undefined, "container-closed");
  }
  function onFetchSackInfo() {
    if (!sackNo.trim()) return;
    callApi(`/api/admin/momo/sack-info?sackNo=${encodeURIComponent(sackNo.trim())}`, undefined, "sack-info");
  }
  function onSyncPreview() {
    callApi("/api/admin/momo/sync-preview", {
      method: "POST",
      body: JSON.stringify({ start, end, sackNo: sackNo.trim() || undefined }),
    }, "preview");
  }
  function onSyncReal() {
    if (!confirm("ยืนยัน sync เข้า momo_* tables? (action นี้จะ upsert เข้า DB)")) return;
    callApi("/api/admin/momo/sync", {
      method: "POST",
      body: JSON.stringify({ start, end, sackNo: sackNo.trim() || undefined }),
    }, "sync");
  }

  async function onBackfill() {
    if (!confirm("รัน Backfill Phase A?\n\n• กรอก momo_container_ref ลง momo_import_tracks (จาก raw.container_no เดิม)\n• กรอก momo_container_ref / container_batch_no / real_container_no ลง momo_container_closed (จาก raw.fid/cid/cid_code)\n• แตก track_details[] จาก momo_container_closed.raw → momo_container_closed_tracks\n\nIdempotent — รันซ้ำได้.")) return;
    setBusy("backfill");
    setBackfillResult(null);
    try {
      const r = await fetch("/api/admin/momo/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      const j: BackfillResponse = await r.json().catch(() => ({ ok: false, errors: [{ scope: "parse", message: "JSON parse failed" }] }));
      setBackfillResult(j);
    } catch (e) {
      setBackfillResult({
        ok: false,
        errors: [{ scope: "network", message: e instanceof Error ? e.message : "network error" }],
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Date range + Sack input + buttons */}
      <section className="rounded-2xl border border-border bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <label className="block">
            <span className="text-xs font-semibold text-muted">วันที่เริ่ม (YYYY-MM-DD)</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted">วันที่สิ้นสุด</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted">Sack No (เช่น CBX251111-EK04)</span>
            <input
              type="text"
              value={sackNo}
              onChange={(e) => setSackNo(e.target.value)}
              placeholder="ไม่บังคับ — ใช้สำหรับ Sack Info"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={onFetchImportTrack}
            disabled={busy != null}
            className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
          >
            {busy === "import-track" ? "กำลังดึง..." : "ดึง Import Track"}
          </button>
          <button
            type="button"
            onClick={onFetchContainerClosed}
            disabled={busy != null}
            className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
          >
            {busy === "container-closed" ? "กำลังดึง..." : "ดึง Container Closed"}
          </button>
          <button
            type="button"
            onClick={onFetchSackInfo}
            disabled={busy != null || !sackNo.trim()}
            className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
          >
            {busy === "sack-info" ? "กำลังดึง..." : "ค้นหา Sack Info"}
          </button>
          <span className="border-l border-border mx-1 self-stretch" />
          <button
            type="button"
            onClick={onSyncPreview}
            disabled={busy != null}
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
          >
            {busy === "preview" ? "กำลัง Preview..." : "Sync Preview (ไม่บันทึก)"}
          </button>
          <button
            type="button"
            onClick={onSyncReal}
            disabled={busy != null}
            className="rounded-lg border border-red-500 bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy === "sync" ? "กำลัง Sync..." : "Sync เข้าตาราง MOMO"}
          </button>
        </div>
      </section>

      {/* ── Phase A · Backfill ──────────────────────────────────────── */}
      <section className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4 shadow-sm space-y-3">
        <div>
          <h3 className="text-sm font-bold text-violet-900">🛠 Phase A · Backfill</h3>
          <p className="text-xs text-violet-700 mt-1 leading-relaxed">
            กรอก column ใหม่จาก raw เดิม + แตก <code className="rounded bg-violet-100 px-1">track_details[]</code> จาก{" "}
            <code className="rounded bg-violet-100 px-1">momo_container_closed.raw</code> เข้า{" "}
            <code className="rounded bg-violet-100 px-1">momo_container_closed_tracks</code>.{" "}
            <strong>Idempotent</strong> — รันซ้ำได้ ไม่เพิ่มข้อมูลซ้ำ.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={onBackfill}
            disabled={busy != null}
            className="rounded-lg border border-violet-400 bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {busy === "backfill" ? "กำลัง Backfill..." : "▶ รัน Backfill Phase A"}
          </button>
          {backfillResult && (
            <span className={`text-xs font-bold ${backfillResult.ok ? "text-emerald-700" : "text-red-700"}`}>
              {backfillResult.ok ? "✓ Done" : "✗ มี error"}
            </span>
          )}
        </div>

        {backfillResult && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
              <Stat label="IT scanned" value={backfillResult.importTracksScanned ?? 0} />
              <Stat label="IT updated" value={backfillResult.importTracksUpdated ?? 0} tone="green" />
              <Stat label="CC scanned" value={backfillResult.containerClosedScanned ?? 0} />
              <Stat label="CC updated" value={backfillResult.containerClosedUpdated ?? 0} tone="green" />
              <Stat label="Tracks upserted" value={backfillResult.containerTracksUpserted ?? 0} tone="green" />
            </div>
            {backfillResult.errors && backfillResult.errors.length > 0 && (
              <details className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs">
                <summary className="cursor-pointer font-bold text-red-900">
                  ดู errors ({backfillResult.errors.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {backfillResult.errors.map((e, i) => (
                    <li key={i} className="font-mono">
                      <strong>{e.scope}:</strong> {e.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>

      {/* Result */}
      {result && (
        <section className="rounded-2xl border border-border bg-white p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-bold">
            ผลลัพธ์ — {result.dryRun ? "PREVIEW (ไม่บันทึก)" : "SYNC"}
          </h3>

          {/* Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-xs">
            <Stat label="Import Track" value={result.importTrackCount ?? 0} />
            <Stat label="Container Closed" value={result.containerClosedCount ?? 0} />
            <Stat label="Sack Info" value={result.sackInfoCount ?? 0} />
            <Stat label="Mapped" value={result.mappedCount ?? 0} tone="green" />
            <Stat label="Unmapped" value={result.unmappedCount ?? 0} tone="amber" />
            <Stat label="Upserted" value={result.upsertedCount ?? 0} tone="green" />
            <Stat label="Failed" value={result.failedCount ?? 0} tone="red" />
            <Stat label="Errors" value={result.errors?.length ?? 0} tone="red" />
          </div>

          {/* Error banner */}
          {!result.ok && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              <strong>{result.error}:</strong> {result.message}
            </div>
          )}

          {/* Errors list */}
          {result.errors && result.errors.length > 0 && (
            <details className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
              <summary className="cursor-pointer font-bold text-amber-900">ดู errors ({result.errors.length})</summary>
              <ul className="mt-2 space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i} className="font-mono">
                    <strong>{e.scope}:</strong> {e.error} — {e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* Preview tables */}
          {result.preview && (
            <div className="space-y-3">
              <PreviewTable
                title="Import Track preview"
                rows={result.preview.importTrack}
                kind="import"
                openMap={rawOpen}
                setOpenMap={setRawOpen}
              />
              <PreviewTable
                title="Container Closed preview"
                rows={result.preview.containerClosed}
                kind="container"
                openMap={rawOpen}
                setOpenMap={setRawOpen}
              />
              <PreviewTable
                title="Sack Info preview"
                rows={result.preview.sackInfo}
                kind="sack"
                openMap={rawOpen}
                setOpenMap={setRawOpen}
              />
            </div>
          )}
        </section>
      )}

      {/* DB latest rows (initial load — from server) */}
      <section className="rounded-2xl border border-border bg-white p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-bold">
          ข้อมูลล่าสุดที่ sync เข้า DB (จาก momo_* tables)
        </h3>
        <DbTable title="momo_import_tracks (latest 20)" rows={initialDbRows.importTrack} />
        <DbTable title="momo_container_closed (latest 20)" rows={initialDbRows.containerClosed} />
        <DbTable title="momo_sack_infos (latest 20)" rows={initialDbRows.sackInfo} />
        <p className="text-[11px] text-muted">
          ตารางนี้ snapshot ตอนโหลดหน้า — รีเฟรชหน้าหลังกด Sync เพื่อดูข้อมูลล่าสุด
        </p>
      </section>
    </div>
  );
}

// ── Components ────────────────────────────────────────────────

function Stat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "slate" | "green" | "amber" | "red";
}) {
  const cls =
    tone === "green" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    tone === "amber" ? "bg-amber-50 text-amber-700 border-amber-200" :
    tone === "red"   ? "bg-red-50 text-red-700 border-red-200" :
                       "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-lg font-extrabold">{value}</div>
    </div>
  );
}

function PreviewTable({
  title,
  rows,
  kind,
  openMap,
  setOpenMap,
}: {
  title: string;
  rows: MomoInternalAdminRecord[];
  kind: string;
  openMap: Record<string, boolean>;
  setOpenMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  if (!rows || rows.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-bold mb-1">{title} ({rows.length})</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-surface-alt">
            <tr>
              <th className="text-left px-2 py-1 border-b">#</th>
              <th className="text-left px-2 py-1 border-b">Tracking</th>
              <th className="text-left px-2 py-1 border-b">Container</th>
              <th className="text-left px-2 py-1 border-b">Sack</th>
              <th className="text-left px-2 py-1 border-b">Phase</th>
              <th className="text-left px-2 py-1 border-b">Status</th>
              <th className="text-left px-2 py-1 border-b">Admin Text</th>
              <th className="text-left px-2 py-1 border-b">Raw</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const k = `${kind}-${i}`;
              const isOpen = !!openMap[k];
              return (
                <tr key={k} className="border-b">
                  <td className="px-2 py-1 text-muted">{i + 1}</td>
                  <td className="px-2 py-1 font-mono">{r.trackingNo ?? "—"}</td>
                  <td className="px-2 py-1 font-mono">{r.containerNo ?? "—"}</td>
                  <td className="px-2 py-1 font-mono">{r.sackNo ?? "—"}</td>
                  <td className="px-2 py-1">{r.phase ?? "—"}</td>
                  <td className="px-2 py-1"><StatusBadge status={r.shipmentStatus} /></td>
                  <td className="px-2 py-1">{r.adminStatusText}</td>
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      onClick={() => setOpenMap({ ...openMap, [k]: !isOpen })}
                      className="text-sky-600 underline text-[11px]"
                    >
                      {isOpen ? "hide" : "view"}
                    </button>
                    {isOpen && (
                      <pre className="mt-1 max-w-xs overflow-auto rounded bg-slate-50 p-1.5 text-[10px] font-mono">
                        {JSON.stringify(r.raw, null, 2).slice(0, 800)}
                      </pre>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DbTable({ title, rows }: { title: string; rows: DbRow[] }) {
  if (!rows || rows.length === 0) {
    return (
      <div>
        <h4 className="text-xs font-bold mb-1">{title}</h4>
        <p className="text-xs text-muted italic">ยังไม่มีข้อมูล</p>
      </div>
    );
  }
  return (
    <div>
      <h4 className="text-xs font-bold mb-1">{title}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-surface-alt">
            <tr>
              <th className="text-left px-2 py-1 border-b">Tracking</th>
              <th className="text-left px-2 py-1 border-b">Container</th>
              <th className="text-left px-2 py-1 border-b">Sack</th>
              <th className="text-left px-2 py-1 border-b">Status</th>
              <th className="text-left px-2 py-1 border-b">Admin Text</th>
              <th className="text-left px-2 py-1 border-b">Synced</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b">
                <td className="px-2 py-1 font-mono">{r.momo_tracking_no ?? "—"}</td>
                <td className="px-2 py-1 font-mono">{r.momo_container_no ?? "—"}</td>
                <td className="px-2 py-1 font-mono">{r.momo_sack_no ?? "—"}</td>
                <td className="px-2 py-1"><StatusBadge status={r.shipment_status} /></td>
                <td className="px-2 py-1">{r.admin_status_text ?? "—"}</td>
                <td className="px-2 py-1 text-muted">
                  {r.last_synced_at ? new Date(r.last_synced_at).toLocaleString("th-TH") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

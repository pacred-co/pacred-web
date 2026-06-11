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

import { Fragment, useState } from "react";
import { confirm } from "@/components/ui/confirm";
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
// ภูม flag 2026-06-11 — surface the MOMO raw fields as readable columns + detail
// (so staff cross-check every value before commit, not squint at raw JSON).
// พี่ป๊อป flag 2026-06-11 — + a "คลี่ทุก field" raw-spread view (flatten every
// field MOMO sends into its own column) to audit MOMO's inconsistent keying.
import {
  momoRawDisplay,
  momoSpreadRowMap,
  collectMomoSpreadColumns,
  formatMomoSpreadValue,
  deriveModeFromCid,
  MOMO_FIELD_TH,
  type MomoRawDisplay,
} from "@/lib/admin/momo-raw-helpers";

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
  const [rawOpen, setRawOpen] = useState<Record<string, boolean>>({});
  // พี่ป๊อป flag — preview view mode: curated summary vs "คลี่ทุก field" raw spread.
  const [rawSpread, setRawSpread] = useState(false);

  // Phase D debug — tracking lookup state
  const [debugTracking, setDebugTracking] = useState("");
  const [debugResult, setDebugResult] = useState<Record<string, unknown> | null>(null);

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
  async function onSyncReal() {
    if (!(await confirm("ยืนยัน sync เข้า momo_* tables? (action นี้จะ upsert เข้า DB)"))) return;
    callApi("/api/admin/momo/sync", {
      method: "POST",
      body: JSON.stringify({ start, end, sackNo: sackNo.trim() || undefined }),
    }, "sync");
  }

  async function onDebugLookup() {
    const t = debugTracking.trim();
    if (!t) return;
    setBusy("debug");
    setDebugResult(null);
    try {
      const r = await fetch(`/api/admin/momo/debug/tracking?n=${encodeURIComponent(t)}`, {
        cache: "no-store",
      });
      const j = await r.json();
      setDebugResult(j);
    } catch (e) {
      setDebugResult({ ok: false, error: "NETWORK_ERROR", message: e instanceof Error ? e.message : "fail" });
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

      {/* ── Phase D · Debug · Tracking Lookup ───────────────────────── */}
      <section className="rounded-2xl border border-slate-300 bg-slate-50/70 p-4 shadow-sm space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">🔍 Debug · Tracking Lookup</h3>
          <p className="text-xs text-slate-700 mt-1 leading-relaxed">
            กรอก tracking → ดูทุกอย่างที่ระบบรู้ในตอนนี้: snapshot ปัจจุบัน · history · links · raw จากทุก endpoint · status_dates · container_closed parents · container_details · sack parents · raw_events ล่าสุด 50 รายการ.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="block flex-1 min-w-[240px]">
            <span className="text-xs font-semibold text-muted">Tracking no</span>
            <input
              type="text"
              value={debugTracking}
              onChange={(e) => setDebugTracking(e.target.value)}
              placeholder="เช่น 1779529270"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              onKeyDown={(e) => { if (e.key === "Enter") onDebugLookup(); }}
            />
          </label>
          <button
            type="button"
            onClick={onDebugLookup}
            disabled={busy != null || !debugTracking.trim()}
            className="rounded-lg border border-slate-500 bg-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy === "debug" ? "กำลังค้น..." : "🔎 ค้นหา"}
          </button>
        </div>

        {debugResult && (
          <DebugResult result={debugResult} />
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
              {/* พี่ป๊อป flag — view toggle: curated summary vs raw-spread audit grid */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-muted">มุมมอง:</span>
                <div className="inline-flex overflow-hidden rounded-lg border border-border text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setRawSpread(false)}
                    className={`px-3 py-1 ${!rawSpread ? "bg-sky-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    สรุป (ใช้งาน)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRawSpread(true)}
                    className={`px-3 py-1 ${rawSpread ? "bg-sky-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    ดิบทั้งหมด — คลี่ทุก field
                  </button>
                </div>
                {rawSpread && (
                  <span className="text-[10px] text-muted">
                    ทุก field ที่ MOMO ส่งมา (ยกเว้น <code>_id</code>) คลี่เป็นคอลัมน์ — ไว้ตรวจว่า MOMO คีย์อะไรมาบ้าง แล้วคัดว่าจะใช้ field ไหน
                  </span>
                )}
              </div>

              {rawSpread ? (
                <>
                  <RawSpreadTable title="Import Track" rows={result.preview.importTrack} />
                  <RawSpreadTable title="Container Closed" rows={result.preview.containerClosed} />
                  <RawSpreadTable title="Sack Info" rows={result.preview.sackInfo} />
                </>
              ) : (
                <>
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
                </>
              )}
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

// ภูม flag 2026-06-11 — the important MOMO fields, gauged out of `raw` into
// real columns (น้ำหนัก/คิว/จำนวน/ขนส่ง/ประเภท/CG_NO/เข้าโกดัง). Everything else
// MOMO sends — except its internal `_id` — is in the readable detail sub-row.
const PREVIEW_COL_COUNT = 15;

/** Full readable breakdown of one MOMO raw blob (every field except `_id`). */
function MomoDetail({ d, raw }: { d: MomoRawDisplay; raw: unknown }) {
  const [rawOpen, setRawOpen] = useState(false);
  const kv: Array<[string, React.ReactNode]> = [
    ["ลูกค้า (MOMO)", d.memberCode || "—"],
    ["สถานะ MOMO (เลข)", d.statusCode ?? "—"],
    ["เลขพัสดุจีน", d.tracking || "—"],
    ["ขนส่ง", d.shipBy && d.shipByLabel !== d.shipBy ? `${d.shipByLabel} (${d.shipBy})` : d.shipByLabel],
    ["ประเภทสินค้า", d.productType ? (d.productType === "fda" ? "fda · กลุ่มต้องขอ อย./ใบอนุญาต" : d.productType) : "—"],
    ["ตู้/รอบ", d.containerNo || "—"],
    ["กระสอบ", d.sackNo || "—"],
    ["ขนาดกระสอบ", d.sackSize || "—"],
    ["CG_NO (พัสดุย่อย)", d.cgNo || "—"],
    ["น้ำหนัก", `${d.weight} kg`],
    ["ปริมาตร", `${d.cbm} คิว`],
    ["ขนาด (กว้าง×ยาว×สูง)", `${d.width} × ${d.length} × ${d.height} ซม.`],
    ["จำนวน", `${d.qty} ชิ้น`],
    ["ค่าใช้จ่ายเพิ่ม", String(d.extraCost)],
    ["ตีลังไม้", d.woodenCreate ? `ใช่${d.woodenInfo ? ` · ${d.woodenInfo}` : ""}` : "ไม่"],
    ["สร้างเมื่อ", d.createdDate || "—"],
    ["อัปเดตล่าสุด", d.updatedDate || "—"],
  ];
  // Container-closed records carry container-only fields (ภูม flag 2026-06-11).
  if (d.isContainer) {
    kv.push(
      ["ตู้จริง (cabinet)", d.cabinet || "—"],
      ["เลขตู้เรือ (container)", d.realContainerNo || "—"],
      ["ออกจากจีน (ETD)", d.etdCn || "—"],
      ["ถึงไทย (ETA โดยประมาณ)", d.etaThEstimate || "—"],
      ["เรือ (vessel)", d.vesselNo || "—"],
      ["B/L", d.blNo || "—"],
    );
  }
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
        {kv.map(([label, val]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-[10px] text-muted">{label}</dt>
            <dd className="text-[11px] font-medium break-words">{val}</dd>
          </div>
        ))}
      </dl>

      {d.images.length > 0 && (
        <div>
          <div className="text-[10px] text-muted mb-0.5">รูปพัสดุที่โกดังจีน ({d.images.length})</div>
          <div className="flex flex-wrap gap-2">
            {d.images.map((src, idx) => (
              <a key={idx} href={src} target="_blank" rel="noopener noreferrer"
                className="text-[11px] text-sky-600 underline">
                เปิดรูป {idx + 1}
              </a>
            ))}
          </div>
        </div>
      )}

      {!d.isContainer && (
        <div>
          <div className="text-[10px] text-muted mb-0.5">ไทม์ไลน์ของพัสดุ (status_date)</div>
          <ol className="flex flex-wrap gap-x-4 gap-y-1">
            {d.phases.map((p) => (
              <li key={p.key} className="text-[11px]">
                <span className={p.at ? "font-semibold text-emerald-700" : "text-muted"}>{p.label}</span>
                <span className="text-muted"> · {p.at ?? "—"}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <button type="button" onClick={() => setRawOpen((v) => !v)}
        className="text-sky-600 underline text-[10px]">
        {rawOpen ? "ซ่อน raw JSON" : "ดู raw JSON (ดิบ)"}
      </button>
      {rawOpen && (
        <pre className="mt-1 max-h-60 overflow-auto rounded bg-slate-100 p-1.5 text-[10px] font-mono">
          {JSON.stringify(raw, null, 2)}
        </pre>
      )}
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
      <p className="text-[10px] text-muted mb-1">
        ⇆ เลื่อนซ้าย-ขวาเพื่อดูทุกคอลัมน์ · กด “รายละเอียด” เพื่อดูข้อมูล MOMO ครบทุกช่อง
      </p>
      <div className="overflow-x-auto scrollbar-x-visible">
        <table className="w-full text-[11px] border-collapse">
          <thead className="bg-surface-alt">
            <tr className="whitespace-nowrap">
              <th className="text-left px-2 py-1 border-b">#</th>
              <th className="text-left px-2 py-1 border-b">Tracking</th>
              <th className="text-left px-2 py-1 border-b">ตู้/รอบ</th>
              <th className="text-left px-2 py-1 border-b">กระสอบ</th>
              <th className="text-left px-2 py-1 border-b">Phase</th>
              <th className="text-left px-2 py-1 border-b">สถานะ</th>
              <th className="text-right px-2 py-1 border-b">น้ำหนัก (kg)</th>
              <th className="text-right px-2 py-1 border-b">ปริมาตร (คิว)</th>
              <th className="text-right px-2 py-1 border-b">จำนวน</th>
              <th className="text-left px-2 py-1 border-b">ขนส่ง</th>
              <th className="text-left px-2 py-1 border-b">ประเภท</th>
              <th className="text-left px-2 py-1 border-b">CG_NO</th>
              <th className="text-left px-2 py-1 border-b">เข้าโกดัง</th>
              <th className="text-left px-2 py-1 border-b">Admin Text</th>
              <th className="text-left px-2 py-1 border-b">รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const k = `${kind}-${i}`;
              const isOpen = !!openMap[k];
              const d = momoRawDisplay(r.raw);
              const kodang = d.phases.find((p) => p.key === "kodang")?.at;
              return (
                <Fragment key={k}>
                  <tr className="border-b whitespace-nowrap">
                    <td className="px-2 py-1 text-muted">{i + 1}</td>
                    <td className="px-2 py-1 font-mono">{r.trackingNo ?? "—"}</td>
                    <td className="px-2 py-1 font-mono">{r.containerNo ?? "—"}</td>
                    <td className="px-2 py-1 font-mono">{r.sackNo ?? "—"}</td>
                    <td className="px-2 py-1">{r.phase ?? "—"}</td>
                    <td className="px-2 py-1"><StatusBadge status={r.shipmentStatus} /></td>
                    <td className="px-2 py-1 text-right tabular-nums">{d.weight || "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{d.cbm || "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{d.qty}</td>
                    <td className="px-2 py-1">{d.shipByLabel}</td>
                    <td className="px-2 py-1">
                      {d.productType || "—"}
                      {d.productType === "fda" && (
                        <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] font-semibold text-amber-700">อย.</span>
                      )}
                    </td>
                    <td className="px-2 py-1 font-mono">{d.cgNo || "—"}</td>
                    <td className="px-2 py-1">{kodang ?? "—"}</td>
                    <td className="px-2 py-1">{r.adminStatusText}</td>
                    <td className="px-2 py-1">
                      <button
                        type="button"
                        onClick={() => setOpenMap({ ...openMap, [k]: !isOpen })}
                        className="text-sky-600 underline text-[11px]"
                      >
                        {isOpen ? "ปิด" : "รายละเอียด"}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b bg-slate-50">
                      <td colSpan={PREVIEW_COL_COUNT} className="px-3 py-2">
                        <MomoDetail d={d} raw={r.raw} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * RawSpreadTable (พี่ป๊อป flag 2026-06-11) — the "คลี่ทุก field" audit grid.
 * Flattens every field MOMO sent (except `_id`) into one column each, one row
 * per record. The column set is the UNION across all rows (first-seen order),
 * so a field MOMO keyed on only some rows still gets a column — blank ("·")
 * where it's missing. This is the tool to eyeball MOMO's inconsistent keying
 * and decide which fields to trust before committing.
 */
// Status badge color → a light whole-row tint + a matching opaque tint for the
// sticky first column (พี่ป๊อป: ระบายสีทั้งแถวตามสถานะ — รอเข้าโกดัง=เหลือง ฯลฯ).
const ROW_TINT: Record<MomoBadgeColor, string> = {
  yellow: "bg-amber-50",
  blue:   "bg-sky-50",
  green:  "bg-emerald-50",
  red:    "bg-red-50",
};
const STICKY_TINT: Record<MomoBadgeColor, string> = {
  yellow: "bg-amber-100",
  blue:   "bg-sky-100",
  green:  "bg-emerald-100",
  red:    "bg-red-100",
};

/** In-page image viewer (พี่ป๊อป: กดดูรูปในหน้า ไม่เปิดแท็บใหม่). */
function ImageLightbox({ images, onClose }: { images: string[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-bold">รูปสินค้า ({images.length})</span>
          <button type="button" onClick={onClose}
            className="rounded-lg border border-border px-2 py-0.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
            ปิด ✕
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt={`รูปสินค้า ${i + 1}`} loading="lazy"
              className="w-full rounded-lg border border-border" />
          ))}
        </div>
      </div>
    </div>
  );
}

function RawSpreadTable({ title, rows }: { title: string; rows: MomoInternalAdminRecord[] }) {
  const [lightbox, setLightbox] = useState<string[] | null>(null);
  if (!rows || rows.length === 0) return null;
  const raws = rows.map((r) => r.raw);
  // image column → very end of the grid (พี่ป๊อป); keep all other columns' order.
  const all = collectMomoSpreadColumns(raws);
  const cols = all.includes("images")
    ? [...all.filter((c) => c !== "images"), "images"]
    : all;

  return (
    <div>
      <h4 className="text-xs font-bold mb-1">
        {title} · ดิบทั้งหมด ({rows.length} แถว · {cols.length} field)
      </h4>
      <p className="text-[10px] text-muted mb-1">
        ⇆ เลื่อนซ้าย-ขวา · หัวตารางล็อกไว้ (เลื่อนลงยังเห็นหัวข้อ) · หัวคอลัมน์เป็นไทย (ชื่อ field ดิบ MOMO อยู่บรรทัดล่าง) · ช่องว่าง (<span className="text-slate-300">·</span>) = MOMO ไม่ได้คีย์ field นั้นมาในแถวนี้ · ทั้งแถวระบายสีตามสถานะ
      </p>
      <div className="max-h-[70vh] overflow-auto scrollbar-x-visible rounded-lg border border-border">
        <table className="text-[11px] border-collapse">
          <thead className="bg-surface-alt sticky top-0 z-20">
            <tr className="whitespace-nowrap align-bottom">
              <th className="sticky left-0 z-30 bg-surface-alt border-b border-r px-2 py-1 text-left">#</th>
              {cols.map((c) => {
                const th = MOMO_FIELD_TH[c];
                return (
                  <th key={c} className="border-b px-2 py-1 text-left">
                    <div className="font-semibold">{th ?? c}</div>
                    {th && <div className="text-[9px] font-mono font-normal text-slate-400">{c}</div>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((rec, i) => {
              const m = momoSpreadRowMap(rec.raw);
              const ss = rec.shipmentStatus;
              const color: MomoBadgeColor | null = ss && ss in MOMO_STATUS_BADGE ? MOMO_STATUS_BADGE[ss] : null;
              const rowTint = color ? ROW_TINT[color] : "";
              const stickyTint = color ? STICKY_TINT[color] : "bg-white";
              const statusWord = ss && ss in MOMO_STATUS_TH ? MOMO_STATUS_TH[ss] : null;
              // ship_by vs real-cabinet mode mismatch (container rows carry `cid`).
              const cabMode = m["cid"] ? deriveModeFromCid(m["cid"]) : null;
              const shipMode = m["ship_by"] ? formatMomoSpreadValue("ship_by", m["ship_by"]) : "";
              const modeMismatch = !!cabMode && (shipMode === "เรือ" || shipMode === "รถ") && cabMode !== shipMode;
              return (
                <tr key={i} className={`border-b align-top whitespace-nowrap ${rowTint}`}>
                  <td className={`sticky left-0 z-10 border-r px-2 py-1 text-muted ${stickyTint}`}>{i + 1}</td>
                  {cols.map((c) => {
                    // images → "ดูรูป (N)" → in-page lightbox
                    if (c === "images") {
                      const imgs = Array.isArray((rec.raw as Record<string, unknown>)?.images)
                        ? ((rec.raw as Record<string, unknown>).images as unknown[]).filter((x): x is string => typeof x === "string")
                        : [];
                      return (
                        <td key={c} className="px-2 py-1">
                          {imgs.length === 0 ? (
                            <span className="text-slate-300">·</span>
                          ) : (
                            <button type="button" onClick={() => setLightbox(imgs)}
                              className="rounded border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 hover:bg-sky-100">
                              ดูรูป ({imgs.length})
                            </button>
                          )}
                        </td>
                      );
                    }
                    // status → Thai word (เหมือนหน้าสรุป) + raw number small
                    if (c === "status") {
                      return (
                        <td key={c} className="px-2 py-1 font-semibold">
                          {statusWord ?? (m[c] || <span className="text-slate-300">·</span>)}
                          {statusWord && m[c] && <span className="ml-1 text-[9px] font-mono font-normal text-slate-400">#{m[c]}</span>}
                        </td>
                      );
                    }
                    // ship_by → value + ⚠ mismatch-vs-real-cabinet flag
                    if (c === "ship_by") {
                      const v = formatMomoSpreadValue(c, m[c] ?? "");
                      return (
                        <td key={c} className="px-2 py-1 font-mono">
                          {v === "" ? <span className="text-slate-300">·</span> : v}
                          {modeMismatch && (
                            <span className="ml-1 rounded bg-red-100 px-1 text-[9px] font-semibold text-red-700"
                              title={`โหมดไม่ตรงเลขตู้จริง — ตู้ ${m["cid"]} = ${cabMode} แต่ ship_by = ${v}`}>
                              ⚠ ไม่ตรงตู้
                            </span>
                          )}
                        </td>
                      );
                    }
                    const v = formatMomoSpreadValue(c, m[c] ?? "");
                    return (
                      <td key={c} className="px-2 py-1 font-mono">
                        {v === "" ? (
                          <span className="text-slate-300">·</span>
                        ) : (
                          <div className="max-w-[280px] truncate" title={v}>{v}</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {lightbox && <ImageLightbox images={lightbox} onClose={() => setLightbox(null)} />}
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

// ── Phase D Debug result ──────────────────────────────────────

type DebugSnapshot = {
  current_phase?:        string | null;
  current_status_code?:  string | null;
  current_status_label?: string | null;
  source_endpoint?:      string | null;
  source_priority?:      number | null;
  momo_container_ref?:   string | null;
  container_batch_no?:   string | null;
  real_container_no?:    string | null;
  sack_no?:              string | null;
  ship_by?:              string | null;
  weight_kg?:            number | null;
  cbm?:                  number | null;
  estimate_date?:        string | null;
  last_event_at?:        string | null;
  mapping_notes?:        string | null;
  raw_sources?:          Record<string, unknown> | null;
};

type DebugLink = {
  source_endpoint?:    string | null;
  source_table?:       string | null;
  source_record_id?:   string | null;
  matched_by?:         string | null;
  momo_container_ref?: string | null;
  real_container_no?:  string | null;
  sack_no?:            string | null;
};

type DebugStatusDate = {
  status_key?:       string | null;
  status_value_raw?: string | null;
  status_at?:        string | null;
};

type DebugHistory = {
  changed_at?:       string | null;
  old_status_code?:  string | null;
  new_status_code?:  string | null;
  new_status_label?: string | null;
  source_endpoint?:  string | null;
  matched_by?:       string | null;
};

type DebugResultShape = {
  ok?:                    boolean;
  error?:                 string;
  message?:               string;
  trackingNo?:            string;
  snapshot?:              DebugSnapshot | null;
  history?:               DebugHistory[];
  links?:                 DebugLink[];
  statusDates?:           DebugStatusDate[];
  importTrack?:           Record<string, unknown> | null;
  containerClosedTracks?: Array<Record<string, unknown>>;
  containerClosedParents?: Array<Record<string, unknown>>;
  containerDetails?:      Array<Record<string, unknown>>;
  sackTracks?:            Array<Record<string, unknown>>;
  sackInfos?:             Array<Record<string, unknown>>;
  rawEvents?:             Array<Record<string, unknown>>;
};

function DebugResult({ result }: { result: Record<string, unknown> }) {
  const r = result as DebugResultShape;
  if (!r.ok) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
        <strong>{r.error}:</strong> {r.message}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Snapshot — the hero */}
      <div className="rounded-lg border border-slate-300 bg-white p-3 text-xs">
        <h4 className="text-xs font-bold mb-2">Current snapshot</h4>
        {!r.snapshot ? (
          <p className="text-muted italic">ยังไม่มี snapshot — รัน Backfill หรือ Sync ก่อน</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono">
            <dt className="text-muted">tracking</dt>           <dd>{r.trackingNo}</dd>
            <dt className="text-muted">phase</dt>              <dd><strong>{r.snapshot.current_phase ?? "—"}</strong></dd>
            <dt className="text-muted">status code</dt>        <dd><strong>{r.snapshot.current_status_code ?? "—"}</strong></dd>
            <dt className="text-muted">status label (TH)</dt>  <dd>{r.snapshot.current_status_label ?? "—"}</dd>
            <dt className="text-muted">source endpoint</dt>    <dd>{r.snapshot.source_endpoint ?? "—"}</dd>
            <dt className="text-muted">source priority</dt>    <dd>{r.snapshot.source_priority ?? "—"}</dd>
            <dt className="text-muted">container ref</dt>      <dd>{r.snapshot.momo_container_ref ?? "—"}</dd>
            <dt className="text-muted">batch no</dt>           <dd>{r.snapshot.container_batch_no ?? "—"}</dd>
            <dt className="text-muted">real container no</dt>  <dd><strong>{r.snapshot.real_container_no ?? "—"}</strong></dd>
            <dt className="text-muted">sack</dt>               <dd>{r.snapshot.sack_no ?? "—"}</dd>
            <dt className="text-muted">ship_by</dt>            <dd>{r.snapshot.ship_by ?? "—"}</dd>
            <dt className="text-muted">kg / cbm</dt>           <dd>{r.snapshot.weight_kg ?? "—"} / {r.snapshot.cbm ?? "—"}</dd>
            <dt className="text-muted">estimate_date</dt>      <dd>{r.snapshot.estimate_date ?? "—"}</dd>
            <dt className="text-muted">last_event_at</dt>      <dd>{r.snapshot.last_event_at ?? "—"}</dd>
            <dt className="text-muted">mapping_notes</dt>      <dd className="col-span-1">{r.snapshot.mapping_notes ?? "—"}</dd>
          </dl>
        )}
      </div>

      {/* Links */}
      <DebugSection title={`Links (${r.links?.length ?? 0})`}>
        <table className="w-full text-xs">
          <thead className="bg-slate-100"><tr>
            <th className="text-left px-2 py-1">endpoint</th>
            <th className="text-left px-2 py-1">source_table</th>
            <th className="text-left px-2 py-1">matched_by</th>
            <th className="text-left px-2 py-1">ref / real / sack</th>
          </tr></thead>
          <tbody>
            {(r.links ?? []).map((l, i) => (
              <tr key={i} className="border-b border-slate-200 font-mono">
                <td className="px-2 py-1">{l.source_endpoint ?? "—"}</td>
                <td className="px-2 py-1">{l.source_table ?? "—"}</td>
                <td className="px-2 py-1">{l.matched_by ?? "—"}</td>
                <td className="px-2 py-1">{l.momo_container_ref ?? "—"} / {l.real_container_no ?? "—"} / {l.sack_no ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DebugSection>

      {/* Status-date timeline */}
      <DebugSection title={`Status date timeline (${r.statusDates?.length ?? 0})`}>
        <table className="w-full text-xs">
          <thead className="bg-slate-100"><tr>
            <th className="text-left px-2 py-1">phase key</th>
            <th className="text-left px-2 py-1">raw value</th>
            <th className="text-left px-2 py-1">parsed at</th>
          </tr></thead>
          <tbody>
            {(r.statusDates ?? []).map((s, i) => (
              <tr key={i} className="border-b border-slate-200 font-mono">
                <td className="px-2 py-1">{s.status_key}</td>
                <td className="px-2 py-1">{s.status_value_raw ?? ""}</td>
                <td className="px-2 py-1">{s.status_at ?? <span className="text-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DebugSection>

      {/* History */}
      <DebugSection title={`History (${r.history?.length ?? 0})`}>
        <table className="w-full text-xs">
          <thead className="bg-slate-100"><tr>
            <th className="text-left px-2 py-1">changed_at</th>
            <th className="text-left px-2 py-1">old → new</th>
            <th className="text-left px-2 py-1">source</th>
            <th className="text-left px-2 py-1">matched_by</th>
          </tr></thead>
          <tbody>
            {(r.history ?? []).map((h, i) => (
              <tr key={i} className="border-b border-slate-200 font-mono">
                <td className="px-2 py-1">{h.changed_at ?? "—"}</td>
                <td className="px-2 py-1">{h.old_status_code ?? "∅"} → {h.new_status_code ?? "∅"}</td>
                <td className="px-2 py-1">{h.source_endpoint ?? "—"}</td>
                <td className="px-2 py-1">{h.matched_by ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DebugSection>

      {/* Raw events */}
      <DebugSection title={`Raw events (${r.rawEvents?.length ?? 0})`}>
        <details className="text-xs">
          <summary className="cursor-pointer text-sky-700">click to see JSON dump</summary>
          <pre className="mt-2 max-h-80 overflow-auto rounded bg-slate-100 p-2 text-[10px] font-mono">
            {JSON.stringify(r.rawEvents ?? [], null, 2)}
          </pre>
        </details>
      </DebugSection>

      {/* All other tables — collapsible JSON dumps for now */}
      <DebugSection title="Source data (JSON)">
        <details className="text-xs">
          <summary className="cursor-pointer text-sky-700">expand</summary>
          <pre className="mt-2 max-h-80 overflow-auto rounded bg-slate-100 p-2 text-[10px] font-mono">
            {JSON.stringify({
              importTrack:            r.importTrack,
              containerClosedTracks:  r.containerClosedTracks,
              containerClosedParents: r.containerClosedParents,
              containerDetails:       r.containerDetails,
              sackTracks:             r.sackTracks,
              sackInfos:              r.sackInfos,
            }, null, 2)}
          </pre>
        </details>
      </DebugSection>
    </div>
  );
}

function DebugSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-300 bg-white p-3">
      <h4 className="text-xs font-bold mb-2">{title}</h4>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

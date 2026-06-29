"use client";

/**
 * /admin/api-forwarder-momo/missing — Client UI.
 *
 * 2026-06-29 (ภูม). Lists the closed-container parcels MOMO has but our
 * tb_forwarder is missing (the import/track feed dropped them after they
 * advanced past the first status), and lets staff fill the member code +
 * create the forwarder row.
 *
 * Flow:
 *   1. pick a date range (default ~14 days) → "ค้นหาตู้ปิด"
 *   2. GET /api/admin/momo/container-closed → every track_details parcel
 *      (+ its cabinet cid, kg, cbm, ship_by)
 *   3. POST /api/admin/momo/track-completeness → keep ONLY parcels whose base
 *      tracking is NOT already in tb_forwarder
 *   4. aggregate split "-i/n" → base (sum kg/cbm), so each base shows once
 *   5. group by cabinet → table with a member input + add button per parcel
 *   6. confirm → addMissingMomoParcel(...) → mark ✓ / show error inline
 *
 * Money-UX: never auto-submit; one explicit confirmed click per parcel.
 * Writes go ONLY through the addMissingMomoParcel server action; the MOMO reads
 * go through the existing admin-gated API routes.
 */

import { Fragment, useState } from "react";
import { confirm } from "@/components/ui/confirm";
import { deriveModeFromCid } from "@/lib/admin/momo-raw-helpers";
import { addMissingMomoParcel } from "@/actions/admin/momo-add-missing";

/** Strip a MOMO "-i/n" (or "-i") split suffix → base tracking (matches the API + action). */
function baseTrackingOf(re: string): string {
  return re.trim().replace(/-\d+(\/\d+)?$/, "");
}

/** A missing parcel, one row per BASE tracking (split "-i/n" merged). */
type MissingParcel = {
  base:      string;        // base tracking (the tb_forwarder.ftrackingchn key)
  cabinet:   string;        // container cid (e.g. "GZS260626-1")
  shipBy:    string;        // raw MOMO ship_by ("car"/"ship"/"air") | ""
  weightKg:  number;        // summed across this base's "-i/n" parcels
  cbm:       number;        // summed across this base's "-i/n" parcels
  pieces:    number;        // how many track_details rows folded into this base
};

/** Per-row submit state. */
type RowState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "added"; fid: number }
  | { kind: "error"; message: string };

type CompletenessHit = { inFwd: boolean; fid: number; fweight: number; fstatus: string | null };
type CompletenessMap = Record<string, CompletenessHit>;

/** num coercion (finite → value, else 0). */
function numOr0(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  return 0;
}

/** Map raw MOMO ship_by → the action's enum, or undefined. */
function normalizeShipBy(raw: string): "car" | "ship" | "air" | undefined {
  const s = raw.trim().toLowerCase();
  return s === "car" || s === "ship" || s === "air" ? s : undefined;
}

const SHIP_BY_TH: Record<string, string> = { ship: "เรือ", car: "รถ", air: "เครื่องบิน" };

/** N days ago as YYYY-MM-DD. */
function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function MomoMissingClient() {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(daysAgoIso(14));
  const [end, setEnd]     = useState(today);

  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  // Missing parcels, sorted by cabinet then base.
  const [missing, setMissing] = useState<MissingParcel[]>([]);
  // Per-base member-code input + submit state.
  const [members, setMembers] = useState<Record<string, string>>({});
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});

  // ── Search: container-closed → completeness → keep the missing ──────────
  async function onSearch() {
    setBusy(true);
    setError(null);
    setSearched(false);
    setMissing([]);
    setRowStates({});
    try {
      // 1. fetch container_closed for the range
      const ccRes = await fetch(
        `/api/admin/momo/container-closed?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { cache: "no-store" },
      );
      const ccJson = (await ccRes.json().catch(() => null)) as
        | { ok?: boolean; data?: unknown; error?: string; message?: string }
        | null;
      if (!ccRes.ok || !ccJson?.ok) {
        setError(ccJson?.message || ccJson?.error || `ดึงตู้ปิดไม่สำเร็จ (HTTP ${ccRes.status})`);
        setSearched(true);
        return;
      }

      // The route returns res.data which is the raw MOMO payload — either a
      // bare array OR a { data: [...] } envelope (sync.ts handles both).
      const payload = ccJson.data;
      const containers: unknown[] =
        payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
          ? (payload as { data: unknown[] }).data
          : Array.isArray(payload)
            ? (payload as unknown[])
            : [];

      // 2. walk every track_details parcel → aggregate by base tracking.
      //    Keep the cabinet (cid) + ship_by from the container the base lives in.
      type Acc = { cabinet: string; shipBy: string; weightKg: number; cbm: number; pieces: number };
      const byBase = new Map<string, Acc>();
      const allReTracks: string[] = [];

      for (const c of containers) {
        if (!c || typeof c !== "object") continue;
        const cr = c as Record<string, unknown>;
        const cabinet = typeof cr.cid === "string" ? cr.cid.trim() : "";
        if (!cabinet) continue;
        const shipBy = typeof cr.ship_by === "string" ? cr.ship_by.trim() : "";
        const td = Array.isArray(cr.track_details) ? cr.track_details : [];
        for (const t of td) {
          if (!t || typeof t !== "object") continue;
          const o = t as Record<string, unknown>;
          const re = typeof o.reTrack === "string" ? o.reTrack.trim() : "";
          if (!re) continue;
          allReTracks.push(re);
          const base = baseTrackingOf(re);
          const kg = numOr0(o.kg);
          const cbm = numOr0(o.cbm);
          const prev = byBase.get(base);
          if (prev) {
            prev.weightKg += kg;
            prev.cbm += cbm;
            prev.pieces += 1;
            // keep the first non-empty cabinet/shipBy (a base shouldn't span ตู้)
            if (!prev.cabinet && cabinet) prev.cabinet = cabinet;
            if (!prev.shipBy && shipBy) prev.shipBy = shipBy;
          } else {
            byBase.set(base, { cabinet, shipBy, weightKg: kg, cbm, pieces: 1 });
          }
        }
      }

      if (allReTracks.length === 0) {
        setMissing([]);
        setSearched(true);
        return;
      }

      // 3. completeness → which bases are already in tb_forwarder
      const compRes = await fetch("/api/admin/momo/track-completeness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackings: allReTracks }),
        cache: "no-store",
      });
      const compJson = (await compRes.json().catch(() => ({ map: {} }))) as { map?: CompletenessMap };
      const completeness = compJson?.map ?? {};

      // 4. keep ONLY the bases NOT already in tb_forwarder
      const rows: MissingParcel[] = [];
      for (const [base, acc] of byBase) {
        if (completeness[base]) continue; // already in the import flow → skip
        rows.push({
          base,
          cabinet:  acc.cabinet,
          shipBy:   acc.shipBy,
          weightKg: Math.round((acc.weightKg + Number.EPSILON) * 1e6) / 1e6,
          cbm:      Math.round((acc.cbm + Number.EPSILON) * 1e6) / 1e6,
          pieces:   acc.pieces,
        });
      }
      // sort by cabinet, then base, so missing parcels of the same ตู้ group together
      rows.sort((a, b) => (a.cabinet === b.cabinet ? a.base.localeCompare(b.base) : a.cabinet.localeCompare(b.cabinet)));

      setMissing(rows);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการค้นหา");
      setSearched(true);
    } finally {
      setBusy(false);
    }
  }

  // ── Add one parcel ──────────────────────────────────────────────────────
  async function onAdd(p: MissingParcel) {
    const member = (members[p.base] ?? "").trim();
    if (!member) {
      setRowStates((s) => ({ ...s, [p.base]: { kind: "error", message: "กรอกรหัสลูกค้าก่อน (PR…)" } }));
      return;
    }
    if (!/^PR\d+$/i.test(member)) {
      setRowStates((s) => ({ ...s, [p.base]: { kind: "error", message: "รหัสลูกค้าต้องเป็น PR#### เช่น PR145" } }));
      return;
    }

    const ok = await confirm(
      `ยืนยันเพิ่มพัสดุเข้าระบบ?\n\n` +
        `เลขแทรกกิ้ง: ${p.base}\n` +
        `ตู้: ${p.cabinet}\n` +
        `ลูกค้า: ${member.toUpperCase()}\n` +
        `น้ำหนัก: ${p.weightKg} กก. · ${p.cbm} คิว`,
      { title: "เพิ่มพัสดุที่ขาด", confirmLabel: "เพิ่มเข้าระบบ" },
    );
    if (!ok) return;

    setRowStates((s) => ({ ...s, [p.base]: { kind: "saving" } }));
    try {
      const res = await addMissingMomoParcel({
        tracking:   p.base,
        cabinet:    p.cabinet,
        memberCode: member,
        weightKg:   p.weightKg,
        cbm:        p.cbm,
        shipBy:     normalizeShipBy(p.shipBy),
      });
      if (res.ok) {
        setRowStates((s) => ({ ...s, [p.base]: { kind: "added", fid: res.data?.fid ?? 0 } }));
      } else {
        setRowStates((s) => ({ ...s, [p.base]: { kind: "error", message: res.error } }));
      }
    } catch (e) {
      setRowStates((s) => ({ ...s, [p.base]: { kind: "error", message: e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ" } }));
    }
  }

  const cabinetCount = new Set(missing.map((m) => m.cabinet)).size;

  return (
    <div className="space-y-5">
      {/* Search */}
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
          <button
            type="button"
            onClick={onSearch}
            disabled={busy}
            className="rounded-lg border border-sky-500 bg-sky-600 px-3 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {busy ? "กำลังค้นหา..." : "ค้นหาตู้ปิด"}
          </button>
        </div>
        <p className="text-[11px] text-muted leading-relaxed">
          ระบบจะดึง “ตู้ปิด” ของ MOMO ในช่วงวันที่ → เทียบกับ tb_forwarder → แสดงเฉพาะพัสดุที่ MOMO มีแต่ยัง
          <strong className="text-red-600"> ไม่เข้าระบบ</strong> (พัสดุที่หลุดจาก import/track เพราะเลื่อนสถานะไปแล้ว).
          กรอกรหัสลูกค้า (ดูได้จากหน้าเว็บ MOMO) แล้วกด “เพิ่มเข้าระบบ”.
        </p>
      </section>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
          <strong>ผิดพลาด:</strong> {error}
        </div>
      )}

      {/* Results */}
      {searched && !error && (
        <section className="rounded-2xl border border-border bg-white p-4 shadow-sm space-y-3">
          {missing.length === 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              ✓ ไม่พบพัสดุที่ขาด — ทุกพัสดุในตู้ปิดช่วงนี้เข้าระบบครบแล้ว
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 font-bold text-red-700">
                  พบ {missing.length} พัสดุที่ขาด
                </span>
                <span className="text-muted">ใน {cabinetCount} ตู้</span>
              </div>

              <div className="overflow-x-auto scrollbar-x-visible rounded-lg border border-border">
                <table className="w-full text-[12px] border-collapse">
                  <thead className="bg-surface-alt">
                    <tr className="whitespace-nowrap">
                      <th className="text-left px-2 py-2 border-b font-semibold">ตู้</th>
                      <th className="text-left px-2 py-2 border-b font-semibold">เลขแทรกกิ้ง</th>
                      <th className="text-right px-2 py-2 border-b font-semibold">น้ำหนัก (กก.)</th>
                      <th className="text-right px-2 py-2 border-b font-semibold">คิว</th>
                      <th className="text-left px-2 py-2 border-b font-semibold">ขนส่ง</th>
                      <th className="text-left px-2 py-2 border-b font-semibold">รหัสลูกค้า</th>
                      <th className="text-left px-2 py-2 border-b font-semibold">เพิ่มเข้าระบบ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missing.map((p, i) => {
                      const st = rowStates[p.base] ?? { kind: "idle" as const };
                      const isAdded = st.kind === "added";
                      const isSaving = st.kind === "saving";
                      const mode = deriveModeFromCid(p.cabinet);
                      // group divider: show a subtle top border when the cabinet changes
                      const isNewCabinet = i === 0 || missing[i - 1].cabinet !== p.cabinet;
                      return (
                        <Fragment key={p.base}>
                          <tr
                            className={`border-b align-top whitespace-nowrap hover:bg-sky-50/50 ${isAdded ? "bg-emerald-50/60" : ""} ${isNewCabinet ? "border-t-2 border-t-slate-200" : ""}`}
                          >
                            <td className="px-2 py-2 font-mono">
                              {isNewCabinet ? (
                                <span className="inline-flex items-center gap-1">
                                  {p.cabinet}
                                  {mode && (
                                    <span className={`rounded px-1 text-[11px] font-semibold ${mode === "เรือ" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"}`}>
                                      {mode}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-slate-300">″</span>
                              )}
                            </td>
                            <td className="px-2 py-2 font-mono">
                              {p.base}
                              {p.pieces > 1 && (
                                <span className="ml-1 rounded bg-slate-100 px-1 text-[11px] text-slate-600" title={`รวม ${p.pieces} พัสดุย่อย (-i/n)`}>
                                  ×{p.pieces}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">{p.weightKg || "—"}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{p.cbm || "—"}</td>
                            <td className="px-2 py-2">{p.shipBy ? (SHIP_BY_TH[p.shipBy.toLowerCase()] ?? p.shipBy) : "—"}</td>
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                value={members[p.base] ?? ""}
                                onChange={(e) => setMembers((m) => ({ ...m, [p.base]: e.target.value }))}
                                placeholder="PR…"
                                disabled={isAdded || isSaving}
                                className="w-28 rounded-lg border border-border px-2 py-1 text-[12px] font-mono uppercase disabled:bg-slate-100"
                                onKeyDown={(e) => { if (e.key === "Enter" && !isAdded && !isSaving) onAdd(p); }}
                              />
                            </td>
                            <td className="px-2 py-2">
                              {isAdded ? (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700">
                                  ✓ เพิ่มแล้ว {st.fid ? `#${st.fid}` : ""}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onAdd(p)}
                                  disabled={isSaving}
                                  className="rounded-lg border border-emerald-500 bg-emerald-600 px-3 py-1 text-[12px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  {isSaving ? "กำลังเพิ่ม..." : "เพิ่มเข้าระบบ"}
                                </button>
                              )}
                            </td>
                          </tr>
                          {st.kind === "error" && (
                            <tr className="border-b bg-red-50/70">
                              <td colSpan={7} className="px-3 py-1.5 text-[11px] text-red-700">
                                ⚠️ {st.message}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted">
                ⇆ เลื่อนซ้าย-ขวาเพื่อดูทุกคอลัมน์ · พัสดุที่มีเลขย่อย (-i/n) รวมน้ำหนัก/คิวให้แล้ว (×N = จำนวนพัสดุย่อย)
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}

"use client";

/**
 * "คิวค้นเจอจาก MOMO Live" — client grid. One row per dropped-but-advancing parcel:
 * tracking · member (+validity chip) · น้ำหนัก/คิว/กล่อง · ตู้ + สถานะ Live · linked
 * ฝากสั่งซื้อ chip · thumbnail · inline userID/ขนส่ง/ประเภท · per-row + bulk "สร้าง".
 * Confirm-before-mutate (§0f) · readable type (§0h) · self-explaining rows (§0g).
 */

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { confirm, alert } from "@/components/ui/confirm";
import {
  loadMomoLiveDiscoveryQueue,
  commitDiscoveredParcel,
  commitDiscoveredBatch,
} from "@/actions/admin/momo-live-discovery";
import type { DiscoveryRow, MomoLiveDiscoveryResult } from "@/lib/admin/momo-live-discovery";

type ProductType = "1" | "2" | "3" | "4";
type EditState = { userID: string; fShipBy: string; fProductsType: ProductType };

const PRODUCT_LABELS: Record<ProductType, string> = {
  "1": "ทั่วไป",
  "2": "พิเศษ (มอก./อย.)",
  "3": "แบรนด์",
  "4": "อื่นๆ",
};

function num(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function MomoDiscoveryClient() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [loading, startLoad] = useTransition();
  const [result, setResult] = useState<MomoLiveDiscoveryResult | null>(null);
  const [rows, setRows] = useState<DiscoveryRow[]>([]);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [batchBusy, setBatchBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function seed(rs: DiscoveryRow[]) {
    const e: Record<string, EditState> = {};
    for (const r of rs) e[r.baseTracking] = { userID: r.memberCode, fShipBy: "", fProductsType: "1" };
    setEdits(e);
  }

  function load() {
    setError(null);
    startLoad(async () => {
      const res = await loadMomoLiveDiscoveryQueue();
      if (!res.ok || !res.data) {
        setError(res.ok ? "ไม่มีข้อมูล" : res.error ?? "ดึงข้อมูลไม่สำเร็จ");
        setLoaded(true);
        return;
      }
      setResult(res.data);
      setRows(res.data.rows);
      seed(res.data.rows);
      setLoaded(true);
    });
  }

  function setEdit(tracking: string, patch: Partial<EditState>) {
    setEdits((e) => ({ ...e, [tracking]: { ...e[tracking], ...patch } }));
  }

  async function commitRow(r: DiscoveryRow) {
    const e = edits[r.baseTracking];
    if (!e?.userID?.trim()) {
      await alert("กรุณาระบุรหัสลูกค้า (PR####) ก่อนสร้าง");
      return;
    }
    const ok = await confirm(
      `สร้างรายการนำเข้าให้แทรคนี้?\n\nแทรค ${r.baseTracking}\nลูกค้า ${e.userID.trim()}\nน้ำหนัก ${num(r.weightKg)} กก. · ${num(r.cbm)} คิว · ${r.quantity} กล่อง\nตู้ ${r.container || "—"}`,
    );
    if (!ok) return;
    setBusy((b) => ({ ...b, [r.baseTracking]: true }));
    const res = await commitDiscoveredParcel({
      tracking: r.baseTracking,
      userID: e.userID.trim(),
      fShipBy: e.fShipBy.trim(),
      fProductsType: e.fProductsType,
    });
    setBusy((b) => ({ ...b, [r.baseTracking]: false }));
    if (!res.ok) {
      await alert(`สร้างไม่สำเร็จ: ${res.error}`);
      return;
    }
    setRows((rs) => rs.filter((x) => x.baseTracking !== r.baseTracking));
    router.refresh();
  }

  async function commitAll() {
    const items = rows
      .filter((r) => (edits[r.baseTracking]?.userID ?? "").trim())
      .map((r) => {
        const e = edits[r.baseTracking];
        return {
          tracking: r.baseTracking,
          userID: e.userID.trim(),
          fShipBy: e.fShipBy.trim(),
          fProductsType: e.fProductsType,
        };
      });
    if (items.length === 0) {
      await alert("ไม่มีรายการที่พร้อมสร้าง (ทุกแถวต้องมีรหัสลูกค้า)");
      return;
    }
    const ok = await confirm(`สร้างรายการนำเข้าทั้งหมด ${items.length} แทรค?\n(ระบบจะสร้างเฉพาะแทรคที่ยังไม่มีในระบบ · ไม่สร้างซ้ำ)`);
    if (!ok) return;
    setBatchBusy(true);
    const res = await commitDiscoveredBatch({ items });
    setBatchBusy(false);
    if (!res.ok || !res.data) {
      await alert(`สร้างไม่สำเร็จ: ${res.ok ? "ไม่มีข้อมูล" : res.error}`);
      return;
    }
    const { created, failed, results } = res.data;
    const okSet = new Set(results.filter((x) => x.ok).map((x) => x.tracking));
    setRows((rs) => rs.filter((x) => !okSet.has(x.baseTracking)));
    const failLines = results
      .filter((x) => !x.ok)
      .slice(0, 8)
      .map((x) => `• ${x.tracking}: ${x.error}`)
      .join("\n");
    await alert(`สร้างสำเร็จ ${created} · ล้มเหลว ${failed}${failLines ? `\n\n${failLines}` : ""}`);
    router.refresh();
  }

  // ── landing (not yet scraped — MOMO is single-session) ──
  if (!loaded) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-3">
        <p className="text-sm text-muted">
          กด &quot;ค้นหาจาก MOMO Live&quot; เพื่อเข้าสู่ระบบ MOMO (บัญชีหลัก) แล้วเทียบกับระบบ PR —
          หาแทรคที่ Live บอกว่ามาไทยแล้ว/มีตู้ แต่ยังไม่มีในระบบ
        </p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {loading ? "กำลังค้นหา…" : "🔎 ค้นหาจาก MOMO Live"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* summary strip */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted/10 disabled:opacity-60"
        >
          {loading ? "กำลังค้นหา…" : "🔄 ค้นหาใหม่"}
        </button>
        {result && (
          <>
            <span className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
              🔴 ตกหล่น (ต้องสร้าง) {rows.length}
            </span>
            <span className="rounded-lg bg-muted/10 px-3 py-1.5 text-[11px] text-muted">
              เห็นบนบอร์ด {result.baseTrackingsSeen} · มีในระบบแล้ว {result.alreadyInSystem} · ยังไม่ชั่ง {result.skippedNoWeight}
            </span>
            {rows.length > 0 && (
              <button
                type="button"
                onClick={commitAll}
                disabled={batchBusy}
                className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {batchBusy ? "กำลังสร้าง…" : `✅ สร้างทั้งหมด (${rows.length})`}
              </button>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
      )}

      {result?.scrapeError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
          ⚠️ ดึงข้อมูลบางส่วนไม่สำเร็จ: {result.scrapeError} (ลองกด &quot;ค้นหาใหม่&quot;)
        </div>
      )}

      {loaded && !error && rows.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center text-sm text-emerald-800">
          ✅ ไม่มีแทรคตกหล่น — ทุกพัสดุบนบอร์ด MOMO Live มีในระบบครบแล้ว
        </div>
      ) : (
        <div className="overflow-x-auto scrollbar-x-visible rounded-2xl border border-border">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-muted/10 text-left text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">รูป</th>
                <th className="px-3 py-2">แทรค / ตู้ / สถานะ Live</th>
                <th className="px-3 py-2 text-right">น้ำหนัก · คิว · กล่อง</th>
                <th className="px-3 py-2">ฝากสั่งซื้อ</th>
                <th className="px-3 py-2">รหัสลูกค้า *</th>
                <th className="px-3 py-2">ขนส่ง · ประเภท</th>
                <th className="px-3 py-2 text-right">สร้าง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const e = edits[r.baseTracking] ?? { userID: r.memberCode, fShipBy: "", fProductsType: "1" as ProductType };
                const rowBusy = !!busy[r.baseTracking];
                return (
                  <tr key={r.baseTracking} className="align-top hover:bg-muted/5">
                    {/* thumbnail */}
                    <td className="px-3 py-3">
                      {r.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.imageUrl}
                          alt=""
                          className="h-12 w-12 rounded-lg object-cover ring-1 ring-border"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted/10 text-lg">📦</div>
                      )}
                    </td>

                    {/* tracking + cabinet + status */}
                    <td className="px-3 py-3">
                      <div className="font-semibold text-foreground">{r.baseTracking}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {r.hasContainer ? (
                          <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">
                            🚢 ตู้ {r.container}
                          </span>
                        ) : (
                          <span className="rounded-md bg-muted/15 px-1.5 py-0.5 text-[11px] text-muted">ยังไม่มีตู้</span>
                        )}
                        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                          {r.liveStatusText || "กำลังส่งมาไทย"}
                        </span>
                        {r.parcelCount > 1 && (
                          <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-800">
                            แตก {r.parcelCount} กล่อง
                          </span>
                        )}
                      </div>
                    </td>

                    {/* metrics */}
                    <td className="px-3 py-3 text-right tabular-nums">
                      <div className="font-medium text-foreground">{num(r.weightKg)} กก.</div>
                      <div className="text-xs text-muted">{num(r.cbm)} คิว · {r.quantity} กล่อง</div>
                    </td>

                    {/* linked shop order */}
                    <td className="px-3 py-3">
                      {r.linkedHno ? (
                        <div className="text-xs">
                          <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-700">
                            🔗 {r.linkedHno}
                          </span>
                          <div className="mt-1 text-[11px] text-muted">
                            {r.linkedHstatus === "5"
                              ? "สำเร็จ"
                              : r.linkedHstatus === "40"
                                ? "ถึงโกดังจีน"
                                : "รอ… (สร้างแล้วสถานะร้านจะขยับเอง)"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted">—</span>
                      )}
                    </td>

                    {/* userID */}
                    <td className="px-3 py-3">
                      <input
                        value={e.userID}
                        onChange={(ev) => setEdit(r.baseTracking, { userID: ev.target.value })}
                        className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-sm"
                        placeholder="PR####"
                      />
                      {r.userIdValid ? (
                        <div className="mt-1 text-[11px] text-emerald-700">✓ พบใน tb_users</div>
                      ) : (
                        <div className="mt-1 text-[11px] text-rose-600">⚠️ ไม่พบ — ตรวจรหัส</div>
                      )}
                    </td>

                    {/* shipBy + productType */}
                    <td className="px-3 py-3">
                      <input
                        value={e.fShipBy}
                        onChange={(ev) => setEdit(r.baseTracking, { fShipBy: ev.target.value })}
                        className="mb-1 w-28 rounded-lg border border-border bg-background px-2 py-1 text-xs"
                        placeholder="ขนส่ง (เว้นได้)"
                      />
                      <select
                        value={e.fProductsType}
                        onChange={(ev) => setEdit(r.baseTracking, { fProductsType: ev.target.value as ProductType })}
                        className="block w-28 rounded-lg border border-border bg-background px-2 py-1 text-xs"
                      >
                        {(Object.keys(PRODUCT_LABELS) as ProductType[]).map((k) => (
                          <option key={k} value={k}>{PRODUCT_LABELS[k]}</option>
                        ))}
                      </select>
                    </td>

                    {/* commit */}
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => commitRow(r)}
                        disabled={rowBusy || batchBusy}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {rowBusy ? "…" : "สร้าง"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

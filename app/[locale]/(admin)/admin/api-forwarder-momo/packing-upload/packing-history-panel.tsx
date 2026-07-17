"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  listMomoPackingUploads,
  getMomoPackingUpload,
  type MomoPackingUploadRow,
  type MomoPackingUploadDetail,
} from "@/actions/admin/momo-packing-history";
import { formatThaiDateTime } from "@/lib/utils/thai-datetime";

const n3 = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 6 }));
const n2 = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));

/**
 * ประวัติ packing list ที่อัพ (ภูม 2026-07-14) — reads the momo_packing_upload
 * history: every uploaded file + reverse-check (แทร็กที่ packing มี แต่ MOMO API
 * ไม่มี) + a re-preview from the stored snapshot + a download link.
 */
export function PackingHistoryPanel({ nonce }: { nonce: number }) {
  const [rows, setRows] = useState<MomoPackingUploadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<MomoPackingUploadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // setState lives in a PROMISE CALLBACK (external-system response) — the pattern
  // react-hooks/set-state-in-effect allows (never synchronous in the effect body).
  const applyResult = useCallback((res: Awaited<ReturnType<typeof listMomoPackingUploads>>) => {
    if (!res.ok || !res.data) { setErr(res.ok ? "โหลดไม่สำเร็จ" : res.error); return; }
    setErr(null);
    setRows(res.data);
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    listMomoPackingUploads().then(applyResult).finally(() => setLoading(false));
  }, [applyResult]);

  useEffect(() => {
    let alive = true;
    listMomoPackingUploads().then((res) => { if (alive) applyResult(res); });
    return () => { alive = false; };
  }, [applyResult, nonce]);

  async function openDetail(id: number) {
    if (expandedId === id) { setExpandedId(null); setDetail(null); return; }
    setExpandedId(id);
    setDetail(null);
    setDetailLoading(true);
    const res = await getMomoPackingUpload(id);
    setDetailLoading(false);
    if (res.ok && res.data) setDetail(res.data);
  }

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">ประวัติ packing list ที่อัพ</h2>
          <p className="text-[11px] text-muted">เก็บทุกไฟล์ที่อัพ · กดพรีวิวย้อนดู + เช็คแทร็กที่ MOMO(API) ไม่มี แต่มีใน packing list</p>
        </div>
        <button type="button" onClick={reload} disabled={loading}
          className="rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-alt disabled:opacity-50">
          {loading ? "กำลังโหลด…" : "โหลดใหม่"}
        </button>
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {!loading && rows.length === 0 && !err && (
        <p className="rounded-lg bg-surface-alt/40 px-3 py-4 text-center text-xs text-muted">ยังไม่มีประวัติ — อัพไฟล์ packing list ด้านบนแล้วจะขึ้นที่นี่</p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-xs border-collapse [&_th]:border [&_th]:border-border [&_td]:border [&_td]:border-border">
            <thead className="bg-surface-alt/50 text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-2 py-2 text-left">วันที่อัพ</th>
                <th className="px-2 py-2 text-left">ตู้</th>
                <th className="px-2 py-2 text-left">ไฟล์</th>
                <th className="px-2 py-2 text-left">ผู้อัพ</th>
                <th className="px-2 py-2 text-center">สถานะ</th>
                <th className="px-2 py-2 text-right">แทรคกิ้ง</th>
                <th className="px-2 py-2 text-right">นน. / คิว</th>
                <th className="px-2 py-2 text-center">เช็ค API</th>
                <th className="px-2 py-2 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const missing = r.reverseCheck.missing.length;
                return (
                  <Fragment key={r.id}>
                    <tr className="border-t border-border align-top">
                      <td className="px-2 py-1.5 text-[11px] whitespace-nowrap">{formatThaiDateTime(r.uploadedAt)}</td>
                      <td className="px-2 py-1.5 font-mono font-semibold text-sky-800">{r.containerNo ?? "—"}</td>
                      <td className="px-2 py-1.5 text-[11px] max-w-[14rem] truncate" title={r.fileName ?? ""}>📎 {r.fileName ?? "—"}</td>
                      <td className="px-2 py-1.5 text-[11px] whitespace-nowrap" title={r.uploadedBy ?? ""}>{r.uploadedByName ?? r.uploadedBy ?? "—"}</td>
                      <td className="px-2 py-1.5 text-center">
                        {r.status === "applied" || r.appliedAt ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800" title={r.appliedAt ? `ใช้แล้ว ${formatThaiDateTime(r.appliedAt)}` : "ใช้แล้ว"}>✓ ใช้แล้ว</span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700" title="อัพไว้ · ยังไม่กด apply เข้าระบบ">อัพไว้</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">{r.rowCount}</td>
                      <td className="px-2 py-1.5 text-right text-[11px] text-muted">{n2(r.totalWeight)} / {n3(r.totalCbm)}</td>
                      <td className="px-2 py-1.5 text-center">
                        {missing > 0 ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700" title="แทร็กที่ packing มี แต่ MOMO API ไม่มี">
                            💗 API ขาด {missing}
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800">✅ ครบ ({r.reverseCheck.present})</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button type="button" onClick={() => void openDetail(r.id)}
                          className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-surface-alt">
                          {expandedId === r.id ? "ปิด" : "พรีวิว"}
                        </button>
                      </td>
                    </tr>
                    {expandedId === r.id && (
                      <tr className="bg-surface-alt/20">
                        <td colSpan={9} className="px-3 py-3">
                          {detailLoading && <p className="text-xs text-muted">กำลังโหลด…</p>}
                          {detail && detail.row.id === r.id && (
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                {detail.downloadUrl && (
                                  <a href={detail.downloadUrl} target="_blank" rel="noopener noreferrer"
                                    className="rounded-full bg-sky-100 px-2.5 py-0.5 font-medium text-sky-800 hover:bg-sky-200">⬇ ดาวน์โหลดไฟล์ต้นฉบับ</a>
                                )}
                                <span className="text-muted">{detail.snapshot.rows.length} รายการ · {detail.snapshot.listTitle ?? ""}</span>
                              </div>
                              {r.reverseCheck.missing.length > 0 && (
                                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                                  <div className="mb-1 font-semibold">💗 มีใน packing list แต่ MOMO API ไม่มี ({r.reverseCheck.missing.length}):</div>
                                  <div className="flex flex-wrap gap-1 font-mono">
                                    {r.reverseCheck.missing.slice(0, 60).map((t) => (
                                      <span key={t} className="rounded bg-white/70 px-1.5 py-0.5">{t}</span>
                                    ))}
                                    {r.reverseCheck.missing.length > 60 && <span>… +{r.reverseCheck.missing.length - 60}</span>}
                                  </div>
                                </div>
                              )}
                              <div className="max-h-72 overflow-y-auto overflow-x-auto scrollbar-x-visible rounded-lg border border-border">
                                <table className="w-full text-[11px] border-collapse [&_th]:border [&_th]:border-border [&_td]:border [&_td]:border-border">
                                  <thead className="sticky top-0 bg-surface-alt text-muted">
                                    <tr>
                                      <th className="px-2 py-1 text-left">แทรคกิ้ง</th>
                                      <th className="px-2 py-1 text-left">ลูกค้า(PR)</th>
                                      <th className="px-2 py-1 text-right">กล่อง</th>
                                      <th className="px-2 py-1 text-right">นน.</th>
                                      <th className="px-2 py-1 text-right">คิว</th>
                                      <th className="px-2 py-1 text-left">HS</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detail.snapshot.rows.map((row, i) => (
                                      <tr key={`${row.baseTracking}-${i}`} className="border-t border-border">
                                        <td className="px-2 py-1 font-mono">{row.baseTracking}{row.subCount > 1 && <span className="ml-1 text-muted">({row.subCount})</span>}</td>
                                        <td className="px-2 py-1">{row.code ?? "—"}</td>
                                        <td className="px-2 py-1 text-right">{row.boxes ?? "—"}</td>
                                        <td className="px-2 py-1 text-right">{n2(row.weight)}</td>
                                        <td className="px-2 py-1 text-right">{n3(row.cbm)}</td>
                                        <td className="px-2 py-1 text-sky-700">{row.cg ?? "—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

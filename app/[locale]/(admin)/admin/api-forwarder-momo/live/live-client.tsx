"use client";

/**
 * /admin/api-forwarder-momo/live — Client UI.
 *
 * 2026-06-30. Read-only mirror of MOMO's master-account import board.
 *
 * 🔓 PASSWORDLESS LOGIN FLOW (ภูม): the page does NOT auto-fetch. It opens in a
 * NOT-logged-in state showing a single "🔓 เข้าสู่ระบบ MOMO" button (no password
 * field — creds are server-side in env). Clicking it calls `loadMomoLiveBoard`
 * which logs in FRESH to MOMO + returns the chosen status board. Because MOMO is
 * single-session, a "🔄 เข้าใหม่ / รีเฟรช" button re-logs-in on demand (when MOMO
 * kicks our session from another machine). The status tabs, once logged in, load
 * their board via the same action (no full navigation → keeps the logged-in
 * state). Search box client-filters by tracking OR member code, instantly.
 *
 * 🔒 Read-only. The action never fetches cost — rows carry ONLY safe operational
 * fields. Self-explaining rows (§0g) · nothing below text-[11px] (§0h).
 */

import { useMemo, useState, useTransition } from "react";
import { loadMomoLiveBoard } from "@/actions/admin/momo-web-live";
import { MOMO_LIVE_STATUSES, type MomoLiveParcel, type MomoLiveStatus } from "@/lib/integrations/momo-web/types";

/** Thai labels for the 6 status boards (the tabs). */
const STATUS_TH: Record<MomoLiveStatus, string> = {
  waiting: "รอเข้าโกดังจีน",
  arrival_kodang: "ถึงโกดังจีน",
  sending_thai: "กำลังส่งมาไทย",
  wait_pay: "รอชำระค่าขนส่ง",
  sending: "กำลังนำส่ง",
  done: "จัดส่งให้แล้ว",
};

/** raw MOMO ship_by → Thai label (falls back to the raw string, then "—"). */
function shipByTh(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (!s) return "—";
  if (s === "ship") return "เรือ";
  if (s === "car" || s === "truck") return "รถ";
  if (s === "air") return "เครื่องบิน";
  return raw;
}

export function MomoLiveClient({ status: initialStatus }: { status: MomoLiveStatus }) {
  // The board currently shown / being loaded. Starts at the page's ?status.
  const [status, setStatus] = useState<MomoLiveStatus>(initialStatus);
  // null = not logged in yet (show the login card). [] = logged in, empty board.
  const [parcels, setParcels] = useState<MomoLiveParcel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Lightbox: the full-size image of a clicked thumbnail (null = closed).
  const [zoom, setZoom] = useState<{ url: string; tracking: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const loggedIn = parcels !== null;

  // Log in fresh (or re-login) + load ONE board. Reused by the login button,
  // the refresh button, and the status tabs.
  function loadBoard(next: MomoLiveStatus) {
    setError(null);
    setStatus(next);
    startTransition(async () => {
      const res = await loadMomoLiveBoard(next);
      if (res.ok) {
        setParcels(res.data?.parcels ?? []);
      } else {
        setError(res.error);
        // keep `parcels` as-is: if we were already logged in, don't blow the
        // table away on a transient re-kick; if we weren't, it stays null →
        // the login card shows again under the error.
      }
    });
  }

  // Client-side filter by tracking OR member code (instant).
  const filtered = useMemo(() => {
    if (!parcels) return [];
    const q = query.trim().toLowerCase();
    if (!q) return parcels;
    return parcels.filter(
      (p) =>
        p.tracking.toLowerCase().includes(q) ||
        p.memberCode.toLowerCase().includes(q),
    );
  }, [parcels, query]);

  return (
    <div className="space-y-5">
      {/* Banner — what this page is */}
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-[12px] text-sky-900 leading-relaxed">
        <strong>กระจกข้อมูล (read-only):</strong> ข้อมูลนี้ดึงสดจากบัญชีหลักของ MOMO
        โดยตรง — ใช้เทียบ/เช็กว่ารายการในระบบ PR ตรงกับ MOMO ไหม{" "}
        <span className="text-sky-700">แก้ไขที่นี่ไม่ได้</span> (ดูอย่างเดียว ·
        ไม่มีต้นทุน/ราคา)
      </div>

      {/* Error (login/network) — shown above whichever state we're in */}
      {error && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">เข้าสู่ระบบ MOMO / ดึงข้อมูลไม่สำเร็จ</p>
          <p className="mt-1 text-[12px] font-mono break-words">{error}</p>
          <p className="mt-2 text-[12px] text-red-800">
            ลองกด {loggedIn ? "“เข้าใหม่ / รีเฟรช”" : "“เข้าสู่ระบบ MOMO”"} อีกครั้ง — ถ้ายังไม่ได้
            ให้เช็ก user/pass ของ MOMO หรือ MOMO อาจเปลี่ยนวิธี login
          </p>
        </div>
      )}

      {!loggedIn ? (
        /* ── NOT logged in: the passwordless login landing card ─────────── */
        <section className="rounded-2xl border border-border bg-white p-8 shadow-sm">
          <div className="mx-auto flex max-w-md flex-col items-center text-center">
            <div className="mb-3 text-5xl">🔓</div>
            <h2 className="text-lg font-bold text-foreground">เข้าสู่ระบบ MOMO</h2>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              กดเพื่อเข้าระบบ MOMO · ไม่ต้องใส่รหัส · ระบบเข้าให้อัตโนมัติ ·
              ข้อมูลดูอย่างเดียว ไม่มีต้นทุน
            </p>
            <button
              type="button"
              onClick={() => loadBoard(status)}
              disabled={pending}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "⏳ กำลังเข้าสู่ระบบ MOMO…" : "🔓 เข้าสู่ระบบ MOMO"}
            </button>
            <p className="mt-3 text-[11px] text-muted">
              จะเริ่มที่สถานะ: <span className="font-semibold text-foreground">{STATUS_TH[status]}</span>
            </p>
          </div>
        </section>
      ) : (
        /* ── Logged in: status tabs + board ────────────────────────────── */
        <>
          {/* Status tabs — buttons that load the board via the action (no nav) */}
          <nav aria-label="สถานะ MOMO" className="flex flex-wrap items-center gap-1.5">
            {MOMO_LIVE_STATUSES.map((st) => {
              const active = st === status;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => loadBoard(st)}
                  disabled={pending}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    active
                      ? "border-sky-500 bg-sky-600 text-white shadow-sm"
                      : "border-border bg-white text-foreground hover:border-sky-400 hover:bg-sky-50"
                  }`}
                >
                  {STATUS_TH[st]}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => loadBoard(status)}
              disabled={pending}
              className="ml-1 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              title="เข้าระบบ MOMO ใหม่ (กรณีโดน MOMO เตะ session) แล้วโหลดสถานะนี้ใหม่"
            >
              {pending ? "⏳ กำลังโหลด…" : "🔄 เข้าใหม่ / รีเฟรช"}
            </button>
          </nav>

          <section className="rounded-2xl border border-border bg-white p-4 shadow-sm space-y-3">
            {/* Header: count + search */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-bold text-sky-700">
                  พบ {filtered.length.toLocaleString("th-TH")} พัสดุ
                </span>
                {query.trim() && parcels.length !== filtered.length && (
                  <span className="text-[12px] text-muted">
                    (จากทั้งหมด {parcels.length.toLocaleString("th-TH")})
                  </span>
                )}
                <span className="rounded-full border border-border bg-surface-alt px-3 py-1 text-[12px] font-medium text-muted">
                  สถานะ: {STATUS_TH[status]}
                </span>
              </div>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหา เลขพัสดุ / รหัสลูกค้า…"
                className="w-full sm:w-72 rounded-lg border border-border px-3 py-2 text-sm"
              />
            </div>

            {pending ? (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-700">
                ⏳ กำลังเข้าสู่ระบบ MOMO / โหลดข้อมูล…
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                {parcels.length === 0
                  ? "MOMO ไม่มีพัสดุในสถานะนี้"
                  : "ไม่พบพัสดุที่ตรงกับคำค้นหา"}
              </div>
            ) : (
              <div className="overflow-x-auto scrollbar-x-visible rounded-lg border border-border">
                <table className="w-full text-[12px] border-collapse">
                  <thead className="bg-surface-alt">
                    <tr className="whitespace-nowrap">
                      <th className="text-left px-2 py-2 border-b font-semibold">รหัสลูกค้า</th>
                      <th className="text-left px-2 py-2 border-b font-semibold">เลขพัสดุจีน</th>
                      <th className="text-right px-2 py-2 border-b font-semibold">น้ำหนัก (กก.)</th>
                      <th className="text-right px-2 py-2 border-b font-semibold">คิว (ลบ.ม.)</th>
                      <th className="text-left px-2 py-2 border-b font-semibold">ก×ย×ส</th>
                      <th className="text-left px-2 py-2 border-b font-semibold">ประเภท</th>
                      <th className="text-left px-2 py-2 border-b font-semibold">ขนส่ง</th>
                      <th className="text-left px-2 py-2 border-b font-semibold">ตู้</th>
                      <th className="text-left px-2 py-2 border-b font-semibold">สถานะ</th>
                      <th className="text-center px-2 py-2 border-b font-semibold">รูป</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p, i) => {
                      const dims =
                        p.width || p.length || p.height
                          ? `${p.width || 0}×${p.length || 0}×${p.height || 0}`
                          : "–";
                      return (
                        <tr
                          key={`${p.tracking}-${i}`}
                          className="border-b align-top whitespace-nowrap hover:bg-sky-50/50"
                        >
                          {/* รหัสลูกค้า — chip */}
                          <td className="px-2 py-2">
                            {p.memberCode ? (
                              <span className="inline-flex items-center rounded bg-emerald-100 px-2 py-1 text-[12px] font-bold text-emerald-700">
                                {p.memberCode}
                              </span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          {/* เลขพัสดุจีน */}
                          <td className="px-2 py-2 font-mono">{p.tracking}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{p.weightKg || "—"}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{p.cbm || "—"}</td>
                          <td className="px-2 py-2 font-mono text-[11px] text-muted">{dims}</td>
                          <td className="px-2 py-2">{p.type || "—"}</td>
                          <td className="px-2 py-2">{shipByTh(p.shipBy)}</td>
                          {/* ตู้ */}
                          <td className="px-2 py-2 font-mono">{p.containerName || "—"}</td>
                          {/* สถานะ */}
                          <td className="px-2 py-2 text-[11px]">{p.statusText || STATUS_TH[status]}</td>
                          {/* รูป — clickable thumbnail */}
                          <td className="px-2 py-2 text-center">
                            {p.imageUrl ? (
                              <button
                                type="button"
                                onClick={() => setZoom({ url: p.imageUrl!, tracking: p.tracking })}
                                className="inline-block rounded border border-border hover:ring-2 hover:ring-sky-400"
                                title="คลิกเพื่อดูรูปเต็ม"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={p.imageUrl}
                                  alt={`รูปพัสดุ ${p.tracking}`}
                                  className="h-10 w-10 rounded object-cover"
                                  loading="lazy"
                                />
                              </button>
                            ) : (
                              <span className="text-[11px] text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-[11px] text-muted leading-relaxed">
              ⇆ เลื่อนซ้าย-ขวาเพื่อดูทุกคอลัมน์ · ข้อมูลดึงสดจากเว็บ MOMO (บัญชีหลัก) ·
              คลิกรูปเพื่อดูเต็ม · หน้านี้ดูอย่างเดียว ไม่มีการแก้ไข/บันทึก
            </p>
          </section>
        </>
      )}

      {/* Image lightbox */}
      {zoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setZoom(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-full max-w-3xl overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-3 text-white">
              <span className="font-mono text-sm">{zoom.tracking}</span>
              <button
                type="button"
                onClick={() => setZoom(null)}
                className="rounded-lg border border-white/40 bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
              >
                ปิด ✕
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoom.url}
              alt={`รูปพัสดุ ${zoom.tracking}`}
              className="max-h-[80vh] w-auto rounded-lg bg-white"
            />
          </div>
        </div>
      )}
    </div>
  );
}

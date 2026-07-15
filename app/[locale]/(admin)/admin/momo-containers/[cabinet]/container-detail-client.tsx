"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import type { MomoContainerDetail } from "@/actions/admin/momo-container-detail";
import { VERIFY_LABEL } from "@/lib/admin/momo-container-view";

const n2 = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));
const n3 = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 6 }));
const FST: Record<string, string> = {
  "1": "รอเข้าโกดังจีน", "2": "ถึงโกดังจีน", "3": "กำลังส่งมาไทย", "4": "ถึงไทยแล้ว",
  "5": "รอชำระ", "6": "เตรียมส่ง", "7": "ส่งแล้ว", "40": "ถึงโกดังจีน", "99": "ยกเลิก",
};
const TRANSPORT: Record<string, string> = { "1": "🚚 ทางรถ", "2": "🚢 ทางเรือ", "3": "✈️ ทางอากาศ" };

type Tab = "items" | "packing" | "images";

export function ContainerDetailClient({ d }: { d: MomoContainerDetail }) {
  const [tab, setTab] = useState<Tab>("items");
  const v = VERIFY_LABEL[d.verify.status];

  return (
    <div className="space-y-4">
      {/* ── HEADER CARD ─────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-sky-50 to-white dark:from-surface dark:to-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xl font-bold font-mono text-sky-800">🚚 {d.cabinet}</span>
          {d.transport && <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700">{TRANSPORT[d.transport]}</span>}
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${v.cls}`}>{v.label}</span>
          {d.verify.apiMissing > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700" title="แทร็กที่มีใน packing list แต่ MOMO API ไม่มี">
              💗 API ขาด {d.verify.apiMissing}
            </span>
          )}
          {d.garbageCount > 0 && (
            <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white" title="ตัวเลข MOMO ขัดกันเอง (แถวย่อยหนักเกินก้อนรวม) — ระบบแตกกล่องอัตโนมัติไม่ได้ · ต้องอัพ packing list แต้ม">
              🚩 MOMO มั่ว {d.garbageCount}
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <Stat label="แทรคกิ้ง" value={String(d.trackCount)} />
          <Stat label="กล่อง (ระบบ)" value={d.boxes == null ? "—" : String(d.boxes)} sub={d.packing ? `packing ${d.packing.boxes ?? "—"}` : undefined} warn={d.verify.boxShort} />
          <Stat label="น้ำหนัก (ระบบ)" value={`${n2(d.weight)} กก.`} sub={d.packing ? `packing ${n2(d.packing.weight)}` : undefined} warn={d.verify.weightShort} />
          <Stat label="ปริมาตร (ระบบ)" value={`${n3(d.cbm)} คิว`} sub={d.packing ? `packing ${n3(d.packing.cbm)}` : undefined} />
          {d.billedCount > 0 && <Stat label="วางบิลแล้ว" value={`${d.billedCount} แถว`} />}
        </div>
      </section>

      {/* ── 🚩 "MOMO มั่ว" alert — rows whose per-box numbers contradict the aggregate ── */}
      {d.garbageCount > 0 && (
        <section className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 shadow-sm">
          <div className="text-sm font-semibold text-red-800">🚩 ตัวเลข MOMO ขัดกันเอง {d.garbageCount} แถว — ระบบแตกกล่องอัตโนมัติไม่ได้</div>
          <p className="mt-1 text-[13px] leading-relaxed text-red-700">
            แถวที่มี 🚩 ในตาราง = MOMO ส่งน้ำหนัก/คิว ต่อกล่อง <strong>ไม่ตรงกับก้อนรวม</strong> (แถวย่อยหนักเกินก้อนรวม)
            และขนาดกล่อง (ก×ย×ส) ก็เช็คไม่ได้ → เชื่อตัวเลข MOMO ไม่ได้ · ต้อง{" "}
            <Link href="/admin/api-forwarder-momo/packing-upload" className="font-semibold underline hover:text-red-900">
              อัพ packing list ของแต้ม
            </Link>{" "}
            เพื่อได้ตัวเลขจริงก่อนวางบิล.
          </p>
        </section>
      )}

      {/* ── PER-PR SUMMARY (ไอแต้ม "ข้อมูลสรุปในตู้") ─────────────────────── */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold">ข้อมูลสรุปในตู้ (ต่อลูกค้า PR)</h2>
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-xs border-collapse [&_th]:border [&_th]:border-border [&_td]:border [&_td]:border-border">
            <thead className="bg-surface-alt/50 text-[11px] uppercase text-muted">
              <tr>
                <th className="px-2 py-1.5 text-left">ลูกค้า (PR)</th>
                <th className="px-2 py-1.5 text-right">แทรคกิ้ง</th>
                <th className="px-2 py-1.5 text-right">กล่อง</th>
                <th className="px-2 py-1.5 text-right">น้ำหนัก</th>
                <th className="px-2 py-1.5 text-right">ปริมาตร</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t-2 border-border bg-rose-50/40 font-semibold">
                <td className="px-2 py-1.5">ยอดรวมทั้งหมด</td>
                <td className="px-2 py-1.5 text-right">{d.trackCount}</td>
                <td className="px-2 py-1.5 text-right">{d.boxes ?? "—"}</td>
                <td className="px-2 py-1.5 text-right">{n2(d.weight)}</td>
                <td className="px-2 py-1.5 text-right">{n3(d.cbm)}</td>
              </tr>
              {d.perPr.map((p) => (
                <tr key={p.pr} className="border-t border-border">
                  <td className="px-2 py-1.5 font-medium text-sky-700">{p.pr}</td>
                  <td className="px-2 py-1.5 text-right">{p.count}</td>
                  <td className="px-2 py-1.5 text-right">{p.boxes}</td>
                  <td className="px-2 py-1.5 text-right">{n2(p.weight)}</td>
                  <td className="px-2 py-1.5 text-right">{n3(p.cbm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── TABS (ไอแต้ม tab strip) ─────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {([["items", `📋 รายการในตู้ (ระบบ) ${d.items.length}`], ["packing", `📦 เทียบ packing list${d.packing ? "" : " (ยังไม่มี)"}`], ["images", `🖼️ รูปสินค้า ${d.images.length}`]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`rounded-t-lg px-3 py-2 text-xs font-medium ${tab === k ? "border-b-2 border-primary-600 text-primary-700" : "text-muted hover:text-foreground"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: รายการในตู้ (ระบบ) — item table (ไอแต้ม image 4) ────────── */}
      {tab === "items" && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-xs border-collapse [&_th]:border [&_th]:border-border [&_td]:border [&_td]:border-border">
            <thead className="bg-surface-alt/50 text-[11px] uppercase text-muted">
              <tr>
                <th className="px-2 py-1.5 text-right">#</th>
                <th className="px-2 py-1.5 text-left">Tracking</th>
                <th className="px-2 py-1.5 text-left">PR</th>
                <th className="px-2 py-1.5 text-right">W×L×H</th>
                <th className="px-2 py-1.5 text-right">กล่อง</th>
                <th className="px-2 py-1.5 text-right">น้ำหนัก</th>
                <th className="px-2 py-1.5 text-right">คิว</th>
                <th className="px-2 py-1.5 text-left">ประเภท</th>
                <th className="px-2 py-1.5 text-left">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((it, i) => (
                <tr key={it.id} className={`border-t border-border ${it.garbage ? "bg-red-50" : ""}`}>
                  <td className="px-2 py-1.5 text-right text-muted">{i + 1}</td>
                  <td className="px-2 py-1.5 font-mono">
                    {it.garbage && (
                      <span
                        className="mr-1 cursor-help"
                        title={`🚩 MOMO มั่ว — box_detail ${it.garbage.boxCount} กล่อง รวม${
                          it.garbage.reason === "weight"
                            ? `น้ำหนัก ${n2(it.garbage.boxWeightSum)} กก. เกินก้อนรวม ${n2(it.garbage.aggWeight)} กก.`
                            : `คิว ${n3(it.garbage.boxCbmSum)} เกินก้อนรวม ${n3(it.garbage.aggCbm)}`
                        } · ขนาดกล่องก็เช็คไม่ได้ → ต้องอัพ packing list แต้ม`}
                      >🚩</span>
                    )}
                    {it.tracking ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-sky-700">{it.pr ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right text-[11px] text-muted">{it.w ?? "—"}×{it.l ?? "—"}×{it.h ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right">{it.boxes ?? "—"}</td>
                  <td className={`px-2 py-1.5 text-right ${it.garbage?.reason === "weight" ? "font-semibold text-red-700" : ""}`}>{n2(it.weight)}</td>
                  <td className={`px-2 py-1.5 text-right ${it.garbage?.reason === "cbm" ? "font-semibold text-red-700" : ""}`}>{n3(it.cbm)}</td>
                  <td className="px-2 py-1.5 text-[11px]">{it.productType ?? "—"}</td>
                  <td className="px-2 py-1.5 text-[11px] text-muted">{it.status ? (FST[it.status] ?? `[${it.status}]`) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ── TAB: เทียบ packing list ──────────────────────────────────────── */}
      {tab === "packing" && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3">
          {!d.packing ? (
            <p className="rounded-lg bg-surface-alt/40 px-3 py-4 text-center text-xs text-muted">
              ยังไม่มี packing list ของตู้นี้ — <Link href="/admin/api-forwarder-momo/packing-upload" className="text-sky-700 hover:underline">ไปหน้าอัพ packing list</Link>
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-muted">อัพล่าสุด {new Date(d.packing.uploadedAt).toLocaleString("th-TH")}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5">กล่อง {d.packing.boxes ?? "—"}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5">นน. {n2(d.packing.weight)}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5">คิว {n3(d.packing.cbm)}</span>
              </div>
              {d.packing.missing.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                  <div className="mb-1 font-semibold">💗 มีใน packing list แต่ MOMO API ไม่มี ({d.packing.missing.length}):</div>
                  <div className="flex flex-wrap gap-1 font-mono">
                    {d.packing.missing.slice(0, 80).map((t) => <span key={t} className="rounded bg-white/70 px-1.5 py-0.5">{t}</span>)}
                    {d.packing.missing.length > 80 && <span>… +{d.packing.missing.length - 80}</span>}
                  </div>
                </div>
              )}
              <div className="overflow-x-auto scrollbar-x-visible">
                <table className="w-full text-xs">
                  <thead className="bg-surface-alt/50 text-[11px] uppercase text-muted">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Tracking (packing)</th>
                      <th className="px-2 py-1.5 text-left">Code</th>
                      <th className="px-2 py-1.5 text-right">กล่อง</th>
                      <th className="px-2 py-1.5 text-right">น้ำหนัก</th>
                      <th className="px-2 py-1.5 text-right">คิว</th>
                      <th className="px-2 py-1.5 text-left">CG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.packing.rows.map((r, i) => (
                      <tr key={`${r.baseTracking}-${i}`} className="border-t border-border">
                        <td className="px-2 py-1.5 font-mono">{r.baseTracking}{r.subCount > 1 && <span className="ml-1 text-muted">({r.subCount})</span>}</td>
                        <td className="px-2 py-1.5">{r.code ?? "—"}</td>
                        <td className="px-2 py-1.5 text-right">{r.boxes ?? "—"}</td>
                        <td className="px-2 py-1.5 text-right">{n2(r.weight)}</td>
                        <td className="px-2 py-1.5 text-right">{n3(r.cbm)}</td>
                        <td className="px-2 py-1.5 text-sky-700">{r.cg ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {/* ── TAB: รูปสินค้า (ไอแต้ม image 5) ──────────────────────────────── */}
      {tab === "images" && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
          {d.images.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted">ไม่มีรูปสินค้าในตู้นี้</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {d.images.map((img, i) => (
                <a key={i} href={img.src} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.src} alt={img.tracking ?? "สินค้า"} className="h-40 w-full object-cover" loading="lazy" />
                  <div className="px-2 py-1 text-[11px]">
                    <div className="font-mono truncate">{img.tracking ?? "—"}</div>
                    <div className="text-muted">{img.pr ?? "—"}</div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`font-semibold ${warn ? "text-rose-700" : ""}`}>{value}</div>
      {sub && <div className={`text-[11px] ${warn ? "text-rose-600" : "text-muted"}`}>{sub}</div>}
    </div>
  );
}

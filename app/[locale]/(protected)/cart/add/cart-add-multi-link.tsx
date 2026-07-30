"use client";

/**
 * `/cart/add` — multi-link "เพิ่มสินค้าเข้ารถเข็น" (owner 2026-07-30 · "อยากได้แบบในภาพ").
 *
 * Redesign of the single-link `<CartAddUrlForm>`: paste up to 20 product links
 * (1688 / Taobao / Tmall / Alibaba) — one at a time, all-at-once, or from the
 * clipboard — verify them all in one click, pick quantities, then add the whole
 * batch to the cart.
 *
 * Money path is 100% REUSED (no new one):
 *   - verify a link  → searchProductByUrl()  (actions/product-search.ts)
 *   - add the batch  → addCartItemsBulk()     (actions/cart.ts · tb_cart · cap 10000)
 *
 * The "ไม่มีลิงก์สินค้า" tab points to the existing manual-entry flow
 * (/service-order/add) — no dead end, no new manual form for V1.
 *
 * Thai is hardcoded (matches the sibling admin link-paste-search pattern · the
 * customer portal is TH-primary). Mobile-first per AGENTS.md §6: inputs ≥ 44px,
 * body text ≥ 16px on the paste box, single-column < md, CTA thumb-reachable.
 */

import { useMemo, useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import {
  Link2, Pencil, Search, Trash2, Plus, GripVertical,
  CheckCircle2, Clock, AlertTriangle, ShoppingCart, ArrowLeft, PartyPopper,
} from "lucide-react";
import { searchProductByUrl, type ProductSearchOk } from "@/actions/product-search";
import { addCartItemsBulk } from "@/actions/cart";
import { clampOrderQty } from "@/lib/validators/order-qty";

const MAX_ROWS = 20;

// ── Source detection — hostname → marketplace badge. ─────────────────
type Source = "1688" | "taobao" | "tmall" | "alibaba";
function detectSource(raw: string): Source | null {
  const u = raw.trim().toLowerCase();
  if (!u) return null;
  if (u.includes("1688.com")) return "1688";
  if (u.includes("tmall.com")) return "tmall";
  if (u.includes("taobao.com")) return "taobao";
  if (u.includes("alibaba.com")) return "alibaba";
  return null;
}
const SOURCE_BADGE: Record<Source, { label: string; cls: string }> = {
  "1688":   { label: "1688",     cls: "bg-orange-50 text-orange-700" },
  taobao:   { label: "Taobao",   cls: "bg-rose-50 text-rose-700" },
  tmall:    { label: "Tmall",    cls: "bg-red-50 text-red-700" },
  alibaba:  { label: "Alibaba",  cls: "bg-amber-50 text-amber-700" },
};

type Row = { id: number; url: string };
let ROW_SEQ = 1;
function newRow(url = ""): Row {
  return { id: ROW_SEQ++, url };
}

type VerifiedRow =
  | { key: number; url: string; ok: true; product: ProductSearchOk["product"]; qty: number; picked: boolean }
  | { key: number; url: string; ok: false; message: string };

type Flash =
  | { kind: "added"; count: number }
  | { kind: "cart_full" }
  | { kind: "error"; message: string };

function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CartAddMultiLink({ rsDefault }: { rsDefault: number }) {
  const [tab, setTab] = useState<"link" | "manual">("link");
  const [subTab, setSubTab] = useState<"one" | "multi" | "clipboard">("one");
  const [rows, setRows] = useState<Row[]>([newRow(), newRow()]);
  const [multiText, setMultiText] = useState("");
  const [phase, setPhase] = useState<"input" | "results">("input");
  const [results, setResults] = useState<VerifiedRow[]>([]);
  const [verifying, startVerify] = useTransition();
  const [adding, startAdd] = useTransition();
  const [flash, setFlash] = useState<Flash | null>(null);

  // Ready = a row whose URL is a supported marketplace link.
  const readyCount = useMemo(
    () => rows.filter((r) => detectSource(r.url) !== null).length,
    [rows],
  );
  const filledCount = useMemo(() => rows.filter((r) => r.url.trim()).length, [rows]);

  // ── Row editing ───────────────────────────────────────────────────
  function setUrl(id: number, url: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, url } : r)));
    setFlash(null);
  }
  function addRow() {
    setRows((rs) => (rs.length >= MAX_ROWS ? rs : [...rs, newRow()]));
  }
  function deleteRow(id: number) {
    setRows((rs) => (rs.length <= 1 ? rs : rs.filter((r) => r.id !== id)));
  }
  function clearAll() {
    setRows([newRow()]);
    setMultiText("");
    setFlash(null);
  }

  // Split pasted text into individual links (newline / whitespace separated).
  function textToRows(text: string): Row[] {
    const links = text
      .split(/[\s\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_ROWS);
    return links.length ? links.map((u) => newRow(u)) : [newRow()];
  }
  function applyMultiText() {
    const next = textToRows(multiText);
    setRows(next);
    setSubTab("one");
    setFlash(null);
  }
  async function pasteFromClipboard() {
    try {
      const text = (await navigator.clipboard.readText())?.trim();
      if (text) {
        setRows(textToRows(text));
        setSubTab("one");
      }
    } catch {
      setFlash({ kind: "error", message: "อ่านคลิปบอร์ดไม่ได้ — วางลิงก์ในช่องด้านบนแทนได้ครับ" });
    }
  }

  // ── Verify every ready link (parallel) → results stage ──────────────
  function onVerify() {
    const ready = rows.filter((r) => detectSource(r.url) !== null);
    if (ready.length === 0) {
      setFlash({ kind: "error", message: "ยังไม่มีลิงก์ที่พร้อมตรวจสอบ — วางลิงก์ 1688 / Taobao / Tmall ก่อนครับ" });
      return;
    }
    setFlash(null);
    startVerify(async () => {
      const settled = await Promise.all(
        ready.map(async (r): Promise<VerifiedRow> => {
          const res = await searchProductByUrl(r.url.trim());
          if (res.ok) {
            return { key: r.id, url: r.url, ok: true, product: res.product, qty: 1, picked: true };
          }
          return {
            key: r.id,
            url: r.url,
            ok: false,
            message: res.message || "ดึงข้อมูลสินค้าไม่สำเร็จ — ลองใหม่ หรือกรอกข้อมูลเอง",
          };
        }),
      );
      setResults(settled);
      setPhase("results");
    });
  }

  // ── Results-stage editing ───────────────────────────────────────────
  function setResQty(key: number, qty: number) {
    setResults((rs) =>
      rs.map((r) => (r.key === key && r.ok ? { ...r, qty: clampOrderQty(qty) } : r)),
    );
  }
  function togglePick(key: number) {
    setResults((rs) =>
      rs.map((r) => (r.key === key && r.ok ? { ...r, picked: !r.picked } : r)),
    );
  }

  const okResults = results.filter((r): r is Extract<VerifiedRow, { ok: true }> => r.ok);
  const pickedResults = okResults.filter((r) => r.picked && r.qty > 0);
  const failCount = results.length - okResults.length;
  const pickedPieces = pickedResults.reduce((s, r) => s + r.qty, 0);

  function onAddSelected() {
    if (pickedResults.length === 0) {
      setFlash({ kind: "error", message: "เลือกอย่างน้อย 1 รายการก่อนเพิ่มลงรถเข็นครับ" });
      return;
    }
    setFlash(null);
    const bulk = pickedResults.map((r) => ({
      provider:   r.product.provider,
      shop_name:  r.product.shopName || "pacred",
      url:        r.product.sourceUrl,
      title:      r.product.title,
      image_path: r.product.imageUrl || "",
      color:      undefined,
      size:       undefined,
      price_cny:  r.product.promoPriceCny ?? r.product.priceCny,
      amount:     r.qty,
      details:    undefined,
    }));
    startAdd(async () => {
      const res = await addCartItemsBulk(bulk);
      if (res.ok) {
        setFlash({ kind: "added", count: res.data?.count ?? bulk.length });
        setRows([newRow()]);
        setResults([]);
        setPhase("input");
      } else if (/cart cap reached/i.test(res.error)) {
        setFlash({ kind: "cart_full" });
      } else {
        setFlash({ kind: "error", message: res.error || "เพิ่มลงรถเข็นไม่สำเร็จ" });
      }
    });
  }

  // ════════════════════════════════════════════════════════════════
  return (
    <div className="rounded-2xl bg-white border border-border shadow-sm p-4 md:p-5">
      <h2 className="text-lg md:text-xl font-bold text-foreground">เพิ่มสินค้าเข้ารถเข็น</h2>
      <p className="text-[12.5px] text-muted mt-0.5 mb-3.5">เลือกวิธีเพิ่มสินค้าได้ 2 แบบ</p>

      {/* Tabs — มีลิงก์ / ไม่มีลิงก์ */}
      <div className="flex gap-2.5 mb-4">
        <button
          type="button"
          onClick={() => setTab("link")}
          className={`relative flex-1 inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition ${
            tab === "link"
              ? "border-red-500 bg-red-50 text-primary-700 ring-2 ring-red-500/15"
              : "border-border bg-white text-muted hover:border-red-200"
          }`}
        >
          <Link2 className="h-4 w-4" /> มีลิงก์สินค้า
          <span className="absolute -top-2 right-3 rounded-full bg-red-600 px-2 py-0.5 text-[9.5px] font-extrabold text-white">
            แนะนำ
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab("manual")}
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition ${
            tab === "manual"
              ? "border-red-500 bg-red-50 text-primary-700 ring-2 ring-red-500/15"
              : "border-border bg-white text-muted hover:border-red-200"
          }`}
        >
          <Pencil className="h-4 w-4" /> ไม่มีลิงก์สินค้า
        </button>
      </div>

      {/* ── TAB: ไม่มีลิงก์ → manual entry ── */}
      {tab === "manual" && (
        <div className="rounded-xl border border-border p-4 text-center">
          <span className="inline-flex w-11 h-11 rounded-xl bg-red-50 text-primary-600 items-center justify-center mb-2">
            <Pencil className="h-5 w-5" />
          </span>
          <p className="text-[15px] font-bold text-foreground">กรอกข้อมูลสินค้าเอง</p>
          <p className="text-[12.5px] text-muted mt-1 mb-3">
            ไม่มีลิงก์ก็สั่งได้ — พิมพ์ชื่อสินค้า · ราคา · จำนวน แล้วแนบรูปประกอบ
          </p>
          <Link
            href="/service-order/add"
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-700 transition"
          >
            กรอกข้อมูลสินค้าเอง
          </Link>
        </div>
      )}

      {/* ── TAB: มีลิงก์ ── */}
      {tab === "link" && phase === "input" && (
        <>
          <div className="text-[14.5px] font-bold text-foreground">
            เพิ่มลิงก์สินค้าที่ต้องการสั่งซื้อ
            <span className="ml-2 text-[11.5px] font-semibold text-muted">เพิ่มได้สูงสุด {MAX_ROWS} ลิงก์</span>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-1.5 my-3 text-[11px] flex-wrap">
            <Step n={1} label="วางลิงก์สินค้า" on />
            <span className="text-gray-300">→</span>
            <Step n={2} label="เพิ่มได้หลายรายการ" on={filledCount > 0} />
            <span className="text-gray-300">→</span>
            <Step n={3} label="ตรวจสอบทั้งหมด" on={false} />
          </div>

          {/* Sub-tabs */}
          <div className="inline-flex flex-wrap gap-0.5 rounded-xl border border-border bg-surface p-1 mb-3">
            {([
              ["one", "เพิ่มทีละลิงก์"],
              ["multi", "วางหลายลิงก์พร้อมกัน"],
              ["clipboard", "จากคลิปบอร์ด"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (key === "clipboard") { void pasteFromClipboard(); return; }
                  setSubTab(key);
                }}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-bold transition ${
                  subTab === key && key !== "clipboard"
                    ? "bg-white text-primary-700 shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Multi-paste textarea */}
          {subTab === "multi" ? (
            <div className="mb-3">
              <textarea
                value={multiText}
                onChange={(e) => setMultiText(e.target.value)}
                rows={5}
                placeholder={"วางลิงก์หลายอัน บรรทัดละ 1 ลิงก์\nhttps://detail.1688.com/offer/...\nhttps://item.taobao.com/item.htm?id=..."}
                className="w-full rounded-xl border border-border bg-white p-3 text-[14px] outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
              />
              <button
                type="button"
                onClick={applyMultiText}
                disabled={!multiText.trim()}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-primary-700 disabled:opacity-40"
              >
                แปลงเป็นช่องลิงก์
              </button>
            </div>
          ) : (
            <>
              {/* Link rows */}
              <div className="space-y-2">
                {rows.map((r, i) => {
                  const src = detectSource(r.url);
                  const filled = !!r.url.trim();
                  return (
                    <div
                      key={r.id}
                      className={`flex items-center gap-2 rounded-xl border p-2 ${
                        src ? "border-emerald-200 bg-emerald-50/40" : "border-border bg-white"
                      }`}
                    >
                      <GripVertical className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
                      <span className="w-5 shrink-0 text-center text-[12px] font-bold text-muted">{i + 1}</span>
                      <input
                        type="url"
                        inputMode="url"
                        value={r.url}
                        onChange={(e) => setUrl(r.id, e.target.value)}
                        placeholder="วางลิงก์สินค้า 1688 / Taobao / Tmall ที่นี่"
                        className="min-w-0 flex-1 h-10 rounded-lg border border-border px-3 text-[13.5px] outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                      />
                      {src && (
                        <span className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-extrabold ${SOURCE_BADGE[src].cls}`}>
                          {SOURCE_BADGE[src].label}
                        </span>
                      )}
                      <span className="hidden sm:flex shrink-0 items-center gap-1 text-[11.5px] font-bold whitespace-nowrap">
                        {src ? (
                          <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> พร้อมตรวจสอบ</span>
                        ) : filled ? (
                          <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3.5 w-3.5" /> ลิงก์ไม่รองรับ</span>
                        ) : (
                          <span className="flex items-center gap-1 text-gray-400"><Clock className="h-3.5 w-3.5" /> รอวางลิงก์</span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteRow(r.id)}
                        disabled={rows.length <= 1}
                        aria-label="ลบช่องนี้"
                        className="shrink-0 rounded-lg p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={addRow}
                disabled={rows.length >= MAX_ROWS}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-surface/50 py-2.5 text-[13px] font-bold text-muted hover:border-red-300 hover:text-primary-600 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> เพิ่มช่องลิงก์
              </button>

              {/* Footer summary */}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                <span>ทั้งหมด <b className="text-foreground">{rows.length}</b> ช่อง</span>
                <span className="text-emerald-700">· พร้อมตรวจสอบ <b>{readyCount}</b></span>
                {filledCount - readyCount > 0 && <span>· ไม่รองรับ {filledCount - readyCount}</span>}
                <button type="button" onClick={clearAll} className="ml-auto font-bold text-red-600 hover:text-red-700">
                  ล้างทั้งหมด
                </button>
              </div>
            </>
          )}

          {flash && <FlashBanner flash={flash} />}

          <button
            type="button"
            onClick={onVerify}
            disabled={verifying || readyCount === 0}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 py-3.5 text-[15px] font-extrabold text-white shadow-sm hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Search className="h-5 w-5" strokeWidth={2.4} />
            {verifying ? "กำลังตรวจสอบสินค้า..." : `ค้นหาและตรวจสอบสินค้า ${readyCount} รายการ`}
          </button>

          {/* supported */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[12px] text-muted">
            <span>รองรับเว็บไซต์:</span>
            {["1688", "Taobao", "Tmall", "Alibaba"].map((s) => (
              <span key={s} className="rounded-lg bg-surface-alt/60 px-2.5 py-0.5 text-[11.5px] font-semibold text-foreground">{s}</span>
            ))}
          </div>

          {/* no-link hint → manual tab */}
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-border p-3">
            <span className="inline-flex w-9 h-9 rounded-lg bg-red-50 text-primary-600 items-center justify-center shrink-0">
              <Pencil className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-foreground">ไม่มีลิงก์สินค้า?</span>
              <span className="block text-[12px] text-muted">กรอกชื่อ · ราคา · จำนวนเอง</span>
            </span>
            <button
              type="button"
              onClick={() => setTab("manual")}
              className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-2 text-[12.5px] font-bold text-primary-700 hover:bg-red-50"
            >
              กรอกข้อมูลสินค้าเอง →
            </button>
          </div>
        </>
      )}

      {/* ── TAB: มีลิงก์ · RESULTS ── */}
      {tab === "link" && phase === "results" && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[14.5px] font-bold text-foreground">
              ผลการตรวจสอบ
              <span className="ml-2 text-[11.5px] font-semibold text-muted">
                พบ {okResults.length} · ตรวจไม่พบ {failCount}
              </span>
            </div>
            <button
              type="button"
              onClick={() => { setPhase("input"); setFlash(null); }}
              className="inline-flex items-center gap-1 text-[12.5px] font-bold text-muted hover:text-primary-600"
            >
              <ArrowLeft className="h-4 w-4" /> แก้ไขลิงก์
            </button>
          </div>

          <div className="mt-3 space-y-2.5">
            {results.map((r) =>
              r.ok ? (
                <div
                  key={r.key}
                  className={`flex items-center gap-3 rounded-xl border p-3 ${
                    r.picked ? "border-emerald-300 bg-emerald-50/40" : "border-border bg-white opacity-70"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={r.picked}
                    onChange={() => togglePick(r.key)}
                    className="h-5 w-5 shrink-0 accent-emerald-600"
                    aria-label="เลือกสินค้านี้"
                  />
                  {r.product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.product.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-border object-contain bg-white" loading="lazy" />
                  ) : (
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-surface-alt text-2xl">📦</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] font-medium text-foreground">{r.product.title}</p>
                    <p className="mt-0.5 text-[14px] font-extrabold text-red-600">
                      ¥{numberFormat2(r.product.promoPriceCny ?? r.product.priceCny)}
                      <span className="ml-1.5 text-[11.5px] font-medium text-muted">
                        ≈ ฿{numberFormat2((r.product.promoPriceCny ?? r.product.priceCny) * rsDefault)}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-stretch overflow-hidden rounded-lg border border-border bg-white">
                    <button type="button" onClick={() => setResQty(r.key, r.qty - 1)} disabled={adding || r.qty <= 1} className="w-8 text-lg text-gray-600 hover:bg-gray-100 disabled:text-gray-300">−</button>
                    <input
                      type="number" min={1} value={r.qty} disabled={adding}
                      onChange={(e) => setResQty(r.key, Number(e.target.value) || 1)}
                      className="w-11 border-x border-border text-center text-[13px] font-bold outline-none focus:bg-red-50"
                    />
                    <button type="button" onClick={() => setResQty(r.key, r.qty + 1)} disabled={adding} className="w-8 text-lg text-gray-600 hover:bg-gray-100">+</button>
                  </div>
                </div>
              ) : (
                <div key={r.key} className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">ตรวจไม่พบสินค้า</p>
                    <p className="truncate text-[11.5px] text-red-700/80">{r.url}</p>
                    <p className="text-[11.5px]">{r.message}</p>
                  </div>
                </div>
              ),
            )}
          </div>

          {flash && <FlashBanner flash={flash} />}

          <button
            type="button"
            onClick={onAddSelected}
            disabled={adding || pickedResults.length === 0}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 py-3.5 text-[15px] font-extrabold text-white shadow-sm hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ShoppingCart className="h-5 w-5" strokeWidth={2.4} />
            {adding
              ? "กำลังเพิ่มลงรถเข็น..."
              : `เพิ่มที่เลือกลงรถเข็น (${pickedResults.length} รายการ · ${pickedPieces} ชิ้น)`}
          </button>
        </>
      )}
    </div>
  );
}

// ── Step pip ──────────────────────────────────────────────────────────
function Step({ n, label, on }: { n: number; label: string; on: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 ${on ? "font-bold text-foreground" : "text-muted"}`}>
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-extrabold ${on ? "bg-red-600 text-white" : "bg-gray-100 text-muted"}`}>
        {n}
      </span>
      {label}
    </span>
  );
}

// ── Flash banner (added / cart-full / error) ────────────────────────────
function FlashBanner({ flash: f }: { flash: Flash }) {
  if (f.kind === "added") {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-[13.5px] font-medium text-green-800">
        <PartyPopper className="h-5 w-5 shrink-0" />
        <span>
          เพิ่ม <b>{f.count}</b> รายการลงรถเข็นแล้ว ·{" "}
          <Link href="/cart" className="font-bold underline underline-offset-2 hover:text-green-900">ไปที่รถเข็น</Link>
        </span>
      </div>
    );
  }
  if (f.kind === "cart_full") {
    return (
      <div className="mt-3 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-[13.5px] font-medium text-yellow-800">
        รถเข็นเต็มแล้ว (สูงสุด 10,000 รายการ) — กรุณาลบบางรายการก่อน
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-medium text-red-800">
      {f.message}
    </div>
  );
}

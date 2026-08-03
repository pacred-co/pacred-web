"use client";

/**
 * `/cart/add` — multi-link "เพิ่มสินค้าเข้ารถเข็น" (owner 2026-07-30 · "อยากได้แบบในภาพ").
 *
 * Redesign of the single-link `<CartAddUrlForm>`: paste up to 20 product links
 * (1688 / Taobao / Tmall / Alibaba) — one at a time, all-at-once, or from the
 * clipboard. "ค้นหาและตรวจสอบสินค้า" stashes the ready links in sessionStorage and
 * navigates to /cart/add/review (owner 2026-07-31 "กดแล้วไปหน้าใหม่ + skeleton แบบ
 * shopee") which fetches each + shows the full rich product detail.
 *
 * This file is the PASTE ENTRY only — the fetch / rich card / add-to-cart live on
 * the review page (searchProductByUrl → <RichProductCard> → <UrlPasteAddToCart>
 * island → addCartItem → tb_cart). Money path 100% REUSED, no new one.
 *
 * The "ไม่มีลิงก์สินค้า" tab goes to /cart/add/manual — the full "เพิ่มสินค้าด้วย
 * ตัวเอง" form (owner 2026-08-03), which wears this flow's review-page shell.
 *
 * Thai is hardcoded (matches the sibling admin link-paste-search pattern · the
 * customer portal is TH-primary). Mobile-first per AGENTS.md §6: inputs ≥ 44px,
 * body text ≥ 16px on the paste box, single-column < md, CTA thumb-reachable.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  Link as LinkIcon, Link2, Pencil, Search, Trash2, Plus, GripVertical,
  CheckCircle2, Clock, AlertTriangle, PartyPopper,
  ClipboardList, ClipboardPaste, ExternalLink, Globe, Info, ChevronRight,
} from "lucide-react";
import { MAX_LINKS, SOURCE_BADGE, detectSource, splitLinks } from "./link-source";

// Link detection lives in ./link-source so the review page's "เพิ่มรายการ" popup
// judges links exactly the same way this page does.
const MAX_ROWS = MAX_LINKS;

type Row = { id: number; url: string };
let ROW_SEQ = 1;
function newRow(url = ""): Row {
  return { id: ROW_SEQ++, url };
}

type Flash =
  | { kind: "added"; count: number }
  | { kind: "cart_full" }
  | { kind: "error"; message: string };


export function CartAddMultiLink() {

  const [subTab, setSubTab] = useState<"one" | "multi">("one");
  const [rows, setRows] = useState<Row[]>([newRow(), newRow()]);
  const [multiText, setMultiText] = useState("");
  const router = useRouter();
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
  // แยกข้อความที่วาง (หลายลิงก์ · เว้นวรรค/ขึ้นบรรทัด) ลงเป็นหลายช่องอัตโนมัติ เริ่มจากช่อง id นี้.
  function spreadLinks(id: number, text: string) {
    const links = splitLinks(text, MAX_ROWS);
    if (!links.length) return;
    setRows((rs) => {
      const idx = rs.findIndex((r) => r.id === id);
      if (idx < 0) return rs;
      const inserted = links.map((u, k) => (k === 0 ? { ...rs[idx], url: u } : newRow(u)));
      return [...rs.slice(0, idx), ...inserted, ...rs.slice(idx + 1)].slice(0, MAX_ROWS);
    });
    setFlash(null);
  }
  // วางลิงก์ที่คัดลอกไว้ด้วยคลิกเดียว (อ่านคลิปบอร์ด — user gesture · รองรับหลายลิงก์).
  async function pasteInto(id: number) {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) spreadLinks(id, text);
    } catch {
      setFlash({ kind: "error", message: "ไม่สามารถอ่านคลิปบอร์ดได้ - กรุณากดวางเองด้วย Ctrl+V" });
    }
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
    const links = splitLinks(text, MAX_ROWS);
    return links.length ? links.map((u) => newRow(u)) : [newRow()];
  }
  function applyMultiText() {
    const next = textToRows(multiText);
    setRows(next);
    setSubTab("one");
    setFlash(null);
  }
  // "ค้นหาและตรวจสอบสินค้า" → stash the ready links + navigate to the rich review
  // page (owner 2026-07-31 "ไปหน้าใหม่ + skeleton แบบ shopee"). The fetch + skeleton
  // happen on /cart/add/review — this page just collects the links + hands off.
  function onVerify() {
    const ready = rows.filter((r) => detectSource(r.url) !== null);
    if (ready.length === 0) {
      setFlash({ kind: "error", message: "ยังไม่มีลิงก์ที่พร้อมตรวจสอบ — วางลิงก์ 1688 / Taobao / Tmall ก่อนครับ" });
      return;
    }
    setFlash(null);
    try {
      sessionStorage.setItem("pacred_cart_add_links", JSON.stringify(ready.map((r) => r.url.trim())));
    } catch {
      /* private mode / storage disabled — the review page shows an empty state */
    }
    router.push("/cart/add/review");
  }

  // ════════════════════════════════════════════════════════════════
  return (
    <div className="rounded-2xl bg-white p-4 md:p-5">
      <h2 className="text-lg md:text-xl font-bold text-foreground">เพิ่มสินค้านำเข้า</h2>
      <p className="text-[12.5px] text-muted mt-0.5 mb-3.5">เลือกประเทศต้นทางและเพิ่มสินค้าที่ต้องการสั่งซื้อ</p>

      {/* ประเทศต้นทาง (owner 2026-07-30 "แทรก sub ประเทศ + ตีกรอบข้างบน · ตอนนี้มีแค่จีน · แบบในภาพ").
          display-only: จีน = ใช้ได้จริง (active) · ญี่ปุ่น/เกาหลีใต้/เวียดนาม/อินเดีย = เร็ว ๆ นี้ (disabled ·
          กันหลอกลูกค้า §0f). ธงวงกลมจาก flag-icon-css 1x1 (มีในโปรเจกต์). */}
      <div className="mb-4 rounded-2xl border border-border p-3.5 md:p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
          <span className="mr-1 text-[13px] font-bold text-foreground">ประเทศต้นทาง</span>
          <button
            type="button"
            aria-pressed
            className="inline-flex items-center gap-2 rounded-full border border-red-500 bg-red-50 px-3.5 py-2 text-[13px] font-bold text-primary-700 ring-2 ring-red-500/15"
          >
            <span className="h-[22px] w-[22px] shrink-0 overflow-hidden rounded-full ring-1 ring-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/legacy/pcs/assets/fonts/flag-icon-css/flags/1x1/cn.svg" alt="" className="h-full w-full object-cover" />
            </span>
            จีน
          </button>
          {[
            { code: "jp", label: "ญี่ปุ่น" },
            { code: "kr", label: "เกาหลีใต้" },
            { code: "vn", label: "เวียดนาม" },
            { code: "in", label: "อินเดีย" },
          ].map((c) => (
            <button
              key={c.code}
              type="button"
              disabled
              title="เร็ว ๆ นี้"
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-border bg-white px-3.5 py-2 text-[13px] font-bold text-muted opacity-60"
            >
              <span className="h-[22px] w-[22px] shrink-0 overflow-hidden rounded-full ring-1 ring-black/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/legacy/pcs/assets/fonts/flag-icon-css/flags/1x1/${c.code}.svg`} alt="" className="h-full w-full object-cover" />
              </span>
              {c.label}
            </button>
          ))}
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
            <Globe className="h-4 w-4" /> ประเทศอื่น ๆ เร็ว ๆ นี้
          </span>
        </div>
      </div>

      {/* Tabs — มีลิงก์ / ไม่มีลิงก์ */}
      <div className="flex gap-2.5 mb-4">
        {/* Always the active tab now — its sibling navigates to /cart/add/manual,
            so this page only ever shows the paste flow. */}
        <span className="relative flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-red-500 bg-red-50 px-3 py-3 text-sm font-bold text-primary-700 ring-2 ring-red-500/15">
          <LinkIcon className="h-4 w-4" /> มีลิงก์สินค้า
          <span className="absolute -top-2 right-3 rounded-full bg-red-600 px-2 py-0.5 text-[9.5px] font-extrabold text-white">
            แนะนำ
          </span>
        </span>
        {/* owner 2026-08-03 "ถ้ากด ไม่มีลิงก์สินค้าแล้วผมอยากให้เป็นแบบนี้ ใช้หน้าแบบ
            มีลิงก์แหละ แต่เป็นฟอร์มเปล่า" — goes straight to the full manual-entry
            page (same shell as the review page) instead of the old teaser card
            that only linked out to the order list. */}
        <Link
          href="/cart/add/manual"
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-border bg-white px-3 py-3 text-sm font-bold text-muted transition hover:border-red-200 hover:text-primary-600"
        >
          <Pencil className="h-4 w-4" /> ไม่มีลิงก์สินค้า
        </Link>
      </div>

      {/* ── มีลิงก์ = the paste flow this page owns ── */}
      {(
        <>
          {/* กรอบกลุ่มช่องวางลิงก์ (owner 2026-07-30 · "เอากรอบออก · ใช้กรอบแบบในภาพ" +
              "อยู่ในกรอบเดียวกัน") — ถอดกรอบนอกการ์ด แล้วตีกรอบรวม หัวข้อ + steps + แท็บย่อย +
              แถวลิงก์ + สรุป ไว้ในแผงเดียว. ปุ่มค้นหา / รองรับเว็บไซต์ / hint ยังอยู่นอกกรอบ. */}
          <div className="mt-3 rounded-2xl border border-border p-4 md:p-5">
          <div className="text-lg font-bold text-foreground">
            เพิ่มลิงก์สินค้าที่ต้องการสั่งซื้อ
            <span className="ml-2 inline-block rounded-full border border-red-300 px-2.5 py-0.5 text-[11.5px] font-bold text-red-600">
              เพิ่มได้สูงสุด {MAX_ROWS} ลิงก์
            </span>
          </div>
          {/* Step indicator — full-width stepper (owner 2026-07-30 "อยากได้เต็มกรอบ
              พอดีๆ · มันโล้นๆไป"): 3 ขั้นกระจายเต็มความกว้างกรอบ + ไอคอน + เส้นเชื่อมยาว.
              ไอคอนซ่อนบนจอแคบ (เหลือเลข+ป้าย) กันล้นบนมือถือ. */}
          <div className="my-4 flex items-center">
            <StepCell n={1} icon={<ClipboardList className="h-4 w-4" />} label="วางลิงก์สินค้า" on lineAfter lineOn={filledCount > 0} />
            <StepCell n={2} icon={<Link2 className="h-4 w-4" />} label="เพิ่มได้หลายรายการ" on={filledCount > 0} lineAfter lineOn={false} />
            <StepCell n={3} icon={<Search className="h-4 w-4" />} label="ตรวจสอบทั้งหมด" on={false} />
          </div>

          {/* Sub-tabs */}
          {/* sub-tabs = แท็บเส้นใต้ (owner 2026-07-30 "ใส่กรอบ + ขีดแดงแบบในภาพ"):
              เส้นคั่นล่างเต็มความกว้าง (กรอบ) + แท็บ active มีขีดแดงใต้ (ขีดแดง). */}
          <div className="mb-3 flex flex-wrap gap-5 border-b border-border">
            {[
              { key: "one" as const, label: "เพิ่มทีละลิงก์", icon: <ExternalLink className="h-[18px] w-[18px]" /> },
              { key: "multi" as const, label: "วางหลายลิงก์พร้อมกัน", icon: <ClipboardList className="h-[18px] w-[18px]" /> },
            ].map(({ key, label, icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSubTab(key)}
                className={`-mb-px inline-flex items-center gap-2 border-b-2 pb-2.5 text-[14px] font-bold transition ${
                  subTab === key
                    ? "border-red-500 text-primary-700"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {icon}
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
                    <div key={r.id} className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
                      <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-[13px] font-extrabold text-gray-700">{i + 1}</span>
                      <div className="relative min-w-0 flex-1">
                        <input
                          type="url"
                          inputMode="url"
                          value={r.url}
                          onChange={(e) => setUrl(r.id, e.target.value)}
                          onPaste={(e) => {
                            const text = e.clipboardData.getData("text");
                            if (/[\s\n]/.test(text.trim())) {
                              e.preventDefault();
                              spreadLinks(r.id, text);
                            }
                          }}
                          placeholder="วางลิงก์สินค้า 1688 / Taobao / Tmall ที่นี่"
                          className={`w-full h-10 rounded-full border pl-3 text-[13.5px] outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 ${
                            filled ? "pr-3" : "pr-[62px]"
                          } ${src ? "border-emerald-400 bg-emerald-50/40" : "border-red-400 bg-red-50/40"}`}
                        />
                        {!filled && (
                          <button
                            type="button"
                            onClick={() => pasteInto(r.id)}
                            title="วางลิงก์ที่คัดลอกไว้"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[11.5px] font-bold text-gray-600 hover:bg-gray-200 active:scale-95 transition"
                          >
                            <ClipboardPaste className="h-3.5 w-3.5" /> วาง
                          </button>
                        )}
                      </div>
                      {src && (
                        <img
                          src={SOURCE_BADGE[src].icon}
                          alt={SOURCE_BADGE[src].label}
                          className="shrink-0 h-7 w-auto object-contain"
                          loading="lazy"
                        />
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
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-dashed border-border bg-surface/50 py-2.5 text-[13px] font-bold text-muted hover:border-red-300 hover:text-primary-600 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> เพิ่มช่องลิงก์
              </button>

              {/* Footer summary */}
              <div className="mt-3 flex items-start gap-1.5 text-[12px] text-muted">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-gray-400" aria-hidden />
                <span>สามารถวางหลายลิงก์พร้อมกันได้ ระบบจะแยกเป็นแต่ละรายการให้อัตโนมัติ</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-muted">
                <span>ทั้งหมด <b className="text-foreground">{rows.length}</b> ช่อง</span>
                <span className="text-emerald-700">· พร้อมตรวจสอบ <b>{readyCount}</b></span>
                {filledCount - readyCount > 0 && <span>· ไม่รองรับ {filledCount - readyCount}</span>}
                <button type="button" onClick={clearAll} className="ml-auto inline-flex items-center gap-1 font-bold text-red-600 hover:text-red-700">
                  <Trash2 className="h-4 w-4" /> ล้างทั้งหมด
                </button>
              </div>
            </>
          )}
          </div>
          {/* ปิดกรอบกลุ่มช่องวางลิงก์ */}

          {flash && <FlashBanner flash={flash} />}

          <button
            type="button"
            onClick={onVerify}
            disabled={readyCount === 0}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary-600 py-3.5 text-[15px] font-extrabold text-white shadow-sm hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Search className="h-5 w-5" strokeWidth={2.4} />
            ค้นหาและตรวจสอบสินค้า {readyCount} รายการ
          </button>

          {/* supported — โลโก้จริงของแต่ละแพลตฟอร์ม (owner 2026-07-30/31 "ใช้ไอคอนจริงๆ ·
              เอากรอบออก · ใหญ่ขึ้น · กดแล้วไปเว็บนั้นๆ"). โลโก้ wordmark พื้นขาวบนการ์ดขาว
              = ไร้รอยต่อ ไม่ต้องมีกรอบ · h-8 · กว้าง auto · <a> เปิดเว็บจริงในแท็บใหม่. */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-6 text-[13px] text-muted">
            <span>รองรับเว็บไซต์:</span>
            {[
              { src: "/legacy/pcs/assets/images/shops/1688-logo-2.png", alt: "1688", href: "https://www.1688.com" },
              { src: "/images/partners/taobaopartner.png", alt: "Taobao", href: "https://www.taobao.com" },
              { src: "/images/partners/tmallpartner.png", alt: "Tmall", href: "https://www.tmall.com" },
              { src: "/images/partners/alibabapartner.png", alt: "Alibaba", href: "https://www.alibaba.com" },
            ].map((s) => (
              <a
                key={s.alt}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                title={`ไปที่เว็บ ${s.alt}`}
                className="inline-flex items-center hover:opacity-70 transition-opacity"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {/* Eager, not lazy: four ~17KB logos that sit just under the CTA — with
                    lazy they popped in late and one rendered as broken alt text mid-scroll
                    (owner screenshot 2026-08-03). Loading them up front costs ~60KB once. */}
                <img src={s.src} alt={s.alt} className="h-11 w-auto object-contain" />
              </a>
            ))}
          </div>
          {/* The duplicate "ไม่มีลิงก์สินค้า?" prompt that used to sit here was removed
              (owner 2026-08-03) — the ไม่มีลิงก์สินค้า TAB above is the entry point, so
              manual entry stays reachable (§0d). */}
        </>
      )}
    </div>
  );
}

// ── Step cell — even-thirds stepper (owner 2026-07-30 "จัดกลางเท่าๆ · พอดีกลางๆ").
// แต่ละ cell = flex-1 (ช่อง 1/3 เท่าๆกัน) · เนื้อหา (เลข+ไอคอน+ป้าย) อยู่กึ่งกลางช่อง ·
// เส้นเชื่อมลากหลังเนื้อหาจากกลางช่องนี้ไปกลางช่องถัดไป (bg-white บนเนื้อหาบังเส้นตรงกลาง).
// มือถือ (< sm): ซ่อนไอคอน+ป้าย → เหลือวงเลขเรียงเท่าๆ + เส้นเชื่อม (กันล้น).
function StepCell({
  n, icon, label, on, lineAfter, lineOn,
}: {
  n: number; icon: ReactNode; label: string; on: boolean; lineAfter?: boolean; lineOn?: boolean;
}) {
  return (
    <div className="relative flex flex-1 items-center justify-center">
      {lineAfter && (
        <span
          aria-hidden
          className={`pointer-events-none absolute left-1/2 top-1/2 h-px w-full -translate-y-1/2 ${lineOn ? "bg-red-300" : "bg-gray-200"}`}
        >
          {/* หัวลูกศรที่ "ปลายเส้น" — ชิดวงกลมสเต็ปถัดไป (เยื้องซ้าย = รัศมีวงกลม 14px) */}
          <ChevronRight
            strokeWidth={2.5}
            className={`absolute right-[14px] top-1/2 h-4 w-4 -translate-y-1/2 ${lineOn ? "text-red-400" : "text-gray-300"}`}
          />
        </span>
      )}
      <div className="relative z-10 flex items-center gap-1.5 bg-white px-1.5 sm:gap-2">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold ${on ? "bg-red-600 text-white shadow-sm" : "border border-gray-200 bg-white text-gray-400"}`}>
          {n}
        </span>
        <span className={`hidden sm:flex ${on ? "text-red-600" : "text-gray-400"}`}>{icon}</span>
        <span className={`hidden whitespace-nowrap font-bold sm:inline sm:text-[12.5px] ${on ? "text-foreground" : "text-muted"}`}>
          {label}
        </span>
      </div>
    </div>
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

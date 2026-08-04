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

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  Link as LinkIcon, Link2, Pencil, Search, Trash2, Plus, GripVertical,
  CheckCircle2, Clock, AlertTriangle, PartyPopper,
  ClipboardList, ClipboardPaste, ExternalLink, Globe, Info, ChevronRight, ChevronDown,
} from "lucide-react";
import {
  MAX_LINKS, SOURCE_BADGE, detectSource, splitLinks, stashManualLinks,
  ORIGIN_COUNTRIES, originCountry, stashOriginCountry, useStoredOriginCountry,
  type OriginCode,
} from "./link-source";

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

  // ประเทศต้นทาง — the remembered pick (จีน on the server / when never chosen), so
  // walking back from the manual form keeps the chip selected; `picked` takes over
  // the moment the customer taps one.
  const stored = useStoredOriginCountry();
  const [picked, setPicked] = useState<OriginCode | null>(null);
  const origin = picked ?? stored;
  const country = originCountry(origin);
  /** Only จีน has marketplace lookups — every other country is typed in. */
  const canFetch = country.hasApi;

  /** แถวประเทศ: ปิด = บรรทัดเดียว · เปิด = กางลงมาเห็นครบ (owner 2026-08-04). */
  const [countryOpen, setCountryOpen] = useState(false);
  /**
   * ตอนย่อโชว์กี่ประเทศ (owner 2026-08-04 "เอาให้เห็น 5 ประเทศ").
   *
   * ตัดด้วย "จำนวน" ไม่ใช่ "ความสูง/ความกว้าง" เพราะป้าย +N ต้องเป๊ะ (§0f) — ถ้าปล่อยให้
   * ความกว้างจอเป็นตัวตัด จำนวนที่เห็นจริงจะเปลี่ยนไปตามจอ แล้วเลขบนปุ่มจะโกหกทันที.
   * วัดจริงบนจอ owner: 5 ปุ่ม = 543px แต่กรอบกว้าง 438px → ย่อแล้วตัดเป็น 2 บรรทัด
   * (จอกว้างจะพอดีบรรทัดเดียวเอง) ซึ่งดีกว่าบีบปุ่มให้เล็กจนอ่านยาก.
   */
  const COLLAPSED_COUNTRY_COUNT = 5;
  /**
   * ตอนย่อ ดันประเทศที่เลือกขึ้นหน้าสุด — จะได้โชว์ "ของที่เลือกอยู่" เสมอ ไม่ใช่โดนตัด
   * ตกไปอยู่ในกลุ่มที่ซ่อน (จอจะกลายเป็นไม่มีอะไรถูกเลือก = โกหกสถานะ §0f).
   * ตอนกางใช้ลำดับจริงตาม SOT.
   */
  const shownCountries = useMemo(
    () =>
      countryOpen
        ? [...ORIGIN_COUNTRIES]
        : [...ORIGIN_COUNTRIES]
            .sort((a, b) => Number(b.code === origin) - Number(a.code === origin))
            .slice(0, COLLAPSED_COUNTRY_COUNT),
    [countryOpen, origin],
  );
  /** เลขบนปุ่ม +N — มาจากผลต่างจริง ไม่ใช่ค่าที่พิมพ์ไว้ เพิ่มประเทศแล้วเลขขยับเอง. */
  const hiddenCountryCount = ORIGIN_COUNTRIES.length - COLLAPSED_COUNTRY_COUNT;

  function pickOrigin(code: OriginCode) {
    setPicked(code);
    stashOriginCountry(code);
    setFlash(null);
  }

  // Ready = a row whose URL is a supported marketplace link. Outside จีน nothing
  // is fetchable, so nothing counts as ready — the flow says "กรอกเอง" instead of
  // promising a lookup that cannot run (§0f: never offer what we can't do).
  const readyCount = useMemo(
    () => (canFetch ? rows.filter((r) => detectSource(r.url) !== null).length : 0),
    [rows, canFetch],
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
    const filled = rows.map((r) => r.url.trim()).filter(Boolean);
    if (filled.length === 0) {
      setFlash({ kind: "error", message: "ยังไม่ได้วางลิงก์สินค้า — วางลิงก์อย่างน้อย 1 รายการก่อนครับ" });
      return;
    }
    // Outside จีน there is no marketplace API at all, so EVERY link is a manual
    // order — not just the ones from an unsupported shop.
    const ready = canFetch ? filled.filter((u) => detectSource(u) !== null) : [];
    const unsupported = canFetch ? filled.filter((u) => detectSource(u) === null) : filled;
    setFlash(null);

    // owner 2026-08-03 "ถ้าลิงก์ที่วางไม่ใช่ร้านค้าที่เรามี api จะเด้งไปที่หน้า ไม่มีลิงก์นะ"
    // — a shop we can't fetch is NOT an error the customer should be stuck on; it
    // is simply an order they type in. The links travel along so nothing is
    // re-copied, and none is dropped silently: the unsupported ones ALWAYS reach
    // the manual form, whether or not there are supported ones alongside.
    stashManualLinks(unsupported);

    if (ready.length === 0) {
      router.push("/cart/add/manual");
      return;
    }
    try {
      sessionStorage.setItem("pacred_cart_add_links", JSON.stringify(ready));
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

      {/* ประเทศต้นทาง (owner 2026-07-30 "แทรก sub ประเทศ + ตีกรอบข้างบน · แบบในภาพ" →
          owner 2026-08-04 "ปลดประเทศออกให้กดได้"). ทุกประเทศกดเลือกได้จริงแล้ว — และการเลือก
          ต้องมีผลจริง (ห้ามปุ่มกดแล้วไม่เกิดอะไร §0f): จีน = ดึงข้อมูลจากลิงก์ได้ · ประเทศอื่น
          ยังไม่มี API ร้านค้า → พาไปกรอกเอง แล้วส่งชื่อประเทศติดไปให้ทีมจัดซื้อเห็น.
          ธงวงกลมจาก flag-icon-css 1x1 (มีในโปรเจกต์). */}
      {/* p-3.5 คงที่ (ไม่ md:p-4) — คืนความกว้าง 8px ให้แถวประเทศ ทุก px มีผลตรงนี้
          เพราะกรอบถูกบีบด้วยคอลัมน์โฆษณา 400px ทางขวาอยู่แล้ว */}
      <div className="mb-4 rounded-2xl border border-border p-3.5">
        {/* ปิด = บรรทัดเดียว · กดวงกลม ⌄ = กางลงมาเห็นทุกประเทศ (owner 2026-08-04
            "ทำเป็นบรรทัดเดียว แล้วทำวงกลม ตัว v ลงมาเห็นแบบนี้แหละ").
            ย่อด้วย max-height ไม่ใช่ overflow-x — owner "ไม่เอา สไลด์บาร์ แบบนี้น่าเกลียด":
            ปุ่มยัง wrap ตามปกติ แค่ตัดให้เห็นบรรทัดแรก → ไม่มีแถบเลื่อน ไม่มีปุ่มโดนหั่นครึ่ง
            และปรับตามความกว้างจอเองโดยไม่ต้องวัดอะไร. */}
        {/* หัวข้อขึ้นบรรทัดบน — กรอบนี้กว้างแค่ ~423px (หน้านี้เป็น grid ที่มีคอลัมน์
            โฆษณา 400px กินไปทางขวา) ป้ายอินไลน์กินไปอีก ~97px ทำให้แถวแรกลงได้แค่ 3 ปุ่ม.
            ย้ายขึ้นบน = คืนพื้นที่ให้ปุ่มจนแถวแรกเห็นครบ 5 ประเทศตามที่ owner สั่ง. */}
        <div className="mb-2.5 text-[13px] font-bold text-foreground">ประเทศต้นทาง</div>
        <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-2">
          {shownCountries.map((c, i) => {
            const on = c.code === origin;
            /**
             * ตัดบรรทัดตายตัวหลังประเทศที่ 5 (owner 2026-08-04 "ขนาดเต็ม 5 เท่าเดิม
             * กดแล้วก็เป็นบรรทัด 2 เลย ... อันนี้เองเอามาเติมข้างแถมลดขนาดอีก").
             *
             * ปล่อยให้ flex-wrap จัดเอง = จอกว้างมันจะ "ไหลขึ้นไปเติม" แถวแรกเป็น 6-7 ปุ่ม
             * แล้วกลุ่ม 5 ที่เห็นตอนย่อก็เพี้ยนไปทั้งแถว. คั่นด้วยตัวกินเต็มความกว้าง =
             * แถวแรกคือ 5 ประเทศเดิมเป๊ะทุกความกว้างจอ · กดแล้ว "ลงบรรทัด 2" เฉยๆ.
             */
            const breakAfter = countryOpen && i === COLLAPSED_COUNTRY_COUNT - 1;
            const chip = (
              <button
                key={c.code}
                type="button"
                onClick={() => pickOrigin(c.code)}
                aria-pressed={on}
                title={c.hasApi ? `สั่งจาก${c.label} — วางลิงก์ได้เลย` : `สั่งจาก${c.label} — กรอกรายการเอง`}
                // py หนาบนมือถือให้แตะได้ ≥44px (§6) · เดสก์ท็อปคืนความสูงเดิม
                /**
                 * ขนาดปุ่มบนจอ md+ = ความกว้างขั้นต่ำ "คงที่" (ไม่ใช่ flex-1 ที่ยืดตามกรอบ) —
                 * owner 2026-08-04 "กดดร็อปดาวน์แล้วประเทศเล็กลง ไม่น่าได้ ให้เท่ากัน".
                 *
                 * ทำไมยืดตามกรอบไม่ได้: หน้านี้สูงพอดีจอเป๊ะตอนย่อ (910px) พอกางเป็น 918px
                 * แถบเลื่อนโผล่ → กรอบหด 15px → ปุ่มที่ยืดตามกรอบเลยเล็กลงต่อหน้า.
                 * ล็อกเป็นค่าคงที่แล้วขนาดเท่ากันเป๊ะทั้งย่อและกาง ไม่ว่ากรอบจะกว้างเท่าไร.
                 *
                 * `flex-1 basis-0` = กินเต็มความกว้างแถว (owner "ขยายให้เต็ม พื้นที่ว่างเยอะ")
                 * แต่ `max-w = 1/5 ของแถว` คือหัวใจ: แถวล่างมีแค่ 3 ปุ่ม ถ้าปล่อยยืดอิสระมันจะ
                 * บานเป็น 1/3 ของแถว = ใหญ่กว่าแถวบน. ล็อกเพดานไว้ที่ 1/5 → ทุกปุ่มทุกแถว
                 * กว้างเท่ากันเป๊ะ แถวล่างชิดซ้ายมีที่ว่างท้ายแถวแทน.
                 * min-w-fit มาก่อน = ชื่อยาวไม่โดนบีบจนตัวหนังสือแตก (มือถือตัดบรรทัดตามปกติ).
                 */
                className={`inline-flex min-w-fit items-center justify-center gap-1 rounded-full border px-2 py-3 text-[13px] font-bold transition md:max-w-[calc((100%-1rem)/5)] md:flex-1 md:basis-0 md:py-2.5 ${
                  on
                    ? "border-red-500 bg-red-50 text-primary-700 ring-2 ring-red-500/15"
                    : "border-border bg-white text-muted hover:border-red-300 hover:text-primary-600"
                }`}
              >
                <span className="h-[18px] w-[18px] shrink-0 overflow-hidden rounded-full ring-1 ring-black/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/legacy/pcs/assets/fonts/flag-icon-css/flags/1x1/${c.code}.svg`} alt="" className="h-full w-full object-cover" />
                </span>
                {c.label}
              </button>
            );
            return breakAfter ? (
              <Fragment key={c.code}>
                {chip}
                <span aria-hidden className="w-full" />
              </Fragment>
            ) : (
              chip
            );
          })}
          {/* owner 2026-08-04 "เอาไปไว้แถวล่าง แล้วซ่อนไว้ เหมือนประเทศที่ 6 ขึ้นไป" —
              อยู่ท้ายสุดของลิสต์อยู่แล้ว จึงตกไปอยู่แถวล่างเองตอนกาง · ตอนย่อซ่อนพร้อมกัน
              (ป้าย +N บนปุ่มเป็นตัวบอกแทนว่ายังมีอีก). */}
          {countryOpen && (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium text-muted">
              <Globe className="h-4 w-4" /> ประเทศอื่น ๆ เร็ว ๆ นี้
            </span>
          )}
        </div>
        {/* วงกลม ⌄ เหมือนเดิม + ป้ายเล็ก "+N" มุมบนบอกว่ายังมีอีกกี่ประเทศ (owner 2026-08-04
            "เป็นตัว v ในวงกลมเหมือนเดิม แค่มีบอกเฉยๆ ว่า +กี่ประเทศ กดแล้วดร็อปดาวน์ลงมา").
            ป้ายเป็น absolute → ไม่กินความกว้างแถว · กางแล้วป้ายหาย (ไม่เหลืออะไรให้ดูอีก).
            ซ่อนปุ่มทั้งอันถ้าประเทศไม่เกินจำนวนที่โชว์ — ไม่มี "+0" ให้กดเก้อ. */}
        {hiddenCountryCount > 0 && (
          <button
            type="button"
            onClick={() => setCountryOpen((v) => !v)}
            aria-expanded={countryOpen}
            aria-label={countryOpen ? "ย่อรายชื่อประเทศ" : `ดูอีก ${hiddenCountryCount} ประเทศ`}
            title={
              countryOpen
                ? "ย่อรายชื่อประเทศ"
                : `อีก ${hiddenCountryCount} ประเทศที่สั่งซื้อให้ได้ — กดเพื่อดูทั้งหมด`
            }
            className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-white text-muted transition hover:border-red-300 hover:bg-red-50 hover:text-primary-600 md:h-8 md:w-8"
          >
            {/* Tailwind v4 ทำ rotate ผ่าน CSS property `rotate` ไม่ใช่ `transform`
                → ต้อง transition-[rotate] ไม่งั้นลูกศรกระตุกแทนที่จะหมุนลื่นๆ */}
            <ChevronDown
              className={`h-[18px] w-[18px] transition-[rotate] duration-200 ${countryOpen ? "rotate-180" : ""}`}
              strokeWidth={2.6}
            />
            {!countryOpen && (
              <span className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 px-1.5 text-[11px] font-extrabold leading-[17px] text-white">
                +{hiddenCountryCount}
              </span>
            )}
          </button>
        )}
        </div>
        {/* บอกตรงๆ ว่าเลือกประเทศนี้แล้วเกิดอะไรขึ้น — ไม่ปล่อยให้ลูกค้าวางลิงก์แล้วไปเจอ
            หน้ากรอกเองโดยไม่รู้ตัว. */}
        {!canFetch && (
          <p className="mt-2.5 flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] font-medium text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              ขออภัย ขณะนี้ระบบยังไม่รองรับการดึงรายละเอียดสินค้าจากลิงก์เว็บไซต์<b>{country.label}</b>โดยอัตโนมัติ
              แต่ท่านยังสามารถสั่งซื้อได้ตามปกติ เพียงกรอกรายละเอียดสินค้าและแนบลิงก์ไว้
              ทีมงานจะช่วยตรวจสอบและดำเนินการสั่งซื้อให้ครับ
            </span>
          </p>
        )}
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
                  // นอกจีน = ไม่มี API ร้านค้า → ไม่มีลิงก์ไหน "พร้อมตรวจสอบ" ได้
                  const src = canFetch ? detectSource(r.url) : null;
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
                          placeholder={
                            canFetch
                              ? "วางลิงก์สินค้า 1688 / Taobao / Tmall ที่นี่"
                              : `วางลิงก์สินค้าจาก${country.label} ที่นี่ (ถ้ามี)`
                          }
                          className={`w-full h-10 rounded-full border pl-3 text-[13.5px] outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 ${
                            filled ? "pr-3" : "pr-[62px]"
                          } ${
                            src
                              ? "border-emerald-400 bg-emerald-50/40"
                              : canFetch
                                ? "border-red-400 bg-red-50/40"
                                : // นอกจีน "กรอกเอง" คือทางปกติ ไม่ใช่ความผิดพลาด → เหลือง ไม่ใช่แดง
                                  "border-amber-300 bg-amber-50/40"
                          }`}
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
                          // Not a rejection — this shop just gets typed in instead of fetched.
                          <span className="flex items-center gap-1 text-amber-600" title="ร้านนี้ระบบดึงข้อมูลอัตโนมัติไม่ได้ — จะพาไปกรอกเอง"><AlertTriangle className="h-3.5 w-3.5" /> ต้องกรอกเอง</span>
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
                {filledCount - readyCount > 0 && (
                  <span className="text-amber-700">· ต้องกรอกเอง {filledCount - readyCount}</span>
                )}
                <button type="button" onClick={clearAll} className="ml-auto inline-flex items-center gap-1 font-bold text-red-600 hover:text-red-700">
                  <Trash2 className="h-4 w-4" /> ล้างทั้งหมด
                </button>
              </div>
            </>
          )}
          </div>
          {/* ปิดกรอบกลุ่มช่องวางลิงก์ */}

          {flash && <FlashBanner flash={flash} />}

          {/* Enabled as soon as ANY link is pasted — not just a supported one.
              A link from a shop we have no API for is a manual order, so the
              button carries it to /cart/add/manual instead of sitting disabled
              with nothing the customer can do (owner 2026-08-03). */}
          <button
            type="button"
            onClick={onVerify}
            disabled={filledCount === 0}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary-600 py-3.5 text-[15px] font-extrabold text-white shadow-sm hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {readyCount > 0 ? (
              <>
                <Search className="h-5 w-5" strokeWidth={2.4} />
                ค้นหาและตรวจสอบสินค้า {readyCount} รายการ
              </>
            ) : (
              <>
                <Pencil className="h-5 w-5" strokeWidth={2.4} />
                กรอกข้อมูลเอง {filledCount} รายการ
              </>
            )}
          </button>
          {readyCount === 0 && filledCount > 0 && (
            <p className="mt-2 text-center text-[12px] text-amber-700">
              {canFetch
                ? "ร้านที่วางมาระบบยังดึงข้อมูลอัตโนมัติไม่ได้ — กดปุ่มด้านบนเพื่อไปกรอกข้อมูลเอง (ลิงก์จะติดไปให้)"
                : `สินค้าจาก${country.label} กรอกรายละเอียดเอง — กดปุ่มด้านบนได้เลย (ลิงก์จะติดไปให้)`}
            </p>
          )}

          {/* supported — โลโก้จริงของแต่ละแพลตฟอร์ม (owner 2026-07-30/31 "ใช้ไอคอนจริงๆ ·
              เอากรอบออก · ใหญ่ขึ้น · กดแล้วไปเว็บนั้นๆ"). โลโก้ wordmark พื้นขาวบนการ์ดขาว
              = ไร้รอยต่อ ไม่ต้องมีกรอบ · h-8 · กว้าง auto · <a> เปิดเว็บจริงในแท็บใหม่. */}
          {/* โลโก้ 4 ตัวนี้เป็นร้านจีนล้วน — เลือกประเทศอื่นอยู่แล้วยังโชว์ = หลอกว่ารองรับ */}
          <div className={`mt-4 flex flex-wrap items-center justify-center gap-6 text-[13px] text-muted ${canFetch ? "" : "hidden"}`}>
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

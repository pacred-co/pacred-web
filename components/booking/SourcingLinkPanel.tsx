"use client";

/**
 * แท็บ "ฝากสั่งซื้อ" ในแถบบุ๊กกิ้ง — ตารางวางลิงก์สินค้าจีน (ปอน 2026-08-07).
 *
 * แทนที่ฟอร์มเดิม (แพลตฟอร์ม / ลิงก์เดียว / จำนวน / งบ) ซึ่งจบด้วยการ "ประเมินราคา"
 * เฉยๆ — owner: *"เอาใน แถบBooking ในภาพออก แล้วเอาตรงนี้มาแทน · เอาตัววางลิงก์จาก
 * หลังบ้านมาขึ้นหน้าบ้าน"* → หน้าแรก/แลนดิ้งวางลิงก์ได้เลย ไม่ต้องเข้าไปหลังล็อกอินก่อน.
 *
 * 🔴 ไม่มีเส้นเงินใหม่ — จอนี้ "เก็บลิงก์" อย่างเดียว. การดึงสินค้า/ราคา/ใส่ตะกร้า ยังเป็น
 * `/cart/add/review` ตัวเดิมที่ audit แล้ว (searchProductByUrl → RichProductCard →
 * addCartItem → tb_cart). ตัวช่วยตัดสินลิงก์ + คีย์ sessionStorage รียูสจาก
 * `link-source.ts` ชุดเดียวกับ `/cart/add` เป๊ะ — ห้ามก๊อปตรรกะมาเขียนใหม่ ไม่งั้น
 * "ลิงก์นี้รองรับไหม" จะตอบคนละอย่างกันสองจอ.
 *
 * คนที่ยังไม่ล็อกอิน (owner เคาะ 2026-08-07): เก็บลิงก์ไว้ → พาไปล็อกอิน → กลับมาต่อ
 * ให้เอง. `requireAuth()` เด้ง `/login` เปล่าๆ (ไม่พกปลายทาง) แต่ `/login` รองรับ
 * `?next=` + `safeNext()` กันเปิดเว็บนอกอยู่แล้ว → ส่ง `?next=` เองตั้งแต่ต้นทาง
 * โดยไม่ต้องแตะ `requireAuth()` ที่ทั้งเว็บใช้ร่วมกัน.
 *
 * ⚠️ เช็คล็อกอิน "ตอนกดปุ่ม" ฝั่งเบราว์เซอร์ ไม่ใช่ฝั่งเซิร์ฟเวอร์ตอนเรนเดอร์ — พาเนลนี้อยู่บน
 * หน้าแรกด้วย ซึ่งยังไม่อ่านคุกกี้ฝั่งเซิร์ฟเวอร์เลย (NavBar อ่านผ่านเบราว์เซอร์). ถ้าไปอ่าน
 * คุกกี้ตอนเรนเดอร์จะดันหน้าแรกเป็น dynamic = ช้าลงทั้งหน้า. ใช้ `getSession()` (อ่าน local
 * ไม่ยิงเน็ต) เพราะนี่เป็นแค่การ "เลือกปลายทาง" — ด่านจริงยังเป็น `requireAuth()` ฝั่งเซิร์ฟเวอร์
 * เหมือนเดิม ถ้า session หมดอายุ ก็แค่ถูกเด้งไป /login ตามปกติ (ลิงก์ยังอยู่ใน sessionStorage).
 *
 * Mobile-first (AGENTS §6): ตาราง 3 คอลัมน์ยุบเป็นแถวเดี่ยว < md · ช่องกรอกสูง ≥ 44px.
 */

import { useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ClipboardList, ClipboardPaste, ExternalLink, Plus,
  Search, Trash2,
} from "lucide-react";
import {
  MAX_LINKS, SOURCE_BADGE, detectSource, splitLinks, stashManualLinks,
} from "@/app/[locale]/(protected)/cart/add/link-source";

/** คีย์ที่ `/cart/add/review` อ่าน — ต้องตรงกับ `cart-add-multi-link.tsx` เป๊ะ */
const REVIEW_LINKS_KEY = "pacred_cart_add_links";
const REVIEW_PATH = "/cart/add/review";
const MANUAL_PATH = "/cart/add/manual";

type Row = { id: number; url: string };
let ROW_SEQ = 1;
const newRow = (url = ""): Row => ({ id: ROW_SEQ++, url });

export function SourcingLinkPanel() {
  const router = useRouter();
  // เริ่มแถวเดียว (ปอน 2026-08-07) — เพิ่มเองด้วยปุ่ม + ในแถว หรือวางหลายลิงก์ทีเดียว
  // แล้วระบบกระจายให้เอง
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filled = useMemo(() => rows.map((r) => r.url.trim()).filter(Boolean), [rows]);
  const readyCount = useMemo(() => filled.filter((u) => detectSource(u) !== null).length, [filled]);

  function setUrl(id: number, url: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, url } : r)));
    setError(null);
  }

  /** วางลิงก์ก้อนเดียวหลายอัน → กระจายลงช่องถัดๆ ไป (เหมือน /cart/add) */
  function spreadLinks(fromId: number, text: string) {
    const urls = splitLinks(text);
    if (urls.length === 0) return;
    setRows((rs) => {
      const idx = rs.findIndex((r) => r.id === fromId);
      if (idx < 0) return rs;
      const next = [...rs];
      urls.forEach((u, i) => {
        const at = idx + i;
        if (at < next.length) next[at] = { ...next[at], url: u };
        else if (next.length < MAX_LINKS) next.push(newRow(u));
      });
      return next.slice(0, MAX_LINKS);
    });
    setError(null);
  }

  async function pasteInto(id: number) {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return;
      if (/[\s\n]/.test(text.trim())) spreadLinks(id, text);
      else setUrl(id, text.trim());
    } catch {
      /* เบราว์เซอร์ไม่ให้สิทธิ์คลิปบอร์ด — ลูกค้าวางเองด้วย Ctrl+V ได้ตามปกติ */
    }
  }

  /** แทรกช่องใหม่ "ต่อจากแถวนี้" — ปุ่ม + อยู่ข้างถังขยะในแถว (ปอน 2026-08-07)
   *  แทนปุ่มยาว "เพิ่มช่องลิงก์" ที่ถอดออกไป */
  function addRowAfter(id: number) {
    setRows((rs) => {
      if (rs.length >= MAX_LINKS) return rs;
      const idx = rs.findIndex((r) => r.id === id);
      const next = [...rs];
      next.splice(idx < 0 ? rs.length : idx + 1, 0, newRow());
      return next;
    });
  }

  function removeRow(id: number) {
    setRows((rs) => (rs.length <= 1 ? [newRow()] : rs.filter((r) => r.id !== id)));
    setError(null);
  }

  /** ปลายทางหลังกด — ยังไม่ล็อกอินให้แวะ /login พร้อมปลายทาง แล้วเด้งกลับมาเอง.
   *  เช็คไม่ได้/พัง → ไปหน้าปลายทางตรงๆ (ด่านฝั่งเซิร์ฟเวอร์รับต่อ ไม่มีทางหลุด) */
  async function go(path: string) {
    let signedIn = true;
    try {
      const { data } = await createClient().auth.getSession();
      signedIn = Boolean(data.session);
    } catch {
      /* storage ถูกปิด — ปล่อยให้ requireAuth() ฝั่งเซิร์ฟเวอร์ตัดสิน */
    }
    router.push(signedIn ? path : `/login?next=${encodeURIComponent(path)}`);
  }

  async function onVerify() {
    if (filled.length === 0) {
      setError("ยังไม่ได้วางลิงก์สินค้า — วางลิงก์อย่างน้อย 1 รายการก่อนครับ");
      return;
    }
    const ready = filled.filter((u) => detectSource(u) !== null);
    const unsupported = filled.filter((u) => detectSource(u) === null);
    setError(null);

    setBusy(true);
    // ลิงก์ร้านที่เราไม่มี API ไม่ใช่ความผิดพลาด — ส่งต่อไปฟอร์มกรอกเอง จะได้ไม่ต้องก๊อปซ้ำ
    stashManualLinks(unsupported);
    if (ready.length === 0) {
      await go(MANUAL_PATH);
      return;
    }
    try {
      sessionStorage.setItem(REVIEW_LINKS_KEY, JSON.stringify(ready));
    } catch {
      /* โหมดส่วนตัว / ปิด storage — หน้า review จะขึ้นสถานะว่าง */
    }
    await go(REVIEW_PATH);
  }

  return (
    <div className="p-4 md:p-6">
      {/* ── หัวคอลัมน์ (เดสก์ท็อปเท่านั้น — จอแคบยุบเป็นแถวเดี่ยว) ── */}
      <div className="hidden items-center gap-2.5 px-1 pb-2 text-[11.5px] font-bold text-muted md:grid md:grid-cols-[34px_minmax(0,1fr)_220px_auto]">
        <div />
        <div>วางลิงก์สินค้า <span className="font-medium">(ใส่ได้มากกว่าหนึ่งลิงก์)</span></div>
        {/* คอลัมน์โลโก้ร้าน — ไม่มีหัวคอลัมน์ (ปอน 2026-08-07 "เอาออก") แต่ยังต้องมี
            ช่องว่างไว้ ไม่งั้นคอลัมน์ที่เหลือจะเลื่อนไม่ตรงกับแถวข้างล่าง */}
        <div />
        <div className="text-right">ใส่ลิงก์สินค้า</div>
      </div>

      <div className="space-y-2 md:space-y-0">
        {rows.map((r, i) => {
          const url = r.url.trim();
          const src = detectSource(url);
          const badge = src ? SOURCE_BADGE[src] : null;
          return (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border p-2.5 md:grid md:grid-cols-[34px_minmax(0,1fr)_220px_auto] md:rounded-none md:border-0 md:border-t md:border-t-gray-100 md:p-0 md:py-2"
            >
              <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg bg-surface-alt text-[12px] font-extrabold text-gray-600">
                {String(i + 1).padStart(2, "0")}
              </span>

              {/* ช่องลิงก์ */}
              <div className="relative min-w-0 flex-1 md:flex-none">
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
                  aria-label={`ลิงก์สินค้ารายการที่ ${i + 1}`}
                  className={`h-11 w-full rounded-full border pl-3.5 text-[13.5px] outline-none focus:ring-2 focus:ring-primary-100 ${
                    url ? "pr-3.5" : "pr-[62px]"
                  } ${src ? "border-emerald-400 bg-emerald-50/40" : "border-primary-300 bg-primary-50/40"}`}
                />
                {/* มุมขวาของช่อง: ยังว่าง = ปุ่ม "วาง" · มีลิงก์แล้ว = ปุ่มค้นหา
                    (ปอน 2026-08-07 "เอาไอคอนค้นหาไปวางไว้ข้างๆการวางลิงก์" — เลิกใช้ปุ่มยาว
                    ด้านล่าง). ปุ่มค้นหาส่งลิงก์ที่พร้อม "ทุกช่อง" ไปหน้าตรวจสอบทีเดียว
                    เพราะจอนี้ออกแบบมาให้วางได้ถึง {MAX_LINKS} ลิงก์ต่อรอบ */}
                {url ? (
                  <button
                    type="button"
                    onClick={onVerify}
                    disabled={busy}
                    title={`ค้นหาและตรวจสอบสินค้า${readyCount > 0 ? ` ${readyCount} รายการ` : ""}`}
                    aria-label={`ค้นหาและตรวจสอบสินค้า${readyCount > 0 ? ` ${readyCount} รายการ` : ""}`}
                    className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-primary-600 text-white transition hover:bg-primary-700 active:scale-95 disabled:bg-primary-200"
                  >
                    <Search className="h-4 w-4" aria-hidden />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => pasteInto(r.id)}
                    title="วางลิงก์ที่คัดลอกไว้"
                    className="absolute right-1.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full bg-surface-alt px-2.5 py-1.5 text-[11.5px] font-bold text-gray-600 transition hover:bg-gray-200 active:scale-95"
                  >
                    <ClipboardPaste className="h-3.5 w-3.5" aria-hidden /> วาง
                  </button>
                )}
              </div>

              {/* ตัวอย่างสินค้า — โครงว่างไว้ตามม็อกอัพ. รูป/ชื่อ/ราคาจริงดึงที่หน้าถัดไป
                  (owner เคาะ: "ทำคอลัมน์ไว้ตามภาพ แต่ดึงจริงที่หน้าถัดไปเหมือนเดิม") */}
              <div className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-lg border border-dashed border-border bg-surface text-gray-300"
                >
                  <ClipboardList className="h-4 w-4" />
                </span>
                <span className="min-w-0 text-[11.5px] leading-tight">
                  {badge ? (
                    // 🔴 `SOURCE_BADGE.icon` เป็น "พาธรูป" ไม่ใช่อีโมจิ — เรนเดอร์เป็น <img>
                    // เท่านั้น (ถ้าใส่เป็นข้อความจะโชว์พาธดิบออกมาให้ลูกค้าเห็น). ใช้ทรงเดียว
                    // กับ /cart/add เพื่อให้โลโก้ร้านหน้าตาเหมือนกันทั้งสองจอ
                    <img
                      src={badge.icon}
                      alt={badge.label}
                      title={`ลิงก์จาก ${badge.label}`}
                      className="h-7 w-auto shrink-0 object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-muted">{url ? "กรอกข้อมูลเองหน้าถัดไป" : "รอวางลิงก์"}</span>
                  )}
                </span>
              </div>

              {/* ปุ่มท้ายแถว */}
              <div className="ml-auto flex items-center gap-2 md:ml-0 md:justify-end">
                <a
                  href={src ? url : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!src}
                  title={src ? "เปิดลิงก์ในแท็บใหม่ เพื่อดูว่าใช่สินค้าที่ต้องการ" : "วางลิงก์ร้านจีนก่อน"}
                  onClick={(e) => { if (!src) e.preventDefault(); }}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 text-[11.5px] font-bold transition ${
                    src
                      ? "border-primary-200 bg-primary-50 text-primary-600 hover:bg-primary-100"
                      : "pointer-events-none border-border text-gray-400 opacity-60"
                  }`}
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden /> ตรวจสอบลิงก์
                </a>
                <button
                  type="button"
                  onClick={() => removeRow(r.id)}
                  title="ลบช่องนี้"
                  aria-label={`ลบลิงก์รายการที่ ${i + 1}`}
                  className="p-1.5 text-gray-300 transition hover:text-primary-600"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => addRowAfter(r.id)}
                  disabled={rows.length >= MAX_LINKS}
                  title={rows.length >= MAX_LINKS ? `วางได้สูงสุด ${MAX_LINKS} ลิงก์` : "เพิ่มช่องลิงก์ถัดจากแถวนี้"}
                  aria-label="เพิ่มช่องลิงก์"
                  className="p-1.5 text-gray-300 transition hover:text-primary-600 disabled:opacity-40 disabled:hover:text-gray-300"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-2.5 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-[12.5px] font-medium text-primary-700">
          {error}
        </p>
      )}


    </div>
  );
}

import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { calPriceForwarderSumCompany } from "@/lib/forwarder/calc-company-total";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { legacyMemberUrl } from "@/lib/legacy-image";
import { code128SvgDataUrl } from "@/lib/barcode";
import { ADDRESSES, CONTACT } from "@/components/seo/site";
import { ServiceImportEditShipByForm } from "./service-import-edit-ship-by-form";
import { ServiceImportEditAddressForm } from "./service-import-edit-address-form";
import { ServiceImportPayButton } from "./service-import-pay-button";
import { Explain, GUIDE } from "@/components/ui/tooltip";
import {
  DeliveryFeedbackCard,
  type DeliveryFeedbackExisting,
} from "./delivery-feedback-card";
import { MissingItemReportCard } from "./missing-item-report-card";
import type { ForwarderRow } from "../forwarder-row-view";
// 2026-06-19 (Unit A · owner "แจงค่าหน้าอื่นด้วย") — READ-ONLY "ยอดเก็บจริง"
// breakdown so the customer sees the SAME amount admin will collect (freight +
// เหมาๆ ฿100 − ส่วนลด − หัก ณ ที่จ่าย นิติ 1%), not the freight-only number.
// Same canonical money fn the จ่ายแทนลูกค้า + admin detail use — no inline math.
import {
  computeForwarderDebitBatch,
  type ForwarderDebitRow,
} from "@/lib/forwarder/forwarder-debit-total";
import { fetchCountableForwarderSiblings } from "@/lib/admin/forwarder-siblings";
// 2026-06-19 (owner ภูม #2) — customer-facing import price-breakdown. PURE +
// DISPLAY-ONLY: turns the ALREADY-STORED rate decision (frefrate/frefprice/
// ftotalprice) into the same "หาค่าเทียบ / คิดตามน้ำหนัก / คิดตามปริมาตร / ระบบเลือก"
// lines the admin box shows, so the customer sees Pacred picked the best rate.
// NO money recompute, NO write.
import { buildPriceBreakdownDisplay } from "@/lib/forwarder/price-breakdown-display";

/**
 * Customer "รายการฝากนำเข้าสินค้า — รายละเอียด" (forwarder detail) screen —
 * a FAITHFUL 1:1 TRANSCRIPTION of the legacy PCS Cargo
 * `member/forwarder.php` `?page=detail&id=<ID>` branch (lines 1584-2419)
 * (D1 / ADR-0017 · faithful-port transcription · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * ── Legacy mapping ──
 * The legacy `.htaccess` (member/.htaccess) rewrites:
 *   `forwarder/<page>/<id>/` → `forwarder.php?page=<page>&id=<id>`
 * The `?page=detail&id=<n>` branch (forwarder.php L1584) renders this
 * order-detail screen; the URL the new menu / list rows use is
 * `/service-import/<n>` and the dynamic segment is `[fNo]`.
 *
 * ── Page structure (forwarder.php L1682-2247) ──
 * <title> + 3 <link>s (magnific-popup / switchery / dropify)  (L1682-1685)
 *   - the screen-local <style> overrides              (L1687-1699)
 *   - .app-content > .content-wrapper
 *     1. breadcrumb header (หน้าแรก / รายการฝากนำเข้าสินค้า / #<ID>) (L1707-1719)
 *     2. .content-body.pr110 > section > .row > .col-md-12 > .card.border-black
 *        > .card-content > .card-body
 *        a. header card row                              (L1748-1825)
 *           — order number + tracking + barcode (left)
 *           — status badge / "ส่งสินค้าโดย" / receipt link (right)
 *        b. 7-step process tabs (.process-model.pro2)    (L1827-1906)
 *           — visited / active per fStatus 1..7 + driver flag
 *        c. metadata row two-col                         (L1909-2124)
 *           — refOrder · fDate · fShipBy (+ inline edit form)
 *             · payMethod · fullAddress (+ inline edit form)
 *             · fTrackingTH · multi-bill warning · fPhotoEnd
 *             · driver status (left)
 *           — fTrackingCHN · transport-type · crate
 *             · fWarehouseChina · fCabinetNumber · close-date
 *             · fAmount · fProductsType · fDetail · cover photo
 *             · fNoteUser=2 admin note (right)
 *        d. (cond. fStatus>=5) cost-breakdown table     (L2126-2194)
 *           — 14 columns: count / weight / volume / rate-basis /
 *             rate / cost / adjust / crate / chnthb / transport /
 *             service / other / discount / +WHT col / net
 *           — "ชำระเงิน" button when fStatus=5
 *        e. (cond. fStatus<5) item-list table           (L2199-2229)
 *           — 5 columns: # / detail / count / weight / volume
 *        f. footer "ย้อนกลับ" button                    (L2231-2240)
 *
 * ── Data — every forwarder.php detail-branch query transcribed 1:1 ──
 * The `tb_*` schema is RLS-locked to service_role → reads go through the
 * admin client. Join key for ownership: `tb_*.userid === profile.member_code`
 * (the customer's "PR<n>" code).
 *
 *   - $row (L1661-1668) → tb_forwarder f ⋈ tb_users u ⋈ tb_promotion po
 *                         WHERE f.id=<fNo> AND u.userid=<currentUser>
 *                         — the user-ID match in the join is the ownership
 *                         gate; missing match → 404 (legacy includes 404.php).
 *                         Followed here: notFound() if the record's userid
 *                         doesn't match profile.member_code.
 *   - $row_driver2 (L1725-1739) → tb_forwarder_driver_item fdi
 *                                ⋈ tb_forwarder_driver fd
 *                                ⋈ tb_admin a
 *                                WHERE fid=<id>
 *                                (last row wins per legacy `while` loop)
 *   - $rID (L1788-1793) → tb_receipt_item WHERE fid=<id>  (receipt link)
 *   - $row_tran_th_sub (L2024-2039) → tb_forwarder_tran_th_sub  (multi-bill)
 *   - $row_driver (L2050-2056) → tb_forwarder_driver_item fdi
 *                              ⋈ tb_forwarder_driver fd
 *                              WHERE fdi.fid=<id>
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + Pacred. Otherwise the markup is byte-for-byte
 * the legacy output — same class names, same Thai labels, same order.
 *
 * ── FLAGGED — not strictly 1:1 (documented, never silently diverged) ──
 *  1. forwarder.php L1586-1659 has TWO POST handlers — `update_fShipBy`
 *     and `update_fAddress` (UPDATE tb_forwarder SET …). Both wired via
 *     <ServiceImportEditShipByForm> / <ServiceImportEditAddressForm>
 *     Client Components → updateLegacyForwarderShipBy /
 *     updateLegacyForwarderAddress Server Actions. The jQuery slide-
 *     down toggle becomes a useState open/close + an "ยกเลิก" button.
 *  2. forwarder.php L2329-2335 runs `payForwarder()` JS when `?pay=true`
 *     on the URL → that fires AJAX to fetch the pay-modal. Not reproduced.
 *  3. forwarder.php L2337-2411 SweetAlert popups (eSQL / sPay / eWallet /
 *     eCashBack / ePass / eAddress / sUpdate) need client JS not present
 *     here — kept silent (no popup).
 *  4. forwarder.php L1762 `include/barcode.php` is a server-side PNG
 *     Code128 generator on pcscargo.co.th — replaced by a LOCAL inline
 *     Code128 SVG (lib/barcode.ts via bwip-js): same symbology + value,
 *     no runtime call to the legacy server (no brand leak / dependency).
 *  5. The "ชำระเงิน" button (L2140) calls `payForwarder()` (AJAX to
 *     `include/pages/index/getListPayForwarder.php`) — wired via the
 *     <ServiceImportPayButton> Client Component, which opens the
 *     existing <ForwarderPayModal> seeded with this single row (the
 *     same modal /service-import's pay-bar opens for multi-row).
 *  6. forwarder.php L1672 calls `statusForwarderBadge()` (function.php
 *     L581-592) — transcribed inline below as `statusForwarderBadge()`.
 *  7. forwarder.php L1678 calls `calPriceForwarderSumCompany()`
 *     (function.php L1384-1392) — transcribed inline below.
 */

// Server Components reading cookies/auth under a layout must be dynamic.
export const dynamic = "force-dynamic";

// Translator function from getTranslations("serviceImportDetailPage").
type T = (key: string, values?: Record<string, string | number>) => string;

// PHP `number_format($n, 2)` — 2 decimals, comma thousands separator.
function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// PHP `DATE_FORMAT(x,'%d/%m/%Y %T')` — d/m/Y H:i:s of a timestamp.
function dmyHms(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts.replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
// PHP `DATE(x)` → d/m/Y of a timestamp.
function dmy(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts.replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
// Is a stored date-stamp a REAL value (the warehouse scan actually set it),
// not a null / empty / legacy MySQL zero-date sentinel? Drives the PHYSICAL
// journey steps so a credit order flipped to fStatus=6 BEFORE the goods
// arrive doesn't paint "สินค้าถึงไทย" as done.
function hasRealStamp(ts: string | null): boolean {
  if (!ts) return false;
  const s = ts.trim();
  if (s === "" || s.startsWith("0000-00-00")) return false;
  return !isNaN(new Date(s.replace(" ", "T")).getTime());
}
// PHP DateTime modify on a d/m/Y string — used for the "จะถึงไทย" range.
function modifyDmy(dmyStr: string, days: number): string {
  const m = dmyStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Legacy `statusForwarderBadge($fStatus)` — member/include/function.php L581-592.
// Bootstrap `badge badge-*` → Tailwind chips, matching the canonical
// STATUS_CHIP palette in forwarder-row-view.tsx (same tones per status).
const STATUS_BADGE_CHIP = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold";
function statusForwarderBadge(fStatus: string | null, t: T) {
  switch (fStatus) {
    case "1":
      return <span className={`${STATUS_BADGE_CHIP} bg-amber-100 text-amber-700 border-amber-200`}>{t("status1")}</span>;
    case "2":
      return <span className={`${STATUS_BADGE_CHIP} bg-sky-100 text-sky-700 border-sky-200`}>{t("status2")}</span>;
    case "3":
      return <span className={`${STATUS_BADGE_CHIP} bg-pink-100 text-pink-700 border-pink-200`}>{t("status3")}</span>;
    case "4":
      return <span className={`${STATUS_BADGE_CHIP} bg-amber-200 text-amber-900 border-amber-300`}>{t("status4")}</span>;
    case "5":
      return <span className={`${STATUS_BADGE_CHIP} bg-red-100 text-red-700 border-red-200`}>{t("status5")}</span>;
    case "6":
      return <span className={`${STATUS_BADGE_CHIP} bg-indigo-100 text-indigo-700 border-indigo-200`}>{t("status6")}</span>;
    case "7":
      return <span className={`${STATUS_BADGE_CHIP} bg-emerald-100 text-emerald-700 border-emerald-200`}>{t("status7")}</span>;
    default:
      return null;
  }
}

// Legacy `nameShipBy($fShipBy)` — function.php L91-143.
const NAME_SHIP_BY: Record<string, string> = {
  "1": "DHL Express", "2": "Flash Express", "3": "J.K. เอ็กซ์เพรส",
  "4": "Kerry Express", "5": "Nim Express", "6": "S & J ขนส่งด่วนสุพรรณบุรี",
  "7": "SB สมใจขนส่ง", "8": "SCG Express", "9": "เคพีเอ็น",
  "10": "เฟิร์ส เอ็กเพรส ขนส่ง", "11": "ไปรษณีย์ไทย", "12": "จันทร์สว่างขนส่ง",
  "13": "ธนามัย ขนส่งด่วน", "14": "บุญอนันต์ขนส่ง", "15": "พี.เจ. ด่วนอีสาน ขนส่ง",
  "16": "มะม่วงขนส่ง", "17": "วันชนะ แอนด์ วันณิสา ขนส่ง", "18": "สมพงษ์อุบลรัตน์ ขนส่ง",
  "19": "อาร์.ซี.อาร์ เพลส", "20": "ตองสอง ขนส่ง", "21": "นิ่มซี่เส็งขนส่ง 1988",
  "22": "ธนาไพศาล ขนส่ง", "23": "PL ขนส่งด่วน", "24": "J&T Express",
  "25": "มังกรทองขนส่ง 2019", "26": "PM ชลบุรี ขนส่งด่วน", "27": "ทรัพย์ปรีชา",
  "28": "พัฒนาเอ็กซ์เพลส", "29": "หาดใหญ่ทัวร์", "30": "หาดใหญ่ โอ.พี. 2012",
  "31": "อาร์.ซี.เอ็กซเพรส", "32": "สี่สหาย", "33": "แพปลา​สมบัติ​วัฒนา",
  "34": "ทวีทรัพย์ระยอง", "35": "ศิริสมบูรณ์", "36": "นิวสอง อัศวินขนส่ง",
  "37": "โชคสถาพรขนส่ง", "38": "ทรัพย์สมบูรณ์ถาวร", "39": "MNB Transport",
  "40": "หจก.โชคพูลทรัพย์ขนส่ง 2014", "41": "สิรินครขนส่ง", "42": "พาณิชย์การขนส่ง KSD",
  PCS: "รับเองโกดัง Pacred (สมุทรสาคร)", F: "บริษัทจัดหาให้อัตโนมัติ",
  PCSF: "Pacred เหมาเหมา", PCSE: "Pacred Express",
};
function nameShipBy(fShipBy: string | null, t: T): string {
  return NAME_SHIP_BY[fShipBy ?? ""] ?? t("notFound");
}

// Legacy `namePayMethod($data)` — function.php L624-633.
function namePayMethod(data: string | null, t: T) {
  if (data === "2")
    return <span className="inline-flex items-center rounded bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white">{t("payMethodDestination")}</span>;
  return t("payMethodOrigin");
}

// Legacy `nameCrate($data)` — function.php L634-643.
function nameCrate(data: string | null, t: T) {
  if (data === "1")
    return <span className="inline-flex items-center rounded bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white">{t("crateYes")}</span>;
  return t("crateNo");
}

// Legacy `nameWarehouseChina($fWarehouseChina)` — function.php L593-600.
function nameWarehouseChina(v: string | null, t: T): string {
  if (v === "1") return t("warehouseGuangzhou");
  if (v === "2") return t("warehouseYiwu");
  return t("warehousePending");
}

// Legacy `nameProductsType($productsType)` — function.php L320-330.
function nameProductsType(v: string | null, t: T): string {
  if (v === "1") return t("productsTypeGeneral");
  if (v === "2") return t("productsTypeTisi");
  if (v === "3") return t("productsTypeFda");
  if (v === "4") return t("productsTypeSpecial");
  return t("productsTypePending");
}

// Legacy `nameRefPrice($refPrice)` — function.php L615-623.
function nameRefPrice(v: string | null, t: T): string {
  if (v === "1") return t("refPriceWeight");
  if (v === "2") return t("refPriceVolume");
  return t("notFound");
}

// Legacy `tagPro($ID)` — function.php L1274+. Detail screen only ever
// shows the badge text — the WordPress promo links are kept (faithful).
const TAG_PRO: Record<string, { label: string; href?: string }> = {
  "1": { label: "Pro 3.15" },
  "2": { label: "Pro 4.4" },
  "3": { label: "Pro 4.25" },
  "4": { label: "Pro 5.5" },
  "5": { label: "Pro 5.15" },
  "6": { label: "Pro 6.6" },
  // Legacy promo pages on pcscargo.co.th — rewritten to the internal
  // Pacred import-china landing page (closest equivalent until Pacred
  // ships its own promo pages). Customer stays inside Pacred.
  "7": { label: "Pro 6.25", href: "/services/import-china" },
  "8": { label: "Pro 7.7", href: "/services/import-china" },
  "9": { label: "Pro 7.25", href: "/services/import-china" },
  "10": { label: "Pro 8.8", href: "/services/import-china" },
  "11": { label: "Pro 8.25", href: "/services/import-china" },
  "12": { label: "Pro 9.9", href: "/services/import-china" },
};
function TagPro({ id }: { id: string | null }) {
  if (!id || !TAG_PRO[id]) return null;
  const p = TAG_PRO[id];
  const chip =
    "ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200 align-middle";
  return (
    <>
      {" "}
      {p.href ? (
        <a href={p.href} target="_blank" rel="noreferrer">
          <span className={chip}>{p.label}</span>
        </a>
      ) : (
        <span className={chip}>{p.label}</span>
      )}
    </>
  );
}

// Legacy `convertIMGCHN($url,$size)` — function.php L1414+. The cover
// photo URL/filename → displayable URL.
function convertIMGCHN(url: string | null): string {
  if (!url || url === "") return "/legacy/pcs/shops/default.png";
  const u = url
    .replace("?x-oss-process=style/alsy", "")
    .replace("?x-oss-process=style/tbsy", "")
    .replace("_250x250.jpg", "");
  if (u.includes("/")) {
    // Old data may store full legacy URLs — re-resolve through the
    // Supabase mirror so customer-visible URLs never leak the legacy host.
    const legacyMatch = u.match(/pcscargo\.co\.th\/member\/(.+)$/);
    if (legacyMatch) return legacyMemberUrl(legacyMatch[1]);
    return u;
  }
  // a bare filename — legacy stores forwarder covers under images/shops/
  return legacyMemberUrl(`images/shops/${u}`);
}

// calPriceForwarderSumCompany — shared in @/lib/forwarder/calc-company-total (imported above).

// The 7-step process tabs (forwarder.php L1827-1906). The legacy emits
// a per-`fStatus` `<li>` cluster — encoded here as a per-step state
// machine to keep the markup identical.
type StepState = "" | "visited" | "active";
type PhysicalStamps = {
  s2: string | null; // fdatestatus2 — สินค้าถึงโกดังจีน
  s3: string | null; // fdatestatus3 — กำลังส่งมาไทย
  s4: string | null; // fdatestatus4 — สินค้าถึงไทย
};
/**
 * The 8-step tracker state. Indices 0..7 → step 1..6 / step 6.1 / step 7
 * (รอเข้าโกดังจีน / ถึงโกดังจีน / กำลังส่งมาไทย / สินค้าถึงไทย / รอชำระเงิน /
 *  เตรียมส่ง / กำลังจัดส่ง / ส่งแล้ว).
 *
 * tb_forwarder.fstatus carries TWO dimensions on one column: a PHYSICAL
 * journey (1-4) AND money/dispatch (5-7). A CREDIT order is flipped to
 * fstatus=6 at credit-grant BEFORE the goods physically arrive — so driving
 * the physical steps off the fstatus integer would paint steps 1-4
 * (incl. "สินค้าถึงไทย") as done when nothing has physically arrived.
 *
 * FIX (2026-06-14): the PHYSICAL steps (2=ถึงโกดังจีน · 3=กำลังส่งมาไทย ·
 * 4=สินค้าถึงไทย) are "done" ONLY when their fdatestatusN stamp is real (the
 * warehouse scan set it) — NOT because fstatus advanced past them. The
 * money/dispatch steps (5/6/6.1/7) still key off fstatus. Step 1 is the
 * entry state, visited once the goods enter the China warehouse (step 2
 * stamped) or any later milestone is reached.
 */
function computeSteps(
  fStatus: string | null,
  fidDriver: 0 | 1,
  stamps: PhysicalStamps,
): StepState[] {
  const s = Number(fStatus);
  const p2 = hasRealStamp(stamps.s2);
  const p3 = hasRealStamp(stamps.s3);
  const p4 = hasRealStamp(stamps.s4);

  // Physical journey (indices 0..3). Each physical milestone is "done" only
  // with a real stamp; the next un-stamped physical step is the active one.
  const out: StepState[] = ["", "", "", "", "", "", "", ""];
  // Step 1 (รอเข้าโกดังจีน) — visited the moment any later milestone is
  // reached (a stamp OR fstatus already past the physical phase), else active.
  const reachedBeyondStep1 = p2 || p3 || p4 || s >= 5;
  out[0] = reachedBeyondStep1 ? "visited" : "active";
  out[1] = p2 ? "visited" : reachedBeyondStep1 && !p2 ? "active" : "";
  // Once a physical step is "active", later physical steps stay blank.
  if (out[1] === "active") return finalizeMoneySteps(out, s, fidDriver, p2, p3, p4);
  out[2] = p3 ? "visited" : p2 && !p3 ? "active" : "";
  if (out[2] === "active") return finalizeMoneySteps(out, s, fidDriver, p2, p3, p4);
  out[3] = p4 ? "visited" : p3 && !p4 ? "active" : "";
  if (out[3] === "active") return finalizeMoneySteps(out, s, fidDriver, p2, p3, p4);

  return finalizeMoneySteps(out, s, fidDriver, p2, p3, p4);
}

// Money/dispatch tail (indices 4..7 = step 5 / 6 / 6.1 / 7). These DO key off
// fstatus — they're the dispatch dimension, not the physical journey. Only
// runs once the physical phase has no active step (goods at TH, or fstatus
// already in the money phase). A credit order at fstatus=6 with no
// fdatestatus4 keeps step 4 NOT-done (handled in the caller) and the
// dispatch chips reflect fstatus.
function finalizeMoneySteps(
  out: StepState[],
  s: number,
  fidDriver: 0 | 1,
  p2: boolean,
  p3: boolean,
  p4: boolean,
): StepState[] {
  // If a physical step is the active one, don't light any money step.
  if (out.includes("active")) return out;
  // No money phase yet (still physically in transit, fstatus < 5) → the
  // furthest physical milestone is the active head if nothing downstream.
  if (s < 5) {
    // Make the next un-reached physical step active (entry already handled).
    if (!p2) out[1] = out[1] || "active";
    else if (!p3) out[2] = out[2] || "active";
    else if (!p4) out[3] = out[3] || "active";
    return out;
  }
  // Money/dispatch phase. Mark earlier money steps visited up to the current.
  if (s === 5) out[4] = "active";
  else if (s === 6) {
    out[4] = "visited";
    if (fidDriver === 1) {
      out[5] = "visited";
      out[6] = "active";
    } else {
      out[5] = "active";
    }
  } else if (s >= 7) {
    out[4] = "visited";
    out[5] = "visited";
    out[6] = "visited";
    out[7] = "active";
  }
  return out;
}

const ICON_BASE = "/legacy/pcs/assets/images/icon/forwarder/";
const STEPS = [
  { ctrl: "step1", labelKey: "stepWaitChinaWarehouse", icon: "forwarder-1.png" },
  { ctrl: "step2", labelKey: "stepArrivedChinaWarehouse", icon: "forwarder-2.png" },
  { ctrl: "step3", labelKey: "stepShippingToThailand", icon: "forwarder-3.png" },
  { ctrl: "step4", labelKey: "stepArrivedThailand", icon: "forwarder-4.png" },
  { ctrl: "step5", labelKey: "stepWaitPayment", icon: "forwarder-5.png" },
  { ctrl: "step6", labelKey: "stepPreparing", icon: "/images/home/iconfloating/pcs-cart.png" },
  { ctrl: "step62", labelKey: "stepDelivering", icon: "forwarder-6.1.png" },
  { ctrl: "step7", labelKey: "stepDelivered", icon: "forwarder-7.png" },
];

export default async function ServiceImportDetailPage({
  params,
}: {
  params: Promise<{ fNo: string }>;
}) {
  const { fNo } = await params;

  const t = await getTranslations("serviceImportDetailPage");

  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const memberCode = profile.member_code ?? "";

  // forwarder.php L1660: $ID=preg_replace("/[^a-z\d]/i", '', $_GET['id']);
  // The legacy strips everything except a-z 0-9. Faithfully reproduced.
  const idClean = fNo.replace(/[^a-z\d]/gi, "");
  const idNum = Number(idClean);
  if (!Number.isFinite(idNum) || idNum <= 0) notFound();

  const admin = createAdminClient();

  // ── forwarder.php L1661-1668 ─────────────────────────────────────
  // SELECT … FROM tb_forwarder f
  //   LEFT JOIN tb_users u  ON u.userid=f.userid
  //   LEFT JOIN tb_promotion po ON po.fid=f.id
  //   WHERE f.id=<id> AND u.userid=<currentUser>
  //
  // The `u.userid=<currentUser>` clause IS the ownership gate — if it
  // doesn't match this customer, the legacy include falls through to
  // 404.php. Reproduced as `notFound()` below.
  const { data: row, error: rowErr } = await admin
    .from("tb_forwarder")
    .select(
      // tb_forwarder columns
      "id, fdate, fdateadminstatus, fstatus, fshipby, fproductstype, ftransporttype, " +
      "fwarehousechina, fcabinetnumber, fdatecontainerclose, fdatetothai, " +
      "ftrackingchn, ftrackingchn2, ftrackingth, famount, famountcount, " +
      "fdetail, fcover, fphotoend, fnote, fnoteuser, " +
      "fweight, fwidth, flength, fheight, fvolume, frefprice, frefrate, " +
      "ftotalprice, ftransportprice, fpriceupdate, fdiscount, fshippingservice, " +
      "pricecrate, ftransportpricechnthb, priceother, crate, ffreeshipping, " +
      "paymethod, faddressname, faddresslastname, faddressno, faddresssubdistrict, " +
      "faddressdistrict, faddressprovince, faddresszipcode, faddresstel, faddresstel2, " +
      "fdatestatus2, fdatestatus3, fdatestatus4, fdatestatus7, fcredit, fcreditdate, " +
      "reforder, fusercompany, userid, courier_tracking_url, " +
      "fpriceupdate, customrate, customratekg, customratecbm, " +
      // per-order ค่าเทียบ override (mig 0187) — DISPLAY-ONLY: drives the
      // customer price-breakdown "หาค่าเทียบ …" line (no money recompute).
      "custom_comparison, custom_comparison_value",
    )
    .eq("id", idNum)
    .maybeSingle<{
      id: number;
      fdate: string | null;
      fdateadminstatus: string | null;
      fstatus: string | null;
      fshipby: string | null;
      fproductstype: string | null;
      ftransporttype: string | null;
      fwarehousechina: string | null;
      fcabinetnumber: string | null;
      fdatecontainerclose: string | null;
      fdatetothai: string | null;
      ftrackingchn: string | null;
      ftrackingchn2: string | null;
      ftrackingth: string | null;
      famount: number;
      famountcount: string | null;
      fdetail: string | null;
      fcover: string | null;
      fphotoend: string | null;
      fnote: string | null;
      fnoteuser: string | null;
      fweight: number | string;
      fwidth: number | string;
      flength: number | string;
      fheight: number | string;
      fvolume: number | string;
      frefprice: string | null;
      frefrate: number | string;
      ftotalprice: number | string;
      ftransportprice: number | string;
      fpriceupdate: number | string;
      fdiscount: number | string;
      fshippingservice: number | string;
      pricecrate: number | string;
      ftransportpricechnthb: number | string;
      priceother: number | string;
      crate: string | null;
      ffreeshipping: string | null;
      paymethod: string | null;
      faddressname: string | null;
      faddresslastname: string | null;
      faddressno: string | null;
      faddresssubdistrict: string | null;
      faddressdistrict: string | null;
      faddressprovince: string | null;
      faddresszipcode: string | null;
      faddresstel: string | null;
      faddresstel2: string | null;
      fdatestatus2: string | null;
      fdatestatus3: string | null;
      fdatestatus4: string | null;
      fdatestatus7: string | null;
      fcredit: string | null;
      fcreditdate: string | null;
      reforder: string | null;
      fusercompany: string | null;
      userid: string | null;
      courier_tracking_url: string | null;
      customrate: string | null;
      customratekg: number | string;
      customratecbm: number | string;
      custom_comparison: string | null;
      custom_comparison_value: number | string | null;
    }>();

  // forwarder.php L1669: if ($result->num_rows > 0) { … } else { 404 }
  // PLUS the ownership clause in the WHERE — modelled as a notFound()
  // when the row doesn't exist OR doesn't belong to the current member.
  // §0c (Wave 19): destructure error first so a transient PgBouncer
  // timeout doesn't fake-404 a real customer's shipment.
  if (rowErr) {
    console.error(`[service-import/[fNo] row lookup] fNo=${idNum} member=${memberCode}`, {
      code: rowErr.code, message: rowErr.message, details: rowErr.details, hint: rowErr.hint,
    });
    throw new Error(`Failed to load tb_forwarder (${rowErr.code}): ${rowErr.message}`);
  }
  if (!row || (row.userid ?? "") !== memberCode) notFound();

  // forwarder.php L1666: LEFT JOIN tb_promotion po ON po.fid=f.id
  // (read as a separate query — the legacy gets promoID off the same row)
  const { data: promoRow, error: promoErr } = await admin
    .from("tb_promotion")
    .select("promoid")
    .eq("fid", idNum)
    .maybeSingle<{ promoid: number | string | null }>();
  if (promoErr) {
    // Soft-fail — promotion is optional decoration; legacy uses LEFT JOIN.
    console.error(`[service-import/[fNo] tb_promotion lookup] fid=${idNum}`, { code: promoErr.code, message: promoErr.message });
  }
  const promoIdStr = promoRow ? String(promoRow.promoid) : null;

  // ── forwarder.php L1762 / detail.php L81 — tracking barcode ──
  // Legacy rendered <img src="…/include/barcode.php?text={fTrackingCHN}…"> when
  // fTrackingCHN matched /^[a-zA-Z0-9-]+$/i — a live call to the pcscargo.co.th
  // PHP Code128 generator (brand leak + runtime dependency on the legacy
  // server). Rendered LOCALLY now as an inline Code128 SVG (same symbology +
  // same value), no external request. null when there's no encodable tracking.
  const trackingBarcode = row.ftrackingchn
    ? code128SvgDataUrl(String(row.ftrackingchn))
    : null;

  // ── forwarder.php L976-997 / L1953-2011 — address <select> options ──
  // Used by the inline "แก้ไข ที่อยู่จัดส่ง" form (update_fAddress POST).
  // Main address first (tb_address ⋈ tb_address_main), then the rest.
  const { data: mainAddrRow, error: mainAddrErr } = await admin
    .from("tb_address_main")
    .select("addressid")
    .eq("userid", memberCode)
    .maybeSingle<{ addressid: number | string | null }>();
  if (mainAddrErr) {
    // Soft-fail — empty mainAddressId falls through to plain ordering; legacy uses LEFT JOIN.
    console.error(`[service-import/[fNo] tb_address_main lookup] memberCode=${memberCode}`, { code: mainAddrErr.code, message: mainAddrErr.message });
  }
  const mainAddressId = mainAddrRow?.addressid ?? null;
  const { data: allAddrs, error: allAddrsErr } = await admin
    .from("tb_address")
    .select(
      "addressid, addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode",
    )
    .eq("userid", memberCode)
    .eq("addressstatus", "1");
  if (allAddrsErr) {
    // Soft-fail — empty list renders an empty address picker; mirror's legacy behaviour when SELECT returns no rows.
    console.error(`[service-import/[fNo] tb_address list] memberCode=${memberCode}`, { code: allAddrsErr.code, message: allAddrsErr.message });
  }
  type AddressOption = {
    addressid: number | string;
    label: string;
    isMain: boolean;
  };
  const addressOptions: AddressOption[] = [];
  const addrList = ((allAddrs ?? []) as Array<{
    addressid: number;
    addressname: string | null;
    addresslastname: string | null;
    addressno: string | null;
    addresssubdistrict: string | null;
    addressdistrict: string | null;
    addressprovince: string | null;
    addresszipcode: string | null;
  }>).slice();
  // Sort: main first, then by addressid asc (the legacy ORDER BY).
  let mainIdx = -1;
  for (let i = 0; i < addrList.length; i++) {
    if (
      mainAddressId != null &&
      String(addrList[i].addressid) === String(mainAddressId)
    ) {
      mainIdx = i;
      break;
    }
  }
  const sorted: typeof addrList = [];
  if (mainIdx >= 0) sorted.push(addrList[mainIdx]);
  addrList
    .filter((_, i) => i !== mainIdx)
    .sort((a, b) => Number(a.addressid) - Number(b.addressid))
    .forEach((a) => sorted.push(a));
  for (const a of sorted) {
    const parts = [
      a.addressname ?? "",
      a.addresslastname ?? "",
      a.addressno ?? "",
      t("addressSubdistrict"),
      a.addresssubdistrict ?? "",
      t("addressDistrict"),
      a.addressdistrict ?? "",
      t("addressProvince"),
      a.addressprovince ?? "",
      a.addresszipcode ?? "",
    ].filter((s) => s !== "").join(" ");
    const isMain = mainAddressId != null &&
      String(a.addressid) === String(mainAddressId);
    addressOptions.push({
      addressid: a.addressid,
      label: isMain ? `${t("addressMainPrefix")} ${parts}` : parts,
      isMain,
    });
  }

  // forwarder.php L1725-1739: tb_forwarder_driver_item fdi
  //   ⋈ tb_forwarder_driver fd ON fdi.fdid = fd.id
  //   ⋈ tb_admin a              ON a.adminid = fd.fdadminid
  //   WHERE fdi.fid = <id>
  // Tables have no declared FKs → use parallel queries (same pattern as
  // the LIST page's tb_forwarder_driver_item lookup).
  const { data: driverItemRows, error: driverItemErr } = await admin
    .from("tb_forwarder_driver_item")
    .select("fid, fdid, fdistatus")
    .eq("fid", idNum);
  if (driverItemErr) {
    // Soft-fail — driver join is decorative for the FID_driver2 flag.
    console.error(`[service-import/[fNo] tb_forwarder_driver_item lookup] fid=${idNum}`, { code: driverItemErr.code, message: driverItemErr.message });
  }
  // The legacy reads tb_forwarder_driver's fdstatus (`fd.fdStatus`)
  // for the FID_driver2 flag (L1731-1735).
  let FID_driver2: 0 | 1 = 0;
  let adminTel = "";
  let adminName = "";
  const fdIds = Array.from(
    new Set(
      ((driverItemRows ?? []) as { fdid: number }[]).map((r) => r.fdid),
    ),
  );
  if (fdIds.length > 0) {
    const { data: drvRows, error: drvErr } = await admin
      .from("tb_forwarder_driver")
      .select("id, fdadminid, fdstatus")
      .in("id", fdIds);
    if (drvErr) {
      // Soft-fail — driver info is decorative for adminTel/adminName + FID_driver2.
      console.error(`[service-import/[fNo] tb_forwarder_driver lookup] fdIds=${JSON.stringify(fdIds)}`, { code: drvErr.code, message: drvErr.message });
    }
    const adminIds = Array.from(
      new Set(
        ((drvRows ?? []) as { fdadminid: string }[]).map((r) => r.fdadminid),
      ),
    );
    const adminMap: Record<string, { adminname: string | null; admintel: string | null }> = {};
    if (adminIds.length > 0) {
      const { data: admRows, error: admErr } = await admin
        .from("tb_admin")
        .select("adminID, adminName, adminTel")
        .in("adminID", adminIds);
      if (admErr) {
        // Soft-fail — admin name/tel is decorative.
        console.error(`[service-import/[fNo] tb_admin lookup] adminIds=${JSON.stringify(adminIds)}`, { code: admErr.code, message: admErr.message });
      }
      for (const a of (admRows ?? []) as Array<{
        adminID: string;
        adminName: string | null;
        adminTel: string | null;
      }>) {
        adminMap[a.adminID] = { adminname: a.adminName, admintel: a.adminTel };
      }
    }
    for (const fd of (drvRows ?? []) as Array<{
      fdadminid: string;
      fdstatus: string | null;
    }>) {
      if (fd.fdstatus === "1") FID_driver2 = 1;
      else if (fd.fdstatus === "2") FID_driver2 = 0;
      const a = adminMap[fd.fdadminid];
      if (a) {
        adminTel = a.admintel ?? adminTel;
        adminName = a.adminname ?? adminName;
      }
    }
  }

  // forwarder.php L1786-1793: tb_receipt_item WHERE fid=<id>
  const { data: receiptRow, error: receiptErr } = await admin
    .from("tb_receipt_item")
    .select("rid")
    .eq("fid", idNum)
    .maybeSingle<{ rid: string | null }>();
  if (receiptErr) {
    // Soft-fail — receipt link is decorative (legacy uses LEFT JOIN).
    console.error(`[service-import/[fNo] tb_receipt_item lookup] fid=${idNum}`, { code: receiptErr.code, message: receiptErr.message });
  }
  const rID = receiptRow?.rid ?? null;

  // forwarder.php L2024-2039: tb_forwarder_tran_th_sub multi-bill warning
  const { data: tranThSub, error: tranThSubErr } = await admin
    .from("tb_forwarder_tran_th_sub")
    .select("ftthhid")
    .eq("fid", idNum)
    .maybeSingle<{ ftthhid: string | number | null }>();
  if (tranThSubErr) {
    // Soft-fail — multi-bill warning is decorative.
    console.error(`[service-import/[fNo] tb_forwarder_tran_th_sub lookup] fid=${idNum}`, { code: tranThSubErr.code, message: tranThSubErr.message });
  }
  let multiBillSiblings: { fID: number; fTrackingCHN: string | null }[] = [];
  if (tranThSub?.ftthhid != null) {
    // forwarder.php L2029-2031 — no FKs declared, parallel fetch:
    //   SELECT fid FROM tb_forwarder_tran_th_sub WHERE ftthhid=… AND fid<>…
    //   then join tb_forwarder.id IN (fids) for the ftrackingchn column.
    const { data: siblingIds, error: siblingErr } = await admin
      .from("tb_forwarder_tran_th_sub")
      .select("fid")
      .eq("ftthhid", tranThSub.ftthhid)
      .neq("fid", idNum);
    if (siblingErr) {
      console.error(`[service-import/[fNo] tb_forwarder_tran_th_sub siblings lookup] ftthhid=${tranThSub.ftthhid}`, { code: siblingErr.code, message: siblingErr.message });
    }
    const fids = ((siblingIds ?? []) as { fid: number }[]).map((s) => s.fid);
    if (fids.length > 0) {
      const { data: fwdRows, error: fwdErr } = await admin
        .from("tb_forwarder")
        .select("id, ftrackingchn")
        .in("id", fids);
      if (fwdErr) {
        console.error(`[service-import/[fNo] tb_forwarder siblings lookup] fids=${JSON.stringify(fids)}`, { code: fwdErr.code, message: fwdErr.message });
      }
      multiBillSiblings = ((fwdRows ?? []) as Array<{
        id: number;
        ftrackingchn: string | null;
      }>).map((r) => ({ fID: r.id, fTrackingCHN: r.ftrackingchn }));
    }
  }

  // forwarder.php L2050-2056: tb_forwarder_driver_item ⋈ tb_forwarder_driver
  const { data: driverRow, error: driverRowErr } = await admin
    .from("tb_forwarder_driver_item")
    .select("fdistatus")
    .eq("fid", idNum)
    .maybeSingle<{ fdistatus: string | null }>();
  if (driverRowErr) {
    // Soft-fail — driver status is decorative for legacy display.
    console.error(`[service-import/[fNo] tb_forwarder_driver_item secondary lookup] fid=${idNum}`, { code: driverRowErr.code, message: driverRowErr.message });
  }

  // ── delivery_feedback — Phase 4a (ops-workflow audit 2026-06-05 §32).
  // Only meaningful when the row is delivered (fstatus='7'). We fetch
  // eagerly so the page can decide between editor / summary in one render.
  let existingFeedback: DeliveryFeedbackExisting | null = null;
  if ((row.fstatus ?? "") === "7") {
    const { data: fb, error: fbErr } = await admin
      .from("delivery_feedback")
      .select("rating, comment, photo_path, created_at, updated_at")
      .eq("fid", idNum)
      .maybeSingle<{
        rating: number | null;
        comment: string | null;
        photo_path: string | null;
        created_at: string;
        updated_at: string;
      }>();
    if (fbErr) {
      // Soft-fail — feedback is supplementary; render the empty form on read failure.
      console.error(`[service-import/[fNo] delivery_feedback lookup] fid=${idNum}`, { code: fbErr.code, message: fbErr.message });
    } else if (fb) {
      existingFeedback = {
        rating: fb.rating,
        comment: fb.comment,
        photoPath: fb.photo_path,
        createdAt: fb.created_at,
        updatedAt: fb.updated_at,
      };
    }
  }

  // Normalised row aliases.
  const fStatusValue = row.fstatus ?? "";
  const fShipBy = row.fshipby ?? "";

  // Self-pickup (fShipBy='PCS' = "รับเองที่โกดัง") always shows Pacred's TH
  // receiving warehouse (สมุทรสาคร — ADDRESSES.warehouseTh) from the SOT
  // constant, never the stored faddress* snapshot. The write paths already
  // write Pacred (actions/forwarder-legacy.ts + cart.ts), but pre-rebrand /
  // legacy-PHP-era rows still carry the old Bangkok "โกดัง PCS · เพชรเกษม 77"
  // address baked into the columns. Self-pickup is a FIXED company address
  // (the inline edit is even blocked for it), so overriding at display keeps
  // old + new orders uniform on Pacred — no prod-data migration needed.
  const isSelfPickup = fShipBy === "PCS";
  const displayAddress = isSelfPickup
    ? {
        name: "รับที่โกดัง Pacred",
        lastname: "",
        no: ADDRESSES.warehouseTh.line,
        subdistrict: ADDRESSES.warehouseTh.subDistrict,
        district: ADDRESSES.warehouseTh.district,
        province: ADDRESSES.warehouseTh.province,
        zipcode: ADDRESSES.warehouseTh.postcode,
        tel: CONTACT.phoneCompanyDisplay,
        tel2: "",
      }
    : {
        name: row.faddressname,
        lastname: row.faddresslastname,
        no: row.faddressno,
        subdistrict: row.faddresssubdistrict,
        district: row.faddressdistrict,
        province: row.faddressprovince,
        zipcode: row.faddresszipcode,
        tel: row.faddresstel,
        tel2: row.faddresstel2,
      };
  const fAmount = row.famount;
  const fWeight = Number(row.fweight ?? 0);
  const fVolume = Number(row.fvolume ?? 0);
  const fWidth = Number(row.fwidth ?? 0);
  const fLength = Number(row.flength ?? 0);
  const fHeight = Number(row.fheight ?? 0);
  const fTotalPrice = Number(row.ftotalprice ?? 0);
  const fTransportPrice = Number(row.ftransportprice ?? 0);
  const fPriceUpdate = Number(row.fpriceupdate ?? 0);
  const fDiscount = Number(row.fdiscount ?? 0);
  const fShippingService = Number(row.fshippingservice ?? 0);
  const priceCrate = Number(row.pricecrate ?? 0);
  const fTransportPriceChnThb = Number(row.ftransportpricechnthb ?? 0);
  const priceOther = Number(row.priceother ?? 0);
  const fUserCompany = row.fusercompany ?? "";

  // ── 2026-06-19 (owner ภูม #2) — import price-breakdown (DISPLAY-ONLY) ──
  // Show the customer HOW the import rate was chosen (น้ำหนัก vs ปริมาตร · ค่าเทียบ
  // vs ราคามากสุด) from the STORED decision — never a recompute. The "ค่าเทียบ on"
  // signal: the per-order override (custom_comparison='1', mig 0187) WINS over the
  // customer's stored userComparison/userComparisonValue (tb_users) — same
  // precedence the live-rate engine uses (live-rate.ts L234-238). READ-ONLY.
  const breakdownUserId = (row.userid ?? "").trim();
  const orderComparisonOn = String(row.custom_comparison ?? "0").trim() === "1";
  let pbComparisonOn = orderComparisonOn;
  let pbThreshold = orderComparisonOn ? Number(row.custom_comparison_value ?? 0) : 0;
  if (!orderComparisonOn && breakdownUserId) {
    const { data: cmpRow, error: cmpErr } = await admin
      .from("tb_users")
      .select("userComparison, userComparisonValue")
      .eq("userID", breakdownUserId)
      .maybeSingle<{ userComparison: string | number | null; userComparisonValue: number | string | null }>();
    if (cmpErr) {
      console.error(`[service-import/[fNo] price-breakdown userComparison] fid=${idNum}`, { code: cmpErr.code, message: cmpErr.message });
    }
    if (String(cmpRow?.userComparison ?? "0").trim() === "1") {
      pbComparisonOn = true;
      pbThreshold = Number(cmpRow?.userComparisonValue ?? 0);
    }
  }
  const priceBreakdown = buildPriceBreakdownDisplay({
    weightKg: fWeight,
    volume: fVolume,
    amount: Number(fAmount ?? 0),
    amountCount: row.famountcount,
    refRate: Number(row.frefrate ?? 0),
    refPrice: row.frefprice,
    totalPrice: fTotalPrice,
    comparisonOn: pbComparisonOn,
    comparisonThreshold: pbThreshold,
  });

  // ── ForwarderRow projection for the <ForwarderPayModal> ──
  // The pay-button on this detail page opens the same multi-bill modal
  // used by /service-import's pay-bar, with this single row seeded.
  // Cross-RSC contract — every field plain-serializable (matches the
  // ForwarderRow type the modal already accepts from the list view).
  const payButtonRow: ForwarderRow = {
    id:                     row.id,
    fdate:                  row.fdate,
    fstatus:                row.fstatus,
    ftrackingchn:           row.ftrackingchn,
    ftrackingchn2:          row.ftrackingchn2,
    ftrackingth:            row.ftrackingth,
    ftransporttype:         row.ftransporttype,
    fshipby:                row.fshipby,
    fdetail:                row.fdetail,
    fcover:                 row.fcover,
    famount:                row.famount,
    fweight:                fWeight,
    fvolume:                fVolume,
    ftotalprice:            fTotalPrice,
    ftransportprice:        fTransportPrice,
    fpriceupdate:           fPriceUpdate,
    fdiscount:              fDiscount,
    fshippingservice:       fShippingService,
    pricecrate:             priceCrate,
    ftransportpricechnthb:  fTransportPriceChnThb,
    priceother:             priceOther,
    fusercompany:           fUserCompany,
    fcredit:                null,
    fcreditdate:            null,
    fdatestatus5:           null,
    fdatetothai:            row.fdatetothai,
    fcabinetnumber:         row.fcabinetnumber,
    fdatecontainerclose:    row.fdatecontainerclose,
    fnote:                  row.fnote,
    fnoteuser:              row.fnoteuser,
    reforder:               row.reforder ?? null,
    adminidcreator:         null,
    promoid:                promoIdStr,
    fproductstype:          row.fproductstype,
  };

  // forwarder.php L1678 — total price with WHT adjustment for tax-exempt customers.
  const priceAllUser = calPriceForwarderSumCompany(
    fUserCompany,
    fPriceUpdate,
    fTotalPrice,
    fTransportPrice,
    fShippingService,
    fDiscount,
    priceCrate,
    fTransportPriceChnThb,
    priceOther,
  );

  // ── 2026-06-19 (Unit A) — ยอดเก็บจริง breakdown (READ-ONLY, customer labels) ──
  // The cost table above shows ftotalprice = freight only; at pay-time admin
  // collects freight + เหมาๆ ฿100 (first PCSF-zero row) − ส่วนลด − หัก ณ ที่จ่าย
  // นิติ 1% (juristic & batch ≥ ฿1,000). We compute the real collect with the SAME
  // canonical fn the admin detail + จ่ายแทนลูกค้า use, so the customer sees 95.10
  // (not 45.10) before paying — no surprise at checkout. isCorporate: a
  // tb_corporate row exists OR fusercompany==='1' (matches the admin derivation).
  const collectUserId = (row.userid ?? "").trim();
  let collectIsCorporate = fUserCompany === "1";
  if (!collectIsCorporate && collectUserId) {
    const { data: corpRow, error: corpErr } = await admin
      .from("tb_corporate")
      .select("id")
      .eq("userid", collectUserId)
      .limit(1)
      .maybeSingle<{ id: number | string }>();
    if (corpErr) {
      console.error(`[tb_corporate collect-check] failed`, { code: corpErr.code, message: corpErr.message, userid: collectUserId });
    }
    if (corpRow) collectIsCorporate = true;
  }
  // 2026-06-23 (เดฟ · owner "เก็บรอบเดียวต่อชิปเมนต์ · ระวังเก็บตังเบิ้ล") — the
  // ยอดเก็บจริง MUST span the WHOLE shipment (all sibling trackings), exactly like
  // ภูม's admin fix (forwarders/[fNo]/page.tsx). The bug: a single-row batch made
  // computeForwarderDebitBatch treat THIS row as the first PCSF-zero row → it added
  // the ฿100 เหมาๆ to EVERY sibling's detail page (6×฿100 across a split shipment).
  // Passing all siblings = one ฿100 เหมาๆ for the batch + the นิติ 1% on the batch
  // total. fetchCountableForwarderSiblings falls back to [landed] on any error.
  const collectSiblings = await fetchCountableForwarderSiblings(admin, {
    id: row.id, ftrackingchn: row.ftrackingchn, userid: row.userid, fweight: row.fweight,
    fshipby: row.fshipby, ftotalprice: fTotalPrice, ftransportprice: fTransportPrice,
    fpriceupdate: fPriceUpdate, fshippingservice: fShippingService, pricecrate: priceCrate,
    ftransportpricechnthb: fTransportPriceChnThb, priceother: priceOther, fdiscount: fDiscount,
  });
  const collectRows: ForwarderDebitRow[] = collectSiblings.map((s) => ({
    id: s.id, fshipby: s.fshipby, ftotalprice: s.ftotalprice, ftransportprice: s.ftransportprice,
    fpriceupdate: s.fpriceupdate, fshippingservice: s.fshippingservice, pricecrate: s.pricecrate,
    ftransportpricechnthb: s.ftransportpricechnthb, priceother: s.priceother, fdiscount: s.fdiscount,
  }));
  const collectBatch = computeForwarderDebitBatch(collectRows, {
    userId: collectUserId,
    isCorporate: collectIsCorporate,
  });
  // Collapse the per-line breakdowns into ONE shipment breakdown; the total is the
  // authoritative batch total (= the รายการสินค้า table Σ + one ฿100 เหมาๆ).
  const collect =
    collectBatch.lines.length > 0
      ? collectBatch.lines.reduce(
          (acc, l) => ({
            freight: acc.freight + l.breakdown.freight,
            otherCharges: acc.otherCharges + l.breakdown.otherCharges,
            discount: acc.discount + l.breakdown.discount,
            maoFee: acc.maoFee + l.breakdown.maoFee,
            wht1pct: acc.wht1pct + l.breakdown.wht1pct,
            total: collectBatch.total_thb,
          }),
          { freight: 0, otherCharges: 0, discount: 0, maoFee: 0, wht1pct: 0, total: collectBatch.total_thb },
        )
      : null;
  const baht2 = (n: number) =>
    `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // forwarder.php L1808-1820 — ETA range.
  const fDateToThai = row.fdatetothai;
  let etaFrom = "";
  let etaTo = "";
  if (fDateToThai && fDateToThai !== "0000-00-00") {
    const baseDmy = dmy(fDateToThai + "T00:00:00");
    if (row.ftransporttype === "1") {
      etaFrom = baseDmy;
      etaTo = modifyDmy(baseDmy, 2);
    } else {
      etaFrom = baseDmy;
      etaTo = modifyDmy(baseDmy, 4);
    }
  }

  // forwarder.php L2080-2092 — "วันที่ปิดตู้".
  let containerCloseStr = "";
  if (row.fdatecontainerclose) {
    containerCloseStr = dmy(row.fdatecontainerclose);
  } else if (fDateToThai && fDateToThai !== "0000-00-00") {
    const baseDmy = dmy(fDateToThai + "T00:00:00");
    if (row.ftransporttype === "1") {
      containerCloseStr = modifyDmy(baseDmy, -5);
    } else {
      containerCloseStr = modifyDmy(baseDmy, -12);
    }
  }

  // forwarder.php L2103-2109 — cover image resolution.
  const coverUrl = (() => {
    if (!row.fcover) return "/legacy/pcs/shops/default.png";
    if (/https|http/.test(row.fcover)) return row.fcover;
    return convertIMGCHN(row.fcover);
  })();

  // Physical journey done-state is driven by the per-stage date stamps
  // (set by the warehouse scan), NOT the fstatus integer — see computeSteps.
  const steps = computeSteps(fStatusValue, FID_driver2, {
    s2: row.fdatestatus2,
    s3: row.fdatestatus3,
    s4: row.fdatestatus4,
  });

  // A CREDIT order (fcredit='1') is flipped to fstatus=6 at credit-grant
  // BEFORE the goods physically arrive. When the arrival stamp (fdatestatus4)
  // is still empty, show a clear "ติดเครดิต · รอสินค้าถึงไทย" chip instead of
  // a bare "เตรียมส่ง" that misleads the customer about where the goods are.
  const isCreditAwaitingArrival =
    row.fcredit === "1" && !hasRealStamp(row.fdatestatus4);

  // Real per-stage dates for the 8-step timeline (index 0..7 → step 1..7).
  // Only the physical milestones carry a stamp: index 1=ถึงโกดังจีน (fds2),
  // 2=กำลังส่งมาไทย (fds3), 3=สินค้าถึงไทย (fds4). Empty otherwise.
  const stepDates: (string | null)[] = [
    null,
    hasRealStamp(row.fdatestatus2) ? dmy(row.fdatestatus2) : null,
    hasRealStamp(row.fdatestatus3) ? dmy(row.fdatestatus3) : null,
    hasRealStamp(row.fdatestatus4) ? dmy(row.fdatestatus4) : null,
    null,
    null,
    null,
    hasRealStamp(row.fdatestatus7) ? dmy(row.fdatestatus7) : null,
  ];

  const refOrderEl =
    row.reforder && row.reforder !== "" ? (
      <div>
        <Link href={`/service-order/${row.reforder}`}>
          <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-700 border border-sky-200">
            {t("refOrderLabel")} : {row.reforder}
          </span>
        </Link>
      </div>
    ) : null;

  // forwarder.php L1764-1782 — header right column status / driver display.
  // forwarder.php L1788-1804 — receipt link (only when rID exists and
  //   fStatus>=6). The legacy emits an <a> wrapping the whole block but the
  //   button only renders when fStatus>=6 (`$row['fStatus']<6` returns nothing).

  return (
    <div className="pcs-legacy pr-forwarder-detail">
      {/* Legacy PCS theme — kept ONLY for the magnific-popup image viewer
          hook (`image-popup-vertical-fit`) + any residual legacy class.
          The page chrome below is a Tailwind rebuild (เดฟ 2026-05-30 —
          ปอน: "rebuild chrome เป็น tailwind mobile-first ห้ามแก้ relation /
          query / href / hook"). Every href/id/name/data-* + the inline
          edit forms + pay button + receipt link wiring preserved verbatim;
          only Bootstrap-4 presentation classes are swapped for Tailwind. */}
      <link rel="stylesheet" href="/legacy/pcs/service-import.css" />

      {/* Page content — Tailwind rebuild. Wrapped in `.pcs-content-pad` so
          the (protected) layout's desktop padding (sidebar + FloatingTabs
          clearance) kicks in automatically. */}
      {/* pb-32 on mobile so the last content clears the floating LINE bubble
          + the fixed bottom nav (otherwise it sits hidden behind them). */}
      <div className="pcs-content-pad w-full px-3 md:px-6 pt-3 pb-32 md:py-6">
        {/* L1707-1719 — breadcrumb header */}
        <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-xs md:text-sm text-muted">
          <Link href="/dashboard" className="hover:text-red-600 transition-colors">
            <span className="menu-home">{t("breadcrumbHome")}</span>
          </Link>
          <span aria-hidden className="text-border">/</span>
          <Link href="/service-import" className="hover:text-red-600 transition-colors">
            {t("breadcrumbImportList")}
          </Link>
          <span aria-hidden className="text-border">/</span>
          <span className="font-medium text-foreground">#{row.id}</span>
        </nav>

        {/* L1720 — detail card */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-4 md:p-6">
          {/* ── Header row ── forwarder.php L1748-1825 ── */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg md:text-xl font-bold text-foreground">
                {t("orderTitle")}{" "}
                <span className="text-red-600">
                  {t("orderNumberLabel")} #{row.id}
                  <TagPro id={promoIdStr} />
                </span>
              </h3>
              {row.ftrackingchn2 && row.ftrackingchn2 !== "" ? (
                <p className="mt-1 text-base md:text-lg font-semibold text-red-600 break-all">
                  {t("trackingNumberLabel")} {row.ftrackingchn2}
                </p>
              ) : (
                <p className="mt-1 text-base md:text-lg font-semibold text-red-600 break-all">
                  {t("trackingNumberLabel")} {row.ftrackingchn}
                </p>
              )}
              {trackingBarcode && (
                <div className="mt-1">
                  {/* forwarder.php L1762 / detail.php L81 — the tracking
                      Code128 barcode. Legacy rendered the live
                      pcscargo.co.th/include/barcode.php PNG; now rendered
                      LOCALLY as an inline Code128 SVG (see lib/barcode.ts) —
                      same symbology + same value, no external request, no
                      brand leak. The tracking number text is shown above. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="barcode-forwader h-12 w-auto max-w-full"
                    alt={String(row.ftrackingchn)}
                    src={trackingBarcode}
                  />
                </div>
              )}
            </div>
            <div className="md:text-right shrink-0">
              {FID_driver2 === 1 ? (
                <>
                  <p className="flex items-center gap-2 md:justify-end text-sm md:text-base font-semibold text-foreground">
                    <b className="font-bold">{t("statusLabel")} :</b>
                    <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-100 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-700">
                      {t("stepDelivering")}
                    </span>
                  </p>
                  {fShipBy === "PCSF" ? (
                    <p className="mt-1 text-sm text-foreground">
                      <b className="font-semibold">{t("shipByLabel")} : </b>
                      {adminName} {t("telPrefix")}
                      <a href={`tel:${adminTel}`} className="text-red-600"> {adminTel}</a>
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-foreground">
                      <b className="font-semibold">{t("shipByLabel")} : </b>
                      {nameShipBy(fShipBy, t)}
                    </p>
                  )}
                </>
              ) : (
                <p className="flex items-center gap-2 md:justify-end text-sm md:text-base font-semibold text-foreground">
                  <b className="font-bold">{t("statusLabel")} :</b>
                  {statusForwarderBadge(fStatusValue, t)}
                  <Explain
                    align="right"
                    def="สถานะปัจจุบันของสินค้าในเส้นทาง: รอเข้าโกดังจีน → ถึงโกดังจีน → กำลังส่งมาไทย → ถึงไทย → รอชำระเงิน → เตรียมส่ง → ส่งแล้ว"
                  />
                </p>
              )}
              {/* Credit-before-arrival chip — a credit order is flipped to
                  fStatus=6 ("เตรียมส่ง") at credit-grant before the goods
                  physically arrive. Show where the goods REALLY are so the
                  bare "เตรียมส่ง" badge doesn't mislead the customer. */}
              {isCreditAwaitingArrival && (
                <p className="mt-1.5 flex md:justify-end">
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                    <i className="mdi mdi-truck-fast-outline" aria-hidden></i>
                    ติดเครดิต · รอสินค้าถึงไทย
                  </span>
                </p>
              )}
              <div className="flex flex-col items-start gap-2 md:items-end">
                {/* L1788-1804 — receipt link (only when rID is set
                    AND fStatus>=6, per the legacy `$row['fStatus']<6`
                    branch which renders nothing). */}
                {rID && Number(fStatusValue) >= 6 && (
                  <>
                    {/* Legacy linked to pcscargo.co.th/member/printReceiptF.php
                       — rewritten to the internal Pacred print route
                       /freight/receipts/print/{rID} so the customer
                       stays inside Pacred (no bounce to legacy site). */}
                    <a
                      href={`/freight/receipts/print/${rID}?type=1`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.98] transition-all"
                    >
                      <i className="mdi mdi-check-circle-outline"></i>{" "}
                      {t("receiptLink")}
                    </a>
                    {/* invoiceF.php URL mirror — customer self-serve
                       standalone invoice PDF for the forwarder order.
                       Closes the 2026-05-22 gap audit §1 finding
                       ("Customer-side standalone invoice PDF for
                       forwarder orders … no customer download
                       endpoint"). Legacy URL is invoiceF.php?id=<rID>;
                       Pacred mirrors it at /invoiceF?id=<rID> which
                       forwards to the existing /freight/invoice/[id]
                       1:1 transcription. */}
                    <a
                      href={`/invoiceF?id=${encodeURIComponent(rID)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm hover:bg-emerald-50 active:scale-[0.98] transition-all"
                    >
                      <i className="mdi mdi-file-document-outline"></i>{" "}
                      ใบเสร็จรับเงิน (พิมพ์ / บันทึก PDF)
                    </a>
                  </>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">
                {row.fdateadminstatus &&
                  dmyHms(row.fdateadminstatus) !==
                    "00/00/0000 00:00:00" &&
                  t("lastUpdated", { time: dmyHms(row.fdateadminstatus) })}
              </p>
              {etaFrom !== "" && (
                <p className="mt-1 text-sm text-foreground">
                  {t("etaLabel")} :{" "}
                  <span className="text-sky-600">
                    {etaFrom} {t("etaTo")} {etaTo}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* ── 8-step process tracker ── forwarder.php L1826-1906 ──
              4-col grid → 2 rows of 4 on mobile, single row of 8 on desktop
              (ปอน 2026-06-08: "เรียงตามในภาพ" — เลิก horizontal-scroll ที่พังบน
              มือถือ ให้ wrap เป็นตาราง 4×2). Connector lines dropped (don't
              grid-wrap cleanly); each step = icon+label coloured by state.
              Legacy tab hooks (role / aria-controls / data-toggle) preserved. */}
          <div className="mt-4">
            <ul
              className="mx-auto grid max-w-md grid-cols-4 gap-x-1 gap-y-6 md:max-w-5xl md:grid-cols-8"
              role="tablist"
            >
              {STEPS.map((step, i) => {
                const state = steps[i];
                const innerSpanClass =
                  state === "active" ? "active show" : "";
                const innerIconClass =
                  state === "active" && i === 3 ? "active show" : "";
                const done = state === "visited";
                const active = state === "active";
                return (
                  <li
                    key={step.ctrl}
                    role="presentation"
                    className={`relative flex flex-col items-center text-center px-0.5 ${state}`}
                  >
                    {/* connector rail (behind the icon) — drawn to the LEFT of
                        every step except the FIRST of each grid row, so it joins
                        steps WITHIN a row but never wraps across rows. Mobile is
                        4-col → steps 1 & 5 (i=0,4) start a row → no rail; on
                        desktop (8-col single row) step 5 (i=4) is mid-row so its
                        rail re-appears via `md:block`. Red once the step is
                        reached, grey otherwise (ปอน 2026-06-08 — "ทำเส้นแดงๆ"). */}
                    {i !== 0 && (
                      <span
                        aria-hidden
                        className={`absolute top-8 right-1/2 left-[-50%] h-0.5 md:top-10 ${
                          i === 4 ? "hidden md:block" : ""
                        } ${done || active ? "bg-red-500" : "bg-border"}`}
                      />
                    )}
                    <span
                      aria-controls={step.ctrl}
                      role="tab"
                      data-toggle="tab"
                      className={`relative z-10 flex flex-col items-center ${innerSpanClass}`}
                    >
                      <i
                        aria-hidden="true"
                        className={`flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-full border-2 ${
                          active
                            ? "border-red-600 bg-red-50 ring-2 ring-red-200"
                            : done
                              ? "border-red-500 bg-red-50"
                              : "border-gray-300 bg-white dark:bg-surface"
                        } ${innerIconClass}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className={`img-fluid p-img-icon object-contain h-11 w-11 md:h-14 md:w-14 ${
                            step.ctrl === "step62" ? "p-0 " : ""
                          }${done || active ? "" : "grayscale opacity-70"}`}
                          src={step.icon.startsWith("/") ? step.icon : `${ICON_BASE}${step.icon}`}
                          alt=""
                        />
                      </i>
                      <p
                        className={`mt-2 text-xs leading-tight ${
                          active
                            ? "font-bold text-red-600"
                            : done
                              ? "font-medium text-foreground"
                              : "text-muted"
                        }`}
                      >
                        {t(step.labelKey)}
                      </p>
                      {/* Real per-stage date (warehouse scan stamp). Shows
                          WHEN a physical milestone actually happened, so the
                          customer can see where the goods are + when. */}
                      {stepDates[i] && (
                        <span className="mt-0.5 block text-[11px] font-medium text-muted notranslate">
                          {stepDates[i]}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <hr className="my-4 border-t border-dashed border-border" />

                        {/* ── Metadata two-col ── forwarder.php L1909-2124 ── */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                          {/* LEFT col — L1910-2064 */}
                          <div className="space-y-2.5">
                            {refOrderEl}
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">{t("createdDateLabel")} : </b>
                              {t("dateTimeWithHour", { value: dmyHms(row.fdate) })}
                            </p>
                            <div className="text-sm">
                              <b className="font-semibold text-foreground">{t("carrierLabel")} : </b>
                              <ServiceImportEditShipByForm
                                forwarderId={row.id}
                                currentFShipBy={fShipBy}
                                currentLabel={nameShipBy(fShipBy, t)}
                                options={
                                  /* forwarder.php L1593 → `optionHShipBy2()` —
                                     legacy lists every carrier from
                                     NAME_SHIP_BY (function.php L91-143). The
                                     ZIP-gating the legacy applies is admin-
                                     only context the customer doesn't see;
                                     the customer-side dropdown enumerates the
                                     full list, mirroring the legacy fallback
                                     behaviour when no ZIP filter applies. */
                                  Object.entries(NAME_SHIP_BY).map(([code, label]) => ({
                                    code,
                                    label,
                                  }))
                                }
                                isEditable={Number(fStatusValue) < 4}
                              />
                            </div>
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">{t("payMethodLabel")} : </b>
                              {namePayMethod(row.paymethod, t)}
                            </p>
                            <div className="text-sm">
                              <b className="font-semibold text-foreground">{t("deliveryAddressLabel")} : </b>
                              <div className="mt-1 text-foreground leading-relaxed">
                                {/* forwarder.php L1663 — CONCAT 'คุณ' addressName …
                                    Self-pickup (PCS) → Pacred warehouse from SOT
                                    (see displayAddress above), else stored snapshot. */}
                                {t("addressNamePrefix")}{displayAddress.name} {displayAddress.lastname}
                                <br />
                                {displayAddress.no} {t("addressSubdistrict")} {displayAddress.subdistrict}
                                <br /> {t("addressDistrict")} {displayAddress.district} {t("addressProvince")}{" "}
                                {displayAddress.province} {displayAddress.zipcode}
                                <br />
                                {t("telPrefix")} {displayAddress.tel}, {displayAddress.tel2}
                                <ServiceImportEditAddressForm
                                  forwarderId={row.id}
                                  options={addressOptions}
                                  isEditable={Number(fStatusValue) < 4}
                                />
                              </div>
                            </div>
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">{t("trackingThLabel")} : </b>
                              {row.ftrackingth}
                            </p>
                            {/* External-courier (Lalamove / Grab / รถเหมา)
                                last-mile tracking link — set by ops on the
                                dispatch page (2026-06-08 gap analysis #2). */}
                            {row.courier_tracking_url && (
                              <p className="text-sm">
                                <a
                                  href={row.courier_tracking_url}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
                                >
                                  <i className="fas fa-truck" aria-hidden></i>
                                  {t("courierTrackingLink")}
                                </a>
                              </p>
                            )}
                            {multiBillSiblings.length > 0 && (
                              <div className="rounded-lg bg-red-50 border border-red-200 p-2.5">
                                <p className="text-sm font-semibold text-red-700">
                                  {t("multiBillWarning")}
                                </p>
                                <div className="mt-1 space-y-0.5">
                                  {multiBillSiblings.map((s, i) => (
                                    <div key={s.fID}>
                                      <Link
                                        href={`/service-import/${s.fID}`}
                                        target="_blank"
                                        className="text-sm text-red-600 hover:underline"
                                      >
                                        {i + 1}. {t("siblingItemLabel")} #{s.fID} {t("siblingTrackingLabel")} :{" "}
                                        {s.fTrackingCHN}
                                      </Link>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {row.fphotoend && row.fphotoend !== "" && (
                              <div>
                                <p className="text-sm font-semibold text-foreground">
                                  {t("deliveryPhotoLabel")} :
                                </p>
                                <a
                                  className="image-popup-vertical-fit el-link mt-1 inline-block"
                                  href={legacyMemberUrl(`images/shops/${row.fphotoend}`)}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={legacyMemberUrl(`images/shops/${row.fphotoend}`)}
                                    alt=""
                                    className="w-full max-w-[200px] rounded-lg border border-border object-cover"
                                  />
                                </a>
                              </div>
                            )}
                            {!row.fphotoend && fStatusValue === "7" && (
                              <p className="text-sm text-red-600">{t("noPhotoYet")}</p>
                            )}
                            {driverRow?.fdistatus === "2" && (
                              <p className="text-sm text-foreground">
                                {t("deliveredTimeLabel")} : {row.fdatestatus7}
                              </p>
                            )}
                          </div>

                          {/* RIGHT col — L2065-2123 */}
                          <div className="space-y-2.5 md:text-right">
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">{t("trackingChnLabel")} : </b>
                              <span className="text-red-600 break-all" id="text-fTrackingCHN">
                                {row.ftrackingchn}
                              </span>
                            </p>
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">{t("transportTypeLabel")} : </b>
                              <span id="text-fTransportType">
                                {row.ftransporttype === "1"
                                  ? t("transportByTruck")
                                  : t("transportBySea")}
                              </span>
                            </p>
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">{t("crateLabel")} : </b>
                              {nameCrate(row.crate, t)}
                            </p>
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">{t("warehouseChinaLabel")} : </b>
                              {nameWarehouseChina(row.fwarehousechina, t)}
                            </p>
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">{t("cabinetNumberLabel")} : </b>
                              {row.fcabinetnumber}
                            </p>
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">{t("containerCloseDateLabel")} : </b>
                              {containerCloseStr}
                            </p>
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">{t("amountLabel")} : </b>
                              {t("boxCount", { count: fAmount })}
                            </p>
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">{t("productsTypeLabel")} : </b>
                              {nameProductsType(row.fproductstype, t)}
                            </p>
                            <div className="rounded-lg border border-border bg-surface-alt/40 p-3 md:text-left">
                              <p className="text-sm text-foreground">
                                {row.fdetail}
                              </p>
                              <a
                                className="image-popup-vertical-fit el-link mt-2 inline-block"
                                href={coverUrl}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={coverUrl}
                                  alt=""
                                  className="w-full max-w-[200px] rounded-lg border border-border object-cover"
                                />
                              </a>
                            </div>
                            {row.fnoteuser === "2" && row.fnote && row.fnote !== "" && (
                              <div className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white md:text-left">
                                {t("adminNotePrefix")} {row.fnote}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ── Cost / item table ── forwarder.php L2125-2229 ── */}
                        {Number(fStatusValue) >= 5 ? (
                          <>
                            <hr className="my-4 border-t border-dashed border-border" />
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                              <h4 className="text-base md:text-lg font-bold text-red-600">
                                {t("productDetailHeading")}
                              </h4>
                              {fStatusValue === "5" && (
                                <div className="md:text-right">
                                  <ServiceImportPayButton
                                    row={payButtonRow}
                                    isJuristic={fUserCompany === "1"}
                                  />
                                </div>
                              )}
                            </div>

                            {/* Mobile: stacked cost card (md:hidden) — same
                                figures as the desktop table, definition-list
                                style so it never h-scrolls at 360px. */}
                            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border bg-surface-alt/40 p-3 text-sm md:hidden">
                              <dt className="text-muted">{t("colBoxCount")}</dt>
                              <dd className="text-right font-medium tabular-nums">{fAmount}</dd>
                              <dt className="text-muted">{t("colWeight")}</dt>
                              <dd className="text-right font-medium tabular-nums">{fWeight} kg.</dd>
                              <dt className="text-muted">{t("colDimensions")}</dt>
                              <dd className="text-right font-medium tabular-nums">{fWidth} × {fLength} × {fHeight} {t("unitCm")}</dd>
                              <dt className="text-muted">{t("colVolume")}</dt>
                              <dd className="text-right font-medium tabular-nums">{fVolume}</dd>
                              <dt className="text-muted">{t("colPriceBasis")}</dt>
                              <dd className="text-right font-medium">{nameRefPrice(row.frefprice, t)}</dd>
                              <dt className="text-muted">{t("colImportRate")}</dt>
                              <dd className="text-right font-medium tabular-nums">฿{numberFormat2(Number(row.frefrate ?? 0))}</dd>
                              <dt className="text-muted">{t("colImportCost")}</dt>
                              <dd className="text-right font-medium tabular-nums">฿{numberFormat2(fTotalPrice)}</dd>
                              <dt className="text-muted">{t("colPriceAdjust")}</dt>
                              <dd className="text-right font-medium tabular-nums">฿{numberFormat2(fPriceUpdate)}</dd>
                              <dt className="text-muted">{t("colCrate")}</dt>
                              <dd className="text-right font-medium tabular-nums">฿{numberFormat2(priceCrate)}</dd>
                              <dt className="text-muted">{t("colChinaTransport")}</dt>
                              <dd className="text-right font-medium tabular-nums">฿{numberFormat2(fTransportPriceChnThb)}</dd>
                              <dt className="text-muted">{t("colThaiTransport")}</dt>
                              <dd className="text-right font-medium tabular-nums">฿{numberFormat2(fTransportPrice)}</dd>
                              <dt className="text-muted">{t("colService")}</dt>
                              <dd className="text-right font-medium tabular-nums">฿{numberFormat2(fShippingService)}</dd>
                              <dt className="text-muted">{t("colOther")}</dt>
                              <dd className="text-right font-medium tabular-nums">฿{numberFormat2(priceOther)}</dd>
                              <dt className="text-muted">{t("colDiscount")}</dt>
                              <dd className="text-right font-medium tabular-nums">฿{numberFormat2(fDiscount)}</dd>
                              {/* owner 2026-06-24: always show (— when no WHT applies). */}
                              <dt className="text-muted">LESS WITHHOLDING TAX 1%</dt>
                              <dd className="text-right font-medium tabular-nums">
                                {fUserCompany === "1" ? (
                                  <>
                                    ฿
                                    {numberFormat2(
                                      (fTotalPrice +
                                        fTransportPrice +
                                        fPriceUpdate +
                                        fShippingService +
                                        fTransportPriceChnThb +
                                        priceCrate +
                                        priceOther -
                                        fDiscount) *
                                        0.01,
                                    )}
                                  </>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </dd>
                              <dt className="font-semibold text-foreground border-t border-border pt-2">{t("colTotalPrice")}</dt>
                              <dd className="text-right font-bold tabular-nums text-red-600 border-t border-border pt-2">
                                ฿{numberFormat2(priceAllUser)}
                              </dd>
                            </dl>

                            {/* Desktop: full 14/15-column cost table. */}
                            <div className="mt-3 hidden md:block overflow-x-auto rounded-xl border border-border">
                              <table
                                className="dataTable pcs-detail-table w-full text-sm border-collapse"
                              >
                                <thead>
                                  <tr className="text-center bg-surface-alt">
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">
                                      {t("colBoxCount")}
                                    </th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">{t("colWeight")}</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">{t("colVolume")}</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">{t("colPriceBasis")}</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">{t("colImportRate")}</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">{t("colImportCost")}</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">{t("colPriceAdjust")}</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">{t("colCrate")}</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">{t("colChinaTransport")}</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">{t("colThaiTransport")}</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">{t("colService")}</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">{t("colOther")}</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">{t("colDiscount")}</th>
                                    {/* owner 2026-06-24: ALWAYS show this column for every
                                        customer (นิติ/บุคคล) — when no WHT applies the cell is
                                        just blank ("—"), the column never disappears. */}
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">
                                      LESS
                                      <br /> WITHHOLDING <br />
                                      TAX 1%
                                    </th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">{t("colTotalPrice")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="text-foreground">
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">{fAmount}</td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">{fWeight} kg.</td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">{fVolume}</td>
                                    <td className="px-2 py-2 text-center border-b border-border">
                                      {nameRefPrice(row.frefprice, t)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      ฿{numberFormat2(Number(row.frefrate ?? 0))}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      ฿{numberFormat2(fTotalPrice)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      ฿{numberFormat2(fPriceUpdate)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      ฿{numberFormat2(priceCrate)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      ฿{numberFormat2(fTransportPriceChnThb)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      ฿{numberFormat2(fTransportPrice)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      ฿{numberFormat2(fShippingService)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      ฿{numberFormat2(priceOther)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      ฿{numberFormat2(fDiscount)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      {fUserCompany === "1" ? (
                                        <>
                                          ฿
                                          {numberFormat2(
                                            (fTotalPrice +
                                              fTransportPrice +
                                              fPriceUpdate +
                                              fShippingService +
                                              fTransportPriceChnThb +
                                              priceCrate +
                                              priceOther -
                                              fDiscount) *
                                              0.01,
                                          )}
                                        </>
                                      ) : (
                                        <span className="text-muted">—</span>
                                      )}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums font-bold text-red-600 border-b border-border">
                                      ฿{numberFormat2(priceAllUser)}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>

                            {/* ── 🧮 ราคานำเข้าจีน-ไทย · how the rate was chosen ──
                               owner ภูม #2 (2026-06-19). DISPLAY-ONLY: shows the
                               customer the SAME "หาค่าเทียบ / คิดตาม / ระบบเลือก"
                               reasoning the admin box renders (per-tracking-editor
                               L345-383) — from the STORED frefrate/frefprice/
                               ftotalprice decision. NO money recompute, NO write.
                               Customer-friendly framing: "เราเลือกเรทที่คุ้มที่สุด". ── */}
                            {priceBreakdown && (
                              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                                <div className="flex items-center gap-2">
                                  <span aria-hidden className="text-base">🧮</span>
                                  <h5 className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                                    {t("priceBreakdownHeading")}
                                  </h5>
                                </div>
                                <p className="mt-0.5 text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
                                  {t("priceBreakdownIntro")}
                                </p>

                                <div className="mt-2 space-y-1 text-xs font-mono tabular-nums text-foreground">
                                  {priceBreakdown.comparisonOn && (
                                    <p className="text-amber-700 dark:text-amber-400">
                                      {t("priceBreakdownCompare", {
                                        weight: numberFormat2(priceBreakdown.weightKg),
                                        cbm: numberFormat2(priceBreakdown.billableCbm),
                                        ratio: numberFormat2(priceBreakdown.kgPerCbm),
                                        threshold: String(priceBreakdown.threshold),
                                        basis: priceBreakdown.byWeight
                                          ? t("priceBreakdownByWeight")
                                          : t("priceBreakdownByVolume"),
                                      })}
                                    </p>
                                  )}
                                  {priceBreakdown.basis === "kg" ? (
                                    <p>
                                      {t("priceBreakdownLineWeight", {
                                        weight: numberFormat2(priceBreakdown.weightKg),
                                      })}{" "}
                                      × {numberFormat2(priceBreakdown.rate)} ={" "}
                                      <strong>฿{numberFormat2(priceBreakdown.transport)}</strong>
                                    </p>
                                  ) : (
                                    <p>
                                      {t("priceBreakdownLineVolume", {
                                        cbm: numberFormat2(priceBreakdown.billableCbm),
                                      })}{" "}
                                      × {numberFormat2(priceBreakdown.rate)} ={" "}
                                      <strong>฿{numberFormat2(priceBreakdown.transport)}</strong>
                                    </p>
                                  )}
                                  <p className="inline-flex flex-wrap items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white">
                                    {t("priceBreakdownChosen", {
                                      mode: priceBreakdown.comparisonOn
                                        ? t("priceBreakdownModeCompare")
                                        : t("priceBreakdownModeCheapest"),
                                    })}{" "}
                                    → ฿{numberFormat2(priceBreakdown.transport)}
                                  </p>
                                </div>

                                <p className="mt-2 text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
                                  ✓ {t("priceBreakdownReassure")}
                                </p>
                              </div>
                            )}

                            {/* ── ยอดเก็บจริง (แจงรายละเอียดค่า) — Unit A · owner
                               2026-06-19 "แจงค่าหน้าอื่นด้วย". READ-ONLY. Shown while
                               รอชำระเงิน (fstatus='5') so the customer sees the real
                               collect (freight + เหมาๆ ฿100 − ส่วนลด − นิติ 1%),
                               not the freight-only number in the table above. ── */}
                            {fStatusValue === "5" && collect && Number.isFinite(collect.total) && (
                              <div className="mt-3 rounded-xl border border-red-200 bg-red-50/40 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-sm font-bold text-red-700">ยอดที่ต้องชำระจริง</span>
                                  <span className="text-lg font-mono font-bold text-red-600">{baht2(collect.total)}</span>
                                </div>
                                <dl className="mt-2 space-y-1 text-sm">
                                  <div className="flex items-center justify-between gap-3">
                                    <dt className="text-muted">ค่าขนส่งสินค้า</dt>
                                    <dd className="font-mono tabular-nums">{baht2(collect.freight)}</dd>
                                  </div>
                                  {collect.otherCharges > 0 && (
                                    <div className="flex items-center justify-between gap-3">
                                      <dt className="text-muted">+ บริการอื่นๆ</dt>
                                      <dd className="font-mono tabular-nums">{baht2(collect.otherCharges)}</dd>
                                    </div>
                                  )}
                                  {collect.maoFee > 0 && (
                                    <div className="flex items-center justify-between gap-3">
                                      <dt className="text-sky-600">
                                        <Explain label={<span className="text-sky-600">+ ค่าส่งเหมาๆ</span>} def={GUIDE.mao_fee} />
                                      </dt>
                                      <dd className="font-mono tabular-nums text-sky-600">{baht2(collect.maoFee)}</dd>
                                    </div>
                                  )}
                                  {collect.discount > 0 && (
                                    <div className="flex items-center justify-between gap-3">
                                      <dt className="text-emerald-600">− ส่วนลด</dt>
                                      <dd className="font-mono tabular-nums text-emerald-600">{baht2(collect.discount)}</dd>
                                    </div>
                                  )}
                                  {collect.wht1pct > 0 && (
                                    <div className="flex items-center justify-between gap-3">
                                      <dt className="text-orange-600">
                                        <Explain label={<span className="text-orange-600">− หัก ณ ที่จ่าย นิติ 1%</span>} def={GUIDE.wht_1pct_bill} />
                                      </dt>
                                      <dd className="font-mono tabular-nums text-orange-600">{baht2(collect.wht1pct)}</dd>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between gap-3 border-t border-red-200 pt-1.5 font-semibold text-foreground">
                                    <dt>รวมที่ต้องชำระ</dt>
                                    <dd className="font-mono tabular-nums text-red-600">{baht2(collect.total)}</dd>
                                  </div>
                                </dl>
                                {collect.maoFee > 0 && (
                                  <p className="mt-2 text-[11px] text-muted">
                                    ℹ️ มีค่าส่งเหมาๆ ฿100 รวมในยอดชำระ (ยังไม่แสดงในตารางค่าใช้จ่ายด้านบนจนกว่าจะชำระ)
                                  </p>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <hr className="my-4 border-t border-dashed border-border" />
                            <h4 className="text-base md:text-lg font-bold text-red-600">
                              {t("productDetailHeading")}
                            </h4>

                            {/* Mobile: item card (md:hidden). */}
                            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border bg-surface-alt/40 p-3 text-sm md:hidden">
                              <dt className="text-muted">#</dt>
                              <dd className="text-right font-medium">1</dd>
                              <dt className="text-muted">{t("colItemDetail")}</dt>
                              <dd className="text-right font-medium break-words">{row.fdetail}</dd>
                              <dt className="text-muted">{t("colBoxCount")}</dt>
                              <dd className="text-right font-medium tabular-nums">{fAmount}</dd>
                              <dt className="text-muted">{t("colWeight")}</dt>
                              <dd className="text-right font-medium tabular-nums">{fWeight} kg.</dd>
                              <dt className="text-muted">{t("colDimensions")}</dt>
                              <dd className="text-right font-medium tabular-nums">{fWidth} × {fLength} × {fHeight} {t("unitCm")}</dd>
                              <dt className="text-muted">{t("colVolume")}</dt>
                              <dd className="text-right font-medium tabular-nums">
                                {row.famountcount === "1"
                                  ? fVolume
                                  : fVolume * Number(fAmount)}{" "}
                                CBM
                              </dd>
                            </dl>

                            {/* Desktop: 5-column item table. */}
                            <div className="mt-3 hidden md:block overflow-x-auto rounded-xl border border-border">
                              <table
                                className="dataTable pcs-detail-table w-full text-sm border-collapse"
                              >
                                <thead>
                                  <tr className="text-center bg-surface-alt">
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border">#</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border">{t("colItemDetail")}</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">{t("colBoxCount")}</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border">{t("colWeight")}</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">
                                      <Explain label={t("colVolume")} def={GUIDE.cbm} />
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="text-foreground">
                                    <td className="px-2 py-2 text-center border-b border-border">1</td>
                                    <td className="px-2 py-2 border-b border-border" title="">{row.fdetail}</td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">{fAmount}</td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">{fWeight} kg.</td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      {row.famountcount === "1"
                                        ? fVolume
                                        : fVolume * Number(fAmount)}{" "}
                                      CBM
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </>
                        )}

                        {/* ── Delivery feedback (Phase 4a · ops-workflow audit 2026-06-05 §32)
                            — only when fstatus=7 (delivered). Customer can leave
                            rating + comment + photo (all optional · ≥ 1 required). ── */}
                        {fStatusValue === "7" && (
                          <DeliveryFeedbackCard
                            fid={row.id}
                            existing={existingFeedback}
                          />
                        )}

                        {/* ── Missing/damaged item report (2026-06-08 gap #4)
                            — only when delivered. Opens a cs_followup ops
                            ticket on the work-board. ── */}
                        {fStatusValue === "7" && (
                          <MissingItemReportCard fid={row.id} />
                        )}

                        {/* ── Footer back button ── forwarder.php L2231-2240 ── */}
                        <hr className="my-4 border-t border-border" />
                        <div className="md:text-right">
                          <Link
                            href={`/service-import?q=${fStatusValue}`}
                            className="inline-flex w-full md:w-auto items-center justify-center gap-1.5 rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 active:scale-[0.98] transition-all"
                          >
                            <i className="fas fa-arrow-left"></i> {t("backButton")}
                          </Link>
                        </div>
        </section>
        {/* forwarder.php L2252 — pay-modal target div (#list-forwarder-data) */}
        <div id="list-forwarder-data"></div>
      </div>
    </div>
  );
}

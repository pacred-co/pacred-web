/**
 * /admin/customers/[id] — legacy fallback view (Wave 7 fix · 2026-05-21 night).
 *
 * The dashboard's "ลูกค้าไม่ใช้งาน" tab + `/admin/customers` list row click
 * both pass the legacy text customer id (e.g. `PR10691` / `PCS10843`) to
 * `/admin/customers/[id]`. The default view queries `profiles.id` (uuid)
 * which on prod is essentially empty after the D1 pivot → every row click
 * 404'd. This fallback resolves the same id against `tb_users.userid` and
 * renders a faithful legacy customer card with wallet balance + recent
 * forwarder/shop/yuan activity from the migrated `tb_*` tables.
 *
 * 2026-06-12 — LAYOUT re-ordered 1:1 to the legacy PCS `users/profile` page
 * (ปอน). Section order now mirrors the legacy: profile header card (avatar +
 * code + VIP/SVIP + sale/CS + rate-gear) → profile detail (identity + account
 * meta + main address + note) → 8 stat cards → address table → ฝากสั่ง /
 * ฝากนำเข้า / ฝากโอน / ประวัติการจ่ายเงิน tables → a "เครื่องมือผู้ดูแล · Pacred"
 * divider that groups the Pacred-only tools (margin · rate · ค่าเทียบ/เครดิต ·
 * tags/activity · corporate · danger-zone). NO function was removed — every
 * interactive component is reused unchanged, only its placement moved.
 *
 * Verified prod schema 2026-05-21 via REST: tb_users(userid, username,
 *   userlastname, usercompany, useremail, usertel, useractive,
 *   useridcorporate, userregistered, lastlogindate, adminidsale, ...).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLegacyUrl, resolveLegacyUrlMap } from "@/lib/storage/legacy-resolver";
import { SlipImage } from "@/components/admin/slip-image";
import { SectionHeading } from "@/components/admin/page-header";
import { getSignedBucketUrl } from "@/lib/storage/upload";
import { getBusinessConfig } from "@/lib/business-config";
import { PROFILE_COVER_BUCKET, PROFILE_COVER_KEY } from "@/actions/admin/profile-cover-keys";
import { CoverEditor } from "./cover-editor";
import { RowLimitSelect } from "./row-limit-select";
import { parseRowLimit } from "./row-limit-options";
import { SectionStatusTabs, SectionPagination, buildSectionHref, parsePageNo, type SectionTab } from "./profile-section-nav";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { resolvePendingSlipFidsAll } from "@/lib/forwarder/pending-slip";
import { LEGACY_ORDER_TABS } from "@/lib/legacy-status-map";
import { Link } from "@/i18n/navigation";
import { getAdminRoles, isGodRole } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { getCustomerRateMatrix } from "@/actions/admin/customer-rate";
import { getQuoteDefaultRates } from "@/lib/admin/quote-default-rates";
import { getQuotePackages } from "@/lib/quote/quote-packages";
import { getSellFloorCbm, getSellFloorKg } from "@/lib/admin/sell-floor-config";
import { getCustomerStatCounts, listSalesAdmins, listCsAdmins, listActiveAdmins } from "@/actions/admin/customer-profile";
import { getCustomerMarginSummary } from "@/actions/admin/customer-margin";
// Legacy status vocabularies (D1 faithful-port SOT) — Thai labels for the
// single-char tb_* status codes the order tables show.
import { legacyOrderStatusThai, legacyForwarderStatusThai } from "@/lib/legacy-status-map";
import { carrierLabel } from "@/lib/freight/shipping-methods";
import {
  fstatusBadge,
  fstatusVivid,
  FORWARDER_STATUS_TABS,
  fstatusTabActiveCls,
  fstatusTabBadge,
  resolveRowStatusCode,
  statusCodeLabel,
} from "@/lib/admin/forwarder-status";
import { HSTATUS_CFG } from "@/lib/admin/service-order-status";
import { CustomerRateEditor } from "./rate-editor";
import { CustomerMarginPanel } from "./customer-margin-panel";
import { HardDeletePanel } from "./hard-delete-panel";
import { AdminToolsPinGate } from "./admin-tools-gate";
import { ResetPwdButton } from "../reset-pwd-button";
import { ReassignCodeButton } from "./reassign-code-button";
import { PricingTeamEditor } from "./pricing-team-editor";
import { UpgradeJuristicPopup } from "./upgrade-juristic-popup";
import { JuristicDocRestampPanel } from "./juristic-doc-restamp-panel";
// CRM depth (2026-06-08) — tags + activity timeline panels.
import { getTags } from "@/actions/admin/customer-tags";
import { getCustomerActivity } from "@/actions/admin/customer-activity";
import { TagChips } from "@/components/admin/tag-chips";
import { CustomerActivityTimeline } from "@/components/admin/customer-activity-timeline";
import {
  StatCards,
  IdentityEditor,
  NoteEditor,
  SaleRepEditor,
  CsRepEditor,
  ComparisonEditor,
  CreditLineEditor,
  CorporateEditor,
  CorporateDocGallery,
  type CorporateDocView,
  AddressManager,
} from "./profile-sections";
import { parseCorporateDocs } from "@/lib/admin/corporate-docs";
import { resolveBillingIdentity } from "@/lib/admin/customer-identity";
import { resolveActiveSalesRep, CENTRAL_SALES_LABEL } from "@/lib/admin/resolve-active-rep";
import { CustomerTypeTag } from "@/components/admin/customer-type-tag";
import { formatThaiDateTime } from "@/lib/utils/thai-datetime";

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userCompany: string | null;
  userEmail: string | null;
  userTel: string | null;
  userActive: string | null;
  userRegistered: string | null;
  userLastLogin: string | null;   // ← correct column (legacy schema)
  adminIDSale: string | null;
  adminIDCS: string | null;        // FEATURE 1: assigned CS rep (migration 0141)
  // FEATURE D (owner 2026-06-26 · migration 0217): per-customer extra owner-reps
  // — ล่ามจีน / Pricing / ผู้สั่งซื้อ (mirror adminIDSale / adminIDCS).
  adminIDInterpreter: string | null;
  adminIDPricing: string | null;
  adminIDPurchaser: string | null;
  userNote: string | null;
  userPicture: string | null;     // Wave 13: legacy avatar filename (col is `userPicture` not `userimage` — fix Wave 19 BUG#1 2026-05-26)
  // P0-17: identity-edit fields (faithful editUser modal).
  userSex: string | null;
  userBirthday: string | null;
  userLineID: string | null;
  userFacebook: string | null;
  coID: string | null;
  // Pricing-segment fields (2026-06-05) — ค่าเทียบ (CPS) + เครดิต. The price
  // engine reads userComparison/Value; userCredit/Value/Date drive the credit line.
  userComparison: string | null;
  userComparisonValue: number | string | null;
  userCredit: string | null;
  userCreditValue: number | string | null;
  userCreditDate: number | string | null;
};

// 2026-06-12 — column set expanded to faithfully reproduce the legacy PCS
// `users/profile` forwarder table (วันที่ · รหัสลูกค้า · รายละเอียด+รูป · ยอดค้างชำระ+
// kg/cbm · เลขพัสดุจีน+ตู้/ประเภท/กล่อง · เลขพัสดุไทย+ขนส่ง/ที่อยู่ · สถานะ · อัปเดต ·
// ตัวเลือก). All columns are READ-only — no money math change.
type FRow = {
  id: number;
  fdate: string | null;
  fidorco: string | null;          // ← legacy uses fidorco as the customer-facing F-no
  fstatus: string | null;
  ftransporttype: string | null;
  fcabinetnumber: string | null;
  ftrackingchn: string | null;
  ftrackingth: string | null;
  fdetail: string | null;
  reforder: string | null;         // shop hno that spawned this forwarder (if any)
  fproductstype: string | null;    // ประเภท (ทั่วไป/มอก./อย./…)
  fpallet: string | null;          // warehouse location chip
  fshipby: string | null;          // ขนส่งไทย (carrier name)
  fweight: number | string | null;
  fvolume: number | string | null;
  famount: number | null;          // กล่อง
  ftotalprice: number | null;
  fcover: string | null;           // product/cover photo (legacy thumbnail)
  faddressname: string | null;
  faddresslastname: string | null;
  faddresszipcode: string | null;
  fdateadminstatus: string | null; // last status-update timestamp
  adminidkey: string | null;       // admin who last updated
};
type HRow = {
  id: number;
  hdate: string | null;
  hno: string | null;
  hstatus: string | null;
  htotalpriceuser: number | null;
  htitle: string | null;
  hcover: string | null;           // product photo (legacy thumbnail)
  hdateupdate: string | null;      // last update timestamp
  adminidupdate: string | null;    // admin who last updated
};
type PRow = {
  id: number;
  paydate: string | null;
  paystatus: string | null;
  paytype: string | null;          // วิธีการชำระ code
  paydetail: string | null;        // รายละเอียด (e.g. 1688/Taobao channel)
  payyuan: number | null;
  paythb: number | null;
  adminid: string | null;          // อัปเดต admin
};
// Wallet-history rows (legacy ประวัติการจ่ายเงิน table) — column set mirrors the
// proven customer reader app/[locale]/(protected)/wallet/page.tsx (2026-06-12).
type WHRow = {
  id: number;
  date: string | null;
  status: string | null;
  amount: number | string | null;
  type: string | null;
  reforder: string | null;
  imagesslip: string | null;       // สลิปรายการ (legacy "Lock" popup link)
};
type WRow = {
  wallettotal: number | null;
};
// Wave 20 P0-1: juristic company info — legacy `tb_corporate` keyed by
// userid (mirrors the customer-portal `/profile` + `/service-order/add`
// reads). corporatestatus codes (canonical SOT lib/admin/customer-identity.ts
// CORP_STATUS · statusComp function.php:530): '1' = รอตรวจสอบ (pending) ·
// '2' = อนุมัติแล้ว (verified) · '3' = ไม่ผ่าน (rejected).
type CRow = {
  id: number;
  corporatename: string | null;
  corporatenumber: string | null;     // tax id (เลขผู้เสียภาษี · 13 digits)
  corporateaddress: string | null;
  corporatestatus: string | null;
  corporate_docs: unknown;            // multi-doc gallery jsonb (mig 0214)
  corporatefile: string | null;      // legacy single หนังสือรับรอง
  corporatefile20: string | null;    // legacy single ภพ.20
};
// Wave 20 P0-1: shipping addresses — legacy `tb_address` keyed by userid
// (mirrors `/addresses` page reads). `addressstatus`='1' filters out
// soft-deleted rows.
type ARow = {
  addressid: number;
  addressname: string | null;
  addresslastname: string | null;
  addresstel: string | null;
  addresstel2: string | null;
  addressno: string | null;
  addresssubdistrict: string | null;
  addressdistrict: string | null;
  addressprovince: string | null;
  addresszipcode: string | null;
  addressnote: string | null;
};
type AMain = { addressid: number };

const STATUS_ACTIVE_CFG: Record<string, { label: string; cls: string }> = {
  "1": { label: "ใช้งานอยู่", cls: "bg-green-100 text-green-700 border-green-200" },
  "0": { label: "ระงับ", cls: "bg-red-100 text-red-700 border-red-200" },
};

// Wallet-history type / status labels — reuse the canonical admin taxonomy
// from /admin/wallet transactions-view.tsx (2026-06-12) so the in-profile
// payment-history table matches the dedicated wallet list 1:1.
const WHS_TYPE_LABEL: Record<string, string> = {
  "1": "ชำระเงิน",
  "2": "เติม (manual)",
  "3": "ถอนเงิน",
  "4": "ชำระจากกระเป๋า",
  "5": "คืนเงิน",
  "6": "ชำระเงิน",
  "7": "รอตรวจการเติม",
  "8": "ชำระฝากสั่งซื้อ",
};
const WHS_STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ",
  "2": "สำเร็จ",
  "3": "ปฏิเสธ",
};
// Yuan-payment paystatus (legacy tb_payment.paystatus · 1/2/3) Thai labels.
const PAYSTATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ",
  "2": "สำเร็จ",
  "3": "ไม่สำเร็จ",
};

type PillTone = "green" | "red" | "amber" | "blue" | "gray";
function paystatusTone(code: string | null): PillTone {
  return code === "2" ? "green" : code === "3" ? "red" : code === "1" ? "amber" : "gray";
}
function whsStatusTone(code: string | null): PillTone {
  return code === "2" ? "green" : code === "3" ? "red" : code === "1" ? "amber" : "gray";
}
function orderStatusTone(code: string | null): PillTone {
  return code === "5" ? "green" : code === "6" ? "red" : code === "2" ? "amber" : "blue";
}

export async function renderLegacyCustomerView(
  id: string,
  searchParams?: Record<string, string | string[] | undefined>,
) {
  const admin = createAdminClient();

  // Per-table row-count, driven by URL params (the <RowLimitSelect> dropdowns
  // in each table header). Clamped to the allowed option set (default 10).
  const shopN = parseRowLimit(searchParams?.shopN);
  const fwdN = parseRowLimit(searchParams?.fwdN);
  const yuanN = parseRowLimit(searchParams?.yuanN);
  const payN = parseRowLimit(searchParams?.payN);

  // ── หัวแถวสถานะ + แบ่งหน้า ต่อ section (owner 2026-07-31) ──────────────────
  // "ตรงแต่ละบริการ อยากให้มีหัวแถวสถานะเหมือนหน้าหลัก แต่เป็นของ PR นั้นๆ ·
  //  กดดูทั้งหมดต้องยังอยู่ในหน้าโปรไฟล์ · กดแสดง 100 แล้วต้องมีหน้า 1 2 3"
  // นิยามสถานะ = ชุดเดียวกับหน้ารายการหลักเป๊ะ (ห้ามมี 2 นิยาม):
  //   forwarder: 1..7 + "6.1" (fstatus 6 + คนขับเปิดรอบ) + "c" (fcredit='1') +
  //   "p" (fstatus='99') — ตรง /admin/forwarders L1179-1191 · shop: hstatus
  //   (LEGACY_ORDER_TABS) · yuan: paystatus 1/2/3.
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const shopSt = str(searchParams?.shopSt);
  const fwdSt = str(searchParams?.fwdSt);
  const yuanSt = str(searchParams?.yuanSt);
  const shopP = parsePageNo(searchParams?.shopP);
  const fwdP = parsePageNo(searchParams?.fwdP);
  const yuanP = parsePageNo(searchParams?.yuanP);
  const payP = parsePageNo(searchParams?.payP);
  const sp = searchParams ?? {};

  // Wave 18 follow-up (2026-05-25 ค่ำ): the previous version of this query
  // destructured ONLY `data` — so any transient Supabase error (PgBouncer
  // timeout · network blip · 503 from project) collapsed silently to
  // `data=null` → we returned null → page.tsx called `notFound()` → user
  // saw an intermittent 404 even on rows that exist. Server logs showed
  // 200/200/200/404 hitting the same userid within 5 seconds — exactly the
  // transient-error pattern this hid. The fix: destructure `error`, log
  // it with full context, and THROW so Next renders the error boundary
  // (a real 500 with the diagnostic) instead of a misleading 404. A 404
  // is now reserved for "row genuinely not in tb_users" only.
  const { data: userRaw, error: userErr } = await admin
    .from("tb_users")
    .select(
      "userID,userName,userLastName,userCompany,userEmail,userTel,userActive,userRegistered,userLastLogin,adminIDSale,adminIDCS,adminIDInterpreter,adminIDPricing,adminIDPurchaser,userNote,userPicture,userSex,userBirthday,userLineID,userFacebook,coID,userComparison,userComparisonValue,userCredit,userCreditValue,userCreditDate",
    )
    .eq("userID", id)
    .maybeSingle();
  if (userErr) {
    console.error("[legacy-view] tb_users query failed", {
      userid: id,
      code: userErr.code,
      message: userErr.message,
      details: userErr.details,
      hint: userErr.hint,
    });
    throw new Error(
      `legacy-view: failed to load tb_users for ${id} — ${userErr.code ?? "unknown"}: ${userErr.message}`,
    );
  }
  if (!userRaw) return null;
  const u = userRaw as unknown as URow;

  // Wave 13: resolve the legacy customer-portrait filename → signed URL.
  // Bare filenames live under `member-docs/legacy-images/users/` after
  // backfill 06. Empty / null → null → header renders the initial-letter
  // fallback instead of the avatar.
  const userImageUrl = await resolveLegacyUrl(u.userPicture, "profile");

  // Wallet balance + corporate + addresses + recent activity (parallel).
  // Wave 20 P0-1 (audit P0-1 · 2026-05-25 ค่ำ): the four extra reads (corp,
  // addresses, mainAddr, wallet) are the load-bearing detail-page reads —
  // all destructure `error` per AGENTS §0c. Activity reads (forwarder /
  // shop / yuan / wallet-hs) are best-effort recents — a transient error
  // there falls through to an empty list rather than blowing up the page.
  const [
    walletRes,
    corpRes,
    addrRes,
    mainAddrRes,
    forwarderRes,
    shopRes,
    yuanRes,
    walletHsRowsRes,
    fwdCountRes,
    ordCountRes,
    payCountRes,
    walletHsCountRes,
    creditRes,
  ] = await Promise.all([
    admin.from("tb_wallet").select("wallettotal").eq("userid", u.userID).maybeSingle(),
    admin
      .from("tb_corporate")
      .select("id, corporatename, corporatenumber, corporateaddress, corporatestatus, corporate_docs, corporatefile, corporatefile20")
      .eq("userid", u.userID)
      .maybeSingle(),
    admin
      .from("tb_address")
      .select("addressid, addressname, addresslastname, addresstel, addresstel2, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addressnote")
      .eq("userid", u.userID)
      .eq("addressstatus", "1")
      .order("addressid", { ascending: false })
      .limit(20),
    admin
      .from("tb_address_main")
      .select("addressid")
      .eq("userid", u.userID)
      .maybeSingle(),
    // LIGHT SCAN ทุกแถวของลูกค้า (owner 2026-07-31 — หัวแถวสถานะต้องนับครบทุกงาน
    // ไม่ใช่แค่ N แถวล่าสุด) — คอลัมน์จิ๋ว · scoped ต่อลูกค้า = bounded ·
    // fetchAllRows กัน PostgREST ตัดเงียบที่ 1,000 (กติกาบ้าน 2026-07-29).
    // แถวหนักของ "หน้าปัจจุบัน" ดึงทีหลังด้วย .in("id", pageIds).
    fetchAllRows<{ id: number; fstatus: string | null; fcredit: string | null; fdate: string | null }>(() =>
      admin
        .from("tb_forwarder")
        .select("id,fstatus,fcredit,fdate")
        .eq("userid", u.userID)
        .order("id", { ascending: true }),
    ),
    fetchAllRows<{ id: number; hstatus: string | null; hdate: string | null }>(() =>
      admin
        .from("tb_header_order")
        .select("id,hstatus,hdate")
        .eq("userid", u.userID)
        .order("id", { ascending: true }),
    ),
    fetchAllRows<{ id: number; paystatus: string | null; paydate: string | null }>(() =>
      admin
        .from("tb_payment")
        .select("id,paystatus,paydate")
        .eq("userid", u.userID)
        .order("id", { ascending: true }),
    ),
    // ประวัติการจ่ายเงิน (wallet-hs) — แบ่งหน้าฝั่ง server ด้วย .range()
    // (owner: "กดแสดง 100 แล้วหางานไม่เจอ ไม่มีหน้า 1 2 3").
    admin
      .from("tb_wallet_hs")
      .select("id,date,status,amount,type,reforder,imagesslip")
      .eq("userid", u.userID)
      .order("id", { ascending: false })
      .range((payP - 1) * payN, payP * payN - 1),
    // Exact activity counts for the super-only hard-delete safety gate
    // (HardDeletePanel) — head:true counts are cheap. The recents above cap at
    // 10; these report the true totals so the gate shows accurate "ลบไม่ได้"
    // reasons. The action (adminHardDeleteCustomer) re-checks server-side.
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("userid", u.userID),
    admin.from("tb_header_order").select("id", { count: "exact", head: true }).eq("userid", u.userID),
    admin.from("tb_payment").select("id", { count: "exact", head: true }).eq("userid", u.userID),
    admin.from("tb_wallet_hs").select("id", { count: "exact", head: true }).eq("userid", u.userID),
    // Credit outstanding (best-effort · for the credit-line "คงเหลือ"). Absent
    // row = 0 owed; a transient error degrades to 0 (not in the throw-loop).
    admin.from("tb_credit").select("creditvalue").eq("userid", u.userID).maybeSingle(),
  ]);

  // §0c — surface real errors on the load-bearing reads (wallet · corp ·
  // addresses · mainAddr) by throwing into Next's error boundary. A 404
  // is reserved for "user genuinely missing from tb_users" (handled above).
  // Activity reads are best-effort (errors degrade silently to empty list).
  for (const [label, res] of [
    ["tb_wallet", walletRes],
    ["tb_corporate", corpRes],
    ["tb_address", addrRes],
    ["tb_address_main", mainAddrRes],
  ] as const) {
    if (res.error) {
      console.error("[legacy-view] query failed", {
        userid: u.userID,
        table: label,
        code: res.error.code,
        message: res.error.message,
        details: res.error.details,
        hint: res.error.hint,
      });
      throw new Error(
        `legacy-view: failed to load ${label} for ${u.userID} — ${res.error.code ?? "unknown"}: ${res.error.message}`,
      );
    }
  }

  const wallet = (walletRes.data as unknown as WRow | null) ?? null;
  const corp = (corpRes.data as unknown as CRow | null) ?? null;
  const addresses = (addrRes.data ?? []) as unknown as ARow[];
  const mainAddrId = (mainAddrRes.data as AMain | null)?.addressid ?? null;
  // ── LIGHT SCANS → หัวแถวสถานะ + แบ่งหน้า (owner 2026-07-31) ────────────────
  // scan พังบางตัว = ส่วนนั้น degrade เป็นลิสต์ว่าง (best-effort เหมือนเดิม · ไม่ล้มหน้า)
  const fwdScan = forwarderRes.error ? [] : (forwarderRes.data ?? []);
  const shopScan = shopRes.error ? [] : (shopRes.data ?? []);
  const yuanScan = yuanRes.error ? [] : (yuanRes.data ?? []);
  if (forwarderRes.error) console.error("[legacy-view] fwd scan failed", { code: forwarderRes.error.code, message: forwarderRes.error.message });
  if (shopRes.error) console.error("[legacy-view] shop scan failed", { code: shopRes.error.code, message: shopRes.error.message });
  if (yuanRes.error) console.error("[legacy-view] yuan scan failed", { code: yuanRes.error.code, message: yuanRes.error.message });

  // "กำลังจัดส่ง" (แท็บ 6.1 ของหน้าหลัก) = fstatus '6' + มีแถวคนขับเปิดอยู่
  // (tb_forwarder_driver_item.fdistatus='' — นิยามเดียวกับ /admin/forwarders L1186-1188)
  const sixIds = fwdScan.filter((r) => String(r.fstatus ?? "") === "6").map((r) => r.id);
  // สลิปรอบัญชีตรวจ → สถานะย่อย 5.1 "รอออก/ใบเสร็จรับเงิน" (owner 2026-07-31 ·
  // นิยาม/สัญญาณเดียวกับหน้ารายการหลัก · scoped เฉพาะงานสถานะ 5 ของลูกค้ารายนี้)
  const fiveIds = fwdScan.filter((r) => String(r.fstatus ?? "") === "5").map((r) => r.id);
  // ⚠️ ที่มาของสัญญาณ = SOT ตัวเดียวกับหน้ารายการหลัก + จอลูกค้า
  // (lib/forwarder/pending-slip.ts) — ห้ามเขียน query เองซ้ำที่นี่ ไม่งั้นวันที่
  // นิยาม "แนบสลิปแล้ว" เปลี่ยน จะได้คนละคำตอบคนละจอ (owner 2026-07-31).
  const pendingSlipFids = await resolvePendingSlipFidsAll(admin, fiveIds);
  const driverOpenFids = new Set<number>();
  if (sixIds.length > 0) {
    const { data: dItems, error: dErr } = await admin
      .from("tb_forwarder_driver_item")
      .select("fid")
      .in("fid", sixIds)
      .eq("fdistatus", "");
    if (dErr) console.error("[legacy-view] driver-item scan failed", { code: dErr.code, message: dErr.message });
    for (const d of (dItems ?? []) as Array<{ fid: number }>) driverOpenFids.add(Number(d.fid));
  }

  // ลูกค้าเครดิต? — แท็บ "เครดิตสินค้า/สถานะพิเศษ" โชว์เฉพาะลูกค้าที่ตั้งเป็นเครดิต
  // (owner เคาะ): ธงบนโปรไฟล์ (userCredit='1') หรือมีวงเงินค้าง หรือมีงาน fcredit='1' จริง
  const hasCreditRows = fwdScan.some((r) => String(r.fcredit ?? "") === "1");
  const isCreditCustomer =
    String(u.userCredit ?? "") === "1" ||
    hasCreditRows ||
    Number((creditRes.data as { creditvalue?: number | string | null } | null)?.creditvalue ?? 0) > 0;

  // ตัวกรองสถานะของ section forwarder — นิยามเดียวกับหน้าหลักเป๊ะ
  const fwdMatch = (r: { fstatus: string | null; fcredit: string | null; id: number }): boolean => {
    const st = String(r.fstatus ?? "");
    if (fwdSt === "") return true;
    if (fwdSt === "c") return String(r.fcredit ?? "") === "1";
    if (fwdSt === "p") return st === "99";
    if (fwdSt === "6") return st === "6" && !driverOpenFids.has(r.id);
    if (fwdSt === "6.1") return st === "6" && driverOpenFids.has(r.id);
    if (fwdSt === "5") return st === "5" && !pendingSlipFids.has(r.id);
    if (fwdSt === "5.1") return st === "5" && pendingSlipFids.has(r.id);
    return st === fwdSt;
  };
  const byDateDesc = (a: string | null, b: string | null) => (b ?? "").localeCompare(a ?? "");

  const fwdFiltered = fwdScan.filter(fwdMatch).sort((a, b) => byDateDesc(a.fdate, b.fdate));
  const shopFiltered = shopScan
    .filter((r) => (shopSt === "" ? true : String(r.hstatus ?? "") === shopSt))
    .sort((a, b) => byDateDesc(a.hdate, b.hdate));
  const yuanFiltered = yuanScan
    .filter((r) => (yuanSt === "" ? true : String(r.paystatus ?? "") === yuanSt))
    .sort((a, b) => byDateDesc(a.paydate, b.paydate));

  // page-slice → ดึงแถวหนักเฉพาะหน้าปัจจุบัน (id ≤ 100 ตัว)
  const pageIds = (list: Array<{ id: number }>, page: number, size: number) =>
    list.slice((page - 1) * size, page * size).map((r) => r.id);
  const fwdPageIds = pageIds(fwdFiltered, fwdP, fwdN);
  const shopPageIds = pageIds(shopFiltered, shopP, shopN);
  const yuanPageIds = pageIds(yuanFiltered, yuanP, yuanN);

  const [fwdHeavyRes, shopHeavyRes, yuanHeavyRes] = await Promise.all([
    fwdPageIds.length
      ? admin
          .from("tb_forwarder")
          .select(
            "id,fdate,fidorco,fstatus,ftransporttype,fcabinetnumber,ftrackingchn," +
              "ftrackingth,fdetail,reforder,fproductstype,fpallet,fshipby,fweight," +
              "fvolume,famount,ftotalprice,fcover,faddressname,faddresslastname," +
              "faddresszipcode,fdateadminstatus,adminidkey",
          )
          .in("id", fwdPageIds)
      : Promise.resolve({ data: [], error: null }),
    shopPageIds.length
      ? admin
          .from("tb_header_order")
          .select("id,hdate,hno,hstatus,htotalpriceuser,htitle,hcover,hdateupdate,adminidupdate")
          .in("id", shopPageIds)
      : Promise.resolve({ data: [], error: null }),
    yuanPageIds.length
      ? admin
          .from("tb_payment")
          .select("id,paydate,paystatus,paytype,paydetail,payyuan,paythb,adminid")
          .in("id", yuanPageIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const [label, res] of [["fwd page", fwdHeavyRes], ["shop page", shopHeavyRes], ["yuan page", yuanHeavyRes]] as const) {
    if (res.error) console.error(`[legacy-view] ${label} fetch failed`, { code: res.error.code, message: res.error.message });
  }
  // เรียงแถวหนักตามลำดับหน้า (วันที่ล่าสุดก่อน — ลำดับจาก list ที่ sort แล้ว)
  const orderByIds = <T extends { id: number }>(rows: T[], ids: number[]): T[] => {
    const at = new Map(ids.map((v, i) => [v, i]));
    return rows.slice().sort((a, b) => (at.get(Number(a.id)) ?? 0) - (at.get(Number(b.id)) ?? 0));
  };
  const forwarderRows = orderByIds(((fwdHeavyRes.data ?? []) as unknown as Array<{ id: number }>), fwdPageIds);
  const shopRows = orderByIds(((shopHeavyRes.data ?? []) as unknown as Array<{ id: number }>), shopPageIds);
  const yuanRows = orderByIds(((yuanHeavyRes.data ?? []) as unknown as Array<{ id: number }>), yuanPageIds);
  // Identity for the header — juristic-aware via the shared resolver (2026-07-03).
  // For a company the H2 shows the COMPANY name (was leaking the contact person
  // "PEA PEA" — company only appeared as a static "ลูกค้า นิติบุคคล" tag). The
  // person stays as the "ผู้ติดต่อ" sub-line. Personal customers unchanged.
  const identity = resolveBillingIdentity({
    userCompany: u.userCompany,
    userName: u.userName,
    userLastName: u.userLastName,
    corp,
  });
  const isJuristic = identity.isJuristic;
  const fullName = identity.name || "—";
  const contactPersonName = identity.personName;
  const active = u.userActive ?? "1";
  const statusCfg = STATUS_ACTIVE_CFG[active] ?? {
    label: `status ${active}`,
    cls: "bg-gray-100 text-gray-600 border-gray-200",
  };

  const fws = (forwarderRows ?? []) as unknown as FRow[];
  const hos = (shopRows ?? []) as unknown as HRow[];
  const pys = (yuanRows ?? []) as unknown as PRow[];
  const whs = (walletHsRowsRes.data ?? []) as unknown as WHRow[];

  // ── นิยามแท็บต่อ section — ดึงจาก SOT ตัวเดียวกับหน้ารายการหลัก (owner 2026-07-31
  //    "สีต้องเหมือนหน้าหลัก · ดึงจากที่เดียวกัน · มีสถานะเพิ่มไม่ต้องไล่แก้หากัน") ──
  // forwarder: FORWARDER_STATUS_TABS + fstatusTabActiveCls/fstatusTabBadge
  // (lib/admin/forwarder-status.ts) · shop: LEGACY_ORDER_TABS + HSTATUS_CFG.chip ·
  // yuan: PAYSTATUS_LABEL. เพิ่มสถานะที่ SOT = ขึ้นทั้งหน้าหลักและโปรไฟล์เอง.
  const stCount = (st: string) => fwdScan.filter((r) => String(r.fstatus ?? "") === st).length;
  const fwdTabCount = (code: string): number => {
    if (code === "") return fwdScan.length;
    if (code === "c") return fwdScan.filter((r) => String(r.fcredit ?? "") === "1").length;
    if (code === "p") return stCount("99");
    if (code === "6") return sixIds.filter((id) => !driverOpenFids.has(id)).length;
    if (code === "6.1") return sixIds.filter((id) => driverOpenFids.has(id)).length;
    if (code === "5") return fiveIds.filter((id) => !pendingSlipFids.has(id)).length;
    if (code === "5.1") return fiveIds.filter((id) => pendingSlipFids.has(id)).length;
    return stCount(code);
  };
  const fwdTabs: SectionTab[] = FORWARDER_STATUS_TABS
    // แท็บ creditOnly (เครดิตสินค้า/สถานะพิเศษ) โชว์เฉพาะลูกค้าเครดิต (owner เคาะ)
    .filter((t) => !t.creditOnly || isCreditCustomer)
    .map((t) => ({
      code: t.code,
      label: t.label,
      count: fwdTabCount(t.code),
      activeCls: t.code === "" ? undefined : fstatusTabActiveCls(t.code),
      badgeCls: fstatusTabBadge(t.code === "" ? undefined : t.code),
    }));
  const shopTabs: SectionTab[] = [
    { code: "", label: "ทั้งหมด", count: shopScan.length, badgeCls: "bg-slate-500 text-white" },
    ...LEGACY_ORDER_TABS.map((t) => {
      const cfg = HSTATUS_CFG[t.code];
      return {
        code: t.code as string,
        label: t.thai,
        count: shopScan.filter((r) => String(r.hstatus ?? "") === t.code).length,
        activeCls: cfg?.chip,
        badgeCls: cfg?.chip,
      };
    }),
  ];
  const YUAN_TAB_CLS: Record<string, string> = {
    "1": "bg-amber-500 text-white",
    "2": "bg-emerald-600 text-white",
    "3": "bg-red-600 text-white",
  };
  const yuanTabs: SectionTab[] = [
    { code: "", label: "ทั้งหมด", count: yuanScan.length, badgeCls: "bg-slate-500 text-white" },
    ...(["1", "2", "3"] as const).map((c) => ({
      code: c as string,
      label: PAYSTATUS_LABEL[c],
      count: yuanScan.filter((r) => String(r.paystatus ?? "") === c).length,
      activeCls: YUAN_TAB_CLS[c],
      badgeCls: YUAN_TAB_CLS[c],
    })),
  ];

  // 2026-06-12 — resolve the legacy thumbnails + slip images for the faithful
  // PCS users/profile tables. Bounded to the recent-10 sets (≤30 signed-URL
  // calls). `kind="cover"` also rewrites external alicdn/taobao URLs to the
  // thumb size; `kind="slip"` points at the wallet slip bucket.
  const [fwCoverMap, shopCoverMap, slipMap] = await Promise.all([
    resolveLegacyUrlMap(fws.map((r) => ({ id: r.id, filename: r.fcover })), "cover"),
    resolveLegacyUrlMap(hos.map((r) => ({ id: r.id, filename: r.hcover })), "cover"),
    resolveLegacyUrlMap(whs.map((r) => ({ id: r.id, filename: r.imagesslip })), "slip"),
  ]);

  // owner 2026-06-26 — resolve signed URLs for the นิติบุคคล documents (multi-doc
  // gallery `corporate_docs` in the member-docs bucket + the 2 legacy single files
  // corporatefile/corporatefile20 = legacy-uploads/file). Best-effort: a null url
  // renders "เปิดไม่ได้" in the gallery (graceful).
  const corpDocViews: CorporateDocView[] = [];
  if (corp) {
    const parsedDocs = parseCorporateDocs(corp.corporate_docs);
    for (const d of parsedDocs) {
      corpDocViews.push({ type: d.type, key: d.key, name: d.name, at: d.at, url: await getSignedBucketUrl("member-docs", d.key, 3600) });
    }
    if (corp.corporatefile && !parsedDocs.some((d) => d.key === corp.corporatefile)) {
      corpDocViews.push({ type: "affidavit", key: corp.corporatefile, name: "หนังสือรับรอง (ไฟล์เดิม)", at: "", url: await resolveLegacyUrl(corp.corporatefile, "file") });
    }
    if (corp.corporatefile20 && !parsedDocs.some((d) => d.key === corp.corporatefile20)) {
      corpDocViews.push({ type: "vat", key: corp.corporatefile20, name: "ภพ.20 (ไฟล์เดิม)", at: "", url: await resolveLegacyUrl(corp.corporatefile20, "file") });
    }
  }

  // Main shipping address (legacy "ที่อยู่จัดส่ง (หลัก)" summary in the profile
  // detail). Falls back to "—" when none flagged.
  const mainAddr = addresses.find((a) => a.addressid === mainAddrId) ?? null;
  const mainAddrText = mainAddr
    ? [
        `${mainAddr.addressname ?? ""} ${mainAddr.addresslastname ?? ""}`.trim(),
        mainAddr.addressno,
        mainAddr.addresssubdistrict ? `ต.${mainAddr.addresssubdistrict}` : null,
        mainAddr.addressdistrict ? `อ.${mainAddr.addressdistrict}` : null,
        mainAddr.addressprovince ? `จ.${mainAddr.addressprovince}` : null,
        mainAddr.addresszipcode,
      ]
        .filter((s) => s && String(s).trim() !== "")
        .join(" ")
    : "—";

  // Per-customer rate matrix (live tb_rate_custom_kg/cbm) — drives the
  // in-profile rate editor + the SVIP badge. Reader logs+degrades on error.
  // Stat-card counts (8 cards · cheap COUNT/head) + the sales-admin dropdown
  // for the editSale control fetched alongside. Each reader logs+degrades on
  // error (never throws — the profile must still render).
  // 2026-06-05 ภูม lane (CEO CRM-activation): per-customer margin baseline
  // is fetched here in parallel with the other profile sub-readers. Best-
  // effort — never throws (the loader degrades to "0 delivered ตู้" empty
  // state if tb_forwarder query fails).
  const [rateMatrix, quoteDefaults, quotePackages, statCounts, salesAdminsRes, csAdminsRes, activeAdminsRes, marginSummary, tagsRes, activityRes] = await Promise.all([
    getCustomerRateMatrix(u.userID),
    // เรท default ใบเสนอราคา = เรททั่วไป tb_rate_g_* (owner ปอน 2026-07-17) — global,
    // ส่งให้ QuoteTab ใช้เป็นชั้น default (SVIP ▸ แพ็ก ▸ general ▸ promo/FDA).
    getQuoteDefaultRates(),
    // แพ็กเกจใบเสนอราคา (data-driven · owner ปอน 2026-07-18) — dropdown + เรทพรีเซ็ต.
    getQuotePackages(),
    getCustomerStatCounts(u.userID),
    listSalesAdmins(),
    listCsAdmins(),
    // FEATURE D (owner 2026-06-26) — active-admin list for ล่ามจีน/Pricing/ผู้สั่งซื้อ.
    listActiveAdmins(),
    getCustomerMarginSummary(u.userID),
    // CRM depth (2026-06-08) — best-effort: degrade to empty on error.
    getTags(u.userID),
    getCustomerActivity(u.userID),
  ]);
  const salesAdmins = salesAdminsRes.ok ? salesAdminsRes.data?.rows ?? [] : [];
  // Active sales-rep id set (adminStatusA='1' AND adminStatusSale='1') — the
  // SaleBadge resolves a RETIRED assigned rep to the central line via this set
  // (owner 2026-07-09). `salesAdminsLoaded` distinguishes a genuinely-empty pool
  // (all retired → central is correct) from a failed read (show the raw id, no
  // false "central") so a transient error can't mislabel every rep as central.
  const salesAdminsLoaded = salesAdminsRes.ok;
  const activeSalesIds = new Set(salesAdmins.map((a) => a.adminID));
  const csAdmins = csAdminsRes.ok ? csAdminsRes.data?.rows ?? [] : [];
  const activeAdmins = activeAdminsRes.ok ? activeAdminsRes.data?.rows ?? [] : [];
  const customerTags = tagsRes.ok ? (tagsRes.data ?? []).map((t) => t.tag) : [];
  const customerActivity = activityRes.ok ? (activityRes.data ?? []) : [];
  const walletBalance = Number(wallet?.wallettotal ?? 0);

  // Pricing-segment state (ค่าเทียบ + เครดิต) for the in-profile editors.
  const comparisonEnabled = (u.userComparison ?? "") === "1";
  const comparisonValue = Number(u.userComparisonValue ?? 0);
  const creditLimit = Number(u.userCreditValue ?? 0);
  const creditDays = Number(u.userCreditDate ?? 0);
  const creditEnabled = (u.userCredit ?? "") === "1" || creditLimit > 0;
  const creditOutstanding = Number(
    (creditRes.data as { creditvalue: number | string | null } | null)?.creditvalue ?? 0,
  );

  // P0-17: the identity editor's senior-only fields (rep + coID) mirror the
  // legacy CEO/Manager/QAAndQC/Accounting/ITDT gate → Pacred senior roles.
  const adminRoles = (await getAdminRoles()) ?? [];
  // NON-money privilege gate — ultra inherits super's reach (isGodRole).
  const isSeniorAdmin =
    isGodRole(adminRoles) ||
    ["manager", "accounting", "qa"].some((r) => adminRoles.includes(r as never));

  // 2026-06-15 (owner "พนักงานไม่ควรเห็นต้นทุน") — per-customer margin/profit IS
  // cost data. 2026-06-18 (owner · mig 0189) — super ALSO loses money-internal
  // visibility; margin is gated by canViewCostProfit → {ultra, accounting,
  // pricing} only (NOT super, NOT ops). The CLIENT margin panel must also OMIT
  // the cost/margin data when this is false (prop threaded below).
  const canSeeMargin = canViewCostProfit(adminRoles);

  // Hard-delete is super-only (staff-CRUD gap · §PM-6 #3.3). NON-money gate →
  // isGodRole so ultra inherits. Exact activity counts feed the danger-zone
  // panel's safety gate (count reads are best-effort — a transient miss
  // degrades to 0, but the action re-checks server-side so a wrong 0 here can
  // never bypass the real gate).
  const isSuperAdmin = isGodRole(adminRoles);

  // "รันเลข PR ลูกค้าใหม่" is ULTRA-ONLY (re-keys the whole identity across 52+
  // tables + auth). owner 2026-07-14: allow SUPER too (not only ultra). The server
  // action re-asserts ultra||super; this UI flag just shows/hides the button.
  const isUltraAdmin = adminRoles.includes("ultra") || adminRoles.includes("super");

  // Sell-rate floors — resolve the LIVE floors (business_config override ||
  // constant default) on the server and pass BOTH into the (client) rate editor
  // for enforcement display + the InfoTab floor tables. Both are EDITABLE inline
  // by `ultra` only (isGodRole) — non-ultra sees them read-only. (KG default
  // รถ 17 · เรือ 7 · owner 2026-07-03.)
  const [sellFloorCbm, sellFloorKg] = await Promise.all([getSellFloorCbm(), getSellFloorKg()]);
  const canEditSellFloor = isGodRole(adminRoles); // ultra/super only

  const fwdCount = fwdCountRes.count ?? 0;
  const ordCount = ordCountRes.count ?? 0;
  const payCount = payCountRes.count ?? 0;
  const walletHsCount = walletHsCountRes.count ?? 0;

  const fmtBaht = (n: number) =>
    `฿${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  // Facebook-style cover — a GLOBAL admin-set image (business_config) signed on
  // read; falls back to the bundled default GIF when unset. Editable inline by
  // any admin via <CoverEditor> (actions/admin/profile-cover.ts).
  const DEFAULT_COVER = "/images/admin/customerprofile/bannertest01g.gif";
  const coverPath = await getBusinessConfig<string>(PROFILE_COVER_KEY, "");
  const coverSrc =
    (coverPath ? await getSignedBucketUrl(PROFILE_COVER_BUCKET, coverPath, 86400) : null) ||
    DEFAULT_COVER;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* ── SECTION 1 · Profile header card (legacy users/profile top card) ── */}
      <div className="overflow-hidden rounded-2xl border border-border bg-white dark:bg-surface p-5">
        {/* FB-style cover photo — full-bleed Pacred brand banner, FLUSH to the card
            top (-mt-5 cancels the card's top padding · card is overflow-hidden so
            the corners clip to the rounded card). The action buttons that used to
            sit above the cover now live in the name row. Admin-editable (global)
            via the overlaid <CoverEditor> button. */}
        <div className="relative -mx-5 -mt-5 h-32 sm:h-40 overflow-hidden bg-primary-600">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverSrc}
            alt=""
            className="h-full w-full object-cover"
          />
          <CoverEditor hasCustom={!!coverPath} />
        </div>

        {/* Facebook-style profile header — avatar OVERLAPS the cover (bottom-left),
            ชื่อ + รหัส/tags stacked to its right (left-aligned). */}
        <div className="flex items-start gap-4 px-1">
          {/* Wave 13: legacy avatar — resolved signed URL or initial-letter
              fallback when no portrait was uploaded. The avatar alone is pulled
              up (-mt-12) so it OVERLAPS the cover; the name/tags stay below it on
              the white area so they're readable (never dark-on-red). */}
          {userImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={userImageUrl}
              alt={fullName}
              className="relative z-20 -mt-12 w-24 h-24 shrink-0 rounded-full object-cover bg-white ring-4 ring-white dark:ring-surface shadow-sm"
            />
          ) : (
            <div className="relative z-20 -mt-12 w-24 h-24 shrink-0 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-3xl ring-4 ring-white dark:ring-surface shadow-sm">
              {(u.userName ?? u.userID).trim().charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <div className="min-w-0 flex flex-col gap-2 pt-2">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">{fullName}</h2>
              <span className="text-[11px] font-semibold tracking-wide text-primary-600">
                ADMIN · ลูกค้า {isJuristic ? "นิติบุคคล" : "บุคคล"}
              </span>
            </div>
            {/* Sub-line under the display name — เบอร์โทร ALWAYS (personal + juristic ·
                owner 2026-07-06) + ผู้ติดต่อ/เลขผู้เสียภาษี for a juristic (the H2 is the
                COMPANY name, so show who staff talk to). Personal: just the phone. */}
            {u.userTel || (isJuristic && (contactPersonName || identity.taxId)) ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted">
                {isJuristic && contactPersonName ? <span>ผู้ติดต่อ: <span className="text-foreground font-medium">{contactPersonName}</span></span> : null}
                {u.userTel ? <span>เบอร์โทร: <span className="text-foreground font-medium font-mono">{u.userTel}</span></span> : null}
                {isJuristic && identity.taxId ? <span>เลขผู้เสียภาษี: <span className="text-foreground font-mono">{identity.taxId}</span></span> : null}
              </div>
            ) : null}
            {/* Meta row — รหัสลูกค้า + สถานะ + Sales/CS tags inline
                (legacy "Sale : admin_xxx แก้ไข" badge → compact editable pills). */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl font-bold font-mono">{u.userID}</span>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusCfg.cls}`}>
                {statusCfg.label}
              </span>
              {rateMatrix.isSvip ? (
                <span className="rounded-full bg-primary-600 text-white px-3 py-1 text-xs font-semibold">
                  เรทเฉพาะตัว
                </span>
              ) : null}
              {/* owner 2026-06-25 — tag บุคคล/นิติ + เงินสด/เครดิต ข้าง Sales/CS
                  ให้คนทำงาน+ลูกค้ารู้รายละเอียดทันที (§0g self-explaining).
                  CUSTTAG rollout: shared <CustomerTypeTag> (same pills on the lists). */}
              <CustomerTypeTag
                isJuristic={isJuristic}
                creditLimit={creditLimit}
                creditDays={creditDays}
                creditUsed={creditOutstanding}
              />
              <SaleRepEditor compact userid={u.userID} currentRep={u.adminIDSale} admins={salesAdmins} />
              <CsRepEditor compact userid={u.userID} currentRep={u.adminIDCS} admins={csAdmins} />
              {/* ทีม Pricing (owner 2026-07-05) — ย่อเหลือ "ช่องเดียว": เลือกคน → เลือกบทบาท
                  (ล่าม/สั่งซื้อ/Pricing) → assign. คงผู้รับผิดชอบ 3 บทบาทไว้ในข้อมูล (เขียน
                  ทีละคอลัมน์ผ่าน action เดิม) เพื่อจ่ายค่าคอมถูกคน. §0g self-explaining · §0h ≥11px. */}
              <PricingTeamEditor
                userid={u.userID}
                interpreter={u.adminIDInterpreter}
                purchaser={u.adminIDPurchaser}
                pricing={u.adminIDPricing}
                admins={activeAdmins}
              />
              {/* อัพเกรดเป็นนิติบุคคล (owner 2026-07-05) — เฉพาะลูกค้า "บุคคล" · เซล/CS ทำเองได้
                  ไม่ต้องปลดล็อกรหัส · เปิด popup กรอกข้อมูล + แนบเอกสารในตัว. */}
              {!isJuristic ? <UpgradeJuristicPopup userid={u.userID} /> : null}
              {/* รีเซ็ตรหัสผ่านลูกค้า (owner 2026-07-06) — moved UP into the header,
                  right after the ทีม Pricing chip and BEFORE รันเลข PR (was in the
                  account-tools block far below). Shown to every admin who reaches
                  the page (a normal CS action · confirm-before-mutate in the button). */}
              <ResetPwdButton userid={u.userID} />
              {/* รันเลข PR ลูกค้าใหม่ (ULTRA-ONLY · owner 2026-07-06) — surfaced here
                  in the identity header (was buried ~550 lines down in the account
                  tools) so it's reachable without scrolling (§0d). Same component +
                  props + strict-ultra gate + the action's own ultra re-assertion —
                  only the placement changed. */}
              {isUltraAdmin ? (
                <ReassignCodeButton
                  userid={u.userID}
                  customerName={`${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || undefined}
                />
              ) : null}
            </div>
          </div>
          {/* Action buttons — moved into the name row (right-aligned · FB-style)
              instead of a separate top bar above the cover. */}
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-3 pt-2">
            <CustomerRateEditor
              userid={u.userID}
              customerName={fullName}
              buyerTaxId={identity.taxId}
              buyerAddress={identity.registeredAddress}
              buyerIsJuristic={isJuristic}
              buyerPhone={u.userTel ?? ""}
              matrix={rateMatrix}
              generalDefaults={quoteDefaults}
              quotePackages={quotePackages}
              comparisonEnabled={comparisonEnabled}
              comparisonValue={comparisonValue}
              sellFloorCbm={sellFloorCbm}
              sellFloorKg={sellFloorKg}
              canEditSellFloor={canEditSellFloor}
            />
            <Link href="/admin/customers" className="text-xs text-primary-600 hover:underline">
              ← รายการลูกค้า
            </Link>
          </div>
        </div>

        {/* ── 8 stat cards — moved UP inside the profile header card to match the
            legacy PCS users/profile layout (avatar → ชื่อ → รหัสสมาชิก → Sale →
            [8 tiles]). Counts from tb_header_order / tb_forwarder / tb_payment /
            tb_wallet(_hs) / tb_cash_back_hs (unverifiable → "—"). ── */}
        <div className="mt-5 border-t border-border/60 pt-5">
          <StatCards userid={u.userID} walletBalance={walletBalance} counts={statCounts} />
        </div>
      </div>

      {/* ── SECTION 2 · Profile detail — ข้อมูลบัญชี + หมายเหตุภายใน.
          (owner 2026-06-26: ย้าย "ข้อมูลส่วนตัวลูกค้า" [IdentityEditor] ไปไว้ใน
          "เครื่องมือผู้ดูแล" ใต้ PIN lock ด้านล่าง · ส่วนนี้เหลือ ข้อมูลบัญชี +
          หมายเหตุภายใน stacked เต็มแถว.) ── */}
      <div className="grid grid-cols-1 gap-5">
        {/* Account meta (ข้อมูลบัญชี) + the internal note stacked under it
            (legacy โน้ต) — compact padding/gap so the stack is "บาง" (thin). */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 space-y-2 text-sm">
            <SectionHeading>ข้อมูลบัญชี</SectionHeading>
            {/* วันที่สมัคร + ล่าสุดล็อกอิน on ONE row (2 cols, label-over-value)
                so the long date+time strings don't make the card tall (ไม่บวม). */}
            <div className="grid grid-cols-2 gap-x-4 border-b border-border/40 pb-2">
              <div className="min-w-0">
                <div className="text-xs text-muted">วันที่สมัคร</div>
                <div className="truncate">
                  {u.userRegistered ? formatThaiDateTime(u.userRegistered) : "-"}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-xs text-muted">ล่าสุดล็อกอิน</div>
                <div className="truncate">
                  {u.userLastLogin ? formatThaiDateTime(u.userLastLogin) : "-"}
                </div>
              </div>
            </div>
            {/* Registered company address (นิติบุคคล) — the address tax docs use.
                Kept SEPARATE from the delivery address below (do not conflate). */}
            {isJuristic && identity.registeredAddress ? (
              <div className="pt-1 border-b border-border/40 pb-2">
                <span className="text-muted">ที่อยู่จดทะเบียน (บริษัท · ออกใบกำกับ)</span>
                <p className="mt-1 text-foreground">{identity.registeredAddress}</p>
              </div>
            ) : null}
            {/* Self-service doc re-stamp (owner 2026-07-15) — a customer upgraded to นิติ
                AFTER docs were issued: staff pick the already-issued ใบวางบิล/ใบเสร็จ and
                Apply the company identity themselves. Collapsed by default (autoLoad off). */}
            {isJuristic ? (
              <div className="pt-2 border-b border-border/40 pb-2">
                <div className="text-muted mb-1">เปลี่ยนเอกสารที่ออกไปแล้วเป็นนิติ</div>
                <JuristicDocRestampPanel userid={u.userID} autoLoad={false} />
              </div>
            ) : null}
            <div className="pt-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">ที่อยู่จัดส่ง (หลัก)</span>
                <a href="#address-manager" className="text-xs text-primary-600 hover:underline">
                  จัดการที่อยู่ ↓
                </a>
              </div>
              <p className="mt-1 text-foreground">{mainAddrText}</p>
            </div>
          </div>

          {/* Inline note editor (tb_users.userNote) — legacy โน้ต, under ข้อมูลบัญชี */}
          <NoteEditor userid={u.userID} initialNote={u.userNote} />
        </div>
      </div>

      {/* ── SECTION 4 · Shipping addresses table (legacy ที่อยู่จัดส่งในไทย) —
          full CRUD + set-main, main flag from tb_address_main. ── */}
      <div id="address-manager" className="scroll-mt-20">
        <AddressManager userid={u.userID} addresses={addresses} mainAddressId={mainAddrId} />
      </div>

      {/* ── SECTION 5 · ออเดอร์ฝากสั่งซื้อ (legacy shop table · faithful PCS
          users/profile columns: วันที่ · รหัสสมาชิก · เลขที่ · ข้อมูลสินค้า+รูป ·
          ราคารวม · สถานะ · อัปเดต · ตัวเลือก) ── */}
      <Section
        id="sec-shop"
        title={`ออเดอร์ฝากสั่งซื้อ (${shopFiltered.length}${shopSt !== "" ? ` / ${shopScan.length}` : ""})`}
        viewAllHref={buildSectionHref(sp, { shopSt: null, shopP: null, shopN: "100" }, "sec-shop")}
        headerExtra={<RowLimitSelect param="shopN" value={shopN} />}
        tabs={<SectionStatusTabs anchor="sec-shop" current={sp} statusParam="shopSt" pageParam="shopP" active={shopSt} tabs={shopTabs} />}
        footer={<SectionPagination anchor="sec-shop" current={sp} pageParam="shopP" page={shopP} pageSize={shopN} totalRows={shopFiltered.length} />}
      >
        {hos.length === 0 ? (
          <Empty>ยังไม่มีรายการฝากสั่งซื้อ</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>วันที่สร้าง</Th>
                <Th>รหัสสมาชิก</Th>
                <Th>เลขที่ออเดอร์</Th>
                <Th>ข้อมูลสินค้า</Th>
                <Th right>ราคารวม (บาท)</Th>
                <Th>สถานะ</Th>
                <Th>อัปเดต</Th>
                <Th>ตัวเลือก</Th>
              </tr>
            </thead>
            <tbody>
              {hos.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                  <Td>{r.hdate ? formatThaiDateTime(r.hdate) : "-"}</Td>
                  <Td>
                    <span className="font-mono">{u.userID}</span>
                    <SaleBadge adminId={u.adminIDSale} activeIds={activeSalesIds} activeLoaded={salesAdminsLoaded} />
                  </Td>
                  <Td mono>{r.hno ?? "-"}</Td>
                  <Td>
                    <div className="flex gap-2 items-start">
                      <Thumb url={shopCoverMap[String(r.id)] ?? null} alt={r.hno ?? `#${r.id}`} />
                      <span className="block max-w-[240px] break-words" title={r.htitle ?? ""}>
                        {r.htitle ?? "-"}
                      </span>
                    </div>
                  </Td>
                  <Td right>{fmtBaht(Number(r.htotalpriceuser ?? 0))}</Td>
                  <Td>
                    <StatusPill label={legacyOrderStatusThai(r.hstatus) || "-"} tone={orderStatusTone(r.hstatus)} />
                  </Td>
                  <Td>
                    <div className="text-[11px] text-muted whitespace-nowrap">
                      {r.hdateupdate ? formatThaiDateTime(r.hdateupdate) : "-"}
                    </div>
                    {r.adminidupdate ? <div className="text-[11px]">{r.adminidupdate}</div> : null}
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <Link
                        href={`/admin/service-orders/${encodeURIComponent(r.hno ?? String(r.id))}`}
                        className="inline-block rounded-md bg-green-600 text-white border border-green-700 px-2.5 py-1 text-[11px] font-semibold hover:bg-green-700 text-center"
                      >
                        ดูรายละเอียด
                      </Link>
                      <Link
                        href={`/admin/service-orders/${encodeURIComponent(r.hno ?? String(r.id))}`}
                        className="inline-block rounded-md bg-amber-500 text-white border border-amber-600 px-2.5 py-1 text-[11px] font-semibold hover:bg-amber-600 text-center"
                      >
                        อัปเดตรายการ
                      </Link>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {/* ── SECTION 6 · ออเดอร์ฝากนำเข้า (legacy forwarder table · faithful PCS
          users/profile columns: วันที่ · รหัสลูกค้า · รายละเอียด+รูป · ยอดรวม+kg/cbm ·
          เลขพัสดุจีน+ตู้/ประเภท/กล่อง · เลขพัสดุไทย+ขนส่ง/ที่อยู่ · สถานะ · อัปเดต ·
          ตัวเลือก). READ-only — money values unchanged. ── */}
      <Section
        id="sec-fwd"
        title={`ออเดอร์ฝากนำเข้า (${fwdFiltered.length}${fwdSt !== "" ? ` / ${fwdScan.length}` : ""})`}
        viewAllHref={buildSectionHref(sp, { fwdSt: null, fwdP: null, fwdN: "100" }, "sec-fwd")}
        headerExtra={<RowLimitSelect param="fwdN" value={fwdN} />}
        tabs={<SectionStatusTabs anchor="sec-fwd" current={sp} statusParam="fwdSt" pageParam="fwdP" active={fwdSt} tabs={fwdTabs} />}
        footer={<SectionPagination anchor="sec-fwd" current={sp} pageParam="fwdP" page={fwdP} pageSize={fwdN} totalRows={fwdFiltered.length} />}
      >
        {fws.length === 0 ? (
          <Empty>ยังไม่มีรายการฝากนำเข้า</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>วันที่สร้าง</Th>
                <Th>รหัสลูกค้า</Th>
                <Th>รายละเอียด</Th>
                <Th right>ยอดรวม (บาท)</Th>
                <Th>เลขพัสดุ (จีน)</Th>
                <Th>เลขพัสดุ (ไทย)</Th>
                <Th>สถานะ</Th>
                <Th>อัปเดต</Th>
                <Th>ตัวเลือก</Th>
              </tr>
            </thead>
            <tbody>
              {fws.map((r) => {
                const addr = [
                  `${r.faddressname ?? ""} ${r.faddresslastname ?? ""}`.trim(),
                  r.faddresszipcode,
                ]
                  .filter((s) => s && String(s).trim() !== "")
                  .join(" ");
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                    <Td>{r.fdate ? formatThaiDateTime(r.fdate) : "-"}</Td>
                    <Td>
                      <span className="font-mono">{u.userID}</span>
                      <SaleBadge adminId={u.adminIDSale} activeIds={activeSalesIds} activeLoaded={salesAdminsLoaded} />
                    </Td>
                    <Td>
                      <div className="flex gap-2 items-start">
                        <Thumb url={fwCoverMap[String(r.id)] ?? null} alt={`#${r.id}`} />
                        <div className="min-w-0">
                          <div className="font-semibold text-primary-600">#{r.id}</div>
                          {r.fdetail && r.fdetail.trim() !== "" && r.fdetail.trim() !== "..." ? (
                            <div className="max-w-[200px] break-words text-muted">{r.fdetail}</div>
                          ) : null}
                          {r.reforder && r.reforder.trim() !== "" ? (
                            <Link
                              href={`/admin/service-orders/${encodeURIComponent(r.reforder)}`}
                              className="mt-0.5 inline-block rounded-full border bg-sky-50 text-sky-700 border-sky-200 px-1.5 py-0.5 text-[11px] hover:bg-sky-100"
                            >
                              ฝากสั่งซื้อ : {r.reforder}
                            </Link>
                          ) : (
                            <span className="mt-0.5 inline-block rounded-full border bg-amber-50 text-amber-700 border-amber-200 px-1.5 py-0.5 text-[11px]">
                              ฝากนำเข้า
                            </span>
                          )}
                        </div>
                      </div>
                    </Td>
                    <Td right>
                      <div className="font-mono">{fmtBaht(Number(r.ftotalprice ?? 0))}</div>
                      <div className="text-[11px] text-muted mt-0.5">
                        {TRANSPORT_LABEL_FW[r.ftransporttype ?? ""] ?? ""}
                      </div>
                      <div className="text-[11px] text-muted">
                        {Number(r.fweight ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })} Kg ·{" "}
                        {Number(r.fvolume ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 5 })} CBM
                      </div>
                    </Td>
                    <Td>
                      <div className="font-mono text-[11px]">{r.ftrackingchn ?? "-"}</div>
                      {r.fcabinetnumber ? (
                        <div className="text-[11px] mt-0.5">
                          เลขตู้: <span className="font-mono">{r.fcabinetnumber}</span>
                        </div>
                      ) : null}
                      <div className="text-[11px] text-muted">
                        ประเภท: {PRODUCT_TYPE_LABEL_FW[r.fproductstype ?? ""] ?? "-"}
                      </div>
                      {r.fpallet ? <div className="text-[11px] text-muted">location: {r.fpallet}</div> : null}
                      <div className="text-[11px] text-muted">{r.famount ?? 0} กล่อง</div>
                    </Td>
                    <Td>
                      {r.fshipby ? <div className="text-[11px]">{carrierLabel(r.fshipby)}</div> : null}
                      {r.ftrackingth ? <div className="font-mono text-[11px]">{r.ftrackingth}</div> : null}
                      {addr ? <div className="text-[11px] text-muted max-w-[200px] break-words">{addr}</div> : null}
                    </Td>
                    <Td>
                      {/* สถานะ — platform SOT chip (สีต่อสถานะชัด: เหลือง/ฟ้า/ชมพู/น้ำตาล/แดง/
                          น้ำเงิน/เขียว) เหมือนหน้ารายงานตู้ · เดิมฟ้าเหมาโหล (ภูม 2026-07-21). */}
                      {(() => {
                        const b = fstatusBadge(r.fstatus ?? "");
                        const code = resolveRowStatusCode(r.fstatus, {
                          pendingSlip: pendingSlipFids.has(r.id),
                        });
                        return (
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${code === "5.1" ? fstatusVivid(code) : b.chip}`}>
                            {code === "5.1"
                              ? statusCodeLabel(code)
                              : (legacyForwarderStatusThai(r.fstatus) || b.label || "-")}
                          </span>
                        );
                      })()}
                    </Td>
                    <Td>
                      <div className="text-[11px] text-muted whitespace-nowrap">
                        {r.fdateadminstatus ? formatThaiDateTime(r.fdateadminstatus) : "-"}
                      </div>
                      {r.adminidkey ? <div className="text-[11px]">{r.adminidkey}</div> : null}
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-1">
                        <Link
                          href={`/admin/forwarders/${r.id}`}
                          className="inline-block rounded-md bg-green-600 text-white border border-green-700 px-2.5 py-1 text-[11px] font-semibold hover:bg-green-700 text-center"
                        >
                          ดูรายละเอียด
                        </Link>
                        <Link
                          href={`/admin/forwarders/${r.id}`}
                          className="inline-block rounded-md bg-amber-500 text-white border border-amber-600 px-2.5 py-1 text-[11px] font-semibold hover:bg-amber-600 text-center"
                        >
                          อัปเดตรายการ
                        </Link>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Section>

      {/* ── SECTION 7 · ออเดอร์ฝากโอน/ชำระ (legacy yuan-payment table · faithful
          PCS columns: วันที่ · เลขที่ · ชื่อ-นามสกุล · รายละเอียด · ยอดรวม · สถานะ ·
          อัปเดต · ตัวเลือก) ── */}
      <Section
        id="sec-yuan"
        title={`ออเดอร์ฝากโอน/ชำระ (${yuanFiltered.length}${yuanSt !== "" ? ` / ${yuanScan.length}` : ""})`}
        viewAllHref={buildSectionHref(sp, { yuanSt: null, yuanP: null, yuanN: "100" }, "sec-yuan")}
        headerExtra={<RowLimitSelect param="yuanN" value={yuanN} />}
        tabs={<SectionStatusTabs anchor="sec-yuan" current={sp} statusParam="yuanSt" pageParam="yuanP" active={yuanSt} tabs={yuanTabs} />}
        footer={<SectionPagination anchor="sec-yuan" current={sp} pageParam="yuanP" page={yuanP} pageSize={yuanN} totalRows={yuanFiltered.length} />}
      >
        {pys.length === 0 ? (
          <Empty>ยังไม่มีรายการฝากโอน/ชำระ</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>วันที่สร้าง</Th>
                <Th>เลขที่ออเดอร์</Th>
                <Th>ชื่อ-นามสกุล</Th>
                <Th>รายละเอียด</Th>
                <Th right>ยอดรวม (บาท)</Th>
                <Th>สถานะ</Th>
                <Th>อัปเดต</Th>
                <Th>ตัวเลือก</Th>
              </tr>
            </thead>
            <tbody>
              {pys.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                  <Td>{r.paydate ? formatThaiDateTime(r.paydate) : "-"}</Td>
                  <Td mono>{r.id}</Td>
                  <Td>
                    <div className="font-mono">{u.userID}</div>
                    <div className="text-[11px] text-muted">{fullName}</div>
                  </Td>
                  <Td>
                    {r.paydetail ? <div>{r.paydetail}</div> : null}
                    <div className="text-[11px] text-muted">
                      ¥{Number(r.payyuan ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </Td>
                  <Td right>{fmtBaht(Number(r.paythb ?? 0))}</Td>
                  <Td>
                    <StatusPill
                      label={PAYSTATUS_LABEL[r.paystatus ?? ""] ?? (r.paystatus ? `status ${r.paystatus}` : "-")}
                      tone={paystatusTone(r.paystatus)}
                    />
                  </Td>
                  <Td>{r.adminid ? <span className="text-[11px]">{r.adminid}</span> : "-"}</Td>
                  <Td>
                    <Link
                      href={`/admin/yuan-payments/${r.id}`}
                      className="inline-block rounded-md bg-amber-500 text-white border border-amber-600 px-2.5 py-1 text-[11px] font-semibold hover:bg-amber-600"
                    >
                      แก้ไข/ดูรายละเอียด
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {/* ── SECTION 8 · ประวัติการจ่ายเงิน (legacy wallet-hs table · faithful PCS
          columns + the legacy green(เข้า)/pink(ออก) row tint + สลิปรายการ) ── */}
      <Section
        id="sec-pay"
        title={`ประวัติการจ่ายเงิน (${walletHsCount})`}
        viewAllHref={buildSectionHref(sp, { payP: null, payN: "100" }, "sec-pay")}
        headerExtra={<RowLimitSelect param="payN" value={payN} />}
        footer={<SectionPagination anchor="sec-pay" current={sp} pageParam="payP" page={payP} pageSize={payN} totalRows={walletHsCount} />}
      >
        {whs.length === 0 ? (
          <Empty>ยังไม่มีประวัติการจ่ายเงิน</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>วันที่ทำรายการ</Th>
                <Th>เลขที่ดำเนินการ</Th>
                <Th>รหัสสมาชิก</Th>
                <Th>ประเภทรายการ</Th>
                <Th>สลิปรายการ</Th>
                <Th>รายการอ้างอิง</Th>
                <Th>สถานะ</Th>
                <Th right>จำนวนเงิน (บาท)</Th>
              </tr>
            </thead>
            <tbody>
              {whs.map((r) => {
                const amt = Number(r.amount ?? 0);
                const isNeg = amt < 0;
                const slipUrl = slipMap[String(r.id)] ?? null;
                // NOTE — legacy tints rows green(เข้า)/pink(ออก) by direction, but
                // our migrated tb_wallet_hs.amount is stored UNSIGNED and the `type`
                // labels don't reliably encode in/out (a slip "ชำระเงิน" is a top-up
                // IN; a "เติม (manual)" can carry an order ref = OUT). Coloring by a
                // guessed direction would misstate money flow (§0f), so we match the
                // canonical /admin/wallet transactions view: neutral rows, honest
                // magnitude, red only when the stored value is actually negative.
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                    <Td>{r.date ? formatThaiDateTime(r.date) : "-"}</Td>
                    <Td>
                      <Link href={`/admin/wallet/${r.id}`} className="font-mono text-primary-600 hover:underline">
                        {r.id}
                      </Link>
                    </Td>
                    <Td mono>{u.userID}</Td>
                    <Td>{WHS_TYPE_LABEL[r.type ?? ""] ?? (r.type ? `type ${r.type}` : "-")}</Td>
                    <Td>
                      {slipUrl ? (
                        <a href={slipUrl} target="_blank" rel="noreferrer" className="inline-block">
                          <SlipImage src={slipUrl} alt="สลิป" pdfMode="tile" className="h-10 w-10 rounded border border-border object-cover" />
                        </a>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </Td>
                    <Td mono>{r.reforder ?? "-"}</Td>
                    <Td>
                      <StatusPill
                        label={WHS_STATUS_LABEL[r.status ?? ""] ?? (r.status ? `status ${r.status}` : "-")}
                        tone={whsStatusTone(r.status)}
                      />
                    </Td>
                    <Td right>
                      <span className={isNeg ? "text-red-600 font-medium" : "font-medium"}>
                        {isNeg ? "−" : ""}฿
                        {Math.abs(amt).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Section>

      {/* ── 3 ชุดที่พนักงานแก้ได้เลย ไม่ต้องใส่ PIN (owner/ภูม 2026-08-03) — ดึงออกจาก
          "เครื่องมือผู้ดูแล" (PIN) มาไว้ตรงนี้: (1) ข้อมูลส่วนตัวลูกค้า (2) ข้อมูลบริษัท
          นิติบุคคล (3) เอกสารนิติบุคคล. เครื่องมือเงิน/แท็ก/Danger ยังอยู่ใต้ PIN ด้านล่าง. */}
      <IdentityEditor
        userid={u.userID}
        isSenior={isSeniorAdmin}
        admins={salesAdmins}
        initial={{
          userName:     u.userName ?? "",
          userLastName: u.userLastName ?? "",
          userEmail:    u.userEmail ?? "",
          userTel:      u.userTel ?? "",
          userSex:      u.userSex ?? "",
          userBirthday: u.userBirthday ?? "",
          userLineID:   u.userLineID ?? "",
          userFacebook: u.userFacebook ?? "",
          adminIDSale:  u.adminIDSale ?? "",
          coID:         u.coID ?? "",
        }}
      />

      {isJuristic ? (
        <div className="space-y-5">
          <CorporateEditor userid={u.userID} corp={corp} />
          <CorporateDocGallery userid={u.userID} docs={corpDocViews} status={corp?.corporatestatus ?? null} />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-alt/40 px-4 py-3 text-xs text-muted">
          ลูกค้ารายนี้เป็น <b>บุคคลธรรมดา</b> — ถ้าต้องการอัปเกรดเป็นนิติบุคคล กดปุ่ม{" "}
          <b className="text-primary-600">“อัพเกรดเป็นนิติบุคคล”</b> ที่ส่วนหัวโปรไฟล์ด้านบน
          (กรอกข้อมูลบริษัท + แนบเอกสารในตัว · ไม่ต้องใส่ PIN).
        </div>
      )}

      {/* ════════ เครื่องมือผู้ดูแล · Pacred — collapsed behind a light-gray "V"
          dropdown that opens a PIN dialog before revealing the tools ════════ */}
      <AdminToolsPinGate>
      <div className="flex items-center gap-3 pt-4">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold text-muted uppercase tracking-wider">
          เครื่องมือผู้ดูแล · Pacred
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Per-customer Margin Profile (2026-06-05 ภูม · CEO CRM-activation) —
          surfaces this customer's margin history (avg margin vs ฿15k cap).
          Pairs with /admin/accounting/margin-monitor. Money-internal cost data
          → ultra/accounting/pricing only (owner 2026-06-18 · canViewCostProfit).
          The `&& canSeeMargin` short-circuit keeps the panel + its cost-bearing
          `summary` prop off the client payload entirely for non-cost roles; the
          `canViewCostProfit` prop is the in-component defense-in-depth net. */}
      {canSeeMargin && (
        <CustomerMarginPanel summary={marginSummary} canViewCostProfit={canSeeMargin} />
      )}

      {/* Pricing segments (money · 2026-06-05) — legacy users/comparison (ค่าเทียบ/
          CPS) + users/credit (เครดิต). The price + credit engines already read
          these tb_users columns; this is the set/edit/remove admin CRUD. */}
      <div className="grid lg:grid-cols-2 gap-5">
        <ComparisonEditor userid={u.userID} enabled={comparisonEnabled} value={comparisonValue} />
        <CreditLineEditor
          userid={u.userID}
          enabled={creditEnabled}
          limit={creditLimit}
          days={creditDays}
          outstanding={creditOutstanding}
        />
      </div>

      {/* CRM depth (2026-06-08) — tags + activity timeline. Tags double as the
          AXELRA-vs-PCS lead-source marker; the timeline merges call-log +
          manual notes so the next rep can pick up the thread. */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
          <SectionHeading>แท็กลูกค้า</SectionHeading>
          <TagChips userid={u.userID} initialTags={customerTags} />
        </div>
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
          <SectionHeading>กิจกรรม / โน้ต</SectionHeading>
          <CustomerActivityTimeline userid={u.userID} initialEntries={customerActivity} />
        </div>
      </div>

      {/* ข้อมูลส่วนตัวลูกค้า + ข้อมูลบริษัทนิติบุคคล + เอกสารนิติบุคคล ย้ายออกไปไว้
          "นอก PIN" แล้ว (พนักงานแก้ได้เลย · owner/ภูม 2026-08-03) — อยู่ด้านบนก่อน
          "เครื่องมือผู้ดูแล". กรอบ PIN นี้เหลือเฉพาะเครื่องมือเงิน/แท็ก/Danger. */}

      {/* (เครื่องมือบัญชีลูกค้า — รีเซ็ตรหัสผ่าน + รันเลข PR ลูกค้าใหม่ moved UP into the
          identity header · owner 2026-07-06 · reachable without scrolling §0d.) */}

      {/* Danger zone — super-only HARD delete (staff-CRUD gap · §PM-6 #3.3).
          Only for truly-empty (test/orphan) accounts; the panel shows the
          activity gate up front + requires typing the PR-code to confirm. */}
      {isSuperAdmin ? (
        <HardDeletePanel
          userid={u.userID}
          forwarderCount={fwdCount}
          orderCount={ordCount}
          paymentCount={payCount}
          walletBalance={walletBalance}
          walletHistoryCount={walletHsCount}
        />
      ) : null}

      {/* Status mutate (อนุมัติ / ระงับ) still lives on the dedicated queues. */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <strong>หมายเหตุ:</strong> เรทขนส่ง · โน้ต · นิติบุคคล · ที่อยู่ · เซลล์ผู้ดูแล ทำได้ในหน้านี้แล้ว ✓ —
        ส่วน อนุมัติ / ระงับ ยังใช้หน้าย่อยเฉพาะทาง
        (<Link href="/admin/customers/transfer-rep" className="underline">ย้ายเซลล์ (bulk)</Link>
        {" · "}
        <Link href="/admin/customers/pending" className="underline">รายการรออนุมัติ</Link>).
      </div>
      </AdminToolsPinGate>
    </main>
  );
}

// ── tiny helpers ─────────────────────────────────────────
function Section({
  title,
  id,
  viewAllHref,
  headerExtra,
  tabs,
  footer,
  children,
}: {
  title: string;
  /** anchor ของ section — ลิงก์แท็บ/หน้า scroll กลับมาที่นี่ (`#<id>`) */
  id?: string;
  viewAllHref?: string;
  headerExtra?: React.ReactNode;
  /** หัวแถวสถานะ (owner 2026-07-31) — render ใต้หัว section */
  tabs?: React.ReactNode;
  /** แถบแบ่งหน้า — render ใต้ตาราง */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-20 rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <SectionHeading>{title}</SectionHeading>
        <div className="flex shrink-0 items-center gap-2.5">
          {headerExtra}
          {viewAllHref ? (
            // owner 2026-07-31: "กดดูทั้งหมดมันก็ควรยังอยู่ในหน้าโปรไฟล์ลูกค้า ไม่ควรย้ายไป
            // หน้านำเข้า" — href ตอนนี้เป็น query ในหน้าเดิม (?N=100#anchor) จึงใช้ <a>
            // (query-only + hash · ไม่ใช่ route ใหม่)
            <a href={viewAllHref} className="text-xs text-primary-600 hover:underline">
              ดูทั้งหมด →
            </a>
          ) : null}
        </div>
      </div>
      {tabs}
      {children}
      {footer}
    </div>
  );
}
function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto scrollbar-x-visible">
      <table className="w-full text-[11px] border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60 [&>tbody>tr:nth-child(even)]:bg-muted/30">{children}</table>
    </div>
  );
}
function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-2 py-3 text-[11px] uppercase tracking-wide text-muted bg-surface-alt/50 whitespace-nowrap ${right ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}
function Td({ children, mono, right }: { children?: React.ReactNode; mono?: boolean; right?: boolean }) {
  return (
    <td
      className={`px-2 py-2.5 align-top ${mono ? "font-mono" : ""} ${right ? "text-right" : "text-left"}`}
    >
      {children}
    </td>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-12 text-center text-sm text-muted">{children}</p>;
}

// ── legacy users/profile order-table helpers (faithful PCS port · 2026-06-12) ──
// Product-type + transport labels mirror function.php nameProductsType / the
// legacy forwarder table chips.
const PRODUCT_TYPE_LABEL_FW: Record<string, string> = {
  "1": "ทั่วไป", "2": "มอก.", "3": "อย.", "4": "พิเศษ", "5": "ควบคุมพิเศษ",
};
const TRANSPORT_LABEL_FW: Record<string, string> = {
  "1": "ขนส่งทางรถ", "2": "ขนส่งทางเรือ", "3": "ขนส่งทางอากาศ",
};
function SaleBadge({
  adminId,
  activeIds,
  activeLoaded,
}: {
  adminId: string | null;
  activeIds: ReadonlySet<string>;
  activeLoaded: boolean;
}) {
  // DISPLAY-only: a RETIRED assigned rep renders as the central line (owner
  // 2026-07-09). When the active list failed to load, fall back to the raw id
  // (never a false "central"). The stored adminIDSale is never rewritten.
  const resolved = resolveActiveSalesRep(adminId, { activeIds });
  const showCentral = activeLoaded && resolved.isCentral;
  const text = showCentral
    ? CENTRAL_SALES_LABEL
    : adminId?.trim() || "ไม่ระบุ";
  return (
    <span className="ml-1 inline-block rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
      Sale : {text}
    </span>
  );
}
function Thumb({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-border/60 bg-surface-alt/40 text-lg text-muted">
        📦
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className="h-12 w-12 shrink-0 rounded border border-border object-cover bg-surface-alt" loading="lazy" />
  );
}

// owner 2026-07-31 ("สำเร็จตรงนี้ยังสีอ่อนอยู่เลยครับ ไม่เด่นชัด") — LOUD solid fill
// ให้ตรงมาตรฐานเดียวกับ FSTATUS_VIVID / HSTATUS_CFG ที่ใช้ทั้งระบบ
// (§0h · สีสถานะ = LOGIC ไม่ใช่ chrome — ต้องอ่านออกใน 1 วินาที ไม่ใช่ tint จางๆ)
const PILL_TONE: Record<PillTone, string> = {
  green: "bg-emerald-600 text-white border-emerald-700 font-bold",
  red: "bg-red-600 text-white border-red-700 font-bold",
  amber: "bg-amber-500 text-white border-amber-600 font-bold",
  blue: "bg-blue-600 text-white border-blue-700 font-bold",
  gray: "bg-gray-500 text-white border-gray-600 font-bold",
};
function StatusPill({ label, tone = "gray" }: { label: string; tone?: PillTone }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${PILL_TONE[tone]}`}>
      {label}
    </span>
  );
}

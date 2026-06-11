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
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { Link } from "@/i18n/navigation";
import { Settings } from "lucide-react";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { getCustomerRateMatrix } from "@/actions/admin/customer-rate";
import { getCustomerStatCounts, listSalesAdmins, listCsAdmins } from "@/actions/admin/customer-profile";
import { getCustomerMarginSummary } from "@/actions/admin/customer-margin";
// Legacy status vocabularies (D1 faithful-port SOT) — Thai labels for the
// single-char tb_* status codes the order tables show.
import { legacyOrderStatusThai, legacyForwarderStatusThai } from "@/lib/legacy-status-map";
import { CustomerRateEditor } from "./rate-editor";
import { CustomerMarginPanel } from "./customer-margin-panel";
import { HardDeletePanel } from "./hard-delete-panel";
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
  AddressManager,
} from "./profile-sections";

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

type FRow = {
  id: number;
  fdate: string | null;
  fidorco: string | null;          // ← legacy uses fidorco as the customer-facing F-no
  fcabinetnumber: string | null;
  fstatus: string | null;
  ftotalprice: number | null;
};
type HRow = {
  id: number;
  hdate: string | null;
  hno: string | null;
  hstatus: string | null;
  htotalpriceuser: number | null;
  htitle: string | null;
};
type PRow = {
  id: number;
  paydate: string | null;
  paystatus: string | null;
  payyuan: number | null;
  paythb: number | null;
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
};
type WRow = {
  wallettotal: number | null;
};
// Wave 20 P0-1: juristic company info — legacy `tb_corporate` keyed by
// userid (mirrors the customer-portal `/profile` + `/service-order/add`
// reads). `corporatestatus` '1' = approved/verified.
type CRow = {
  id: number;
  corporatename: string | null;
  corporatenumber: string | null;     // tax id (เลขผู้เสียภาษี · 13 digits)
  corporateaddress: string | null;
  corporatestatus: string | null;
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
function forwarderStatusTone(code: string | null): PillTone {
  return code === "7" ? "green" : code === "5" ? "amber" : "blue";
}

export async function renderLegacyCustomerView(id: string) {
  const admin = createAdminClient();

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
      "userID,userName,userLastName,userCompany,userEmail,userTel,userActive,userRegistered,userLastLogin,adminIDSale,adminIDCS,userNote,userPicture,userSex,userBirthday,userLineID,userFacebook,coID,userComparison,userComparisonValue,userCredit,userCreditValue,userCreditDate",
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
      .select("id, corporatename, corporatenumber, corporateaddress, corporatestatus")
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
    admin
      .from("tb_forwarder")
      .select("id,fdate,fidorco,fcabinetnumber,fstatus,ftotalprice")
      .eq("userid", u.userID)
      .order("fdate", { ascending: false })
      .limit(10),
    admin
      .from("tb_header_order")
      .select("id,hdate,hno,hstatus,htotalpriceuser,htitle")
      .eq("userid", u.userID)
      .order("hdate", { ascending: false })
      .limit(10),
    admin
      .from("tb_payment")
      .select("id,paydate,paystatus,payyuan,paythb")
      .eq("userid", u.userID)
      .order("paydate", { ascending: false })
      .limit(10),
    // ประวัติการจ่ายเงิน (wallet-hs) recent 10 — legacy profile section 8.
    // Best-effort: column set mirrors the customer wallet reader; degrades
    // to an empty list on error (not in the load-bearing throw set).
    admin
      .from("tb_wallet_hs")
      .select("id,date,status,amount,type,reforder")
      .eq("userid", u.userID)
      .order("id", { ascending: false })
      .limit(10),
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
  const forwarderRows = forwarderRes.data;
  const shopRows = shopRes.data;
  const yuanRows = yuanRes.data;
  const isJuristic = u.userCompany === "1";
  const fullName = `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || "—";
  const active = u.userActive ?? "1";
  const statusCfg = STATUS_ACTIVE_CFG[active] ?? {
    label: `status ${active}`,
    cls: "bg-gray-100 text-gray-600 border-gray-200",
  };

  const fws = (forwarderRows ?? []) as unknown as FRow[];
  const hos = (shopRows ?? []) as unknown as HRow[];
  const pys = (yuanRows ?? []) as unknown as PRow[];
  const whs = (walletHsRowsRes.data ?? []) as unknown as WHRow[];

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
  const [rateMatrix, statCounts, salesAdminsRes, csAdminsRes, marginSummary, tagsRes, activityRes] = await Promise.all([
    getCustomerRateMatrix(u.userID),
    getCustomerStatCounts(u.userID),
    listSalesAdmins(),
    listCsAdmins(),
    getCustomerMarginSummary(u.userID),
    // CRM depth (2026-06-08) — best-effort: degrade to empty on error.
    getTags(u.userID),
    getCustomerActivity(u.userID),
  ]);
  const salesAdmins = salesAdminsRes.ok ? salesAdminsRes.data?.rows ?? [] : [];
  const csAdmins = csAdminsRes.ok ? csAdminsRes.data?.rows ?? [] : [];
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
  const isSeniorAdmin =
    adminRoles.includes("super") ||
    ["manager", "accounting", "qa"].some((r) => adminRoles.includes(r as never));

  // Hard-delete is super-only (staff-CRUD gap · §PM-6 #3.3). Exact activity
  // counts feed the danger-zone panel's safety gate (count reads are best-
  // effort — a transient miss degrades to 0, but the action re-checks
  // server-side so a wrong 0 here can never bypass the real gate).
  const isSuperAdmin = adminRoles.includes("super");
  const fwdCount = fwdCountRes.count ?? 0;
  const ordCount = ordCountRes.count ?? 0;
  const payCount = payCountRes.count ?? 0;
  const walletHsCount = walletHsCountRes.count ?? 0;

  const fmtBaht = (n: number) =>
    `฿${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* ── SECTION 1 · Profile header card (legacy users/profile top card) ── */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <p className="text-xs font-semibold tracking-widest text-primary-600">
            ADMIN · ลูกค้า {isJuristic ? "นิติบุคคล" : "บุคคล"}
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            {/* legacy rate-settings gear (top-right of the profile card) →
                anchors to the Pacred rate editor below */}
            <a
              href="#rate-settings"
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-surface-alt"
            >
              <Settings className="w-3.5 h-3.5" /> ตั้งค่าเรทขนส่ง
            </a>
            <Link href="/admin/customers" className="text-xs text-primary-600 hover:underline">
              ← รายการลูกค้า
            </Link>
          </div>
        </div>

        <div className="mt-3 flex flex-col items-center text-center gap-2">
          {/* Wave 13: legacy avatar — resolved signed URL or initial-letter
              fallback when no portrait was uploaded. */}
          {userImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={userImageUrl}
              alt={fullName}
              className="w-24 h-24 rounded-full object-cover border border-border"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-3xl border border-border">
              {(u.userName ?? u.userID).trim().charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <h2 className="text-lg font-semibold">{fullName}</h2>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className="text-2xl font-bold font-mono">{u.userID}</span>
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusCfg.cls}`}>
              {statusCfg.label}
            </span>
            {rateMatrix.isSvip ? (
              <span className="rounded-full bg-primary-600 text-white px-3 py-1 text-xs font-semibold">
                SVIP · เรทเฉพาะตัว
              </span>
            ) : null}
          </div>
        </div>

        {/* Sale + CS rep editors (legacy "Sale : admin_xxx แก้ไข" badge) */}
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          <SaleRepEditor userid={u.userID} currentRep={u.adminIDSale} admins={salesAdmins} />
          <CsRepEditor userid={u.userID} currentRep={u.adminIDCS} admins={csAdmins} />
        </div>
      </div>

      {/* ── SECTION 2 · Profile detail (legacy 2-col: left=account meta + main
          address, right=identity). Note editor directly below (legacy โน้ต). ── */}
      <div className="grid lg:grid-cols-2 gap-5 items-start">
        {/* Left: account meta + main shipping address */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3 text-sm">
          <h2 className="text-sm font-semibold">ข้อมูลบัญชี</h2>
          <KV
            label="วันที่สมัคร"
            value={u.userRegistered ? new Date(u.userRegistered).toLocaleString("th-TH") : "-"}
          />
          <KV
            label="ล่าสุดล็อกอิน"
            value={u.userLastLogin ? new Date(u.userLastLogin).toLocaleString("th-TH") : "-"}
          />
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

        {/* Right: identity editor (faithful editUser — email/phone/sex/birthday/
            line/fb + senior-only rep/coID) */}
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
      </div>

      {/* Inline note editor (tb_users.userNote) — legacy โน้ต in profile card */}
      <NoteEditor userid={u.userID} initialNote={u.userNote} />

      {/* ── SECTION 3 · 8 stat cards (faithful to legacy profile.php tiles ·
          counts from tb_header_order / tb_forwarder / tb_payment / tb_wallet(_hs)
          / tb_cash_back_hs). Unverifiable counts render "—" not a wrong number. ── */}
      <StatCards userid={u.userID} walletBalance={walletBalance} counts={statCounts} />

      {/* ── SECTION 4 · Shipping addresses table (legacy ที่อยู่จัดส่งในไทย) —
          full CRUD + set-main, main flag from tb_address_main. ── */}
      <div id="address-manager" className="scroll-mt-20">
        <AddressManager userid={u.userID} addresses={addresses} mainAddressId={mainAddrId} />
      </div>

      {/* ── SECTION 5 · ออเดอร์ฝากสั่งซื้อ (legacy shop table) ── */}
      <Section title={`ออเดอร์ฝากสั่งซื้อ (${hos.length})`} viewAllHref={`/admin/service-orders?q=${u.userID}`}>
        {hos.length === 0 ? (
          <Empty>ยังไม่มีรายการฝากสั่งซื้อ</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>วันที่สร้าง</Th>
                <Th>เลขที่ออเดอร์</Th>
                <Th>ข้อมูลสินค้า</Th>
                <Th right>ราคารวม (บาท)</Th>
                <Th>สถานะ</Th>
                <Th>ตัวเลือก</Th>
              </tr>
            </thead>
            <tbody>
              {hos.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <Td>{r.hdate ? String(r.hdate).slice(0, 10) : "-"}</Td>
                  <Td mono>{r.hno ?? "-"}</Td>
                  <Td>
                    <span className="block max-w-[260px] truncate" title={r.htitle ?? ""}>
                      {r.htitle ?? "-"}
                    </span>
                  </Td>
                  <Td right>{fmtBaht(Number(r.htotalpriceuser ?? 0))}</Td>
                  <Td>
                    <StatusPill label={legacyOrderStatusThai(r.hstatus) || "-"} tone={orderStatusTone(r.hstatus)} />
                  </Td>
                  <Td>
                    <Link
                      href={`/admin/service-orders/${encodeURIComponent(r.hno ?? String(r.id))}`}
                      className="inline-block rounded-md border border-green-200 text-green-700 px-2.5 py-1 text-[11px] hover:bg-green-50"
                    >
                      ดูรายละเอียด
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {/* ── SECTION 6 · ออเดอร์ฝากนำเข้า (legacy forwarder table) ── */}
      <Section title={`ออเดอร์ฝากนำเข้า (${fws.length})`} viewAllHref={`/admin/forwarders?focus=search&q=${u.userID}`}>
        {fws.length === 0 ? (
          <Empty>ยังไม่มีรายการฝากนำเข้า</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>วันที่สร้าง</Th>
                <Th>เลขที่รายการ</Th>
                <Th>เบอร์ตู้</Th>
                <Th right>ยอดรวม (บาท)</Th>
                <Th>สถานะ</Th>
                <Th>ตัวเลือก</Th>
              </tr>
            </thead>
            <tbody>
              {fws.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <Td>{r.fdate ? String(r.fdate).slice(0, 10) : "-"}</Td>
                  <Td mono>{r.fidorco ?? "-"}</Td>
                  <Td mono>{r.fcabinetnumber ?? "-"}</Td>
                  <Td right>{fmtBaht(Number(r.ftotalprice ?? 0))}</Td>
                  <Td>
                    <StatusPill label={legacyForwarderStatusThai(r.fstatus) || "-"} tone={forwarderStatusTone(r.fstatus)} />
                  </Td>
                  <Td>
                    <Link
                      href={`/admin/forwarders/${encodeURIComponent(r.fidorco ?? String(r.id))}`}
                      className="inline-block rounded-md border border-green-200 text-green-700 px-2.5 py-1 text-[11px] hover:bg-green-50"
                    >
                      ดูรายละเอียด
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {/* ── SECTION 7 · ออเดอร์ฝากโอน/ชำระ (legacy yuan-payment table) ── */}
      <Section title={`ออเดอร์ฝากโอน/ชำระ (${pys.length})`} viewAllHref={`/admin/yuan-payments?q=${u.userID}`}>
        {pys.length === 0 ? (
          <Empty>ยังไม่มีรายการฝากโอน/ชำระ</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>วันที่สร้าง</Th>
                <Th right>ยอดหยวน</Th>
                <Th right>ยอดรวม (บาท)</Th>
                <Th>สถานะ</Th>
                <Th>ตัวเลือก</Th>
              </tr>
            </thead>
            <tbody>
              {pys.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <Td>{r.paydate ? String(r.paydate).slice(0, 10) : "-"}</Td>
                  <Td right>
                    ¥{Number(r.payyuan ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </Td>
                  <Td right>{fmtBaht(Number(r.paythb ?? 0))}</Td>
                  <Td>
                    <StatusPill
                      label={PAYSTATUS_LABEL[r.paystatus ?? ""] ?? (r.paystatus ? `status ${r.paystatus}` : "-")}
                      tone={paystatusTone(r.paystatus)}
                    />
                  </Td>
                  <Td>
                    <Link
                      href={`/admin/yuan-payments/${r.id}`}
                      className="inline-block rounded-md border border-green-200 text-green-700 px-2.5 py-1 text-[11px] hover:bg-green-50"
                    >
                      ดูรายละเอียด
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {/* ── SECTION 8 · ประวัติการจ่ายเงิน (legacy wallet-hs table) ── */}
      <Section title={`ประวัติการจ่ายเงิน (${whs.length}${walletHsCount > whs.length ? ` จาก ${walletHsCount}` : ""})`} viewAllHref={`/admin/wallet?view=tx&q=${u.userID}`}>
        {whs.length === 0 ? (
          <Empty>ยังไม่มีประวัติการจ่ายเงิน</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>วันที่ทำรายการ</Th>
                <Th>เลขที่ดำเนินการ</Th>
                <Th>ประเภทรายการ</Th>
                <Th>รายการอ้างอิง</Th>
                <Th>สถานะ</Th>
                <Th right>จำนวนเงิน (บาท)</Th>
              </tr>
            </thead>
            <tbody>
              {whs.map((r) => {
                const amt = Number(r.amount ?? 0);
                const isNeg = amt < 0;
                return (
                  <tr key={r.id} className="border-t border-border">
                    <Td>{r.date ? new Date(r.date).toLocaleString("th-TH") : "-"}</Td>
                    <Td>
                      <Link href={`/admin/wallet/${r.id}`} className="font-mono text-primary-600 hover:underline">
                        {r.id}
                      </Link>
                    </Td>
                    <Td>{WHS_TYPE_LABEL[r.type ?? ""] ?? (r.type ? `type ${r.type}` : "-")}</Td>
                    <Td mono>{r.reforder ?? "-"}</Td>
                    <Td>
                      <StatusPill
                        label={WHS_STATUS_LABEL[r.status ?? ""] ?? (r.status ? `status ${r.status}` : "-")}
                        tone={whsStatusTone(r.status)}
                      />
                    </Td>
                    <Td right>
                      <span className={isNeg ? "text-red-600" : "text-emerald-600"}>
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

      {/* ════════ เครื่องมือผู้ดูแล · Pacred (เพิ่มเติมจาก legacy) ════════ */}
      <div className="flex items-center gap-3 pt-4">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold text-muted uppercase tracking-wider">
          เครื่องมือผู้ดูแล · Pacred
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Per-customer Margin Profile (2026-06-05 ภูม · CEO CRM-activation) —
          surfaces this customer's margin history (avg margin vs ฿15k cap).
          Pairs with /admin/accounting/margin-monitor. */}
      <CustomerMarginPanel summary={marginSummary} />

      {/* Per-customer rate editor (เดฟ 2026-05-30) — faithful port of the legacy
          #rate-settings modal (writes LIVE tb_rate_custom_kg/cbm + history).
          The header ⚙️ gear anchors here. */}
      <div id="rate-settings" className="scroll-mt-20">
        <CustomerRateEditor userid={u.userID} customerName={fullName} matrix={rateMatrix} />
      </div>

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
          <h2 className="text-sm font-semibold">แท็กลูกค้า</h2>
          <TagChips userid={u.userID} initialTags={customerTags} />
        </div>
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
          <h2 className="text-sm font-semibold">กิจกรรม / โน้ต</h2>
          <CustomerActivityTimeline userid={u.userID} initialEntries={customerActivity} />
        </div>
      </div>

      {/* Juristic company info (tb_corporate) — editable in-place (UPDATE-only,
          file upload deferred). Only render for นิติบุคคล customers. */}
      {isJuristic ? <CorporateEditor userid={u.userID} corp={corp} /> : null}

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
    </main>
  );
}

// ── tiny helpers ─────────────────────────────────────────
function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between border-b border-border/40 py-1.5 gap-3">
      <span className="text-muted shrink-0">{label}</span>
      <span className={mono ? "font-mono text-right" : "text-right"}>{value}</span>
    </div>
  );
}
function Section({
  title,
  viewAllHref,
  children,
}: {
  title: string;
  viewAllHref?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {viewAllHref ? (
          <Link href={viewAllHref} className="text-xs text-primary-600 hover:underline">
            ดูทั้งหมด →
          </Link>
        ) : null}
      </div>
      {children}
    </div>
  );
}
function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">{children}</table>
    </div>
  );
}
function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-3 py-2 text-[10px] uppercase text-muted bg-surface-alt/50 ${right ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}
function Td({ children, mono, right }: { children?: React.ReactNode; mono?: boolean; right?: boolean }) {
  return (
    <td
      className={`px-3 py-2 ${mono ? "font-mono" : ""} ${right ? "text-right" : "text-left"}`}
    >
      {children}
    </td>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-8 text-center text-sm text-muted">{children}</p>;
}

const PILL_TONE: Record<PillTone, string> = {
  green: "bg-green-100 text-green-700 border-green-200",
  red: "bg-red-100 text-red-700 border-red-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  gray: "bg-gray-100 text-gray-600 border-gray-200",
};
function StatusPill({ label, tone = "gray" }: { label: string; tone?: PillTone }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${PILL_TONE[tone]}`}>
      {label}
    </span>
  );
}

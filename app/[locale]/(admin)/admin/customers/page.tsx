import { createAdminClient } from "@/lib/supabase/admin";
import { isGeneralCoid } from "@/lib/forwarder/coid";
import { resolveLegacyUrl, resolveLegacyUrlMap } from "@/lib/storage/legacy-resolver";
import { Link } from "@/i18n/navigation";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { PageHeader } from "@/components/admin/page-header";
import { buildDefaultLandingRedirect } from "@/lib/admin/default-queue-filter";
import { getAdminLegacyId } from "@/lib/admin/default-queue-filter-server";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { exportCustomersAll } from "@/actions/admin/export/customers";
import { CustomersTable, PendingJuristicReviews, type CustomerTableRow, type JuristicBundle } from "./customers-table";

// P0-21 (ADR-0021 corporate-SOT): the inline juristic review reads the LEGACY
// `tb_corporate` (keyed by userid = member_code) — the same SOT /admin/juristic-check
// + verifyJuristic/rejectJuristic/adminConvertToJuristic already use — NOT the
// rebuilt-empty `corporate` (profile_id UUID). So the 8,898 migrated juristic
// customers surface here for review. corporatestatus codes (statusComp ·
// function.php:530): '1'=pending '2'=verified '3'=rejected → the client
// JuristicBundle keyword. Legacy docs (cert + ภพ20) are bare filenames under the
// legacy `file` bucket → resolveLegacyUrl(…, "file").
const CORP_STATUS_TO_KEYWORD: Record<string, "pending" | "verified" | "rejected"> = {
  "1": "pending", "2": "verified", "3": "rejected",
};
function guessLegacyDocMime(filename: string | null): string {
  if (!filename) return "application/octet-stream";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (["jpg", "jpeg"].includes(ext)) return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}
/** Resolve a tb_corporate row's cert + ภพ20 filenames → signed-URL doc entries. */
async function resolveLegacyCorpDocs(
  corporatefile: string | null,
  corporatefile20: string | null,
): Promise<{ label: string; url: string; mime: string }[]> {
  const docs: { label: string; url: string; mime: string }[] = [];
  const [certUrl, vatUrl] = await Promise.all([
    resolveLegacyUrl(corporatefile, "file"),
    resolveLegacyUrl(corporatefile20, "file"),
  ]);
  if (certUrl) docs.push({ label: "หนังสือรับรองบริษัท", url: certUrl, mime: guessLegacyDocMime(corporatefile) });
  if (vatUrl) docs.push({ label: "ภ.พ.20", url: vatUrl, mime: guessLegacyDocMime(corporatefile20) });
  return docs;
}

// ─────────────────────────────────────────────────────────────────────
// Page top-menubar — ภูม brief 2026-05-20 ค่ำ.
// Sidebar got a single-leaf "ลูกค้าทั้งหมด" → click lands here. All
// group filters + work queues + search live in the horizontal menubar
// so the sidebar stays slim (Pacred-is-one-company pattern · matches
// accounting/cargo + accounting/freight pages).
// ─────────────────────────────────────────────────────────────────────
const CUSTOMERS_MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/customers" },
  // staff-CRUD gap (§PM-6 #3.3): admin-create-customer entry (no self-register).
  { label: "+ เพิ่มลูกค้า", href: "/admin/customers/new" },
  // Wave 28 (2026-05-29 · ภูม flagged): "รออนุมัติ" was buried 2-levels deep
  // under "งาน" submenu — staff couldn't find new-signup queue. Promoted
  // to a top-level tab since the E2E loop step 2 ("เซลรับลูกค้า") starts here.
  { label: "🆕 รออนุมัติ",  href: "/admin/customers/pending" },
  {
    label: "ตามประเภท",
    children: [
      { label: "ลูกค้าทั่วไป",        href: "/admin/customers?group=general" },
      { label: "VIP",                href: "/admin/customers?group=vip" },
      { label: "SVIP",               href: "/admin/customers?group=svip" },
      { label: "นิติบุคคล",          href: "/admin/customers?group=corporate" },
      // 2026-06-05 (LANE C) — point เครดิต/คิดค่าเทียบ at their dedicated
      // faithful-port pages (legacy users-credit.php / users-comparison.php),
      // which carry the วงเงิน/วัน/คงเหลือ + ค่าเทียบ columns + add/edit/remove —
      // richer than the inline ?group= filter (which only narrows the list).
      { label: "เครดิต",             href: "/admin/customers/credit" },
      { label: "คิดค่าเทียบ (CPS)",  href: "/admin/customers/comparison" },
      { label: "ลูกค้า Freight",     href: "/admin/customers?segment=freight" },
    ],
  },
  {
    label: "งาน",
    children: [
      { label: "เคลื่อนไหวล่าสุด",   href: "/admin/customers/recently-active" },
      { label: "ย้ายเซลล์ดูแล",      href: "/admin/customers/transfer-rep" },
    ],
  },
  { label: "ค้นหา", href: "/admin/customers?focus=search" },
];

// D1 Wave-2 (_SYNTHESIS §7.1 / §7.4): the admin customer list reads the
// migrated legacy table `tb_users` (~8,898 PCS customers) — NOT the
// rebuilt-era `profiles` table (~3 rows). Legacy account state lives in
// two varchar(1) flags:
//   userActive  '1'=ใช้งานแล้ว (sales-contacted) · ''=migrated pending · '0'=native pending
//   userStatus  '1'=ใช้งาน                  · '0'=ลบบัญชี (deleted)
// → derived status: userActive in ('','0') ⇒ incomplete · userStatus='0' ⇒
//   suspended (deleted) · otherwise active.
// P1-17 (ADR-0019 D-C transitional): legacy migrated pending = '',
// native pending = '0'. Until เดฟ P1-16 flips '0'→'', treat BOTH as incomplete.
type DerivedStatus = "active" | "incomplete" | "suspended";

function deriveStatus(u: { userActive: string | null; userStatus: string | null }): DerivedStatus {
  if (u.userStatus === "0") return "suspended";
  if (u.userActive === "0" || u.userActive === "") return "incomplete";
  return "active";
}

// ────────────────────────────────────────────────────────────────────
// Wave 18-A: 5 fidelity columns from legacy `pcs-admin/users.php`
//   VIP chip · birthday DD/MM + age · LINE ID · Facebook · main address.
//   (Sorting + the inline juristic review now live in customers-table.tsx.)
// ────────────────────────────────────────────────────────────────────

/** True for any legacy `coid` that signals a non-default VIP tier.
 *  General = ''/'PR'/'PCS'/'GENERAL' (coid.ts SOT · 'PR' canonical post-0182). */
function isVipCoid(coid: string | null | undefined): boolean {
  return !isGeneralCoid(coid);
}

/** Parse YYYY-MM-DD or ISO into { dm, age }. Returns nulls on failure. */
function formatBirthday(raw: string | null | undefined): { dm: string; age: number | null } {
  if (!raw) return { dm: "—", age: null };
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return { dm: "—", age: null };
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  // Sanity — legacy rows with "0000-00-00" parse to negative years.
  if (age < 0 || age > 120) return { dm: `${dd}/${mm}`, age: null };
  return { dm: `${dd}/${mm}`, age };
}

/** Compact one-liner for a tb_address row. Picks the most-specific parts. */
function summarizeAddress(a: {
  addressno: string | null;
  addresssubdistrict: string | null;
  addressdistrict: string | null;
  addressprovince: string | null;
  addresszipcode: string | null;
} | undefined): string {
  if (!a) return "—";
  const parts = [a.addressno, a.addresssubdistrict, a.addressdistrict, a.addressprovince, a.addresszipcode]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "—";
}

// Sidebar `?group=` filter (lib/admin/sidebar-menu.ts blockUserCargo) →
// the DB filter we run + the chip label we render. The legacy `tb_users`
// table carries three varchar(1) segment flags faithfully:
//   corporate  → usercompany='1'   (นิติบุคคล)
//   credit     → usercredit='1'    (สมาชิกเครดิต)
//   comparison → usercomparison='1' (สมาชิกคิดค่าเทียบ)
const GROUP_CFG: Record<string, { label: string; col?: string }> = {
  general:    { label: "สมาชิกทั่วไป" },
  vip:        { label: "สมาชิก VIP" },
  svip:       { label: "สมาชิก SVIP" },
  corporate:  { label: "สมาชิกนิติบุคคล", col: "userCompany" },
  credit:     { label: "สมาชิกเครดิต",    col: "userCredit" },
  comparison: { label: "สมาชิกคิดค่าเทียบ", col: "userComparison" },
};

// P0-21: DOC_LABELS removed with the rebuilt `documents` reads — the LEGACY
// tb_corporate docs use fixed labels (หนังสือรับรองบริษัท / ภ.พ.20) resolved in
// resolveLegacyCorpDocs above.

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; group?: string; adminidsale?: string; page?: string }> }) {
  // W-1 (gap-admin H-1/H-7): page-level role gate. Lists every
  // customer's member_code/name/phone/email + wallet balances via
  // createAdminClient (RLS-bypass) — a PDPA/PII surface. ops + sales +
  // accounting (super implicit); driver/warehouse refused.
  const { user, roles } = await requireAdmin(["ops", "sales_admin", "accounting"]);

  const sp = await searchParams;

  // G6 — default queue filter per role. sales_admin lands on their
  // own customer book via ?adminidsale=<legacy_admin_id>. Other roles
  // see all (no default).
  const legacyAdminId = await getAdminLegacyId(user.id);
  const defaultRedirect = buildDefaultLandingRedirect(
    "/admin/customers",
    roles,
    sp as Record<string, unknown>,
    { legacyAdminId },
  );
  if (defaultRedirect) redirect(defaultRedirect);

  const admin = createAdminClient();

  // Pending-signup count (owner 2026-06-11): every new signup mirrors into
  // tb_users with userActive IN ('','0') and surfaces at /admin/customers/pending.
  // Show a prominent banner here so a staffer landing on /admin/customers
  // immediately sees + can reach new signups to ตรวจสอบ + แบ่งเซล/CS. Same
  // filter the pending page + deriveStatus("incomplete") use. head:true →
  // count only, no rows pulled.
  const { count: pendingSignupCount, error: pendingCountErr } = await admin
    .from("tb_users")
    .select("userID", { count: "exact", head: true })
    .in("userActive", ["", "0"]);
  if (pendingCountErr) {
    console.error(`[tb_users pending count] failed`, { code: pendingCountErr.code, message: pendingCountErr.message });
  }

  // PERF (2026-06-03): server-side pagination — fetch ONE page (50 rows) via
  // .range() + an exact count for the pager, instead of pulling 200 rows + all
  // their joins/doc-resolution every render. ?page=N drives the window.
  const page = parsePage(sp.page);
  const { from, to } = pageRange(page);

  // D1 Wave-2: read legacy tb_users (member-code identity = `userID`).
  let q = admin.from("tb_users")
    .select(`
      userID, userName, userLastName, userCompany,
      userTel, userEmail, userActive, userStatus, adminIDSale, userRegistered,
      coID, userLineID, userFacebook, userBirthday, userPicture,
      userCreditValue, userCreditDate
    `, { count: "exact" })
    .order("userRegistered", { ascending: false })
    .range(from, to);

  // `type` filter — userCompany '1' = นิติบุคคล (juristic), else บุคคล.
  if (sp.type === "personal")  q = q.neq("userCompany", "1");
  if (sp.type === "juristic")  q = q.eq("userCompany", "1");

  // Sidebar `?group=` filter — see GROUP_CFG header comment for the mapping.
  const group = typeof sp.group === "string" && sp.group in GROUP_CFG ? sp.group : null;
  const groupCol = group ? GROUP_CFG[group].col : undefined;
  if (groupCol) q = q.eq(groupCol, "1");

  // G6 — sales-rep filter (sp.adminidsale). The sentinel "__none__" = the
  // NO-REP queue (cockpit "(ไม่มีเซลล์)" drill-down · 2026-06-14) so staff can
  // open unassigned customers + set sales/CS on the detail page.
  const adminidsale =
    typeof sp.adminidsale === "string" && sp.adminidsale.trim() !== ""
      ? sp.adminidsale.trim()
      : null;
  if (adminidsale === "__none__") {
    q = q.or("adminIDSale.is.null,adminIDSale.eq.");
  } else if (adminidsale) {
    q = q.eq("adminIDSale", adminidsale);
  }

  if (sp.q) {
    const term = sp.q.replace(/[\\%_,]/g, (m) => "\\" + m);
    q = q.or(`userID.ilike.%${term}%,userTel.ilike.%${term}%,userName.ilike.%${term}%,userLastName.ilike.%${term}%`);
  }

  const { data, error, count: totalCustomers } = await q;
  if (error) {
    console.error(`[tb_users list] failed`, { code: error.code, message: error.message });
  }
  type Row = {
    userID: string;
    userName: string | null;
    userLastName: string | null;
    userCompany: string | null;
    userTel: string | null;
    userEmail: string | null;
    userActive: string | null;
    userStatus: string | null;
    adminIDSale: string | null;
    userRegistered: string | null;
    coID: string | null;
    userLineID: string | null;
    userFacebook: string | null;
    userBirthday: string | null;
    userPicture: string | null;
    userCreditValue: number | string | null;
    userCreditDate: number | string | null;
  };
  const rows = (data ?? []) as Row[];

  // Wallet balances — legacy tb_wallet keyed by userid (lowercase).
  const userIds = rows.map((r) => r.userID);

  // Self-explaining-row standard (owner 2026-06-22): a profile avatar
  // thumbnail as the leftmost element of each row. tb_users.userPicture stores
  // a bare legacy filename (e.g. "PCS06_169...jpg") → resolve to a 1h signed
  // URL via the "profile" bucket. (Column is `userPicture` — NOT `userimage`;
  // selecting the wrong name 42703-errors the whole list = blank "ไม่พบลูกค้า".)
  // Only the current page's rows (≤50) are resolved (server-side pagination ·
  // resolveLegacyUrlMap fans the storage round-trips out concurrently).
  const avatarByUser = await resolveLegacyUrlMap(
    rows.map((r) => ({ id: r.userID, filename: r.userPicture })),
    "profile",
  );

  const walletByUser = new Map<string, number>();
  if (userIds.length > 0) {
    const { data: wallets, error: walletsErr } = await admin
      .from("tb_wallet")
      .select("userid, wallettotal")
      .in("userid", userIds);
    if (walletsErr) {
      console.error(`[tb_wallet list] failed`, { code: walletsErr.code, message: walletsErr.message });
    }
    for (const w of (wallets ?? []) as { userid: string; wallettotal: number | null }[]) {
      walletByUser.set(w.userid, Number(w.wallettotal ?? 0));
    }
  }

  // Wave 18-A — main address per visible customer (tb_address lowest addressid).
  type AddressRow = {
    addressid: number;
    userid: string;
    addressno: string | null;
    addresssubdistrict: string | null;
    addressdistrict: string | null;
    addressprovince: string | null;
    addresszipcode: string | null;
  };
  const addressByUser = new Map<string, AddressRow>();
  if (userIds.length > 0) {
    const { data: addresses, error: addressesErr } = await admin
      .from("tb_address")
      .select("addressid, userid, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode")
      .in("userid", userIds)
      .eq("addressstatus", "1")
      .order("addressid", { ascending: true });
    if (addressesErr) {
      console.error(`[tb_address list] failed`, { code: addressesErr.code, message: addressesErr.message });
    }
    for (const a of (addresses ?? []) as unknown as AddressRow[]) {
      if (!addressByUser.has(a.userid)) addressByUser.set(a.userid, a);
    }
  }

  // ── Juristic inline-review bundle (owner 2026-05-30 · P0-21 SOT swap) ──
  // Merge /admin/juristic-check into the customers list: for นิติบุคคล customers
  // that have a corporate row (docs + DBD review), pre-fetch the company data +
  // signed document URLs so the row can be reviewed + approved inline (hover-
  // zoom) — no separate page.
  //
  // P0-21 (ADR-0021): reads the LEGACY `tb_corporate` (keyed by userid =
  // member_code) directly — NOT the rebuilt-empty `corporate` (profile_id UUID).
  // The visible member_codes ARE the tb_corporate.userid key, so no profiles→
  // profile_id hop is needed; we resolve profiles ONLY to populate the bundle's
  // profileId field (best-effort — the juristic actions key on userid, so a
  // missing profileId is non-fatal). Docs come from tb_corporate's own
  // corporatefile/corporatefile20 filename columns (legacy `file` bucket), NOT
  // the rebuilt `documents` table + member-docs storage. Bounded: only the
  // member_codes with a tb_corporate row (≈ juristic customers) fetch docs.
  const juristicByMember = new Map<string, JuristicBundle>();
  if (userIds.length > 0) {
    // member_code → profile_id (for the bundle.profileId field only).
    const { data: profs, error: profsErr } = await admin
      .from("profiles")
      .select("id, member_code")
      .in("member_code", userIds);
    if (profsErr) console.error(`[profiles juristic resolve] failed`, { code: profsErr.code, message: profsErr.message });
    const profileIdByMember = new Map<string, string>();
    for (const p of (profs ?? []) as { id: string; member_code: string | null }[]) {
      if (p.member_code) profileIdByMember.set(p.member_code, p.id);
    }

    // tb_corporate rows for the visible customers (keyed by userid = member_code).
    const { data: corps, error: corpsErr } = await admin
      .from("tb_corporate")
      .select("userid, corporatenumber, corporatename, corporateaddress, corporatestatus, corporatefile, corporatefile20")
      .in("userid", userIds);
    if (corpsErr) console.error(`[tb_corporate inline-review list] failed`, { code: corpsErr.code, message: corpsErr.message });
    const corpList = (corps ?? []) as {
      userid: string; corporatenumber: string | null; corporatename: string | null;
      corporateaddress: string | null; corporatestatus: string | null;
      corporatefile: string | null; corporatefile20: string | null;
    }[];

    // PERF (2026-06-03): resolve every corp's signed doc URLs CONCURRENTLY.
    // resolveLegacyCorpDocs does 2 storage round-trips per row; awaiting it in
    // a sequential for-loop serialized N rows into N round-trips (a big part of
    // the measured 2-4 s /admin/customers render). Promise.all fans them out.
    const corpDocsList = await Promise.all(
      corpList.map((c) => resolveLegacyCorpDocs(c.corporatefile, c.corporatefile20)),
    );
    corpList.forEach((c, i) => {
      juristicByMember.set(c.userid, {
        profileId: profileIdByMember.get(c.userid) ?? "",
        userid: c.userid, // member_code === legacy tb_users.userID (P0-18 actions key on this)
        taxId: c.corporatenumber ?? "",
        companyName: c.corporatename ?? "",
        companyAddress: c.corporateaddress ?? "",
        corpStatus: CORP_STATUS_TO_KEYWORD[c.corporatestatus ?? "1"] ?? "pending",
        docs: corpDocsList[i],
      });
    });
  }

  // ── Pending juristic review QUEUE (corporate-driven · owner 2026-05-30 · P0-21) ──
  // Independent of the visible tb_users page: reads the corporate review rows
  // directly so EVERY juristic customer awaiting review surfaces at the top of
  // /admin/customers — including re-registrations whose identity is under a
  // different member_code (phone-dupe) and so never appear in the list below.
  // This is the inline merge of /admin/juristic-check the owner asked for.
  //
  // P0-21 (ADR-0021): reads the LEGACY `tb_corporate` (corporatestatus='1' =
  // pending) — the SAME SOT /admin/juristic-check uses — NOT the rebuilt-empty
  // `corporate`. Customer identity (member_code = userid, name) comes from
  // `tb_users` (camelCase: userID/userName/userLastName); docs from
  // tb_corporate's own corporatefile/corporatefile20 columns. Faithful to
  // juristic-check/page.tsx (the shipped pending-queue reader).
  const pendingJuristic: JuristicBundle[] = [];
  {
    const { data: pcorps, error: pcorpsErr } = await admin
      .from("tb_corporate")
      .select("userid, corporatenumber, corporatename, corporateaddress, corporatefile, corporatefile20, cpdatecreate")
      .eq("corporatestatus", "1")
      .order("cpdatecreate", { ascending: false })
      .limit(50);
    if (pcorpsErr) console.error(`[tb_corporate pending] failed`, { code: pcorpsErr.code, message: pcorpsErr.message });
    type PCorp = {
      userid: string; corporatenumber: string | null; corporatename: string | null;
      corporateaddress: string | null; corporatefile: string | null;
      corporatefile20: string | null; cpdatecreate: string | null;
    };
    const pcorpList = (pcorps ?? []) as PCorp[];

    // Resolve customer name + phone from tb_users (member_code === userid).
    const pUserIds = [...new Set(pcorpList.map((c) => c.userid))];
    const nameByUser = new Map<string, string>();
    const phoneByUser = new Map<string, string>();
    if (pUserIds.length > 0) {
      const { data: pusers, error: pusersErr } = await admin
        .from("tb_users")
        .select("userID, userName, userLastName, userTel")
        .in("userID", pUserIds);
      if (pusersErr) console.error(`[tb_users pending-juristic] failed`, { code: pusersErr.code, message: pusersErr.message });
      for (const u of (pusers ?? []) as { userID: string; userName: string | null; userLastName: string | null; userTel: string | null }[]) {
        nameByUser.set(u.userID, `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim());
        if ((u.userTel ?? "").trim()) phoneByUser.set(u.userID, u.userTel!.trim());
      }
    }

    // PERF (2026-06-03): same N+1 fix as the visible-corp loop above — the
    // pending queue is up to 50 rows × 2 storage round-trips each. Awaiting
    // them sequentially was the dominant slice of the 2-4 s render; fan out.
    const pcorpDocsList = await Promise.all(
      pcorpList.map((c) => resolveLegacyCorpDocs(c.corporatefile, c.corporatefile20)),
    );
    pcorpList.forEach((c, i) => {
      const customerName = nameByUser.get(c.userid) || undefined;
      pendingJuristic.push({
        profileId: "", // not needed — the juristic actions key on userid (P0-18)
        // member_code === legacy tb_users.userID (P0-18 actions key on this).
        userid: c.userid,
        taxId: c.corporatenumber ?? "",
        companyName: c.corporatename ?? "",
        companyAddress: c.corporateaddress ?? "",
        corpStatus: "pending",
        docs: pcorpDocsList[i],
        memberCode: c.userid || undefined,
        customerName,
        phone: phoneByUser.get(c.userid) || undefined,
      });
    });
  }

  // Build the serializable rows for the client table.
  const tableRows: CustomerTableRow[] = rows.map((r) => {
    const birthday = formatBirthday(r.userBirthday);
    const fb = (r.userFacebook ?? "").trim();
    // Display name: prefer the personal name (userName + userLastName). For a
    // juristic customer whose personal name is empty (e.g. PR047 — registered
    // as a company, no contact name captured), fall back to the company name
    // from tb_corporate so the row shows the company instead of a bare "—".
    const personalName = `${r.userName ?? ""} ${r.userLastName ?? ""}`.trim();
    const companyName = (juristicByMember.get(r.userID)?.companyName ?? "").trim();
    const displayName = personalName || companyName || "—";
    return {
      userID: r.userID,
      avatarUrl: avatarByUser[r.userID] ?? null,
      isJuristic: r.userCompany === "1" || juristicByMember.has(r.userID),
      creditLimit: Number(r.userCreditValue ?? 0),
      creditDays: Number(r.userCreditDate ?? 0),
      status: deriveStatus(r),
      fullName: displayName,
      tel: r.userTel ?? "",
      email: r.userEmail ?? "",
      address: summarizeAddress(addressByUser.get(r.userID)),
      birthdayDm: birthday.dm,
      birthdayAge: birthday.age,
      vip: isVipCoid(r.coID),
      lineId: (r.userLineID ?? "").trim(),
      facebook: fb,
      isFbUrl: /^https?:\/\//i.test(fb),
      adminIDSale: r.adminIDSale ?? "",
      wallet: walletByUser.get(r.userID) ?? 0,
      registered: r.userRegistered,
      juristic: juristicByMember.get(r.userID) ?? null,
    };
  });

  return (
    <>
      <PageTopMenubar items={CUSTOMERS_MENUBAR} activeHref="/admin/customers" />
      <main className="p-6 lg:p-8 space-y-5">
      {(pendingSignupCount ?? 0) > 0 ? (
        <Link
          href="/admin/customers/pending"
          className="flex items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 shadow-sm hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
        >
          <span className="flex items-center gap-2.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <span className="text-lg leading-none">🔔</span>
            มีลูกค้าสมัครใหม่รอตรวจสอบ{" "}
            <span className="rounded-full bg-amber-600 px-2 py-0.5 text-xs font-bold text-white">
              {(pendingSignupCount ?? 0).toLocaleString("th-TH")}
            </span>{" "}
            ราย — ตรวจสอบ + แบ่งเซล/CS
          </span>
          <span className="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-400">
            ไปที่หน้ารออนุมัติ →
          </span>
        </Link>
      ) : null}
      <PageHeader
        eyebrow="ADMIN"
        title={`ลูกค้า${group ? ` — ${GROUP_CFG[group].label}` : ""}`}
        badges={
          <>
            {group ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                <span>กรอง: {GROUP_CFG[group].label}</span>
                <Link href="/admin/customers" className="rounded-full px-1 leading-none hover:bg-primary-100" aria-label="ล้างตัวกรองกลุ่มลูกค้า">×</Link>
              </span>
            ) : null}
            {adminidsale ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                <span>{adminidsale === "__none__" ? "⚠️ ยังไม่มีเซลล์ดูแล (กดเข้าลูกค้าเพื่อ set เซลล์/CS)" : `เซลล์ผู้ดูแล: ${adminidsale}`}</span>
                <Link href="/admin/customers?nofilter=1" className="rounded-full px-1 leading-none hover:bg-primary-100" aria-label="ล้างฟิลเตอร์เซลล์ผู้ดูแล · ดูทั้งหมด" title="ดูทั้งหมด">×</Link>
              </span>
            ) : null}
          </>
        }
        actions={
          <>
          <Link href="/admin/customers/new" className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700 inline-flex items-center gap-1.5">+ เพิ่มลูกค้า</Link>
          <Link href="/admin/customers/recently-active" className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-medium text-primary-700 hover:bg-primary-100">📈 ลูกค้า active ล่าสุด</Link>
          <Link href="/admin/customers/transfer-rep" className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-alt inline-flex items-center gap-1.5">⇄ ย้ายเซลล์ผู้ดูแล</Link>
          <Link href="/admin/customers/transfer-bulk" className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-alt inline-flex items-center gap-1.5">⇄ ย้ายเซลล์ (มีเหตุผล)</Link>
        <form action="/admin/customers" className="flex gap-2">
          {group ? <input type="hidden" name="group" value={group} /> : null}
          {adminidsale ? <input type="hidden" name="adminidsale" value={adminidsale} /> : null}
          <input name="q" defaultValue={sp.q} placeholder="ค้นหา รหัส / เบอร์ / ชื่อ" className="rounded-lg border border-border px-3 py-2 text-sm w-64" />
          <select name="type" defaultValue={sp.type ?? ""} className="rounded-lg border border-border px-3 py-2 text-sm">
            <option value="">ทุกประเภท</option>
            <option value="personal">บุคคล</option>
            <option value="juristic">นิติบุคคล</option>
          </select>
          <button type="submit" className="rounded-lg bg-primary-500 text-white px-4 text-sm">ค้นหา</button>
        </form>
        {/* CSV export — current page only (50/page · honours all filters incl.
            group/type/adminidsale/q). Sales hands the segment list to
            external callers / VAs; accounting reconciles the wallet column
            against tb_wallet. PII surface — page-level gate already enforces
            ops/sales_admin/accounting. */}
        <CsvButton
          rows={tableRows.map((r): CsvRow => ({
            userID: r.userID,
            fullName: r.fullName,
            type: r.isJuristic ? "นิติบุคคล" : "บุคคล",
            status: r.status,
            tel: r.tel,
            email: r.email,
            address: r.address,
            birthday: r.birthdayDm + (r.birthdayAge ? ` (อายุ ${r.birthdayAge})` : ""),
            vip: r.vip ? "VIP" : "",
            lineId: r.lineId,
            facebook: r.facebook,
            adminIDSale: r.adminIDSale,
            wallet: r.wallet.toFixed(2),
            registered: r.registered ? r.registered.slice(0, 10) : "",
            juristic_tax_id: r.juristic?.taxId ?? "",
            juristic_company: r.juristic?.companyName ?? "",
            juristic_status: r.juristic?.corpStatus ?? "",
          }))}
          cols={[
            { key: "userID",           label: "รหัสสมาชิก" },
            { key: "fullName",         label: "ชื่อ-นามสกุล" },
            { key: "type",             label: "ประเภท" },
            { key: "status",           label: "สถานะ" },
            { key: "tel",              label: "เบอร์โทร" },
            { key: "email",            label: "อีเมล" },
            { key: "address",          label: "ที่อยู่หลัก" },
            { key: "birthday",         label: "วันเกิด / อายุ" },
            { key: "vip",              label: "VIP" },
            { key: "lineId",           label: "LINE ID" },
            { key: "facebook",         label: "Facebook" },
            { key: "adminIDSale",      label: "เซลล์ดูแล" },
            { key: "wallet",           label: "ยอด Wallet (฿)" },
            { key: "registered",       label: "วันสมัคร" },
            { key: "juristic_tax_id",  label: "เลขผู้เสียภาษี" },
            { key: "juristic_company", label: "ชื่อบริษัท" },
            { key: "juristic_status",  label: "สถานะเอกสารนิติฯ" },
          ]}
          fetchAll={async () => {
            "use server";
            // Export the FULL filtered customer list (all pages, capped) —
            // audited via admin_export_log (PII walk-off trail · owner
            // directive). Captures the page's active filters so the export
            // matches the on-screen list byte-for-byte.
            return exportCustomersAll({
              type: typeof sp.type === "string" ? sp.type : undefined,
              group: group ?? undefined,
              adminidsale: adminidsale ?? undefined,
              q: typeof sp.q === "string" ? sp.q : undefined,
            });
          }}
          filename={`customers${group ? `-${group}` : ""}${sp.type ? `-${sp.type}` : ""}${adminidsale ? `-${adminidsale}` : ""}-page${page}-${new Date().toISOString().slice(0, 10)}.csv`}
        />
          </>
        }
      />

      <PendingJuristicReviews bundles={pendingJuristic} />

      {error ? (
        // §0c — a failed list query must NOT look like "data is gone". Surface
        // the error loudly + reassure the data is intact (the 2026-06-22
        // userimage→userPicture incident: a wrong column 42703-errored the list
        // and the blank state read as total data loss).
        <div className="rounded-2xl border border-red-300 bg-red-50 dark:bg-red-950/30 p-6 text-center text-sm text-red-700 dark:text-red-300">
          ⚠️ โหลดรายชื่อลูกค้าไม่สำเร็จ ({error.code ?? "error"}) — <strong>ข้อมูลลูกค้ายังอยู่ครบ ไม่ได้หาย</strong> · ลองรีเฟรชหน้า หรือแจ้งทีมพัฒนา
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-12 text-center text-sm text-muted">ไม่พบลูกค้า</div>
      ) : (
        <>
          <CustomersTable rows={tableRows} />
          <Pagination
            page={page}
            pageSize={DEFAULT_PAGE_SIZE}
            total={totalCustomers ?? 0}
            basePath="/admin/customers"
            params={{
              type: typeof sp.type === "string" ? sp.type : undefined,
              group: group ?? undefined,
              adminidsale: adminidsale ?? undefined,
              q: typeof sp.q === "string" ? sp.q : undefined,
            }}
          />
        </>
      )}
    </main>
    </>
  );
}

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { Link } from "@/i18n/navigation";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { buildDefaultLandingRedirect } from "@/lib/admin/default-queue-filter";
import { getAdminLegacyId } from "@/lib/admin/default-queue-filter-server";
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
      { label: "เครดิต",             href: "/admin/customers?group=credit" },
      { label: "คิดค่าเทียบ",        href: "/admin/customers?group=comparison" },
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

/** True for any legacy `coid` that signals a non-default VIP tier. */
function isVipCoid(coid: string | null | undefined): boolean {
  if (!coid) return false;
  const v = coid.trim().toUpperCase();
  // "" / "PCS" / "GENERAL" all = ลูกค้าทั่วไป.
  return v !== "" && v !== "PCS" && v !== "GENERAL";
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

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; group?: string; adminidsale?: string }> }) {
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

  // D1 Wave-2: read legacy tb_users (member-code identity = `userID`).
  let q = admin.from("tb_users")
    .select(`
      userID, userName, userLastName, userCompany,
      userTel, userEmail, userActive, userStatus, adminIDSale, userRegistered,
      coID, userLineID, userFacebook, userBirthday
    `)
    .order("userRegistered", { ascending: false })
    .limit(200);

  // `type` filter — userCompany '1' = นิติบุคคล (juristic), else บุคคล.
  if (sp.type === "personal")  q = q.neq("userCompany", "1");
  if (sp.type === "juristic")  q = q.eq("userCompany", "1");

  // Sidebar `?group=` filter — see GROUP_CFG header comment for the mapping.
  const group = typeof sp.group === "string" && sp.group in GROUP_CFG ? sp.group : null;
  const groupCol = group ? GROUP_CFG[group].col : undefined;
  if (groupCol) q = q.eq(groupCol, "1");

  // G6 — sales-rep filter (sp.adminidsale).
  const adminidsale =
    typeof sp.adminidsale === "string" && sp.adminidsale.trim() !== ""
      ? sp.adminidsale.trim()
      : null;
  if (adminidsale) q = q.eq("adminIDSale", adminidsale);

  if (sp.q) {
    const term = sp.q.replace(/[\\%_,]/g, (m) => "\\" + m);
    q = q.or(`userID.ilike.%${term}%,userTel.ilike.%${term}%,userName.ilike.%${term}%,userLastName.ilike.%${term}%`);
  }

  const { data, error } = await q;
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
  };
  const rows = (data ?? []) as Row[];

  // Wallet balances — legacy tb_wallet keyed by userid (lowercase).
  const userIds = rows.map((r) => r.userID);
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
    for (const a of (addresses ?? []) as AddressRow[]) {
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

    for (const c of corpList) {
      const docs = await resolveLegacyCorpDocs(c.corporatefile, c.corporatefile20);
      juristicByMember.set(c.userid, {
        profileId: profileIdByMember.get(c.userid) ?? "",
        userid: c.userid, // member_code === legacy tb_users.userID (P0-18 actions key on this)
        taxId: c.corporatenumber ?? "",
        companyName: c.corporatename ?? "",
        companyAddress: c.corporateaddress ?? "",
        corpStatus: CORP_STATUS_TO_KEYWORD[c.corporatestatus ?? "1"] ?? "pending",
        docs,
      });
    }
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

    // Resolve customer name from tb_users (member_code === userid).
    const pUserIds = [...new Set(pcorpList.map((c) => c.userid))];
    const nameByUser = new Map<string, string>();
    if (pUserIds.length > 0) {
      const { data: pusers, error: pusersErr } = await admin
        .from("tb_users")
        .select("userID, userName, userLastName")
        .in("userID", pUserIds);
      if (pusersErr) console.error(`[tb_users pending-juristic] failed`, { code: pusersErr.code, message: pusersErr.message });
      for (const u of (pusers ?? []) as { userID: string; userName: string | null; userLastName: string | null }[]) {
        nameByUser.set(u.userID, `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim());
      }
    }

    for (const c of pcorpList) {
      const docs = await resolveLegacyCorpDocs(c.corporatefile, c.corporatefile20);
      const customerName = nameByUser.get(c.userid) || undefined;
      pendingJuristic.push({
        profileId: "", // not needed — the juristic actions key on userid (P0-18)
        // member_code === legacy tb_users.userID (P0-18 actions key on this).
        userid: c.userid,
        taxId: c.corporatenumber ?? "",
        companyName: c.corporatename ?? "",
        companyAddress: c.corporateaddress ?? "",
        corpStatus: "pending",
        docs,
        memberCode: c.userid || undefined,
        customerName,
      });
    }
  }

  // Build the serializable rows for the client table.
  const tableRows: CustomerTableRow[] = rows.map((r) => {
    const birthday = formatBirthday(r.userBirthday);
    const fb = (r.userFacebook ?? "").trim();
    return {
      userID: r.userID,
      isJuristic: r.userCompany === "1" || juristicByMember.has(r.userID),
      status: deriveStatus(r),
      fullName: `${r.userName ?? ""} ${r.userLastName ?? ""}`.trim() || "—",
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">
            ลูกค้า{group ? ` — ${GROUP_CFG[group].label}` : ""}
          </h1>
          {group ? (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
              <span>กรอง: {GROUP_CFG[group].label}</span>
              <Link href="/admin/customers" className="rounded-full px-1 leading-none hover:bg-primary-100" aria-label="ล้างตัวกรองกลุ่มลูกค้า">×</Link>
            </div>
          ) : null}
          {adminidsale ? (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
              <span>เซลล์ผู้ดูแล: {adminidsale}</span>
              <Link href="/admin/customers?nofilter=1" className="rounded-full px-1 leading-none hover:bg-primary-100" aria-label="ล้างฟิลเตอร์เซลล์ผู้ดูแล · ดูทั้งหมด" title="ดูทั้งหมด">×</Link>
            </div>
          ) : null}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
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
        </div>
      </div>

      <PendingJuristicReviews bundles={pendingJuristic} />

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-12 text-center text-sm text-muted">ไม่พบลูกค้า</div>
      ) : (
        <CustomersTable rows={tableRows} />
      )}
    </main>
    </>
  );
}

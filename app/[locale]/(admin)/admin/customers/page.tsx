import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CustomerRowActions } from "@/components/admin/customer-row-actions";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { buildDefaultLandingRedirect } from "@/lib/admin/default-queue-filter";
import { getAdminLegacyId } from "@/lib/admin/default-queue-filter-server";
import { ResetPwdButton } from "./reset-pwd-button";

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
//   useractive  '1'=ใช้งานแล้ว (approved)   · '0'=รอ approve
//   userstatus  '1'=ใช้งาน                  · '0'=ลบบัญชี (deleted)
// → derived status: useractive='0' ⇒ incomplete · userstatus='0' ⇒
//   suspended (deleted) · otherwise active.
type DerivedStatus = "active" | "incomplete" | "suspended";

function deriveStatus(u: { userActive: string | null; userStatus: string | null }): DerivedStatus {
  if (u.userStatus === "0") return "suspended";
  if (u.userActive === "0") return "incomplete";
  return "active";
}

const STATUS_CFG: Record<DerivedStatus, { label: string; className: string }> = {
  active:     { label: "ใช้งาน",      className: "bg-green-50 text-green-700 border-green-200" },
  incomplete: { label: "รอ Approve",  className: "bg-amber-50 text-amber-700 border-amber-200" },
  suspended:  { label: "ระงับ",       className: "bg-red-50 text-red-700 border-red-200" },
};

// ────────────────────────────────────────────────────────────────────
// Wave 18-A: 5 fidelity columns from legacy `pcs-admin/users.php`
//
//   - VIP chip       — coid != "general"/"PCS"/empty (legacy uses coid
//                       to encode tier; "PCS" is the default = ลูกค้าทั่วไป)
//   - Birthday       — DD/MM (no year) + age computed from full date.
//                       tb_users.userbirthday is a `date` column in 0081
//                       but ~110k legacy rows store the legacy varchar
//                       format "YYYY-MM-DD" — both parse with Date(). We
//                       fall back to "—" if parsing yields NaN.
//   - LINE ID        — tb_users.userlineid
//   - Facebook       — tb_users.userfacebook (link or plain text)
//   - Main address   — tb_address rows joined by userid. The legacy
//                       `tb_address_main` pointer table is sparsely
//                       populated (~5% of customers) so we instead pick
//                       the lowest addressid per userid (first-added =
//                       customer's first / "main" address).
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
// general/vip/svip have no faithful `tb_users` column (legacy did not
// store a VIP tier on the customer row) — the chip still renders for
// continuity but applies no DB filter, the same graceful-degrade
// pattern recently-active uses for its SLA chip.
const GROUP_CFG: Record<string, { label: string; col?: string }> = {
  general:    { label: "สมาชิกทั่วไป" },
  vip:        { label: "สมาชิก VIP" },
  svip:       { label: "สมาชิก SVIP" },
  corporate:  { label: "สมาชิกนิติบุคคล", col: "userCompany" },
  credit:     { label: "สมาชิกเครดิต",    col: "userCredit" },
  comparison: { label: "สมาชิกคิดค่าเทียบ", col: "userComparison" },
};

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; group?: string; adminidsale?: string }> }) {
  // W-1 (gap-admin H-1/H-7): page-level role gate. Lists every
  // customer's member_code/name/phone/email + wallet balances via
  // createAdminClient (RLS-bypass) — a PDPA/PII surface. ops + sales +
  // accounting (super implicit); driver/warehouse refused.
  const { user, roles } = await requireAdmin(["ops", "sales_admin", "accounting"]);

  const sp = await searchParams;

  // G6 — default queue filter per role. sales_admin lands on their
  // own customer book via ?adminidsale=<legacy_admin_id>. Other roles
  // see all (no default). Lookup gates on legacy_admin_id presence —
  // Pacred-native admins (no PCS bridge) fall through unfiltered.
  const legacyAdminId = await getAdminLegacyId(user.id);
  const defaultRedirect = buildDefaultLandingRedirect(
    "/admin/customers",
    roles,
    sp as Record<string, unknown>,
    { legacyAdminId },
  );
  if (defaultRedirect) redirect(defaultRedirect);

  const admin = createAdminClient();

  // D1 Wave-2: read legacy tb_users (member-code identity = `userid`).
  // Wave 18-A: extended SELECT with coid (VIP tier), userlineid, userfacebook,
  // userbirthday — the 4 per-row fidelity columns. Main address comes from
  // a separate batched query (tb_address) below.
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

  // G6 — sales-rep filter (sp.adminidsale). Set by the per-role landing
  // redirect for sales_admin (= sees their own book) OR by clicking the
  // "เซลล์ผู้ดูแล" name on any customer row (= "ดูลูกค้าทั้งหมดของเซลล์
  // คนนี้"). Maps to tb_users.adminIDSale text column.
  const adminidsale =
    typeof sp.adminidsale === "string" && sp.adminidsale.trim() !== ""
      ? sp.adminidsale.trim()
      : null;
  if (adminidsale) q = q.eq("adminIDSale", adminidsale);

  if (sp.q) {
    // Search by member_code (userID) OR phone OR name (parallel OR via or() filter)
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

  // Wallet balances — legacy tb_wallet keyed by userid (one row/customer,
  // wallettotal numeric). Batch-fetch for the rows on screen.
  // NOTE: tb_wallet.userid stays lowercase (only tb_users renamed to userID).
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

  // Wave 18-A — main address per visible customer. tb_address holds 1..N rows
  // per userid; the legacy `tb_address_main` pointer table is sparsely populated
  // (~5% of customers — most never picked a "main") so we instead pick the
  // lowest-addressid (= first-added = the legacy default-main fallback). One
  // batched query, then a Map of userid → row for the renderer.
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
      // First-seen (lowest addressid per userid) wins — the order() above
      // guarantees insertion order matches ascending addressid.
      if (!addressByUser.has(a.userid)) addressByUser.set(a.userid, a);
    }
  }

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
              <Link
                href="/admin/customers"
                className="rounded-full px-1 leading-none hover:bg-primary-100"
                aria-label="ล้างตัวกรองกลุ่มลูกค้า"
              >
                ×
              </Link>
            </div>
          ) : null}
          {adminidsale ? (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
              <span>เซลล์ผู้ดูแล: {adminidsale}</span>
              <Link
                href="/admin/customers?nofilter=1"
                className="rounded-full px-1 leading-none hover:bg-primary-100"
                aria-label="ล้างฟิลเตอร์เซลล์ผู้ดูแล · ดูทั้งหมด"
                title="ดูทั้งหมด"
              >
                ×
              </Link>
            </div>
          ) : null}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Link
            href="/admin/customers/recently-active"
            className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-medium text-primary-700 hover:bg-primary-100"
          >
            📈 ลูกค้า active ล่าสุด
          </Link>
          <Link
            href="/admin/customers/transfer-rep"
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-alt inline-flex items-center gap-1.5"
          >
            ⇄ ย้ายเซลล์ผู้ดูแล
          </Link>
          <Link
            href="/admin/customers/transfer-bulk"
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-alt inline-flex items-center gap-1.5"
          >
            ⇄ ย้ายเซลล์ (มีเหตุผล)
          </Link>
        <form action="/admin/customers" className="flex gap-2">
          {group ? <input type="hidden" name="group" value={group} /> : null}
          {adminidsale ? <input type="hidden" name="adminidsale" value={adminidsale} /> : null}
          <input
            name="q"
            defaultValue={sp.q}
            placeholder="ค้นหา รหัส / เบอร์ / ชื่อ"
            className="rounded-lg border border-border px-3 py-2 text-sm w-64"
          />
          <select name="type" defaultValue={sp.type ?? ""} className="rounded-lg border border-border px-3 py-2 text-sm">
            <option value="">ทุกประเภท</option>
            <option value="personal">บุคคล</option>
            <option value="juristic">นิติบุคคล</option>
          </select>
          <button type="submit" className="rounded-lg bg-primary-500 text-white px-4 text-sm">ค้นหา</button>
        </form>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่พบลูกค้า</p>
        ) : (
          <>
            {/* Wave 18 follow-up (2026-05-25 ค่ำ — ภูม flagged): the table
                has 14 columns (after Wave 18-A) and overflows ~1583px on
                a 1920px screen with sidebar. We add a left-rail hint so
                staff know the table is scrollable + the inner wrapper uses
                `.scrollbar-x-visible` (globals.css) to force a visible
                scrollbar on Windows Chrome. */}
            <p className="px-4 pt-3 text-[11px] text-muted">
              <span className="opacity-70">เลื่อนซ้าย-ขวาเพื่อดูคอลัมน์ทั้งหมด</span>
              <span className="ml-1">⇆</span>
            </p>
            <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">รหัส</th>
                  <th className="px-4 py-3">ประเภท</th>
                  <th className="px-4 py-3">ชื่อ</th>
                  <th className="px-4 py-3">เบอร์ / อีเมล</th>
                  {/* Wave 18-A — 5 fidelity columns from legacy users.php */}
                  <th className="px-4 py-3">ที่อยู่หลัก</th>
                  <th className="px-4 py-3">วันเกิด / อายุ</th>
                  <th className="px-4 py-3">VIP</th>
                  <th className="px-4 py-3">LINE</th>
                  <th className="px-4 py-3">Facebook</th>
                  <th className="px-4 py-3">เซลล์ผู้ดูแล</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3 text-right">ยอดกระเป๋า</th>
                  <th className="px-4 py-3">สมัครเมื่อ</th>
                  <th className="px-4 py-3">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isJuristic = r.userCompany === "1";
                  const status = deriveStatus(r);
                  const fullName = `${r.userName ?? ""} ${r.userLastName ?? ""}`.trim() || "—";
                  // Wave 18-A — per-row derived fidelity values.
                  const vip = isVipCoid(r.coID);
                  const birthday = formatBirthday(r.userBirthday);
                  const address = summarizeAddress(addressByUser.get(r.userID));
                  const fb = (r.userFacebook ?? "").trim();
                  const isFbUrl = /^https?:\/\//i.test(fb);
                  return (
                  <tr key={r.userID} className="border-t border-border hover:bg-surface-alt/30">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={`/admin/customers/${r.userID}`} className="text-primary-600 hover:underline">{r.userID}</Link>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
                        isJuristic ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-50 text-gray-700 border-gray-200"
                      }`}>
                        {isJuristic ? "นิติบุคคล" : "บุคคล"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {fullName}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div>{r.userTel ?? "—"}</div>
                      <div className="text-muted">{r.userEmail ?? "—"}</div>
                    </td>
                    {/* Wave 18-A — main address (tb_address lowest addressid per userid) */}
                    <td className="px-4 py-3 text-xs max-w-[260px]">
                      <div className="truncate" title={address}>{address}</div>
                    </td>
                    {/* Wave 18-A — birthday DD/MM + age (legacy users.php showed DD/MM without year) */}
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {birthday.dm}
                      {birthday.age !== null && (
                        <span className="ml-1 text-muted">({birthday.age} ปี)</span>
                      )}
                    </td>
                    {/* Wave 18-A — VIP chip (coid != general/PCS/empty) */}
                    <td className="px-4 py-3 text-xs">
                      {vip ? (
                        <span className="rounded-full border bg-amber-50 text-amber-700 border-amber-200 px-2 py-0.5 text-[10px] font-medium uppercase">
                          VIP
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    {/* Wave 18-A — LINE ID */}
                    <td className="px-4 py-3 text-xs">
                      {r.userLineID?.trim() ? (
                        <span className="font-mono">{r.userLineID}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    {/* Wave 18-A — Facebook (link if URL, else plain text) */}
                    <td className="px-4 py-3 text-xs max-w-[180px]">
                      {fb ? (
                        isFbUrl ? (
                          <a href={fb} target="_blank" rel="noreferrer noopener" className="text-primary-600 hover:underline truncate inline-block max-w-full" title={fb}>
                            {fb.replace(/^https?:\/\/(www\.)?/, "")}
                          </a>
                        ) : (
                          <span className="truncate inline-block max-w-full" title={fb}>{fb}</span>
                        )
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">{r.adminIDSale || "—"}</td>
                    <td className="px-4 py-3">
                      {(() => {
                        const cfg = STATUS_CFG[status];
                        return (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.className}`}>
                            {cfg.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      ฿{(walletByUser.get(r.userID) ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {r.userRegistered ? new Date(r.userRegistered).toLocaleDateString("th-TH") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <CustomerRowActions id={r.userID} status={status} />
                        {/* Wave 18-A — password-reset (legacy users.php per-row action) */}
                        <ResetPwdButton userid={r.userID} />
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </main>
    </>
  );
}

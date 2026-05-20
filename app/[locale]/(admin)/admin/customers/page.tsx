import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CustomerRowActions } from "@/components/admin/customer-row-actions";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";

// ─────────────────────────────────────────────────────────────────────
// Page top-menubar — ภูม brief 2026-05-20 ค่ำ.
// Sidebar got a single-leaf "ลูกค้าทั้งหมด" → click lands here. All
// group filters + work queues + search live in the horizontal menubar
// so the sidebar stays slim (Pacred-is-one-company pattern · matches
// accounting/cargo + accounting/freight pages).
// ─────────────────────────────────────────────────────────────────────
const CUSTOMERS_MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/customers" },
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
      { label: "รออนุมัติ",          href: "/admin/customers/pending" },
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

function deriveStatus(u: { useractive: string | null; userstatus: string | null }): DerivedStatus {
  if (u.userstatus === "0") return "suspended";
  if (u.useractive === "0") return "incomplete";
  return "active";
}

const STATUS_CFG: Record<DerivedStatus, { label: string; className: string }> = {
  active:     { label: "ใช้งาน",      className: "bg-green-50 text-green-700 border-green-200" },
  incomplete: { label: "รอ Approve",  className: "bg-amber-50 text-amber-700 border-amber-200" },
  suspended:  { label: "ระงับ",       className: "bg-red-50 text-red-700 border-red-200" },
};

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
  corporate:  { label: "สมาชิกนิติบุคคล", col: "usercompany" },
  credit:     { label: "สมาชิกเครดิต",    col: "usercredit" },
  comparison: { label: "สมาชิกคิดค่าเทียบ", col: "usercomparison" },
};

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; group?: string }> }) {
  // W-1 (gap-admin H-1/H-7): page-level role gate. Lists every
  // customer's member_code/name/phone/email + wallet balances via
  // createAdminClient (RLS-bypass) — a PDPA/PII surface. ops + sales +
  // accounting (super implicit); driver/warehouse refused.
  await requireAdmin(["ops", "sales_admin", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // D1 Wave-2: read legacy tb_users (member-code identity = `userid`).
  let q = admin.from("tb_users")
    .select(`
      userid, username, userlastname, usercompany,
      usertel, useremail, useractive, userstatus, adminidsale, userregistered
    `)
    .order("userregistered", { ascending: false })
    .limit(200);

  // `type` filter — usercompany '1' = นิติบุคคล (juristic), else บุคคล.
  if (sp.type === "personal")  q = q.neq("usercompany", "1");
  if (sp.type === "juristic")  q = q.eq("usercompany", "1");

  // Sidebar `?group=` filter — see GROUP_CFG header comment for the mapping.
  const group = typeof sp.group === "string" && sp.group in GROUP_CFG ? sp.group : null;
  const groupCol = group ? GROUP_CFG[group].col : undefined;
  if (groupCol) q = q.eq(groupCol, "1");

  if (sp.q) {
    // Search by member_code (userid) OR phone OR name (parallel OR via or() filter)
    const term = sp.q.replace(/[\\%_,]/g, (m) => "\\" + m);
    q = q.or(`userid.ilike.%${term}%,usertel.ilike.%${term}%,username.ilike.%${term}%,userlastname.ilike.%${term}%`);
  }

  const { data } = await q;
  type Row = {
    userid: string;
    username: string | null;
    userlastname: string | null;
    usercompany: string | null;
    usertel: string | null;
    useremail: string | null;
    useractive: string | null;
    userstatus: string | null;
    adminidsale: string | null;
    userregistered: string | null;
  };
  const rows = (data ?? []) as Row[];

  // Wallet balances — legacy tb_wallet keyed by userid (one row/customer,
  // wallettotal numeric). Batch-fetch for the rows on screen.
  const userIds = rows.map((r) => r.userid);
  const walletByUser = new Map<string, number>();
  if (userIds.length > 0) {
    const { data: wallets } = await admin
      .from("tb_wallet")
      .select("userid, wallettotal")
      .in("userid", userIds);
    for (const w of (wallets ?? []) as { userid: string; wallettotal: number | null }[]) {
      walletByUser.set(w.userid, Number(w.wallettotal ?? 0));
    }
  }

  return (
    <>
      <PageTopMenubar items={CUSTOMERS_MENUBAR} activeHref="/admin/customers" />
      <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
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
        <form action="/admin/customers" className="flex gap-2">
          {group ? <input type="hidden" name="group" value={group} /> : null}
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">รหัส</th>
                  <th className="px-4 py-3">ประเภท</th>
                  <th className="px-4 py-3">ชื่อ</th>
                  <th className="px-4 py-3">เบอร์ / อีเมล</th>
                  <th className="px-4 py-3">เซลล์ผู้ดูแล</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3 text-right">ยอดกระเป๋า</th>
                  <th className="px-4 py-3">สมัครเมื่อ</th>
                  <th className="px-4 py-3">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isJuristic = r.usercompany === "1";
                  const status = deriveStatus(r);
                  const fullName = `${r.username ?? ""} ${r.userlastname ?? ""}`.trim() || "—";
                  return (
                  <tr key={r.userid} className="border-t border-border hover:bg-surface-alt/30">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={`/admin/customers/${r.userid}`} className="text-primary-600 hover:underline">{r.userid}</Link>
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
                      <div>{r.usertel ?? "—"}</div>
                      <div className="text-muted">{r.useremail ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">{r.adminidsale || "—"}</td>
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
                      ฿{(walletByUser.get(r.userid) ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {r.userregistered ? new Date(r.userregistered).toLocaleDateString("th-TH") : "—"}
                    </td>
                    <td className="px-4 py-3"><CustomerRowActions id={r.userid} status={status} /></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
    </>
  );
}

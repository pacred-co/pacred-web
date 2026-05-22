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
 * The rebuilt-schema view (profiles + corporate + rates + credit-line) is
 * preserved for the Pacred-only customer profile sections that *do* live
 * in the rebuilt schema (refunds / freight / kpi cohort etc) — but until
 * we wire those into the legacy customer record this fallback IS the
 * working customer detail page for the ~8,898 migrated PCS customers.
 *
 * Wave 8 backlog: status mutate (block/unblock) + rate-custom editor +
 * full order history pagination.
 *
 * Verified prod schema 2026-05-21 via REST: tb_users(userid, username,
 *   userlastname, usercompany, useremail, usertel, useractive,
 *   useridcorporate, userregistered, lastlogindate, adminidsale, ...).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { Link } from "@/i18n/navigation";

type URow = {
  userid: string;
  username: string | null;
  userlastname: string | null;
  usercompany: string | null;
  useremail: string | null;
  usertel: string | null;
  useractive: string | null;
  userregistered: string | null;
  userlastlogin: string | null;   // ← correct column (legacy schema)
  adminidsale: string | null;
  usernote: string | null;
  userimage: string | null;       // Wave 13: legacy avatar filename (resolved via legacy-resolver)
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
type WRow = {
  wallettotal: number | null;
};

const STATUS_ACTIVE_CFG: Record<string, { label: string; cls: string }> = {
  "1": { label: "ใช้งานอยู่", cls: "bg-green-100 text-green-700 border-green-200" },
  "0": { label: "ระงับ", cls: "bg-red-100 text-red-700 border-red-200" },
};

export async function renderLegacyCustomerView(id: string) {
  const admin = createAdminClient();
  const { data: userRaw } = await admin
    .from("tb_users")
    .select(
      "userid,username,userlastname,usercompany,useremail,usertel,useractive,userregistered,userlastlogin,adminidsale,usernote,userimage",
    )
    .eq("userid", id)
    .maybeSingle();
  if (!userRaw) return null;
  const u = userRaw as unknown as URow;

  // Wave 13: resolve the legacy customer-portrait filename → signed URL.
  // Bare filenames live under `member-docs/legacy-images/users/` after
  // backfill 06. Empty / null → null → header renders the initial-letter
  // fallback instead of the avatar.
  const userImageUrl = await resolveLegacyUrl(u.userimage, "profile");

  // Wallet balance + recent activity (parallel)
  const [
    { data: walletRaw },
    { data: forwarderRows },
    { data: shopRows },
    { data: yuanRows },
  ] = await Promise.all([
    admin.from("tb_wallet").select("wallettotal").eq("userid", u.userid).maybeSingle(),
    admin
      .from("tb_forwarder")
      .select("id,fdate,fidorco,fcabinetnumber,fstatus,ftotalprice")
      .eq("userid", u.userid)
      .order("fdate", { ascending: false })
      .limit(10),
    admin
      .from("tb_header_order")
      .select("id,hdate,hno,hstatus,htotalpriceuser,htitle")
      .eq("userid", u.userid)
      .order("hdate", { ascending: false })
      .limit(10),
    admin
      .from("tb_payment")
      .select("id,paydate,paystatus,payyuan,paythb")
      .eq("userid", u.userid)
      .order("paydate", { ascending: false })
      .limit(10),
  ]);

  const wallet = (walletRaw as unknown as WRow | null) ?? null;
  const isJuristic = u.usercompany === "1";
  const fullName = `${u.username ?? ""} ${u.userlastname ?? ""}`.trim() || "—";
  const active = u.useractive ?? "1";
  const statusCfg = STATUS_ACTIVE_CFG[active] ?? {
    label: `status ${active}`,
    cls: "bg-gray-100 text-gray-600 border-gray-200",
  };

  const fws = (forwarderRows ?? []) as unknown as FRow[];
  const hos = (shopRows ?? []) as unknown as HRow[];
  const pys = (yuanRows ?? []) as unknown as PRow[];

  return (
    <main className="p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div className="flex items-start gap-4">
          {/* Wave 13: legacy avatar — resolved signed URL or initial-letter
              fallback when no portrait was uploaded. */}
          {userImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={userImageUrl}
              alt={fullName}
              className="w-14 h-14 rounded-full object-cover border border-border shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-lg border border-border shrink-0">
              {(u.username ?? u.userid).trim().charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">
              ADMIN · ลูกค้า {isJuristic ? "นิติบุคคล" : "บุคคล"}
            </p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <h1 className="text-2xl font-bold font-mono">{u.userid}</h1>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusCfg.cls}`}>
                {statusCfg.label}
              </span>
              {u.adminidsale ? (
                <span className="rounded-full border border-border bg-surface-alt px-3 py-1 text-xs font-mono">
                  ดูแลโดย {u.adminidsale}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted mt-1">
              Wave 7 read-only · status mutate + rate-custom editor → Wave 8
            </p>
          </div>
        </div>
        <Link href="/admin/customers" className="text-xs text-primary-600 hover:underline">
          ← รายการลูกค้า
        </Link>
      </div>

      {/* Profile + wallet card */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3 text-sm">
          <KV label="ชื่อ" value={fullName} />
          <KV label="โทรศัพท์" value={u.usertel ?? "-"} />
          <KV label="อีเมล" value={u.useremail ?? "-"} />
          <KV
            label="สมัครเมื่อ"
            value={u.userregistered ? new Date(u.userregistered).toLocaleString("th-TH") : "-"}
          />
          <KV
            label="ล่าสุดล็อกอิน"
            value={u.userlastlogin ? new Date(u.userlastlogin).toLocaleString("th-TH") : "-"}
          />
          {u.usernote ? <KV label="หมายเหตุ" value={u.usernote} /> : null}
        </div>
        <div className="rounded-2xl border border-border bg-primary-50 dark:bg-surface p-5 text-sm">
          <p className="text-xs font-semibold text-muted">ยอดกระเป๋า (THB)</p>
          <p className="mt-2 text-3xl font-bold font-mono text-primary-700">
            ฿{Number(wallet?.wallettotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <Link
            href={`/admin/wallet?userid=${encodeURIComponent(u.userid)}`}
            className="mt-3 inline-block text-xs text-primary-600 hover:underline"
          >
            ดูประวัติ wallet →
          </Link>
        </div>
      </div>

      {/* Recent forwarders */}
      <Section title={`ฝากนำเข้าล่าสุด (${fws.length})`} viewAllHref={`/admin/forwarders?focus=search&q=${u.userid}`}>
        {fws.length === 0 ? (
          <Empty>ยังไม่มีรายการฝากนำเข้า</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>วันที่</Th>
                <Th>เลขที่</Th>
                <Th>เบอร์ตู้</Th>
                <Th>สถานะ</Th>
                <Th right>ราคารวม</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {fws.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <Td>{r.fdate ? String(r.fdate).slice(0, 10) : "-"}</Td>
                  <Td mono>{r.fidorco ?? "-"}</Td>
                  <Td mono>{r.fcabinetnumber ?? "-"}</Td>
                  <Td>{r.fstatus ?? "-"}</Td>
                  <Td right>
                    ฿
                    {Number(r.ftotalprice ?? 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </Td>
                  <Td>
                    <Link
                      href={`/admin/forwarders/${encodeURIComponent(r.fidorco ?? String(r.id))}`}
                      className="text-primary-600 hover:underline"
                    >
                      ดู
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {/* Recent shop orders */}
      <Section title={`ฝากสั่งล่าสุด (${hos.length})`} viewAllHref={`/admin/service-orders?q=${u.userid}`}>
        {hos.length === 0 ? (
          <Empty>ยังไม่มีรายการฝากสั่ง</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>วันที่</Th>
                <Th>เลขที่</Th>
                <Th>สินค้า</Th>
                <Th>สถานะ</Th>
                <Th right>THB</Th>
                <Th></Th>
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
                  <Td>{r.hstatus ?? "-"}</Td>
                  <Td right>
                    ฿
                    {Number(r.htotalpriceuser ?? 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </Td>
                  <Td>
                    <Link
                      href={`/admin/service-orders/${encodeURIComponent(r.hno ?? String(r.id))}`}
                      className="text-primary-600 hover:underline"
                    >
                      ดู
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {/* Recent yuan payments */}
      <Section title={`ฝากโอนหยวนล่าสุด (${pys.length})`} viewAllHref={`/admin/yuan-payments?q=${u.userid}`}>
        {pys.length === 0 ? (
          <Empty>ยังไม่มีรายการฝากโอน</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>วันที่</Th>
                <Th>สถานะ</Th>
                <Th right>หยวน</Th>
                <Th right>THB</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {pys.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <Td>{r.paydate ? String(r.paydate).slice(0, 10) : "-"}</Td>
                  <Td>{r.paystatus ?? "-"}</Td>
                  <Td right>
                    ¥{Number(r.payyuan ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </Td>
                  <Td right>
                    ฿{Number(r.paythb ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </Td>
                  <Td>
                    <Link
                      href={`/admin/yuan-payments/${r.id}`}
                      className="text-primary-600 hover:underline"
                    >
                      ดู
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
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

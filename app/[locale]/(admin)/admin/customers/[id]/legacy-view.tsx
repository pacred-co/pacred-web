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
  userNote: string | null;
  userPicture: string | null;     // Wave 13: legacy avatar filename (col is `userPicture` not `userimage` — fix Wave 19 BUG#1 2026-05-26)
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
      "userID,userName,userLastName,userCompany,userEmail,userTel,userActive,userRegistered,userLastLogin,adminIDSale,userNote,userPicture",
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
  // shop / yuan) are best-effort recents — a transient error there falls
  // through to an empty list rather than blowing up the page.
  const [
    walletRes,
    corpRes,
    addrRes,
    mainAddrRes,
    forwarderRes,
    shopRes,
    yuanRes,
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
              {(u.userName ?? u.userID).trim().charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-600">
              ADMIN · ลูกค้า {isJuristic ? "นิติบุคคล" : "บุคคล"}
            </p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <h1 className="text-2xl font-bold font-mono">{u.userID}</h1>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusCfg.cls}`}>
                {statusCfg.label}
              </span>
              {u.adminIDSale ? (
                <span className="rounded-full border border-border bg-surface-alt px-3 py-1 text-xs font-mono">
                  ดูแลโดย {u.adminIDSale}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted mt-1">
              Wave 20 P0-1 · `tb_*` schema · status mutate / credit-line editor → Phase C
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
          <KV label="โทรศัพท์" value={u.userTel ?? "-"} />
          <KV label="อีเมล" value={u.userEmail ?? "-"} />
          <KV
            label="สมัครเมื่อ"
            value={u.userRegistered ? new Date(u.userRegistered).toLocaleString("th-TH") : "-"}
          />
          <KV
            label="ล่าสุดล็อกอิน"
            value={u.userLastLogin ? new Date(u.userLastLogin).toLocaleString("th-TH") : "-"}
          />
          {u.userNote ? <KV label="หมายเหตุ" value={u.userNote} /> : null}
        </div>
        <div className="rounded-2xl border border-border bg-primary-50 dark:bg-surface p-5 text-sm">
          <p className="text-xs font-semibold text-muted">ยอดกระเป๋า (THB)</p>
          <p className="mt-2 text-3xl font-bold font-mono text-primary-700">
            ฿{Number(wallet?.wallettotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <Link
            href={`/admin/wallet?userid=${encodeURIComponent(u.userID)}`}
            className="mt-3 inline-block text-xs text-primary-600 hover:underline"
          >
            ดูประวัติ wallet →
          </Link>
        </div>
      </div>

      {/* Wave 20 P0-1: deferred-mutation banner. The legacy view is
          read-only by design — credit-line · status mutate · assign-rep ·
          impersonation panels relied on the rebuilt `profiles.id` (uuid)
          and don't apply to the ~8,898 migrated PCS customers. Edit
          actions are tracked as separate audit items + Phase C work. */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <strong>หมายเหตุ:</strong> หน้านี้อ่านอย่างเดียว (Wave 20 schema port).
        การอนุมัติ / ระงับ / แก้ไขข้อมูล / โอนเซลล์ → ใช้หน้าย่อยเฉพาะทาง
        (<Link href="/admin/customers/transfer-rep" className="underline">ย้ายเซลล์</Link>
        {" · "}
        <Link href="/admin/customers/pending" className="underline">รายการรออนุมัติ</Link>)
        หรือรอ Phase C สำหรับ inline editor.
      </div>

      {/* Wave 20 P0-1: juristic company info (tb_corporate) — only render
          when usercompany='1' AND a corporate row exists. */}
      {isJuristic && corp ? (
        <Section title="ข้อมูลบริษัท (นิติบุคคล)">
          <div className="p-4 grid sm:grid-cols-2 gap-4 text-sm">
            <KV label="ชื่อบริษัท" value={corp.corporatename ?? "-"} />
            <KV label="เลขผู้เสียภาษี" value={corp.corporatenumber ?? "-"} mono />
            <KV
              label="สถานะอนุมัติ"
              value={corp.corporatestatus === "1" ? "อนุมัติแล้ว" : "รออนุมัติ"}
            />
            <KV label="ที่อยู่บริษัท" value={corp.corporateaddress ?? "-"} />
          </div>
        </Section>
      ) : isJuristic ? (
        <Section title="ข้อมูลบริษัท (นิติบุคคล)">
          <Empty>ลูกค้าเลือกประเภทนิติบุคคลแต่ยังไม่ได้กรอกข้อมูลบริษัท</Empty>
        </Section>
      ) : null}

      {/* Wave 20 P0-1: shipping addresses (tb_address) — show default
          flag from tb_address_main. */}
      <Section title={`ที่อยู่จัดส่ง (${addresses.length})`}>
        {addresses.length === 0 ? (
          <Empty>ยังไม่มีที่อยู่จัดส่ง</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {addresses.map((ad) => {
              const isMain = ad.addressid === mainAddrId;
              const recipient = `${ad.addressname ?? ""} ${ad.addresslastname ?? ""}`.trim() || "-";
              const phones = [ad.addresstel, ad.addresstel2].filter(Boolean).join(" · ") || "-";
              const line = [
                ad.addressno,
                ad.addresssubdistrict ? `ต.${ad.addresssubdistrict}` : null,
                ad.addressdistrict ? `อ.${ad.addressdistrict}` : null,
                ad.addressprovince ? `จ.${ad.addressprovince}` : null,
                ad.addresszipcode,
              ].filter(Boolean).join(" ");
              return (
                <li key={ad.addressid} className="px-4 py-3 text-sm space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{recipient}</span>
                    {isMain ? (
                      <span className="rounded-full bg-primary-500 text-white px-2 py-0.5 text-[10px]">
                        ที่อยู่หลัก
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted">📞 {phones}</p>
                  <p className="text-xs">{line || "-"}</p>
                  {ad.addressnote ? (
                    <p className="text-xs text-muted italic">หมายเหตุ: {ad.addressnote}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Recent forwarders */}
      <Section title={`ฝากนำเข้าล่าสุด (${fws.length})`} viewAllHref={`/admin/forwarders?focus=search&q=${u.userID}`}>
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
      <Section title={`ฝากสั่งล่าสุด (${hos.length})`} viewAllHref={`/admin/service-orders?q=${u.userID}`}>
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
      <Section title={`ฝากโอนหยวนล่าสุด (${pys.length})`} viewAllHref={`/admin/yuan-payments?q=${u.userID}`}>
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

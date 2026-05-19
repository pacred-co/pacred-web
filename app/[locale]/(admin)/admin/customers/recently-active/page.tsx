import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { AdminDateFilter } from "@/components/admin/date-filter";

// Port of legacy `pcs-admin/recently-used-imported-customers.php`. PHP
// version was an admin UX dashboard that joined the user list against
// three activity tables (header_order, forwarder, payment) and rendered
// lifetime stats. We replicate the same view + add segmentation by
// account_type and a date range filter on the *registration* timestamp.
//
// Performance: this is admin-only (RLS-bypassing service role) so we
// don't need pagination — typical Pacred member counts (<5k) render in
// well under a second.

type ActType = "all" | "personal" | "juristic";

// D1 Phase-B Wave-B5 (sidebar fidelity): sidebar routes 1 SLA queue here
// — ไม่ติดต่อลูกค้าใหม่เกิน 2 วัน. The real "no contact" rule in legacy
// PHP requires joining against a (still-unported) contact-log table; we
// surface ?sla= as a chip + banner today and leave the activity ranking
// untouched until the contact-log model lands. Premature SQL would
// either over- or under-report leads and hurt sales follow-up.
const SLA_CFG: Record<string, string> = {
  "no-contact-2d": "ไม่ติดต่อลูกค้าใหม่เกิน 2 วัน",
};

type ProfileRow = {
  id:               string;
  member_code:      string | null;
  account_type:     "personal" | "juristic";
  first_name:       string | null;
  last_name:        string | null;
  company_name:     string | null;
  phone:            string | null;
  email:            string | null;
  register_with:    string | null;
  referral_channel: string | null;
  created_at:       string;
};

type Aggregate = { count: number; total: number; lastAt: string | null };

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}
function customerLabel(p: ProfileRow): string {
  if (p.account_type === "juristic" && p.company_name) return p.company_name;
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}
function dateOnly(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("th-TH") : "—";
}

export default async function RecentlyActiveCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?:      string;
    date_from?: string;
    date_to?:   string;
    sla?:       string;
  }>;
}) {
  // W-1 (gap-admin H-1/H-7): page-level role gate. Lists customer PII
  // (name/phone) + their order activity — ops + sales + accounting.
  await requireAdmin(["ops", "sales_admin", "accounting"]);

  const sp        = await searchParams;
  const type: ActType = sp.type === "personal" || sp.type === "juristic" ? sp.type : "all";
  const dateFrom  = sp.date_from ?? "";
  const dateTo    = sp.date_to   ?? "";
  const slaKey    = sp.sla && SLA_CFG[sp.sla] ? sp.sla : undefined;
  const slaLabel  = slaKey ? SLA_CFG[slaKey] : undefined;

  // Clear-link preserves other active filters (type / date range)
  const clearSlaParams = new URLSearchParams({ type });
  if (dateFrom) clearSlaParams.set("date_from", dateFrom);
  if (dateTo)   clearSlaParams.set("date_to",   dateTo);
  const clearSlaHref = `/admin/customers/recently-active?${clearSlaParams}`;

  const admin = createAdminClient();

  // 1. Profiles (filter by account_type + registration date)
  let profileQ = admin
    .from("profiles")
    .select("id, member_code, account_type, first_name, last_name, company_name, phone, email, register_with, referral_channel, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (type !== "all") profileQ = profileQ.eq("account_type", type);
  if (dateFrom)       profileQ = profileQ.gte("created_at", dateFrom);
  if (dateTo)         profileQ = profileQ.lte("created_at", dateTo + "T23:59:59");
  const { data: profilesRaw } = await profileQ;
  const profiles = (profilesRaw ?? []) as ProfileRow[];
  const profileIds = profiles.map((p) => p.id);

  // 2. Aggregate activity per profile (only if we have any profiles)
  const shopByProfile      = new Map<string, Aggregate>();
  const forwarderByProfile = new Map<string, Aggregate>();
  const yuanByProfile      = new Map<string, Aggregate>();

  if (profileIds.length > 0) {
    const [
      { data: orderRows },
      { data: forwarderRows },
      { data: yuanRows },
    ] = await Promise.all([
      admin
        .from("service_orders")
        .select("profile_id, total_thb, created_at")
        .in("profile_id", profileIds)
        .neq("status", "cancelled"),
      admin
        .from("forwarders")
        .select("profile_id, total_price, created_at")
        .in("profile_id", profileIds)
        .neq("status", "cancelled"),
      admin
        .from("yuan_payments")
        .select("profile_id, thb_amount, created_at")
        .in("profile_id", profileIds)
        .eq("status", "completed"),
    ]);

    const accumulate = (
      map:  Map<string, Aggregate>,
      rows: Array<{ profile_id: string; created_at: string; [k: string]: unknown }> | null,
      amountKey: string,
    ) => {
      for (const r of (rows ?? [])) {
        const existing = map.get(r.profile_id) ?? { count: 0, total: 0, lastAt: null };
        existing.count += 1;
        existing.total += Number(r[amountKey] ?? 0);
        if (!existing.lastAt || new Date(r.created_at) > new Date(existing.lastAt)) {
          existing.lastAt = r.created_at;
        }
        map.set(r.profile_id, existing);
      }
    };

    accumulate(shopByProfile,      orderRows     as Array<{ profile_id: string; created_at: string; total_thb: number }>,  "total_thb");
    accumulate(forwarderByProfile, forwarderRows as Array<{ profile_id: string; created_at: string; total_price: number }>, "total_price");
    accumulate(yuanByProfile,      yuanRows      as Array<{ profile_id: string; created_at: string; thb_amount: number }>,  "thb_amount");
  }

  // Sort by latest activity across any channel (most recently active first).
  // This is what makes "recently active" useful — sales reps see who needs follow-up.
  const enriched = profiles.map((p) => {
    const shop      = shopByProfile.get(p.id)      ?? { count: 0, total: 0, lastAt: null };
    const forwarder = forwarderByProfile.get(p.id) ?? { count: 0, total: 0, lastAt: null };
    const yuan      = yuanByProfile.get(p.id)      ?? { count: 0, total: 0, lastAt: null };
    const lastActivityAt = [shop.lastAt, forwarder.lastAt, yuan.lastAt]
      .filter((x): x is string => !!x)
      .sort()
      .pop() ?? null;
    return { p, shop, forwarder, yuan, lastActivityAt };
  });

  enriched.sort((a, b) => {
    // Customers with activity first, sorted by most recent. Then no-activity by reg date.
    if (a.lastActivityAt && b.lastActivityAt) {
      return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
    }
    if (a.lastActivityAt) return -1;
    if (b.lastActivityAt) return  1;
    return new Date(b.p.created_at).getTime() - new Date(a.p.created_at).getTime();
  });

  const activeCount   = enriched.filter((e) => e.lastActivityAt).length;
  const inactiveCount = enriched.length - activeCount;
  const totalSpend    = enriched.reduce(
    (s, e) => s + e.shop.total + e.forwarder.total + e.yuan.total, 0,
  );

  const csvRows: CsvRow[] = enriched.map((e) => ({
    member_code:   e.p.member_code ?? "",
    customer:      customerLabel(e.p),
    account_type:  e.p.account_type,
    register_with: e.p.register_with ?? "",
    channel:       e.p.referral_channel ?? "",
    registered_at: dateOnly(e.p.created_at),
    shop_count:    e.shop.count,
    shop_total:    e.shop.total,
    shop_last:     dateOnly(e.shop.lastAt),
    fw_count:      e.forwarder.count,
    fw_total:      e.forwarder.total,
    fw_last:       dateOnly(e.forwarder.lastAt),
    yuan_count:    e.yuan.count,
    yuan_total:    e.yuan.total,
    yuan_last:     dateOnly(e.yuan.lastAt),
    last_activity: dateOnly(e.lastActivityAt),
  }));

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · CUSTOMERS</p>
          <h1 className="mt-1 text-2xl font-bold">
            รายงานลูกค้าที่ใช้งานล่าสุด{slaLabel ? ` — ${slaLabel}` : ""}
          </h1>
          <p className="text-sm text-muted mt-1">
            แสดงลูกค้าทั้งหมด เรียงตาม activity ล่าสุด (shop / forwarder / yuan transfer) — ใช้สำหรับติดตามลูกค้าที่หายไปและกระตุ้น activity
          </p>
        </div>
        <Link
          href="/admin/customers"
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
        >
          ← Customer list
        </Link>
      </div>

      {slaKey && slaLabel && (
        <>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs text-primary-700">
              SLA: {slaLabel}
              <Link
                href={clearSlaHref}
                className="rounded-full bg-white/70 px-1.5 leading-none hover:bg-white"
                aria-label="ล้างตัวกรอง SLA"
              >
                ×
              </Link>
            </span>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ตัวกรอง SLA: {slaLabel} · กำลังพัฒนาเงื่อนไขกรอง · แสดงทุกรายการในขณะนี้
          </div>
        </>
      )}

      {/* Filters */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">ประเภทลูกค้า</span>
          {(["all", "personal", "juristic"] as const).map((t) => {
            const params = new URLSearchParams({ type: t });
            if (dateFrom) params.set("date_from", dateFrom);
            if (dateTo)   params.set("date_to",   dateTo);
            return (
              <Link
                key={t}
                href={`/admin/customers/recently-active?${params}`}
                className={`rounded-lg border px-3 py-1.5 text-xs ${
                  type === t
                    ? "border-primary-500 bg-primary-50 text-primary-700"
                    : "border-border bg-white dark:bg-surface text-muted hover:text-foreground"
                }`}
              >
                {t === "all" ? "ทั้งหมด" : t === "personal" ? "บุคคล" : "บริษัท"}
              </Link>
            );
          })}
        </div>
        <AdminDateFilter
          tab={`type=${type}`}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
        <p className="text-xs text-muted">
          วันที่กรอง = วันที่ลงทะเบียน · เรียงผลลัพธ์ตาม activity ล่าสุด (ลูกค้าที่ active เรียงขึ้นก่อน)
        </p>
      </section>

      {/* Summary */}
      <section className="grid sm:grid-cols-4 gap-3">
        <Stat label="ลูกค้าทั้งหมด"          value={String(enriched.length)} />
        <Stat label="มี activity"             value={String(activeCount)} />
        <Stat label="ไม่มี activity"          value={String(inactiveCount)} />
        <Stat label="ยอดใช้บริการรวม"        value={thb(totalSpend)} small />
      </section>

      {/* CSV */}
      <div className="flex justify-end">
        <CsvButton
          rows={csvRows}
          cols={[
            { key: "member_code",   label: "รหัสสมาชิก" },
            { key: "customer",      label: "ลูกค้า" },
            { key: "account_type",  label: "ประเภท" },
            { key: "register_with", label: "สมัครผ่าน" },
            { key: "channel",       label: "ช่อง" },
            { key: "registered_at", label: "วันสมัคร" },
            { key: "shop_count",    label: "ครั้งฝากสั่ง" },
            { key: "shop_total",    label: "ยอดฝากสั่ง" },
            { key: "shop_last",     label: "ฝากสั่งล่าสุด" },
            { key: "fw_count",      label: "ครั้งฝากนำเข้า" },
            { key: "fw_total",      label: "ยอดฝากนำเข้า" },
            { key: "fw_last",       label: "ฝากนำเข้าล่าสุด" },
            { key: "yuan_count",    label: "ครั้งโอนหยวน" },
            { key: "yuan_total",    label: "ยอดโอนหยวน" },
            { key: "yuan_last",     label: "โอนหยวนล่าสุด" },
            { key: "last_activity", label: "activity ล่าสุด" },
          ]}
          filename={`pacred-recently-active-${type}-${dateFrom || "all"}-${dateTo || "now"}.csv`}
        />
      </div>

      {/* Table */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface-alt/50 text-left uppercase tracking-wide text-[10px] text-muted">
            <tr>
              <th className="px-2 py-2.5">ลูกค้า</th>
              <th className="px-2 py-2.5">สมัคร</th>
              <th className="px-2 py-2.5">ช่อง</th>
              <th className="px-2 py-2.5 text-right">ฝากสั่ง</th>
              <th className="px-2 py-2.5">ล่าสุด</th>
              <th className="px-2 py-2.5 text-right">ฝากนำเข้า</th>
              <th className="px-2 py-2.5">ล่าสุด</th>
              <th className="px-2 py-2.5 text-right">โอนหยวน</th>
              <th className="px-2 py-2.5">ล่าสุด</th>
              <th className="px-2 py-2.5">Activity ล่าสุด</th>
            </tr>
          </thead>
          <tbody>
            {enriched.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-muted">ไม่มีลูกค้าตรงเงื่อนไข</td>
              </tr>
            ) : (
              enriched.map((e) => (
                <tr key={e.p.id} className="border-t border-border hover:bg-surface-alt/30">
                  <td className="px-2 py-2 max-w-[200px]">
                    <Link href={`/admin/customers/${e.p.id}`} className="font-medium text-primary-600 hover:underline">
                      {customerLabel(e.p)}
                    </Link>
                    <div className="text-[10px] text-muted font-mono">
                      {e.p.member_code ?? "—"} · {e.p.account_type === "juristic" ? "บริษัท" : "บุคคล"}
                    </div>
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-muted">
                    {dateOnly(e.p.created_at)}
                  </td>
                  <td className="px-2 py-2 max-w-[110px] text-muted truncate" title={e.p.referral_channel ?? ""}>
                    {e.p.referral_channel ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {e.shop.count > 0 ? `${e.shop.count} · ${thb(e.shop.total)}` : "—"}
                  </td>
                  <td className="px-2 py-2 text-muted whitespace-nowrap">
                    {dateOnly(e.shop.lastAt)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {e.forwarder.count > 0 ? `${e.forwarder.count} · ${thb(e.forwarder.total)}` : "—"}
                  </td>
                  <td className="px-2 py-2 text-muted whitespace-nowrap">
                    {dateOnly(e.forwarder.lastAt)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {e.yuan.count > 0 ? `${e.yuan.count} · ${thb(e.yuan.total)}` : "—"}
                  </td>
                  <td className="px-2 py-2 text-muted whitespace-nowrap">
                    {dateOnly(e.yuan.lastAt)}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {e.lastActivityAt ? (
                      <span className="rounded-full bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 text-[10px]">
                        {dateOnly(e.lastActivityAt)}
                      </span>
                    ) : (
                      <span className="text-muted text-[10px]">— ยังไม่ใช้บริการ —</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 font-bold font-mono text-foreground ${small ? "text-sm" : "text-xl"}`}>
        {value}
      </p>
    </div>
  );
}

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { TransferRepForm } from "./transfer-rep-form";

export default async function TransferRepPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  // Customer + current rep + stats (mirrors PHP transferSalesCustomers
  // home.php aggregates: shop count/total, forwarder count/total + last
  // date, payment count/total). Done in parallel — none depend on each other.
  //
  // Phase C QoL #1 — the full reps list was previously loaded here to
  // populate a <select>. The combobox in transfer-rep-form fetches via
  // searchAdminsByQuery on-demand, so we no longer pre-fetch every rep.
  // We do still need the CURRENT rep's display label so the page can
  // render "เซลล์ปัจจุบัน" — that's a single targeted lookup.
  const [
    { data: profile },
    { data: shopAgg },
    { data: forwarderAgg },
    { data: forwarderLast },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "id, member_code, account_type, first_name, last_name, company_name, phone, email, sales_admin_id, created_at",
      )
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("service_orders")
      .select("total_thb")
      .eq("profile_id", id)
      .neq("status", "cancelled"),
    admin
      .from("forwarders")
      .select("total_price")
      .eq("profile_id", id)
      .neq("status", "cancelled"),
    admin
      .from("forwarders")
      .select("f_no, created_at")
      .eq("profile_id", id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!profile) notFound();

  type Profile = {
    id: string; member_code: string | null; account_type: "personal" | "juristic";
    first_name: string | null; last_name: string | null; company_name: string | null;
    phone: string | null; email: string | null; sales_admin_id: string | null;
    created_at: string;
  };
  const p = profile as unknown as Profile;

  // Yuan-transfer total — read the LIVE legacy tb_payment (keyed by userid =
  // the customer's PR member_code), NOT the rebuilt 0-row yuan_payments twin
  // (which keyed by profile_id → always ฿0). Mirrors the sibling yuan surfaces
  // (actions/admin/reports.ts getYuanProfitReport + /admin/yuan-payments):
  // paythb = THB amount, paystatus='2' = อนุมัติ (approved/completed) — match
  // the original rebuilt read's status='completed' filter.
  let yuanRows: { paythb: number | null }[] = [];
  if (p.member_code) {
    const { data: yuanAgg, error: yuanErr } = await admin
      .from("tb_payment")
      .select("paythb")
      .eq("userid", p.member_code)
      .eq("paystatus", "2");
    if (yuanErr) {
      console.error(`[transfer-rep yuan tb_payment] failed`, { code: yuanErr.code, message: yuanErr.message, userid: p.member_code });
    }
    yuanRows = yuanAgg ?? [];
  }

  const sum = <T extends Record<string, unknown>>(rows: T[] | null | undefined, key: keyof T) =>
    (rows ?? []).reduce((s, r) => s + Number(r[key] ?? 0), 0);

  const shopCount       = (shopAgg ?? []).length;
  const shopTotal       = sum(shopAgg, "total_thb");
  const forwarderCount  = (forwarderAgg ?? []).length;
  const forwarderTotal  = sum(forwarderAgg, "total_price");
  const yuanCount       = yuanRows.length;
  // à¸à¸²à¸à¹à¸­à¸à¸«à¸¢à¸§à¸: the ROW is a yuan-transfer job but this sums `paythb` = the BAHT
  // the customer paid (owner 2026-07-16 currency-display sweep â the old name
  // "yuanTotal" lied, which is exactly how a à¸¿-on-yuan bug starts).
  const yuanRowsThbTotal       = sum(yuanRows, "paythb");
  const forwarderLastDate = (forwarderLast as { created_at?: string } | null)?.created_at ?? null;

  const customerDisplay = p.account_type === "juristic" && p.company_name
    ? p.company_name
    : `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "ลูกค้า";

  // Resolve the CURRENT rep's display label (combobox no longer pre-fetches
  // the full reps list — see comment in the Promise.all above).
  //
  // Wave 22 — fetched admins + contact extras as 2 separate queries (admins
  // and admin_contact_extras both FK to profiles but NOT to each other →
  // PostgREST cross-embed fails PGRST200). profile via profiles!profile_id
  // works (direct FK).
  type RepProfile = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null };
  type RepContact = { display_name: string | null; direct_phone: string | null };
  let currentRepDisplay: string | null = null;
  if (p.sales_admin_id) {
    const [{ data: repRow, error: repRowErr }, { data: repContact, error: repContactErr }] = await Promise.all([
      admin
        .from("admins")
        .select(
          `profile_id, role,
           profile:profiles!profile_id ( member_code, first_name, last_name, phone )`,
        )
        .eq("profile_id", p.sales_admin_id)
        .in("role", ["sales_admin", "super", "ultra"])
        .eq("is_active", true)
        .limit(1)
        .maybeSingle<{
          profile_id: string; role: string;
          profile: RepProfile | RepProfile[] | null;
        }>(),
      admin
        .from("admin_contact_extras")
        .select("display_name, direct_phone")
        .eq("profile_id", p.sales_admin_id)
        .maybeSingle<RepContact>(),
    ]);
    if (repRowErr) {
      console.error(`[admins list] failed`, { code: repRowErr.code, message: repRowErr.message });
    }
    if (repContactErr) {
      console.error(`[admins contact lookup] failed`, repContactErr);
    }
    if (repRow) {
      const prof    = Array.isArray(repRow.profile) ? repRow.profile[0] : repRow.profile;
      const contact = repContact;
      const name    = contact?.display_name ?? `${prof?.first_name ?? ""} ${prof?.last_name ?? ""}`.trim() ?? "—";
      const phone   = contact?.direct_phone ?? prof?.phone ?? "—";
      currentRepDisplay = `${name} · ${prof?.member_code ?? ""} · ${phone}`;
    }
  }

  return (
    <main className="p-6 lg:p-8 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · โอนเซลล์</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">โอนเซลล์ที่ดูแลลูกค้า</h1>
          <p className="text-sm text-muted mt-1">
            {customerDisplay} · <span className="font-mono">{p.member_code ?? "—"}</span>
          </p>
        </div>
        <Link
          href={`/admin/customers/${id}`}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
        >
          ← กลับโปรไฟล์ลูกค้า
        </Link>
      </div>

      {/* Stat strip — customer's lifetime numbers (decision support for the admin) */}
      <section className="grid sm:grid-cols-3 gap-3">
        <Stat label="จำนวนรายการฝากสั่ง" sub={`฿${shopTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}     value={String(shopCount)} />
        <Stat label="จำนวนรายการฝากนำเข้า" sub={`฿${forwarderTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`} value={String(forwarderCount)} />
        <Stat label="จำนวนรายการโอนหยวน" sub={`฿${yuanRowsThbTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}        value={String(yuanCount)} />
      </section>

      {/* Current state */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <h2 className="font-bold text-sm mb-3">สถานะปัจจุบัน</h2>
        <dl className="grid sm:grid-cols-2 gap-y-2 text-sm">
          <Field label="ลูกค้า"            value={customerDisplay} />
          <Field label="รหัสสมาชิก"        value={p.member_code ?? "—"} mono />
          <Field label="เบอร์"              value={p.phone ?? "—"} />
          <Field label="ลูกค้าใหม่เมื่อ"    value={new Date(p.created_at).toLocaleDateString("th-TH")} />
          <Field label="รายการฝากนำเข้าล่าสุด" value={forwarderLastDate ? new Date(forwarderLastDate).toLocaleDateString("th-TH") : "—"} />
          <Field label="เซลล์ปัจจุบัน"      value={currentRepDisplay ?? "— ไม่มีเซลล์ที่ดูแล —"} />
        </dl>
      </section>

      {/* Transfer form */}
      <TransferRepForm
        customerId={p.id}
        currentRepId={p.sales_admin_id}
        currentRepDisplay={currentRepDisplay}
      />
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold font-mono text-foreground">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className={mono ? "font-mono font-medium" : "font-medium"}>{value}</dd>
    </>
  );
}

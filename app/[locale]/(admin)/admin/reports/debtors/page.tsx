import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CsvButton } from "@/components/admin/csv-button";

// V-B1 #4: customers with negative wallet balance (main or credit). Deepest debt first.
// Date filter not meaningful for current balance — omitted. Cross-link to forwarders
// + service_orders for "what created the debt".

type Row = {
  profile_id:       string;
  balance:          number;
  credit_balance:   number;
  cashback_balance: number;
  profile:          { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null } | { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null }[] | null;
};
type NormRow = Omit<Row, "profile"> & { profile: { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null } | null };

function thb(n: number): string {
  const sign = n < 0 ? "-" : "";
  return sign + "฿" + Math.abs(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function DebtorsReport() {
  await requireAdmin(["super", "accounting"]);
  const admin = createAdminClient();

  // Pull only rows with at least one negative balance — `.or()` is OR across columns
  const { data } = await admin
    .from("wallet")
    .select(`profile_id, balance, credit_balance, cashback_balance,
      profile:profiles!profile_id(member_code, first_name, last_name, phone)`)
    .or("balance.lt.0,credit_balance.lt.0")
    .order("balance", { ascending: true })
    .limit(500);

  const rows: NormRow[] = ((data ?? []) as Row[]).map((r) => ({
    ...r,
    profile: Array.isArray(r.profile) ? (r.profile[0] ?? null) : r.profile,
  }));

  const totalMain   = rows.reduce((s, r) => s + (Number(r.balance)        < 0 ? Number(r.balance)        : 0), 0);
  const totalCredit = rows.reduce((s, r) => s + (Number(r.credit_balance) < 0 ? Number(r.credit_balance) : 0), 0);
  const totalOwed   = totalMain + totalCredit;

  const csvRows = rows.map((r) => ({
    profile_id:       r.profile_id,
    member_code:      r.profile?.member_code ?? "",
    name:             [r.profile?.first_name, r.profile?.last_name].filter(Boolean).join(" "),
    phone:            r.profile?.phone ?? "",
    main_balance:     r.balance,
    credit_balance:   r.credit_balance,
    cashback_balance: r.cashback_balance,
    total_owed:       Math.min(0, Number(r.balance)) + Math.min(0, Number(r.credit_balance)),
  }));
  const csvCols = [
    { key: "profile_id",        label: "Profile ID" },
    { key: "member_code",       label: "รหัสลูกค้า" },
    { key: "name",              label: "ชื่อลูกค้า" },
    { key: "phone",             label: "เบอร์" },
    { key: "main_balance",      label: "ยอด main (บาท)" },
    { key: "credit_balance",    label: "ยอด credit (บาท)" },
    { key: "cashback_balance",  label: "ยอด cashback (บาท)" },
    { key: "total_owed",        label: "หนี้รวม (ติดลบ)" },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · รีพอร์ตเฉพาะกิจ (V-B1)</p>
          <h1 className="mt-1 text-2xl font-bold">ลูกค้าติดหนี้</h1>
          <p className="mt-1 text-sm text-muted">
            ลูกค้าที่ยอด wallet main หรือ credit ติดลบ — เรียงหนี้ลึกสุดบนสุด
          </p>
        </div>
        <div className="flex gap-2">
          <CsvButton rows={csvRows} cols={csvCols} filename={`debtors-${new Date().toISOString().slice(0,10)}.csv`} />
          <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt self-center">← กลับรีพอร์ตหลัก</Link>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card label="ลูกค้าที่ติดหนี้" value={String(rows.length)} highlight={rows.length > 0} />
        <Card label="หนี้ main รวม" value={thb(totalMain)} highlight={totalMain < 0} />
        <Card label="หนี้ credit รวม" value={thb(totalCredit)} highlight={totalCredit < 0} />
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">🎉 ไม่มีลูกค้าติดหนี้</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3 text-right">ยอด main</th>
                  <th className="px-4 py-3 text-right">ยอด credit</th>
                  <th className="px-4 py-3 text-right">cashback</th>
                  <th className="px-4 py-3 text-right">หนี้รวม</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const owed = Math.min(0, Number(r.balance)) + Math.min(0, Number(r.credit_balance));
                  return (
                    <tr key={r.profile_id} className="border-t border-border">
                      <td className="px-4 py-3 text-xs">
                        <p>{[r.profile?.first_name, r.profile?.last_name].filter(Boolean).join(" ") || "—"}</p>
                        {r.profile?.member_code && <p className="font-mono text-[10px] text-muted">{r.profile.member_code}</p>}
                        {r.profile?.phone && <p className="text-[10px] text-muted">☎ {r.profile.phone}</p>}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono text-xs ${Number(r.balance) < 0 ? "text-red-700 font-semibold" : "text-muted"}`}>
                        {thb(Number(r.balance))}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono text-xs ${Number(r.credit_balance) < 0 ? "text-red-700 font-semibold" : "text-muted"}`}>
                        {thb(Number(r.credit_balance))}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-muted">{thb(Number(r.cashback_balance))}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-red-700">{thb(owed)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/customers/${r.profile_id}`} className="text-xs text-primary-600 hover:underline">เปิด →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white dark:bg-surface p-4 shadow-sm ${highlight ? "border-red-200" : "border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold font-mono ${highlight ? "text-red-700" : ""}`}>{value}</p>
    </div>
  );
}

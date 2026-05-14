import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { CustomerRowActions } from "@/components/admin/customer-row-actions";

const STATUS_CFG: Record<string, { label: string; className: string }> = {
  active:     { label: "ใช้งาน",      className: "bg-green-50 text-green-700 border-green-200" },
  incomplete: { label: "รอ Approve",  className: "bg-amber-50 text-amber-700 border-amber-200" },
  suspended:  { label: "ระงับ",       className: "bg-red-50 text-red-700 border-red-200" },
};

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const sp = await searchParams;
  const admin = createAdminClient();

  let q = admin.from("profiles")
    .select(`
      id, member_code, account_type, status, first_name, last_name, company_name,
      phone, email, customer_group, created_at,
      wallet:wallet ( balance, cashback_balance, credit_balance )
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (sp.type === "personal" || sp.type === "juristic") q = q.eq("account_type", sp.type);
  if (sp.q) {
    // Search by member_code OR phone OR name (parallel OR via or() filter)
    q = q.or(`member_code.ilike.%${sp.q}%,phone.ilike.%${sp.q}%,first_name.ilike.%${sp.q}%,last_name.ilike.%${sp.q}%,company_name.ilike.%${sp.q}%`);
  }

  const { data } = await q;
  type WalletShape = { balance: number; cashback_balance: number; credit_balance: number };
  type Row = NonNullable<typeof data>[number];
  const rows: (Row & { wallet_row: WalletShape | null })[] = ((data ?? []) as Row[]).map((r) => {
    const w = (r as Row & { wallet: WalletShape | WalletShape[] | null }).wallet;
    return { ...r, wallet_row: Array.isArray(w) ? w[0] ?? null : w };
  });

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">ลูกค้า</h1>
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
                  <th className="px-4 py-3">กลุ่ม</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3 text-right">ยอดกระเป๋า</th>
                  <th className="px-4 py-3">สมัครเมื่อ</th>
                  <th className="px-4 py-3">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={`/admin/customers/${r.id}`} className="text-primary-600 hover:underline">{r.member_code ?? "—"}</Link>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
                        r.account_type === "juristic" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-50 text-gray-700 border-gray-200"
                      }`}>
                        {r.account_type === "juristic" ? "นิติบุคคล" : "บุคคล"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.account_type === "juristic" && r.company_name ? r.company_name : `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div>{r.phone ?? "—"}</div>
                      <div className="text-muted">{r.email ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">{r.customer_group}</td>
                    <td className="px-4 py-3">
                      {(() => {
                        const cfg = STATUS_CFG[r.status] ?? { label: r.status, className: "bg-surface text-muted border-border" };
                        return (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.className}`}>
                            {cfg.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      ฿{Number(r.wallet_row?.balance ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("th-TH")}</td>
                    <td className="px-4 py-3"><CustomerRowActions id={r.id} status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

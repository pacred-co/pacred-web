import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

type WalletRow = {
  id: string;
  balance: number;
  currency: string;
  profile_id: string;
  profiles: {
    first_name: string | null;
    last_name: string | null;
    member_code: string | null;
    phone: string | null;
  } | null;
};

export default async function WalletPage() {
  await requireAdmin();

  const admin = createAdminClient();
  const { data: wallets } = await admin
    .from("wallets")
    .select("id, balance, currency, profile_id, profiles(first_name, last_name, member_code, phone)")
    .order("balance", { ascending: false })
    .limit(100);

  const totalBalance = (wallets as WalletRow[] | null)?.reduce((s, w) => s + (w.balance ?? 0), 0) ?? 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">กระเป๋าสตางค์</h1>
          <p className="text-sm text-muted mt-1">ยอดเงินของสมาชิกทั้งหมดในระบบ</p>
        </div>
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm text-right">
          <p className="text-xs text-muted mb-1">ยอดรวมในระบบ</p>
          <p className="text-2xl font-bold text-foreground">
            ฿{totalBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-[#F8F9FB] dark:bg-surface-alt text-left">
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">รหัสสมาชิก</th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">ชื่อ</th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">เบอร์โทร</th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide text-right">ยอดเงิน (THB)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(wallets as WalletRow[] | null)?.map((w) => (
                <tr key={w.id} className="hover:bg-[#F8F9FB] dark:hover:bg-surface-alt transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted">{w.profiles?.member_code ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {[w.profiles?.first_name, w.profiles?.last_name].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">{w.profiles?.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">
                    ฿{(w.balance ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
              {(!wallets || wallets.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-muted">
                    ยังไม่มีข้อมูล — รัน migration 0004 ใน Supabase ก่อนครับ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

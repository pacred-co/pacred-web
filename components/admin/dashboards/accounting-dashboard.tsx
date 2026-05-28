import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import {
  FileText, ReceiptText, Wallet as WalletIcon, AlertOctagon,
  ArrowDownToLine, ArrowUpFromLine, Banknote, RotateCcw,
} from "lucide-react";

/**
 * V-E12 · Accounting role dashboard — the queue-driven landing for
 * accounting staff. The existing /admin (ops) view covers some of this
 * but accounting needs the cash-flow queues front + center.
 *
 * KPIs (per spec):
 *   - Pending freight invoices count + amount outstanding
 *   - Pending tax invoices (RD Code 86 issuance queue)
 *   - WHT accumulated this month (ภ.ง.ด credit tracking)
 *   - Pending wallet deposits / withdrawals (incoming slip / outgoing transfer)
 *   - Pending sales payouts (commission withdrawals)
 *   - Pending yuan transfers (admin must process)
 *   - Pending refund requests
 *
 * All queries hit existing indexes; no migration needed.
 */

export const dynamic = "force-dynamic";

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function int(n: number): string {
  return n.toLocaleString("th-TH");
}
function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function nowMsServer(): number {
   
  return Date.now();
}

type WhtRow = { wht_amount_thb: number };
type OverdueInvoiceRow = {
  id: string;
  invoice_no: string | null;
  issued_at: string | null;
  profile:
    | { member_code: string | null; first_name: string | null; last_name: string | null }
    | { member_code: string | null; first_name: string | null; last_name: string | null }[]
    | null;
};

export async function AccountingDashboard() {
  const admin = createAdminClient();

  const nowMs = nowMsServer();
  const now = new Date(nowMs);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthLabel = `${THAI_MONTHS[now.getMonth()]} ${now.getFullYear() + 543}`;

  const [
    freightDraftCount,
    freightIssuedCount,
    taxPending,
    walletDepositsPending,
    walletWithdrawsPending,
    salesPayoutsPending,
    yuanPending,
    refundsPending,
    monthWht,
    overdueInvoices,
  ] = await Promise.all([
    admin
      .from("freight_invoices")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft"),
    admin
      .from("freight_invoices")
      .select("id", { count: "exact", head: true })
      .eq("status", "issued"),
    admin
      .from("tax_invoices")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("wallet_transactions")
      .select("id", { count: "exact", head: true })
      .eq("kind", "deposit")
      .eq("status", "pending"),
    admin
      .from("wallet_transactions")
      .select("id", { count: "exact", head: true })
      .eq("kind", "withdraw")
      .eq("status", "pending"),
    admin
      .from("sales_payouts")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("yuan_payments")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "processing"]),
    admin
      .from("refund_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("withholding_tax_entries")
      .select("wht_amount_thb")
      .gte("created_at", monthStart),
    admin
      .from("freight_invoices")
      .select("id, invoice_no, issued_at, profile:profiles!profile_id(member_code, first_name, last_name)")
      .eq("status", "issued")
      .order("issued_at", { ascending: true })
      .limit(5),
  ]);

  const whtRows = (monthWht.data ?? []) as WhtRow[];
  const whtSum = whtRows.reduce((s, r) => s + Number(r.wht_amount_thb ?? 0), 0);

  const overdueRaw = (overdueInvoices.data ?? []) as OverdueInvoiceRow[];
  const overdue = overdueRaw.map((r) => ({
    ...r,
    profile: Array.isArray(r.profile) ? (r.profile[0] ?? null) : r.profile,
  }));

  return (
    <main className="p-4 lg:p-6 space-y-4">
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · บัญชี</p>
        <h1 className="mt-1 text-2xl font-bold">หน้าบัญชี (Accounting)</h1>
        <p className="text-xs text-muted mt-1">
          คิว invoice · WHT เดือนนี้ · เติม/ถอน · เบิกค่าคอม · คืนเงิน
        </p>
      </header>

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat
          tone="info"
          icon={<FileText className="h-7 w-7" />}
          label="freight invoice draft"
          value={int(freightDraftCount.count ?? 0)}
          sub="รอออกใบ"
          href="/admin/freight"
        />
        <Stat
          tone="warning"
          icon={<FileText className="h-7 w-7" />}
          label="freight invoice ค้างชำระ"
          value={int(freightIssuedCount.count ?? 0)}
          sub="issued · ยังไม่ปิดยอด"
          href="/admin/freight"
        />
        <Stat
          tone="primary"
          icon={<ReceiptText className="h-7 w-7" />}
          label="ใบกำกับภาษีรอออก"
          value={int(taxPending.count ?? 0)}
          sub="RD Code 86 · pending"
          href="/admin/tax-invoices"
        />
        <Stat
          tone="success"
          icon={<Banknote className="h-7 w-7" />}
          label={`WHT สะสม ${monthLabel}`}
          value={thb(whtSum)}
          sub="ภ.ง.ด เครดิตรอ"
          href="/admin/freight"
        />
      </section>

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat
          tone="info"
          icon={<ArrowDownToLine className="h-7 w-7" />}
          label="เติมเงินรอตรวจ"
          value={int(walletDepositsPending.count ?? 0)}
          sub="wallet · deposits"
          href="/admin/wallet"
        />
        <Stat
          tone="warning"
          icon={<ArrowUpFromLine className="h-7 w-7" />}
          label="ถอนเงินรออนุมัติ"
          value={int(walletWithdrawsPending.count ?? 0)}
          sub="wallet · withdraws"
          href="/admin/withdrawals"
        />
        <Stat
          tone="primary"
          icon={<WalletIcon className="h-7 w-7" />}
          label="เบิกค่าคอม"
          value={int(salesPayoutsPending.count ?? 0)}
          sub="sales_payouts · pending"
          href="/admin/sales-payouts"
        />
        <Stat
          tone="danger"
          icon={<RotateCcw className="h-7 w-7" />}
          label="คำขอคืนเงิน"
          value={int(refundsPending.count ?? 0)}
          sub="refund_requests · pending"
          href="/admin/refunds?status=pending"
        />
      </section>

      <section className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <Stat
          tone="info"
          icon={<Banknote className="h-7 w-7" />}
          label="ฝากโอนหยวนรอ"
          value={int(yuanPending.count ?? 0)}
          sub="yuan_payments · pending/processing"
          href="/admin/yuan-payments"
        />
        <Stat
          tone="primary"
          icon={<ReceiptText className="h-7 w-7" />}
          label="freight invoice ทั้งหมด"
          value={int((freightDraftCount.count ?? 0) + (freightIssuedCount.count ?? 0))}
          sub="draft + issued"
          href="/admin/freight"
        />
      </section>

      {/* Overdue invoices (top 5 oldest issued) */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <AlertOctagon className="h-4 w-4 text-amber-600" />
            invoice ค้างชำระ (เก่าสุด 5 ใบ)
          </h2>
          <Link href="/admin/freight" className="text-[11px] text-primary-600 hover:underline">
            ดูทั้งหมด →
          </Link>
        </div>
        {overdue.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">ไม่มีใบที่ค้างชำระ</p>
        ) : (
          <ul className="divide-y divide-border">
            {overdue.map((r) => {
              const p = r.profile;
              const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "—";
              const days = r.issued_at
                ? Math.max(0, Math.floor((nowMs - new Date(r.issued_at).getTime()) / 86400e3))
                : null;
              return (
                <li key={r.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-mono font-semibold truncate">{r.invoice_no}</p>
                    <p className="text-[11px] text-muted truncate">
                      {p?.member_code ?? "—"} · {name}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {days !== null ? (
                      <p className="text-[11px] font-semibold text-amber-600">ค้าง {days} วัน</p>
                    ) : (
                      <p className="text-[11px] text-muted">—</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({
  tone, icon, label, value, sub, href,
}: {
  tone: "danger" | "info" | "success" | "primary" | "warning";
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  href: string;
}) {
  const tones: Record<typeof tone, string> = {
    danger: "text-red-600",
    info: "text-cyan-600",
    success: "text-emerald-600",
    primary: "text-fuchsia-600",
    warning: "text-amber-600",
  };
  return (
    <Link href={href} className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm hover:shadow-md transition-shadow block">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-2xl sm:text-3xl font-bold font-mono leading-none ${tones[tone]}`}>{value}</p>
          <p className="mt-2 text-xs font-semibold text-foreground line-clamp-2">{label}</p>
          <p className="mt-1 text-[10px] text-muted">{sub}</p>
        </div>
        <div className={`shrink-0 opacity-80 ${tones[tone]}`}>{icon}</div>
      </div>
    </Link>
  );
}

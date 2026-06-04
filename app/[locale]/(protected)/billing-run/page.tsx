/**
 * /billing-run — customer-side ใบวางบิลของฉัน (R-2)
 *
 * Per AGENTS.md §0d (reachability) — wired in protected sidebar (added next).
 * Per AGENTS.md §0e — reads `tb_forwarder_invoice` directly with admin client
 * but gates strictly by `userid === profile.userID` so the customer can ONLY
 * see their own invoices.
 *
 * Surface area:
 *   - List the customer's invoices grouped by status (รอชำระ / ชำระแล้ว /
 *     ยกเลิก / เลยกำหนด)
 *   - Click → detail at /billing-run/[id]
 */

import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function thbFmt(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function CustomerBillingRunPage() {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  if (!profile.member_code) {
    // legacy "userid" linkage = profile.member_code (PR123); without it nothing matches
    return (
      <main className="p-4 md:p-6 space-y-4">
        <h1 className="text-xl font-bold">ใบวางบิลของฉัน</h1>
        <p className="text-sm text-muted">ยังไม่มีรหัสสมาชิก · กรุณาเสร็จสิ้นการลงทะเบียน</p>
      </main>
    );
  }

  const admin = createAdminClient();
  type Raw = {
    id: number;
    doc_no: string;
    date_issued: string;
    date_due: string;
    total_thb: number | string;
    status: "issued" | "paid" | "cancelled";
    paid_at: string | null;
  };
  const { data: invoices, error } = await admin
    .from("tb_forwarder_invoice")
    .select("id, doc_no, date_issued, date_due, total_thb, status, paid_at")
    .eq("userid", profile.member_code)
    .order("date_issued", { ascending: false })
    .limit(500);
  if (error) {
    console.error("[/billing-run customer list] failed", {
      code: error.code, message: error.message, userid: profile.member_code,
    });
  }

  const rows = ((invoices ?? []) as unknown as Raw[]).map((r) => ({
    ...r,
    total_thb: Number(r.total_thb),
    is_overdue: r.status === "issued" && r.date_due < isoToday(),
  }));

  const issued    = rows.filter((r) => r.status === "issued" && !r.is_overdue);
  const overdue   = rows.filter((r) => r.is_overdue);
  const paid      = rows.filter((r) => r.status === "paid");
  const cancelled = rows.filter((r) => r.status === "cancelled");
  const totalUnpaid = [...issued, ...overdue].reduce((s, r) => s + r.total_thb, 0);

  return (
    <main className="p-4 md:p-6 lg:p-8 space-y-5">
      <title>ใบวางบิลของฉัน | Pacred</title>

      <header className="space-y-1">
        <h1 className="text-xl md:text-2xl font-bold">ใบวางบิลของฉัน</h1>
        <p className="text-xs text-muted">ใบเรียกเก็บเงินจากบริษัทแพคเรด (ประเทศไทย) จำกัด · ชำระภายในวันที่ครบกำหนด</p>
      </header>

      {totalUnpaid > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-amber-700 font-medium">ยอดค้างชำระทั้งหมด</div>
              <div className="text-2xl md:text-3xl font-bold text-amber-800">฿{thbFmt(totalUnpaid)}</div>
            </div>
            <div className="text-xs text-amber-700 text-right">
              <div>{issued.length} ใบรอชำระ</div>
              {overdue.length > 0 && <div className="text-red-700 font-medium mt-0.5">{overdue.length} ใบเลยกำหนด ⚠️</div>}
            </div>
          </div>
        </section>
      )}

      {rows.length === 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-8 text-center shadow-sm">
          <p className="text-sm text-muted">ยังไม่มีใบวางบิล</p>
        </section>
      )}

      {overdue.length > 0 && (
        <InvoiceSection
          title="⚠️ เลยกำหนดชำระ"
          subtitle="กรุณาชำระโดยเร็วเพื่อหลีกเลี่ยงการระงับบริการ"
          rows={overdue}
          tone="red"
        />
      )}
      {issued.length > 0 && (
        <InvoiceSection title="รอชำระเงิน" rows={issued} tone="amber" />
      )}
      {paid.length > 0 && (
        <InvoiceSection title="ชำระแล้ว" rows={paid} tone="emerald" />
      )}
      {cancelled.length > 0 && (
        <InvoiceSection title="ยกเลิก" rows={cancelled} tone="stone" />
      )}
    </main>
  );
}

type SectionTone = "red" | "amber" | "emerald" | "stone";
type SectionRow = {
  id: number;
  doc_no: string;
  date_issued: string;
  date_due: string;
  total_thb: number;
  status: "issued" | "paid" | "cancelled";
  paid_at: string | null;
  is_overdue: boolean;
};

function InvoiceSection({ title, subtitle, rows, tone }: {
  title: string;
  subtitle?: string;
  rows: SectionRow[];
  tone: SectionTone;
}) {
  const toneCls: Record<SectionTone, string> = {
    red:     "border-red-200 bg-red-50/30",
    amber:   "border-amber-200 bg-amber-50/30",
    emerald: "border-emerald-200 bg-emerald-50/20",
    stone:   "border-stone-200 bg-stone-50/30",
  };
  const titleCls: Record<SectionTone, string> = {
    red:     "text-red-800",
    amber:   "text-amber-800",
    emerald: "text-emerald-800",
    stone:   "text-stone-700",
  };
  return (
    <section className={`rounded-2xl border ${toneCls[tone]} p-3 md:p-4`}>
      <div className="mb-3">
        <h2 className={`font-bold text-sm ${titleCls[tone]}`}>{title} ({rows.length})</h2>
        {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`/billing-run/${r.id}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white dark:bg-surface p-3 hover:shadow-sm transition-shadow"
          >
            <div className="flex-1 min-w-0">
              <div className="font-mono text-sm font-medium truncate">{r.doc_no}</div>
              <div className="text-xs text-muted mt-0.5">
                ออก {r.date_issued} · ครบกำหนด {r.date_due}
                {r.is_overdue && <span className="text-red-600 ml-2">· เลยกำหนดแล้ว</span>}
                {r.status === "paid" && r.paid_at && <span className="text-emerald-700 ml-2">· ชำระเมื่อ {r.paid_at.slice(0, 10)}</span>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-base font-bold">฿{thbFmt(r.total_thb)}</div>
              <div className="text-xs text-primary-600 hover:underline">ดูรายละเอียด →</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

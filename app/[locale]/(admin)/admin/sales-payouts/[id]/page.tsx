/**
 * /admin/sales-payouts/[id] — read-only payout detail (Wave 7 fix · 2026-05-21 night).
 *
 * The /admin dashboard's "payShop" tab row link pointed at
 * `/admin/sales-payouts/${row.id}` but no route existed → 404. The rebuilt
 * `sales_payouts` table is empty on prod (Phase-C feature · no legacy port
 * yet) so in practice the tab shows 0 rows and this page rarely fires —
 * but the route now exists so a future row click won't 404.
 *
 * Wave 8 backlog: full payout view + approve/reject + bank transfer
 * receipt upload + ledger adjust (`tb_user_sales_admin_pay` once we
 * port the cargo-sales commission engine).
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "รอตรวจสอบ",
  approved: "อนุมัติแล้ว",
  paid: "จ่ายแล้ว",
  rejected: "ปฏิเสธ",
  cancelled: "ยกเลิก",
};
const STATUS_CLS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
  approved: "bg-blue-100 text-blue-700 border-blue-200",
  paid: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
};

type PayoutRow = {
  id: string;
  amount_total: number;
  status: string;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  note: string | null;
  requested_at: string;
  paid_at: string | null;
  approved_at: string | null;
  team_leader_id: string | null;
  kind: string | null;
};

export default async function AdminSalesPayoutDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(["super", "accounting"]);
  const { id } = await params;

  const admin = createAdminClient();
  const { data: rowRaw } = await admin
    .from("sales_payouts")
    .select(
      "id,amount_total,status,bank_name,account_name,account_number,note,requested_at,paid_at,approved_at,team_leader_id,kind",
    )
    .eq("id", id)
    .maybeSingle();
  if (!rowRaw) notFound();
  const row = rowRaw as unknown as PayoutRow;

  const status = row.status ?? "pending";

  return (
    <main className="p-6 lg:p-8 max-w-3xl mx-auto space-y-5">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">
            ADMIN · เบิกค่าสินค้า / โบนัสเซลล์
          </p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <h1 className="text-2xl font-bold font-mono">#{row.id.slice(0, 8)}</h1>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                STATUS_CLS[status] ?? "bg-gray-100 text-gray-600 border-gray-200"
              }`}
            >
              {STATUS_LABEL[status] ?? status}
            </span>
            {row.kind ? (
              <span className="rounded-full border border-border bg-surface-alt px-3 py-1 text-xs">
                {row.kind}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted mt-1">
            Wave 7 read-only · approve/reject/paid → Wave 8 (Phase C)
          </p>
        </div>
        <Link href="/admin/sales-payouts" className="text-xs text-primary-600 hover:underline">
          ← รายการ
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3 text-sm">
        <KV
          label="จำนวนเงิน"
          value={`฿${Number(row.amount_total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          mono
        />
        {row.bank_name ? <KV label="ธนาคาร" value={row.bank_name} /> : null}
        {row.account_name ? <KV label="ชื่อบัญชี" value={row.account_name} /> : null}
        {row.account_number ? <KV label="เลขที่บัญชี" value={row.account_number} mono /> : null}
        {row.team_leader_id ? <KV label="ทีมขาย" value={row.team_leader_id} mono /> : null}
        <KV
          label="วันที่ขอเบิก"
          value={row.requested_at ? new Date(row.requested_at).toLocaleString("th-TH") : "-"}
        />
        <KV
          label="วันที่อนุมัติ"
          value={row.approved_at ? new Date(row.approved_at).toLocaleString("th-TH") : "-"}
        />
        <KV
          label="วันที่จ่าย"
          value={row.paid_at ? new Date(row.paid_at).toLocaleString("th-TH") : "-"}
        />
        {row.note ? <KV label="หมายเหตุ" value={row.note} /> : null}
      </div>

      <div className="flex gap-2 flex-wrap pt-2">
        <Link
          href="/admin/sales-payouts"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← รายการ
        </Link>
      </div>
    </main>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between border-b border-border/40 py-1.5 gap-3">
      <span className="text-muted shrink-0">{label}</span>
      <span className={mono ? "font-mono text-right" : "text-right"}>{value}</span>
    </div>
  );
}

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { YuanPaymentActions } from "./actions-cell";
import { YuanBulkApproveBar, YuanRowCheckbox } from "./bulk-approve-bar";
import { SlipTransferredAtCell } from "@/components/admin/slip-transferred-at-cell";

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  processing: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  refunded: "bg-gray-50 text-gray-600 border-gray-200",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "รอตรวจ", processing: "กำลังโอน", completed: "สำเร็จ", failed: "ล้มเหลว", refunded: "คืนเงิน",
};

export default async function AdminYuanPaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const admin = createAdminClient();

  let q = admin.from("yuan_payments")
    .select(`
      id, channel, recipient_detail, yuan_amount, exchange_rate, thb_amount,
      paid_via_wallet, slip_url, id_doc_url, status, created_at, slip_transferred_at,
      profile:profiles!profile_id ( member_code, first_name, last_name, phone )
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (sp.status) q = q.eq("status", sp.status);
  const { data } = await q;
  type ProfileShape = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null };
  type RawRow = Omit<NonNullable<typeof data>[number], "profile"> & {
    profile: ProfileShape | ProfileShape[] | null;
  };
  const rows = ((data ?? []) as RawRow[]).map((r) => ({
    ...r,
    profile: Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile,
  }));

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">ฝากโอนหยวน</h1>
      </div>

      <FilterBar currentStatus={sp.status} />

      <YuanBulkApproveBar />

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีรายการ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-3 w-8"></th>
                  <th className="px-4 py-3">วันที่ระบบ / โอนจริง</th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3">ช่องทาง</th>
                  <th className="px-4 py-3">ปลายทาง</th>
                  <th className="px-4 py-3 text-right">หยวน</th>
                  <th className="px-4 py-3 text-right">บาท</th>
                  <th className="px-4 py-3">หลักฐาน</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-2 py-3">
                      {/* T-P3: bulk-select shown only for pending rows
                          (adminBulkApproveYuanPayments only acts on pending) */}
                      {r.status === "pending" ? <YuanRowCheckbox id={r.id} /> : null}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <div className="text-muted">{new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</div>
                      <div className="mt-1 text-[10px] text-muted">⏱ โอน:</div>
                      <SlipTransferredAtCell
                        kind="yuan_payment"
                        id={r.id}
                        currentValue={(r as { slip_transferred_at: string | null }).slip_transferred_at ?? null}
                      />
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-mono">{r.profile?.member_code ?? "—"}</div>
                      <div>{r.profile?.first_name} {r.profile?.last_name}</div>
                      <div className="text-muted">{r.profile?.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{r.channel}</td>
                    <td className="px-4 py-3 text-xs max-w-[200px] whitespace-pre-wrap">{r.recipient_detail}</td>
                    <td className="px-4 py-3 text-right font-mono">¥{Number(r.yuan_amount).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      ฿{Number(r.thb_amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      <div className="text-[10px] text-muted">@ {Number(r.exchange_rate).toFixed(4)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs space-y-1">
                      {r.paid_via_wallet ? (
                        <span className="rounded-full bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 text-[10px]">จากกระเป๋า</span>
                      ) : (
                        <>
                          {r.slip_url    && <SlipLink path={r.slip_url} label="สลิป" />}
                          {r.id_doc_url  && <SlipLink path={r.id_doc_url} label="บัตร ปชช." />}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status]}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <YuanPaymentActions id={r.id} status={r.status} />
                    </td>
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

function FilterBar({ currentStatus }: { currentStatus?: string }) {
  const opts = [
    { v: undefined, l: "ทั้งหมด" },
    ...Object.entries(STATUS_LABEL).map(([v, l]) => ({ v, l })),
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <Link key={o.l} href={o.v ? `/admin/yuan-payments?status=${o.v}` : "/admin/yuan-payments"}
          className={`rounded-full border px-3 py-1 text-xs ${
            (currentStatus ?? "") === (o.v ?? "") ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border hover:bg-surface-alt"
          }`}>
          {o.l}
        </Link>
      ))}
    </div>
  );
}

function SlipLink({ path, label }: { path: string; label: string }) {
  // path stored as Supabase Storage key — admin can preview via dashboard or by request
  return <div className="text-[10px] text-primary-500 truncate">{label}: <code className="text-[9px]">{path.slice(-20)}</code></div>;
}

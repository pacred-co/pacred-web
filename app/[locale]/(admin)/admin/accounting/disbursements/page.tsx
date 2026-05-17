import { Link } from "@/i18n/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { DisbursementForm } from "./disbursement-form";
import { DisbursementRowControls } from "./disbursement-row-controls";

/**
 * /admin/accounting/disbursements — U2-2 AP ledger list page.
 *
 * Per UPGRADE_PLAN §2 U2-2 + research G-2/R-7: AP ledger surface.
 * Lists container_disbursements with filters (container code,
 * kind, date range), an inline "add new" form, and edit/delete
 * row controls.
 *
 * RBAC: super OR accounting (page-level requireAdmin). The
 * underlying RLS on container_disbursements is super/accounting-only
 * — non-finance roles would 404 from the layout already, but the
 * explicit gate here prevents the page from loading if RBAC drifts.
 */

const KIND_LABEL_TH: Record<string, string> = {
  freight:      "ค่าระวาง (freight)",
  customs_duty: "ค่าภาษีศุลกากร",
  handling:     "ค่า handling / THC",
  fuel:         "ค่าเชื้อเพลิง (fuel)",
  storage:      "ค่าเช่า / demurrage",
  trucking:     "ค่ารถในประเทศ",
  other:        "อื่นๆ",
};
const KIND_BADGE: Record<string, string> = {
  freight:      "bg-blue-50 text-blue-700 border-blue-200",
  customs_duty: "bg-red-50 text-red-700 border-red-200",
  handling:     "bg-amber-50 text-amber-700 border-amber-200",
  fuel:         "bg-orange-50 text-orange-700 border-orange-200",
  storage:      "bg-purple-50 text-purple-700 border-purple-200",
  trucking:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  other:        "bg-gray-50 text-gray-700 border-gray-200",
};

type SP = {
  container_code?: string;
  kind?:           string;
  date_from?:      string;
  date_to?:        string;
};

function thb(n: number) {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function AdminDisbursementsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // W-1 keystone: explicit super+accounting gate (RLS-bypassing client below).
  await requireAdmin(["super", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // ── Build the list query with filters ──
  let q = admin
    .from("container_disbursements")
    .select(`
      id, cargo_container_id, kind, amount_thb, vendor_name, invoice_no,
      paid_at, paid_by_admin_id, attachment_path, note, created_at
    `)
    .order("created_at", { ascending: false })
    .limit(500);

  if (sp.kind && sp.kind !== "all") q = q.eq("kind", sp.kind);
  if (sp.date_from)                  q = q.gte("created_at", sp.date_from);
  if (sp.date_to)                    q = q.lte("created_at", sp.date_to + "T23:59:59");

  // Container-code filter — resolve container_id first
  if (sp.container_code) {
    const { data: cnt } = await admin
      .from("cargo_containers")
      .select("id")
      .eq("code", sp.container_code)
      .maybeSingle<{ id: string }>();
    if (!cnt) {
      // No container with that code — show empty state immediately
      return (
        <EmptyState
          message={`ไม่พบ container ที่มีรหัส "${sp.container_code}"`}
          filters={sp}
        />
      );
    }
    q = q.eq("cargo_container_id", cnt.id);
  }

  const { data: rowsRaw } = await q;
  type Row = {
    id: string; cargo_container_id: string; kind: string;
    amount_thb: number | string; vendor_name: string; invoice_no: string | null;
    paid_at: string | null; paid_by_admin_id: string | null;
    attachment_path: string | null; note: string | null; created_at: string;
  };
  const rows = (rowsRaw ?? []) as Row[];

  // Resolve container codes for display in one query
  const containerIds = Array.from(new Set(rows.map((r) => r.cargo_container_id)));
  const codeById = new Map<string, string | null>();
  if (containerIds.length > 0) {
    const { data: cnts } = await admin
      .from("cargo_containers")
      .select("id, code")
      .in("id", containerIds);
    for (const c of (cnts ?? []) as Array<{ id: string; code: string | null }>) {
      codeById.set(c.id, c.code);
    }
  }

  // Totals
  const totalAmount = rows.reduce((s, r) => s + Number(r.amount_thb ?? 0), 0);
  const paidCount   = rows.filter((r) => r.paid_at).length;

  // Container list for the form dropdown (limit to recent open containers)
  const { data: openContainers } = await admin
    .from("cargo_containers")
    .select("id, code, status, origin, destination")
    .order("created_at", { ascending: false })
    .limit(100);
  type CntRow = { id: string; code: string | null; status: string; origin: string; destination: string };
  const containersForForm = ((openContainers ?? []) as CntRow[]).filter((c) => c.code != null);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · ACCOUNTING</p>
          <h1 className="mt-1 text-2xl font-bold">AP Ledger / สมุดจ่าย (Container disbursements)</h1>
          <p className="mt-1 text-sm text-muted">
            U2-2: ค่าใช้จ่ายจริงที่ Pacred จ่ายออกต่อตู้ — feed margin reconciliation
          </p>
        </div>
      </div>

      {/* Filters */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <label className="text-xs space-y-1">
          <span className="block font-medium">รหัสตู้</span>
          <input
            name="container_code"
            defaultValue={sp.container_code ?? ""}
            placeholder="GZE260516-1"
            className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm font-mono w-44"
          />
        </label>
        <label className="text-xs space-y-1">
          <span className="block font-medium">ประเภท</span>
          <select
            name="kind"
            defaultValue={sp.kind ?? "all"}
            className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm w-44"
          >
            <option value="all">— ทั้งหมด —</option>
            {Object.entries(KIND_LABEL_TH).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="text-xs space-y-1">
          <span className="block font-medium">ตั้งแต่</span>
          <input
            type="date"
            name="date_from"
            defaultValue={sp.date_from ?? ""}
            className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs space-y-1">
          <span className="block font-medium">ถึง</span>
          <input
            type="date"
            name="date_to"
            defaultValue={sp.date_to ?? ""}
            className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600"
        >
          กรอง
        </button>
        <Link
          href="/admin/accounting/disbursements"
          className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-alt"
        >
          เคลียร์
        </Link>
      </form>

      {/* Totals */}
      <div className="grid sm:grid-cols-3 gap-3">
        <StatCard label="จำนวนรายการ" value={String(rows.length)} />
        <StatCard label="ชำระแล้ว"     value={`${paidCount} / ${rows.length}`} tone="green" />
        <StatCard label="ยอดรวม"      value={thb(totalAmount)} tone="red" />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        {/* List */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-bold text-sm">รายการจ่ายล่าสุด ({rows.length})</h2>
          </div>
          {rows.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">
              ยังไม่มีรายการตามฟิลเตอร์ที่เลือก — ใช้ฟอร์มด้านขวาเพื่อบันทึก
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">ตู้</th>
                    <th className="px-4 py-3">ประเภท</th>
                    <th className="px-4 py-3">vendor</th>
                    <th className="px-4 py-3 text-right">จำนวน (฿)</th>
                    <th className="px-4 py-3">ชำระเมื่อ</th>
                    <th className="px-4 py-3">หมายเหตุ</th>
                    <th className="px-4 py-3">การกระทำ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const cntCode = codeById.get(r.cargo_container_id) ?? "—";
                    const badge   = KIND_BADGE[r.kind] ?? "bg-gray-50 text-gray-700 border-gray-200";
                    const label   = KIND_LABEL_TH[r.kind] ?? r.kind;
                    return (
                      <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                        <td className="px-4 py-3 font-mono text-xs">
                          {cntCode !== "—" ? (
                            <Link
                              href={`/admin/warehouse/containers/${cntCode}`}
                              className="text-primary-600 hover:underline"
                            >
                              {cntCode}
                            </Link>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge}`}>
                            {label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div>{r.vendor_name}</div>
                          {r.invoice_no && (
                            <div className="text-muted text-[10px] font-mono">inv: {r.invoice_no}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-bold text-red-700">
                          {thb(Number(r.amount_thb))}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                          {r.paid_at
                            ? new Date(r.paid_at).toLocaleDateString("th-TH")
                            : <span className="text-amber-700">รอชำระ</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted max-w-xs truncate" title={r.note ?? ""}>
                          {r.note ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <DisbursementRowControls
                            id={r.id}
                            kind={r.kind}
                            amountThb={Number(r.amount_thb)}
                            vendorName={r.vendor_name}
                            invoiceNo={r.invoice_no}
                            paidAt={r.paid_at}
                            note={r.note}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add new form */}
        <aside className="space-y-4">
          <DisbursementForm
            containers={containersForForm.map((c) => ({
              id:    c.id,
              code:  c.code as string,
              route: `${c.origin} → ${c.destination}`,
            }))}
            defaultContainerCode={sp.container_code}
          />
        </aside>
      </div>
    </main>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" }) {
  const color = tone === "green" ? "text-green-700" : tone === "red" ? "text-red-700" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold font-mono ${color}`}>{value}</p>
    </div>
  );
}

function EmptyState({ message, filters }: { message: string; filters: SP }) {
  return (
    <main className="p-6 lg:p-8 space-y-4">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · ACCOUNTING</p>
        <h1 className="mt-1 text-2xl font-bold">AP Ledger / สมุดจ่าย</h1>
      </div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-700">
        {message}
      </div>
      <Link
        href="/admin/accounting/disbursements"
        className="inline-block rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-alt"
      >
        ← เคลียร์ฟิลเตอร์
      </Link>
      {/* keep TS happy — filters is used for the empty-state label only */}
      <p className="text-[10px] text-muted">filter: {JSON.stringify(filters)}</p>
    </main>
  );
}

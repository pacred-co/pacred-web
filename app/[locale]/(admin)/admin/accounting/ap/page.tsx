/**
 * /admin/accounting/ap — AP / เบิกจ่าย ledger (READ-first list).
 *
 * Spec: docs/research/accounting-ap-2026-07-01/spec.md · mig 0239.
 * Owner design rule: report-cnt-style LIST → shop-order-style DETAIL.
 *
 * SLICE 1 = READ (the sheet history becomes queryable) + a request/approve
 * RECORD (writes only the ap_disbursement status/record — NO existing money
 * table). The pay-flip (สถานะโอนเงิน → โอนแล้ว = a register of an out-of-band
 * bank transfer) is DEFERRED to Slice 2 (see the banner) with the atomic-claim
 * guard from markShopDisbursementPaid + ก๊อต co-sign.
 *
 * Reachable §0d: accounting menubar "รายจ่าย" leaf "AP / เบิกจ่าย (Ledger)"
 * (lib/admin/accounting-menubar.ts → CARGO_MENUBAR).
 *
 * Auth — finance-only: accounting + super + ultra (RLS mirror mig 0239).
 * requireAdmin(["accounting"]) already admits super + ultra via isGodRole.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccountingMenubar } from "@/components/admin/accounting-menubar";
import { PageHeader } from "@/components/admin/page-header";
import {
  listApDisbursements,
  groupByShipment,
  computeApTotals,
  AP_LANE_ORDER,
  AP_LANE_LABEL,
  AP_ENTITY_LABEL,
  type ApLane,
  type ApEntity,
} from "@/lib/admin/ap-disbursement";
import { ApListTable } from "./ap-list-table";

export const dynamic = "force-dynamic";

function fmt2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type SP = {
  lane?: string;
  entity?: string;
  q?: string;
  start?: string;
  end?: string;
};

function isLane(v: string | undefined): v is ApLane {
  return !!v && (AP_LANE_ORDER as string[]).includes(v);
}
function isEntity(v: string | undefined): v is ApEntity {
  return !!v && ["pacred", "axelra", "nnb", "pcs", "ttp"].includes(v);
}

export default async function AdminApLedgerPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["accounting"]); // super + ultra admitted via isGodRole

  const sp = await searchParams;
  const lane = isLane(sp.lane) ? sp.lane : undefined;
  const entity = isEntity(sp.entity) ? sp.entity : undefined;
  const search = sp.q?.trim() || undefined;
  const start = sp.start && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) ? sp.start : undefined;
  const end = sp.end && /^\d{4}-\d{2}-\d{2}$/.test(sp.end) ? sp.end : undefined;

  const admin = createAdminClient();
  const { rows, error } = await listApDisbursements(admin, {
    lane,
    entity,
    search,
    start,
    end,
  });

  const groups = groupByShipment(rows);
  const pageTotals = computeApTotals(rows);

  // Preserve non-lane params when switching lane tabs.
  function laneHref(l: ApLane | null): string {
    const p = new URLSearchParams();
    if (l) p.set("lane", l);
    if (entity) p.set("entity", entity);
    if (search) p.set("q", search);
    if (start) p.set("start", start);
    if (end) p.set("end", end);
    const qs = p.toString();
    return `/admin/accounting/ap${qs ? `?${qs}` : ""}`;
  }

  return (
    <>
      <AccountingMenubar activeHref="/admin/accounting/ap" />
      <main className="space-y-5 p-6 lg:p-8">
        <PageHeader
          eyebrow="ADMIN · ACCOUNTING"
          title="เบิกจ่าย / AP Ledger"
          subtitle="บันทึกการเบิกเงิน (money-OUT) ต้นทุนบริการ · เงินทดรองจ่าย · เบิก/คืนเงิน — แยกตามงาน (SHIPMENT) · เลน · entity"
          actions={
            <div className="flex items-center gap-2">
              <Link
                href="/admin/accounting/ap/new"
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
              >
                + เพิ่มคำขอเบิก
              </Link>
              <Link
                href="/admin/accounting/ap/central-fund"
                className="rounded-lg border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100"
              >
                กองกลางโกดังจีน (¥) →
              </Link>
            </div>
          }
        />

        {/* Workflow banner — request → approve → transfer(register). */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] leading-relaxed text-amber-800">
          <span className="font-semibold">ขั้นตอน:</span> ขอเบิก (requested) → อนุมัติ (approved) →
          “โอนแล้ว” (transferred). การกด “โอนแล้ว” เป็นการ{" "}
          <span className="font-semibold">บันทึกว่าโอนออกนอกระบบแล้ว (register)</span> — เงินโอนออก
          ทางธนาคารจริงแล้ว สลิปคือหลักฐาน ระบบไม่ได้ตัดเงินในแอป · มี guard atomic-claim กันกดซ้ำ.
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            โหลดรายการไม่สำเร็จ: {error}
          </div>
        )}

        {/* Filters — search + entity + date range (report-cnt-style). */}
        <form
          method="GET"
          className="flex flex-wrap items-end gap-3 rounded-xl border border-black/10 bg-white p-4"
        >
          {lane && <input type="hidden" name="lane" value={lane} />}
          <div className="min-w-[220px] grow">
            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="f-q">
              ค้นหา (SHIPMENT / QO / ผู้รับเงิน / รายการ / รหัสลูกค้า)
            </label>
            <input
              id="f-q"
              type="text"
              name="q"
              defaultValue={search ?? ""}
              placeholder="เช่น PRA260050001 · QO-… · ค่า D/O"
              className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="f-entity">
              Entity
            </label>
            <select
              id="f-entity"
              name="entity"
              defaultValue={entity ?? ""}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm"
            >
              <option value="">ทั้งหมด</option>
              {(Object.keys(AP_ENTITY_LABEL) as ApEntity[]).map((e) => (
                <option key={e} value={e}>
                  {AP_ENTITY_LABEL[e]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="f-start">
              ตั้งแต่วันที่ขอเบิก
            </label>
            <input
              id="f-start"
              type="date"
              name="start"
              defaultValue={start ?? ""}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="f-end">
              ถึงวันที่
            </label>
            <input
              id="f-end"
              type="date"
              name="end"
              defaultValue={end ?? ""}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            ค้นหา
          </button>
        </form>

        {/* Lane tabs (report-cnt transport-mode tabs analogue) */}
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-black/10 bg-white p-2">
          <Link
            href={laneHref(null)}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${
              !lane
                ? "bg-primary-600 text-white"
                : "border border-black/10 text-gray-600 hover:bg-gray-50"
            }`}
          >
            ทั้งหมด
          </Link>
          {AP_LANE_ORDER.map((l) => (
            <Link
              key={l}
              href={laneHref(l)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${
                lane === l
                  ? "bg-primary-600 text-white"
                  : "border border-black/10 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {AP_LANE_LABEL[l]}
            </Link>
          ))}
        </div>

        {/* Page-level Σ footer strip (net = ยอดเบิก − ยอดคืน · category split). */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SumCard label="รายการทั้งหมด" value={`${pageTotals.count} รายการ`} />
          <SumCard
            label="ยอดสุทธิ (เบิก − คืน)"
            value={`฿${fmt2(pageTotals.netSum)}`}
            tone="primary"
            emphasis
          />
          <SumCard label="ต้นทุนบริการ" value={`฿${fmt2(pageTotals.serviceCostSum)}`} tone="blue" />
          <SumCard
            label="เงินทดรองจ่าย (ไม่ใช่ต้นทุน)"
            value={`฿${fmt2(pageTotals.advanceSum)}`}
            tone="amber"
          />
        </div>

        {/* The grouped-by-SHIPMENT list (client — expandable fan-out). */}
        <ApListTable groups={groups} />
      </main>
    </>
  );
}

function SumCard({
  label,
  value,
  tone,
  emphasis,
}: {
  label: string;
  value: string;
  tone?: "primary" | "blue" | "amber";
  emphasis?: boolean;
}) {
  const color =
    tone === "primary"
      ? "text-primary-700"
      : tone === "blue"
        ? "text-blue-700"
        : tone === "amber"
          ? "text-amber-700"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 font-mono ${emphasis ? "text-2xl font-bold" : "text-lg font-semibold"} ${color}`}>
        {value}
      </p>
    </div>
  );
}

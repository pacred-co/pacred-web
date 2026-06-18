import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { adminGetFreightCockpitDetail } from "@/actions/admin/freight-ops-cockpit";
import { CockpitDetailClient, type AdminOption } from "./cockpit-detail-client";

/**
 * W4 — /admin/freight/operations/[id] (id = freight_shipment_id)
 *
 * Per-job cockpit: stage-aware workspace (pricing / sales / doc / acc) with
 * stage status pills, section assignment, per-stage checklist, an operator
 * P&L snapshot, and a commission STUB (read-only invoice total — the
 * commission ledger is a later wave). NO money mutation.
 *
 * Roles: super + freight section roles + ops/accounting/sales_admin/pricing.
 */

export const dynamic = "force-dynamic";

export default async function FreightOperationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { roles } = await requireAdmin([
    "super", "ops", "sales_admin", "accounting", "pricing",
    "freight_sales_manager", "freight_sales",
    "freight_export_manager", "freight_export_cs", "freight_export_doc", "freight_export_clearance",
    "freight_clearance_both",
    "freight_import_manager", "freight_import_cs", "freight_import_doc", "freight_import_clearance",
  ]);

  const { id } = await params;
  const res = await adminGetFreightCockpitDetail({ shipmentId: id });
  if (!res.ok) {
    if (res.error === "not_found") notFound();
    return (
      <main className="p-6 lg:p-8 max-w-4xl space-y-4">
        <Link href="/admin/freight/operations" className="text-sm text-primary-600 hover:underline">← กลับสู่ Freight Operations</Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ: {res.error}
        </div>
      </main>
    );
  }
  if (!res.data) {
    return (
      <main className="p-6 lg:p-8 max-w-4xl space-y-4">
        <Link href="/admin/freight/operations" className="text-sm text-primary-600 hover:underline">← กลับสู่ Freight Operations</Link>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">ไม่พบงานนี้</div>
      </main>
    );
  }
  // Active admin roster for the assignment dropdowns (page-side fetch).
  const admin = createAdminClient();
  const { data: adminRows, error: adminErr } = await admin
    .from("admins")
    .select(`
      profile_id, role,
      profile:profiles!profile_id ( first_name, last_name, company_name )
    `)
    .eq("is_active", true);
  if (adminErr) {
    console.error(`[freight-ops detail admin roster] failed`, { code: adminErr.code, message: adminErr.message });
  }

  type ProfileShape = { first_name: string | null; last_name: string | null; company_name: string | null };
  const seen = new Set<string>();
  const adminOptions: AdminOption[] = [];
  for (const r of (adminRows ?? []) as Array<{ profile_id: string; role: string; profile: ProfileShape | ProfileShape[] | null }>) {
    if (seen.has(r.profile_id)) continue;
    seen.add(r.profile_id);
    const p = Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile;
    const name =
      p?.company_name ??
      `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() ??
      "";
    adminOptions.push({ id: r.profile_id, name: name || r.profile_id.slice(0, 8) });
  }
  adminOptions.sort((a, b) => a.name.localeCompare(b.name, "th"));

  const isSuper = isGodRole(roles);
  // P&L (cost/profit) is a MONEY-internal view — ultra/accounting/pricing ONLY
  // (super excluded per owner 2026-06-18). Gating the cockpit link avoids a
  // dead 403 click for super/CS/doc roles. audit SF-3.
  const canViewPnl = canViewCostProfit(roles);

  // DATA-LAYER hide: the DOC-stage P&L snapshot (cost/revenue/profit) must
  // never reach the client for non-cost roles — strip the money fields from
  // the serialized detail (not just hide the editor). Revenue is kept hidden
  // alongside cost because profit = revenue − cost (derived-value trap).
  const detail = canViewPnl
    ? res.data
    : { ...res.data, costSnapshot: null, revenueSnapshot: null, profitSnapshot: null };

  return (
    <main className="p-4 sm:p-6 lg:p-8 max-w-5xl space-y-5">
      <Link href="/admin/freight/operations" className="text-sm text-primary-600 hover:underline">
        ← กลับสู่ Freight Operations
      </Link>
      <CockpitDetailClient
        detail={detail}
        adminOptions={adminOptions}
        canManage
        canViewPnl={canViewPnl}
        isSuper={isSuper}
      />
    </main>
  );
}

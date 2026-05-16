import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { NewInspectionForm } from "./new-inspection-form";

/**
 * /admin/warehouse/qa-inspections/new?shipment=<uuid> — V-E10.
 *
 * Record a new inspection against a specific cargo shipment. The shipment
 * uuid arrives in the query string from the pending-queue links.
 *
 * Without `?shipment=`, redirect back to the list (operators always come
 * here from a queue link in V1; manual entry is rare).
 */

export const dynamic = "force-dynamic";

type Shipment = {
  id:                  string;
  shipment_code:       string;
  status:              string;
  forwarder_f_no:      string | null;
  service_order_h_no:  string | null;
  profile: {
    member_code: string | null;
    first_name:  string | null;
    last_name:   string | null;
  } | null;
};

export default async function AdminNewQaInspectionPage({
  searchParams,
}: {
  searchParams: Promise<{ shipment?: string }>;
}) {
  await requireAdmin(["super", "accounting", "warehouse"]);
  const sp = await searchParams;
  if (!sp.shipment) redirect("/admin/warehouse/qa-inspections");

  const admin = createAdminClient();
  const { data: raw } = await admin
    .from("cargo_shipments")
    .select(`
      id, shipment_code, status, forwarder_f_no, service_order_h_no,
      profile:profiles!profile_id ( member_code, first_name, last_name )
    `)
    .eq("id", sp.shipment)
    .maybeSingle();

  if (!raw) notFound();

  type ProfileShape = NonNullable<Shipment["profile"]>;
  const rawProfile = raw.profile as ProfileShape | ProfileShape[] | null;
  const shipment: Shipment = {
    ...raw,
    profile: Array.isArray(rawProfile) ? rawProfile[0] ?? null : rawProfile,
  } as Shipment;

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-3xl">
      <div>
        <Link href="/admin/warehouse/qa-inspections" className="text-xs text-primary-500 hover:underline">
          ← กลับหน้ารายการ
        </Link>
        <h1 className="mt-1 text-2xl font-bold">บันทึกการตรวจคุณภาพ</h1>
        <p className="text-xs text-muted mt-1">
          Shipment <span className="font-mono">{shipment.shipment_code}</span> ·
          ลูกค้า {shipment.profile?.member_code} · {shipment.profile?.first_name} {shipment.profile?.last_name}
          {shipment.forwarder_f_no     && <> · forwarder <span className="font-mono">{shipment.forwarder_f_no}</span></>}
          {shipment.service_order_h_no && <> · order <span className="font-mono">{shipment.service_order_h_no}</span></>}
        </p>
      </div>

      <NewInspectionForm cargoShipmentId={shipment.id} shipmentCode={shipment.shipment_code} />
    </main>
  );
}

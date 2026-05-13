import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { ScanForm } from "../scan-form";

export default async function AdminBarcodeDriverPage() {
  const admin = createAdminClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const [outRes, deliveredRes, totalOutRes] = await Promise.all([
    admin.from("forwarders").select("id", { count: "exact", head: true })
      .eq("status", "out_for_delivery"),
    admin.from("forwarders").select("id", { count: "exact", head: true })
      .eq("status", "delivered").gte("date_delivered", todayIso),
    admin.from("forwarders").select("id", { count: "exact", head: true })
      .eq("status", "out_for_delivery"),
  ]);

  const outForDelivery = outRes.count       ?? 0;
  const deliveredToday = deliveredRes.count ?? 0;
  const totalPending   = totalOutRes.count  ?? 0;

  return (
    <main className="p-6 lg:p-8 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · DRIVER</p>
          <h1 className="mt-1 text-2xl font-bold">สแกนปล่อยคนขับ</h1>
          <p className="text-sm text-muted mt-0.5">
            สแกนก่อนส่งของให้ลูกค้า — สแกนซ้ำเมื่อส่งสำเร็จ
          </p>
        </div>
        <Link
          href="/admin/barcode"
          className="flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold hover:bg-surface-alt"
        >
          ← โกดัง
        </Link>
      </div>

      {/* Today stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-white p-4 text-center shadow-sm">
          <p className="text-xs text-muted">รอส่ง</p>
          <p className="mt-1 text-2xl font-bold text-orange-600">{outForDelivery}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 text-center shadow-sm">
          <p className="text-xs text-muted">ส่งแล้ววันนี้</p>
          <p className="mt-1 text-2xl font-bold text-green-700">{deliveredToday}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 text-center shadow-sm">
          <p className="text-xs text-muted">รวมรอส่ง</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{totalPending}</p>
        </div>
      </div>

      {/* Workflow guide */}
      <div className="rounded-xl border border-border bg-surface-alt/30 px-4 py-3 text-xs text-muted space-y-1">
        <p className="font-semibold text-foreground">workflow คนขับ</p>
        <p>🛻 <strong>สแกนครั้งแรก</strong> → ของออกจากโกดัง → สถานะ "กำลังส่ง"</p>
        <p>✅ <strong>สแกนครั้งที่สอง</strong> → ส่งถึงลูกค้าแล้ว → สถานะ "ส่งสำเร็จ" + แจ้งลูกค้า</p>
        <p>รองรับ: f_no · tracking CN/TH · เลขตู้</p>
      </div>

      <ScanForm defaultMode="driver" availableModes={["driver"]} />

      {/* Pending list link */}
      <div className="text-center">
        <Link
          href="/admin/forwarders?status=out_for_delivery"
          className="text-sm text-primary-500 hover:underline"
        >
          ดูรายการรอส่งทั้งหมด ({outForDelivery}) →
        </Link>
      </div>
    </main>
  );
}

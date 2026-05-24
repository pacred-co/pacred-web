import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { ScanForm } from "./scan-form";

/**
 * Wave 16 P0-5 (2026-05-25) — schema-split reconciliation. Originally
 * this page counted from the REBUILT `forwarders` table (English enum
 * `arrived_thailand`/`out_for_delivery`/`delivered`), which after Phase A
 * migration is near-empty on prod (admin entry goes to `tb_forwarder`
 * via Wave 12-C). Cards always showed 0/0/0. Switched to `tb_forwarder`
 * with legacy numeric `fstatus`: 4=ถึงไทย, 5/6=รอชำระ+เตรียมส่ง, 7=ส่งแล้ว.
 */
export default async function AdminBarcodePage() {
  const admin = createAdminClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const [arrivedRes, outRes, deliveredRes] = await Promise.all([
    admin.from("tb_forwarder").select("id", { count: "exact", head: true })
      .eq("fstatus", "4").gte("fdatestatus4", todayIso),
    admin.from("tb_forwarder").select("id", { count: "exact", head: true })
      .in("fstatus", ["5", "6", "6.1"]),
    admin.from("tb_forwarder").select("id", { count: "exact", head: true })
      .eq("fstatus", "7").gte("fdatestatus7", todayIso),
  ]);

  const arrivedToday   = arrivedRes.count   ?? 0;
  const outForDelivery = outRes.count        ?? 0;
  const deliveredToday = deliveredRes.count  ?? 0;

  return (
    <main className="p-6 lg:p-8 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · WAREHOUSE</p>
          <h1 className="mt-1 text-2xl font-bold">สแกนรับเข้าโกดัง</h1>
          <p className="text-sm text-muted mt-0.5">
            สแกนบาร์โค้ดหรือ tracking เพื่ออัพเดทสถานะ
          </p>
        </div>
        <Link
          href="/admin/barcode/driver"
          className="flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold hover:bg-surface-alt"
        >
          🛻 หน้าคนขับ →
        </Link>
      </div>

      {/* Today stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-white p-4 text-center shadow-sm">
          <p className="text-xs text-muted">รับเข้าวันนี้</p>
          <p className="mt-1 text-2xl font-bold text-purple-700">{arrivedToday}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 text-center shadow-sm">
          <p className="text-xs text-muted">รอส่ง</p>
          <p className="mt-1 text-2xl font-bold text-orange-600">{outForDelivery}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 text-center shadow-sm">
          <p className="text-xs text-muted">ส่งแล้ววันนี้</p>
          <p className="mt-1 text-2xl font-bold text-green-700">{deliveredToday}</p>
        </div>
      </div>

      {/* Workflow guide */}
      <div className="rounded-xl border border-border bg-surface-alt/30 px-4 py-3 text-xs text-muted space-y-1">
        <p className="font-semibold text-foreground">workflow</p>
        <p>📦 <strong>รับเข้าโกดัง</strong> → สแกนเมื่อของถึงโกดังไทย → สถานะเปลี่ยนเป็น &quot;ถึงไทย&quot;</p>
        <p>🚚 <strong>เตรียมส่ง</strong> → สแกนเมื่อจัดของขึ้นรถ → สถานะเปลี่ยนเป็น &quot;กำลังส่ง&quot;</p>
        <p>รองรับ: f_no · tracking CN/TH · เลขตู้ · h_no (ฝากสั่ง)</p>
      </div>

      <ScanForm defaultMode="intake" availableModes={["lookup", "intake", "prepare"]} />

      {/* Print queue lookup — legacy `barcode-c-from` redirect target */}
      <div className="text-center text-xs text-muted pt-2">
        ต้องการพิมพ์ใบกำกับจากกล่องที่อยู่ตรงหน้า? เลือกโหมด <strong>ค้นหา</strong> → คลิกผลลัพธ์ →{" "}
        <Link href="/admin/forwarders/combine-bill" className="text-primary-500 hover:underline">
          หน้ารวมบิล
        </Link>
      </div>
    </main>
  );
}

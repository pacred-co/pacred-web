import { listMomoContainers } from "@/actions/admin/momo-containers";
import { MomoContainersClient } from "./momo-containers-client";

export const dynamic = "force-dynamic";

export default async function MomoContainersPage() {
  const res = await listMomoContainers();
  const rows = res.ok && res.data ? res.data : [];
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 space-y-5">
      <header className="space-y-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted">ADMIN · MOMO · ตรวจตู้</div>
        <h1 className="text-2xl font-bold">MOMO ตรวจตู้ — เทียบ API vs packing list</h1>
        <p className="text-sm text-muted leading-relaxed">
          ยึด &quot;ตู้&quot; เป็นหลัก — แต่ละตู้เทียบ <strong>ระบบ (tb_forwarder)</strong> กับ{" "}
          <strong>packing list ที่อัพ</strong> ให้เห็นเลยว่า กล่อง/น้ำหนักตรงไหม + แทร็กที่ MOMO(API) ไม่มีแต่มีใน packing.
          {" "}ลากหัวคอลัมน์เพื่อจัดเรียงได้เหมือน Excel.
        </p>
        {!res.ok && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">โหลดข้อมูลไม่สำเร็จ: {res.error}</div>
        )}
      </header>
      <MomoContainersClient rows={rows} />
    </div>
  );
}

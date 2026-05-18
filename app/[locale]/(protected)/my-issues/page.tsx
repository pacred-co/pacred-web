import { requireAuth } from "@/lib/auth/require-auth";
import { MyIncidentsPanel } from "@/components/observability/my-incidents-panel";

/**
 * IO-1 — /my-issues — the customer's "ปัญหาที่ฉันแจ้ง" page (design
 * doc §6.6).
 *
 * Hosts the MyIncidentsPanel — a signed-in user sees the lifecycle
 * status of incidents THEY hit ("ส่งเรื่องแล้ว / กำลังดำเนินการ /
 * แก้ไขแล้ว"). The owner's "the user sees the status" ask.
 *
 * Reads NavBar/auth → force-dynamic (AGENTS.md §11 pattern rule).
 */
export const dynamic = "force-dynamic";

export default async function MyIssuesPage() {
  const { user } = await requireAuth();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8 space-y-5">
      <header>
        <h1 className="text-xl font-bold sm:text-2xl">ปัญหาที่ฉันแจ้ง</h1>
        <p className="mt-1 text-sm text-muted">
          ระบบ Pacred บันทึกข้อผิดพลาดที่เกิดขึ้นระหว่างใช้งานให้คุณอัตโนมัติ —
          ไม่ต้องกดส่งเอง. หน้านี้แสดงสถานะการแก้ไขของแต่ละปัญหา
        </p>
      </header>

      <MyIncidentsPanel userId={user.id} showEmpty />
    </main>
  );
}

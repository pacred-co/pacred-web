/**
 * /admin/positions — manage ตำแหน่ง (positions · owner ปอน 2026-06-27).
 *
 * A position belongs to a department (lib/admin/departments.ts) + references a
 * workspace_role (the menu template that decides what the staffer sees). Create
 * / edit / activate-deactivate here; the create-admin form picks from this list.
 *
 * Auth: super only (oversight). Reachable from the sidebar (Settings · §0d).
 */
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { listAllPositions } from "@/lib/admin/positions";
import { PositionsManager } from "./positions-manager";

export const dynamic = "force-dynamic";

export default async function AdminPositionsPage() {
  await requireAdmin(["super"]);
  const positions = await listAllPositions();

  return (
    <main className="p-4 lg:p-8 max-w-4xl mx-auto space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/admins" className="hover:text-primary-600">พนักงาน</Link>
        <span>›</span>
        <span className="text-foreground font-medium">ตำแหน่ง</span>
      </nav>

      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · พนักงาน · ตำแหน่ง</p>
        <h1 className="mt-1 text-2xl font-bold">จัดการตำแหน่ง (Positions)</h1>
        <p className="mt-1.5 text-sm text-muted leading-relaxed">
          ตำแหน่งอยู่ใต้ <span className="font-medium text-foreground">แผนก</span> และอ้าง{" "}
          <span className="font-medium text-foreground">workspace</span> (ชุดเมนูที่เห็น).
          สร้าง/เพิ่มได้ — ตอนสร้างพนักงานจะเลือกจากรายการนี้.
        </p>
      </header>

      <PositionsManager positions={positions} />
    </main>
  );
}

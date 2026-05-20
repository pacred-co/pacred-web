import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { LINE_OA } from "@/components/seo/site";

/**
 * /admin/forwarders/container-cost-check — STUB (Phase-C eligible).
 *
 * Legacy equivalent: `pcs-admin/check-sang-cost.php` ("เช็คต้นทุนตู้ Sheet")
 * Reconciles container cost vs a Google Sheet (cost audit). Per
 * `docs/research/sidebar-fidelity-audit/01-broken-links.md` row 3 and
 * `_MASTER-FIX-PLAN.md` A-1, this is a 🅰 STUB recommendation —
 * keeps the sidebar link clickable + faithful while the real Sheets-API
 * integration is deferred to Phase C.
 */
export const dynamic = "force-dynamic";

export default async function ContainerCostCheckStubPage() {
  await requireAdmin(["super", "ops", "accounting"]);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-3xl">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">
          ADMIN · ฝากนำเข้า
        </p>
        <h1 className="mt-1 text-2xl font-bold">เช็คต้นทุนตู้ Sheet</h1>
        <p className="mt-1 text-sm text-muted">
          เครื่องมือกระทบยอดต้นทุนตู้สินค้ากับ Google Sheet (cost audit) — ใช้สำหรับฝ่ายบัญชีตรวจสอบ.
        </p>
      </div>

      <section className="rounded-lg border border-border bg-surface p-6 space-y-3">
        <h2 className="text-base font-semibold">อยู่ระหว่างพัฒนา</h2>
        <p className="text-sm text-muted">
          ฟีเจอร์นี้ยังไม่พร้อมใช้งานในเวอร์ชันปัจจุบัน — รออินทิเกรชั่นกับ Google Sheets API (Phase C).
          ระหว่างนี้ ฝ่ายบัญชียังคงตรวจกระทบยอดด้วยมือผ่าน Sheet ตามขั้นตอนเดิม.
        </p>
        <p className="text-sm text-muted">
          ติดต่อทีมพัฒนา / สอบถามความคืบหน้า — LINE OA:{" "}
          <a
            href={LINE_OA.addFriendUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-500 hover:underline"
          >
            {LINE_OA.premiumId}
          </a>
        </p>
      </section>

      <div>
        <Link href="/admin/forwarders" className="text-xs text-primary-500 hover:underline">
          ← กลับหน้ารายการ
        </Link>
      </div>
    </main>
  );
}

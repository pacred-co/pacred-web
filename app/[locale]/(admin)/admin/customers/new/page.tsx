/**
 * /admin/customers/new — admin-create-customer (staff-CRUD gap · §PM-6 #3.3).
 *
 * A form for staff to create a customer WITHOUT the self-register OTP flow
 * (walk-in / phone signup / sales-onboarded lead). On submit the action
 * (adminCreateCustomer) provisions auth.users + profiles + tb_users (+ wallet
 * seed + sales-rep round-robin), lands the customer ACTIVE, and reveals the
 * (auto-generated or admin-chosen) password once.
 *
 * Reachable from /admin/customers via the "เพิ่มลูกค้า" header button (§0d).
 * Role gate: super / ops / sales_admin (same as the customer list + the
 * adminCreateCustomer action).
 */
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { CreateCustomerForm } from "./create-customer-form";

// requireAdmin reads auth cookies → force-dynamic (AGENTS.md §11).
export const dynamic = "force-dynamic";

const MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/customers" },
  { label: "🆕 รออนุมัติ", href: "/admin/customers/pending" },
  { label: "+ เพิ่มลูกค้า", href: "/admin/customers/new" },
];

export default async function AdminCustomerNewPage() {
  // Creating a customer is a sales/ops act — gate to the same roles the list
  // uses (super implicit). driver/warehouse refused.
  await requireAdmin(["ops", "sales_admin"]);

  return (
    <>
      <PageTopMenubar items={MENUBAR} activeHref="/admin/customers/new" />
      <main className="p-6 lg:p-8 max-w-2xl mx-auto space-y-5">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
            <h1 className="mt-1 text-2xl font-bold">เพิ่มลูกค้าใหม่</h1>
            <p className="mt-1 text-xs text-muted">
              สร้างบัญชีลูกค้าโดยไม่ต้องให้ลูกค้าสมัครเอง / ไม่ต้องยืนยัน OTP — บัญชีจะใช้งานได้ทันที
            </p>
          </div>
          <Link href="/admin/customers" className="text-xs text-primary-600 hover:underline">
            ← รายการลูกค้า
          </Link>
        </div>

        <CreateCustomerForm />
      </main>
    </>
  );
}

/**
 * /admin/accounting/cargo/income/[type]/[service]/[[...slug]] — catch-all stub
 *
 * Wave 23 P0 (Task #157) — the accounting menubar (lib/admin/accounting-menubar.ts
 * CARGO_MENUBAR) defines ~96 leaf URLs under this prefix (quotation × 4 svc × 5
 * status + deposit × ... + invoice + receipt + credit-note + debit-note +
 * billing-note). NONE of those leaves were ever built — they 404'd silently
 * since the menubar was extracted 2026-05-26. Agent K's click-through audit on
 * 2026-05-27 flagged this as ภูม-blocking "ระบบไม่มีคุณภาพ" feedback.
 *
 * Per ภูม decision (Wave 23 P0 #5 in master tech-debt doc): make the menubar
 * HONEST instead of 404. This catch-all renders a Pacred-styled "กำลังพัฒนา"
 * page that shows the requested type + service + status as a breadcrumb so
 * the ภูม clicking + the staff clicking know exactly what was requested AND
 * that it's coming in a future wave.
 *
 * Build vs hide trade-off: choosing build-stub-once over hide-menubar-items
 * because (a) the menubar is the legacy PEAK chrome ภูม explicitly approved
 * (Q3) and (b) staff using the system know what they're looking for · they
 * shouldn't have to "discover by trial" which routes work. The stub message
 * makes the gap explicit.
 *
 * When the real routes ship, they take precedence over this catch-all
 * automatically (Next.js routes specific > [[...slug]] generic).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

// Lookup tables — the labels match the legacy PCS invoice-type taxonomy
// + lib/admin/accounting-menubar.ts SERVICES list. Keep in sync if either
// adds/removes types.

const TYPE_LABEL: Record<string, string> = {
  // Invoice types from the รายรับ dropdown
  "quotation":    "ใบเสนอราคา",
  "deposit":      "ใบรับเงินมัดจำ",
  "invoice":      "ใบแจ้งหนี้ (ใบส่งของ · บันทึกลูกหนี้)",
  "receipt":      "ใบเสร็จรับเงิน",
  "credit-note":  "ใบลดหนี้",
  "debit-note":   "ใบเพิ่มหนี้",
  "billing-note": "ใบวางบิล",
  // Category placeholders from the other 3 dropdowns (รายจ่าย · ผู้ติดต่อ ·
  // การเงิน) + การบัญชี · all stubbed Wave 23 P0 (Task #157) so menubar
  // doesn't have href="#" no-op clicks anymore.
  "expenses": "รายจ่าย",
  "contacts": "ผู้ติดต่อ",
  "finance":  "การเงิน",
  "ledger":   "การบัญชี",
};

const SERVICE_LABEL: Record<string, string> = {
  "shop":           "ฝากสั่งซื้อสินค้า",
  "forwarder-rate": "ฝากนำเข้า แบบเรทราคา",
  "forwarder-item": "ฝากนำเข้า แบบรายการ",
  "payment":        "ฝากโอนหยวน",
  // Used by the 4 category placeholder leaves (expenses · contacts · finance · ledger).
  "coming-soon":    "ทั้งหมวด",
};

const STATUS_LABEL: Record<string, string> = {
  "new":               "(หน้าสร้างใหม่)",
  "pending":           "รอตอบรับ",
  "accepted":          "ยอมรับ",
  "expired":           "พ้นกำหนด",
  "awaiting_payment":  "รอชำระเงิน",
  "paid":              "ชำระแล้ว",
};

type Props = {
  params: Promise<{
    type:    string;
    service: string;
    slug?:   string[];
  }>;
  searchParams: Promise<{ status?: string }>;
};

export default async function AccountingIncomeStub({ params, searchParams }: Props) {
  await requireAdmin();

  const { type, service, slug } = await params;
  const sp = await searchParams;

  const typeLabel    = TYPE_LABEL[type] ?? type;
  const serviceLabel = SERVICE_LABEL[service] ?? service;

  // Two ways the leaf can carry "status": ?status=… (most common) or as a
  // trailing path segment like .../shop/new (the "สร้าง" leaves use this).
  const isNewForm   = (slug?.[0] === "new");
  const statusKey   = isNewForm ? "new" : sp.status;
  const statusLabel = statusKey ? (STATUS_LABEL[statusKey] ?? statusKey) : null;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto p-6 lg:p-10">
        <nav className="text-xs text-gray-500 mb-3">
          <Link href="/admin/accounting" className="hover:text-primary-600">ระบบบัญชี</Link>
          <span className="mx-2">›</span>
          <span>รายรับ</span>
          <span className="mx-2">›</span>
          <span>{typeLabel}</span>
          <span className="mx-2">›</span>
          <span>{serviceLabel}</span>
          {statusLabel && (
            <>
              <span className="mx-2">›</span>
              <span className="text-gray-700">{statusLabel}</span>
            </>
          )}
        </nav>

        <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-8 lg:p-10 text-center">
          <div className="text-5xl mb-4">🚧</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            หน้านี้กำลังพัฒนา
          </h1>
          <p className="text-sm text-gray-600 mb-1">
            <span className="font-medium">{typeLabel}</span>
            {" · "}
            <span>{serviceLabel}</span>
            {statusLabel && (
              <>
                {" · "}
                <span>{statusLabel}</span>
              </>
            )}
          </p>
          <p className="text-xs text-gray-500 mb-6">
            ฟังก์ชันบัญชีรายรับใน menubar เป็นโครงสร้าง PEAK-style ที่ port มาจาก
            <code className="font-mono mx-1 px-1.5 py-0.5 bg-amber-100 rounded text-[11px]">acc-system-cargo.php</code>
            · ทยอยทำตามลำดับ. หน้านี้จะเปิดใช้งานจริงเมื่อ Wave 24+ ลงตัว.
          </p>
          <div className="flex justify-center gap-2 flex-wrap">
            <Link
              href="/admin/accounting"
              className="rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
            >
              กลับหน้าหลักบัญชี
            </Link>
            <Link
              href="/admin/accounting/disbursements"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              ไปใบลด/ใบจ่าย (live)
            </Link>
            <Link
              href="/admin/accounting/closing"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              ปิดงบรายเดือน (live)
            </Link>
          </div>
        </div>

        <p className="mt-4 text-[11px] text-gray-400 text-center">
          path: <code className="font-mono">/admin/accounting/cargo/income/{type}/{service}{slug?.length ? `/${slug.join("/")}` : ""}{sp.status ? `?status=${sp.status}` : ""}</code>
        </p>
      </div>
    </main>
  );
}

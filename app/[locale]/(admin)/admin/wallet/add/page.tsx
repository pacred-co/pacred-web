/**
 * /admin/wallet/add — admin-initiated manual topup (Wave 8 backlog).
 *
 * Wave 7.2 (2026-05-21 night): the original form queried + mutated the
 * rebuilt `profiles` + `wallet_transactions` tables which are empty on
 * prod. Posting the form would INSERT into a table no other surface
 * reads → the credit wouldn't show in /admin/wallet, /admin/wallet/[id],
 * dashboard, or the customer's own /wallet page. Silently breaks the
 * legacy ledger.
 *
 * Replaced with a clear "Wave 8 backlog" banner so accounting doesn't
 * try to use a broken admin-topup form. Wave 8 will rebuild against
 * tb_wallet_hs (the same table the new /admin/wallet list + /[id]
 * detail page read).
 *
 * Until Wave 8: manual topups are entered via legacy PHP admin
 * (`pcs-admin/wallet.php?page=add`).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

export default async function AdminWalletAddPage() {
  await requireAdmin(["accounting"]);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-3xl">
      <div className="text-sm text-muted space-x-2">
        <Link href="/admin" className="hover:underline">
          หน้าแรก
        </Link>
        <span>›</span>
        <Link href="/admin/wallet" className="hover:underline">
          กระเป๋าสตางค์
        </Link>
        <span>›</span>
        <span className="font-semibold">เพิ่มรายการเติมเงินด้วยมือ</span>
      </div>

      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">
          ADMIN · WALLET · เพิ่ม Topup ด้วยมือ
        </p>
        <h1 className="mt-1 text-2xl font-bold">ยังไม่เปิดให้แอดมินเพิ่ม Topup</h1>
      </div>

      <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 space-y-3 text-sm">
        <p className="font-medium text-yellow-900">
          ฟีเจอร์นี้อยู่ใน Wave 8 backlog (admin-initiated topup against tb_wallet_hs).
        </p>
        <p className="text-yellow-800">
          การเพิ่มรายการเติมเงินด้วยมือ ยังไม่ ship เพราะต้องเขียน server action ใหม่ที่
          INSERT ลง{" "}
          <code className="rounded bg-yellow-100 px-1.5 py-0.5">tb_wallet_hs</code>{" "}
          (ไม่ใช่ rebuilt{" "}
          <code className="rounded bg-yellow-100 px-1.5 py-0.5">wallet_transactions</code>{" "}
          ที่หน้าเดิมเขียน) + อัปเดต{" "}
          <code className="rounded bg-yellow-100 px-1.5 py-0.5">tb_wallet.wallettotal</code>{" "}
          ของลูกค้าให้ตรงกัน
        </p>
        <p className="text-yellow-800 font-medium">วิธีทำชั่วคราว:</p>
        <ol className="list-decimal pl-6 text-yellow-800 space-y-1">
          <li>
            ใช้ legacy PHP admin (
            <code className="rounded bg-yellow-100 px-1.5 py-0.5">
              pcs-admin/wallet.php?page=add
            </code>
            ) สำหรับเพิ่ม manual topup ชั่วคราว
          </li>
          <li>
            หรือให้ลูกค้าเติมเงินผ่าน{" "}
            <code className="rounded bg-yellow-100 px-1.5 py-0.5">/wallet</code> ฝั่งลูกค้า
            แล้วแอดมินกด "อนุมัติ" ใน{" "}
            <Link
              href="/admin/wallet?kind=topup&status=1"
              className="font-medium text-yellow-900 underline"
            >
              คิวรอตรวจ
            </Link>
          </li>
        </ol>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Link
          href="/admin/wallet"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← กลับรายการกระเป๋า
        </Link>
        <Link
          href="/admin/wallet?kind=topup&status=1"
          className="rounded-md border border-primary-500 bg-primary-500 px-3 py-2 text-xs text-white hover:bg-primary-600"
        >
          ไปคิวรอตรวจเติม →
        </Link>
      </div>
    </main>
  );
}

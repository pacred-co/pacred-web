"use client";

/**
 * Danger-zone HARD-delete panel on /admin/customers/[id] (staff-CRUD gap ·
 * §PM-6 #3.3). DESTRUCTIVE + super-only — physically removes the customer
 * (auth + profiles + tb_users + empty seed rows). The cleanup tool for
 * test/orphan/phone-collision rows, NOT a customer-management action.
 *
 * Guards (UI side — the server action re-enforces every one):
 *   - Renders ONLY when isSuper (the page passes it; the action gates super too).
 *   - Shows the activity snapshot (orders + wallet balance/history) up front so
 *     the admin sees WHY a non-empty account can't be deleted before trying.
 *   - When the account is non-empty the delete button is hidden entirely + a
 *     reason is shown — the only path to the action is a truly-empty account.
 *   - Double-confirm: a collapsed "เปิดโซนอันตราย" → the admin must TYPE the
 *     PR-code to enable the red delete button.
 *
 * On success → navigate back to the customer list (the row is gone).
 */

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Loader2, Trash2, AlertTriangle, ShieldAlert } from "lucide-react";
import { adminHardDeleteCustomer } from "@/actions/admin/customer-admin";

type Props = {
  userid: string;
  /** Order/shipment counts already loaded by the detail page (the safety gate). */
  forwarderCount: number;
  orderCount: number;
  paymentCount: number;
  /** tb_wallet balance — non-zero blocks deletion. */
  walletBalance: number;
  /** tb_wallet_hs row count — any history blocks deletion. */
  walletHistoryCount: number;
};

export function HardDeletePanel({
  userid,
  forwarderCount,
  orderCount,
  paymentCount,
  walletBalance,
  walletHistoryCount,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // Mirror the server safety gate so the UI never offers a delete that would
  // be refused. "Empty" = no orders/payments AND zero balance AND no history.
  const hasOrders = forwarderCount > 0 || orderCount > 0 || paymentCount > 0;
  const hasMoney = walletBalance !== 0 || walletHistoryCount > 0;
  const deletable = !hasOrders && !hasMoney;
  const confirmMatches = confirmText.trim().toUpperCase() === userid.toUpperCase();

  function handleDelete() {
    setErr(null);
    if (!confirmMatches) {
      setErr("พิมพ์รหัสสมาชิกให้ตรงก่อนยืนยัน");
      return;
    }
    start(async () => {
      const res = await adminHardDeleteCustomer({ user_id: userid, confirm: confirmText.trim() });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      // Row is gone — leave the (now-404) detail page.
      router.push("/admin/customers");
    });
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50/50 dark:bg-red-900/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-red-600" />
        <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">โซนอันตราย — ลบลูกค้าถาวร</h3>
        <span className="text-[11px] text-muted">เฉพาะผู้ดูแลระดับสูง (super)</span>
      </div>

      <p className="text-xs text-red-700/90 dark:text-red-300/80">
        ลบบัญชีนี้ออกจากระบบถาวร (auth + โปรไฟล์ + ข้อมูลลูกค้า) — กู้คืนไม่ได้.
        ใช้สำหรับบัญชีทดสอบ / บัญชีซ้ำ / orphan ที่ไม่มีกิจกรรมเท่านั้น.
      </p>

      {/* Activity snapshot — the gate, shown up front. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="ฝากนำเข้า" value={forwarderCount} bad={forwarderCount > 0} />
        <Stat label="ฝากสั่ง" value={orderCount} bad={orderCount > 0} />
        <Stat label="ฝากโอน" value={paymentCount} bad={paymentCount > 0} />
        <Stat label="ประวัติกระเป๋า" value={walletHistoryCount} bad={walletHistoryCount > 0} />
      </div>
      <div className="text-xs">
        <span className="text-muted">ยอดกระเป๋าเงิน: </span>
        <span className={walletBalance !== 0 ? "font-semibold text-red-700" : "font-mono"}>
          ฿{walletBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
        </span>
      </div>

      {!deletable ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            ลบถาวรไม่ได้ — บัญชีนี้มีกิจกรรม
            {hasOrders ? " (รายการสั่งซื้อ/ชิปเมนต์)" : ""}
            {hasMoney ? " (ยอด/ประวัติกระเป๋าเงิน)" : ""}.
            ใช้ “ระงับบัญชี” แทนหากต้องการปิดการใช้งาน.
          </span>
        </div>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
        >
          <Trash2 className="h-3.5 w-3.5" /> เปิดโซนอันตราย เพื่อลบถาวร
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-red-300 bg-white dark:bg-surface p-3">
          {err && <div className="text-[11px] font-medium text-red-700" role="alert">{err}</div>}
          <label className="block text-xs">
            <span className="text-muted">พิมพ์รหัสสมาชิก <span className="font-mono font-semibold text-foreground">{userid}</span> เพื่อยืนยัน:</span>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={userid}
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-red-300 px-3 py-2 font-mono text-sm focus:border-red-500 focus:outline-none"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending || !confirmMatches}
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              ลบถาวร
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => { setOpen(false); setConfirmText(""); setErr(null); }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-alt"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: number; bad: boolean }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-center ${bad ? "border-red-200 bg-red-50" : "border-border bg-white dark:bg-surface"}`}>
      <div className={`text-sm font-semibold ${bad ? "text-red-700" : "text-foreground"}`}>{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

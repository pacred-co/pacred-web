"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { cancelServiceOrder, payServiceOrderFromWallet } from "@/actions/service-order";

/**
 * Client-side shim that wires the legacy `member/shops.php` jQuery +
 * AJAX interactions into Pacred Server Actions, without disturbing the
 * 1:1 transcribed DOM in `page.tsx`.
 *
 * Legacy AJAX endpoints replaced (D1 / ADR-0017 · faithful-port):
 *   - cancelOrder.php           — per-row "ยกเลิกออเดอร์"        (shops.php L1005)
 *   - getList.php               — `#selectCancel` bulk-cancel    (shops.php L1269-1281, POST branch L440-460 `orderCancelAll`)
 *   - getListPay.php / calPrice — `#select` bulk-pay + b-pay bar (shops.php L1255-1267 + L1059-1081, POST branch L246-438 `paymentOrder`)
 *
 * The wired Server Actions in `actions/service-order.ts`:
 *   - cancelServiceOrder(hNo)             — per-row + each item in bulk-cancel loop
 *   - payServiceOrderFromWallet(hNo)      — each item in bulk-pay loop
 *
 * Bulk shape — matched 1:1 to the legacy `orderCancelAll` / `paymentOrder`
 * branches: the legacy PHP iterates through a comma-separated `hNo` list
 * and runs the single-order mutation once per element; here the loop
 * runs client-side via `Promise.all([...].map(...))`, returning an
 * aggregate ok/err count. SweetAlert flash payloads (sCan / sPay / eWallet)
 * → inline banner UI (per Pacred port pattern; see `pay-from-wallet-button.tsx`).
 */

type Ctx = {
  selected: Set<string>;
  toggle: (hNo: string) => void;
  totals: Map<string, number>;          // hno → price for the b-pay sum
  payableHNos: string[];                // hStatus='2' rows in display order
};

const SelectCtx = createContext<Ctx | null>(null);

function useSelectCtx() {
  const ctx = useContext(SelectCtx);
  if (!ctx) throw new Error("SelectCtx missing — wrap with <BulkActionsProvider>");
  return ctx;
}

/**
 * Provider — wraps the legacy form. Owns the row-selection set + caches
 * per-row totals (cached upfront so the b-pay running total doesn't have
 * to re-derive from server state when the customer toggles a checkbox).
 */
export function BulkActionsProvider({
  payableHNos,
  totals,
  children,
}: {
  payableHNos: string[];
  totals: Map<string, number>;
  children: ReactNode;
}) {
  // Legacy parity (`shops.php` L729-731): the "เลือกทั้งหมด" checkbox
  // renders `defaultChecked` — i.e. every payable order is selected on
  // first paint, so the b-pay bar greets the customer with the full
  // running total. Reproduced via a lazy initializer on `useState`,
  // which is deterministic across SSR + client so hydration matches.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(payableHNos),
  );
  const toggle = useCallback((hNo: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(hNo)) next.delete(hNo); else next.add(hNo);
      return next;
    });
  }, []);
  const value = useMemo<Ctx>(
    () => ({ selected, toggle, totals, payableHNos }),
    [selected, toggle, totals, payableHNos],
  );
  return <SelectCtx.Provider value={value}>{children}</SelectCtx.Provider>;
}

/**
 * Row checkbox — auto-injected by legacy DataTables for selectable rows
 * (`shops.php` L1189+ initialised checkbox column via the `responsive`
 * plugin). Here it's rendered inline next to col 1.
 *
 * Only shown when the row is selectable (legacy: hStatus<=2 for cancel,
 * hStatus='2' also feeds the bulk-pay).
 */
export function RowCheckbox({ hNo, selectable }: { hNo: string; selectable: boolean }) {
  const { selected, toggle } = useSelectCtx();
  if (!selectable) return null;
  return (
    <input
      type="checkbox"
      className="dt-checkboxes"
      checked={selected.has(hNo)}
      onChange={() => toggle(hNo)}
      aria-label={`เลือกออเดอร์ ${hNo}`}
    />
  );
}

/**
 * Per-row cancel button — `shops.php` L1005 `onclick=deleteOrder(hNo)` →
 * AJAX cancelOrder.php. Legacy gate: `hstatus <= 2`. The legacy class +
 * markup is preserved (the surrounding `<a><p class="btn ..."></p></a>`)
 * for CSS parity; the `<a>` is swapped for a `<button>` so it's
 * keyboard-accessible.
 */
export function RowCancelButton({ hNo }: { hNo: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  function onClick() {
    if (pending) return;
    if (!confirm(`ต้องการยกเลิกออเดอร์ ${hNo} นี้?`)) return;
    setErr(null);
    startTransition(async () => {
      const res = await cancelServiceOrder(hNo);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      router.refresh();
    });
  }
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="btn-as-link p-0 border-0 bg-transparent"
        style={{ cursor: pending ? "wait" : "pointer" }}
      >
        <p className="btn font-12 btn-danger btn-rounded btn-sm">
          {pending ? "กำลังยกเลิก..." : "ยกเลิกออเดอร์"}
        </p>
      </button>
      {err && (
        <div className="text-white bg-danger font-12 p-05 mt-05" role="alert">
          {err}
        </div>
      )}
    </>
  );
}

/**
 * Bulk-cancel button — `shops.php` L1269-1281 `#selectCancel` → AJAX
 * getList.php → POST `orderCancelAll` (L440-460): UPDATE hStatus='6'
 * WHERE hStatus<3 AND hNo IN(<selected>). Loops `cancelServiceOrder`
 * once per selected hNo (matches the per-row loop semantic of the legacy
 * branch). The button itself is rendered by `page.tsx`; here we wire
 * its `onClick` via the wrapping client subtree.
 *
 * `cancellableHNos` is the subset of `selected` that legacy would
 * accept (hStatus<=2). Passed in by `page.tsx` to keep the gate logic
 * close to the render.
 */
export function BulkCancelButton({ cancellableHNos }: { cancellableHNos: string[] }) {
  const { selected } = useSelectCtx();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const targets = useMemo(
    () => cancellableHNos.filter((h) => selected.has(h)),
    [cancellableHNos, selected],
  );

  function onClick() {
    if (pending) return;
    if (targets.length === 0) {
      setBanner({ kind: "err", text: "กรุณาเลือกออเดอร์ที่ต้องการยกเลิก" });
      return;
    }
    if (!confirm(`ต้องการยกเลิกออเดอร์ที่เลือกทั้ง ${targets.length} รายการ?`)) return;
    setBanner(null);
    startTransition(async () => {
      const results = await Promise.all(targets.map((h) => cancelServiceOrder(h)));
      const failed = results.filter((r) => !r.ok).length;
      if (failed === 0) {
        setBanner({ kind: "ok", text: `ยกเลิกออเดอร์สำเร็จ ${targets.length} รายการ` });
        router.refresh();
        setTimeout(() => setBanner(null), 4000);
      } else {
        setBanner({
          kind: "err",
          text: `ยกเลิกออเดอร์สำเร็จ ${targets.length - failed} / ${targets.length} (ล้มเหลว ${failed})`,
        });
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-sm btn-danger waves-effect round"
        id="selectCancel"
        onClick={onClick}
        disabled={pending}
      >
        {pending ? "กำลังยกเลิก..." : "ยกเลิกออเดอร์รายการที่เลือก"}
      </button>
      {banner && (
        <div
          className={
            "font-12 p-05 mt-05 " +
            (banner.kind === "ok"
              ? "text-white bg-success"
              : "text-white bg-danger")
          }
          role="status"
        >
          {banner.text}
        </div>
      )}
    </>
  );
}

/**
 * b-pay sticky bar — `shops.php` L1059-1081 — the bottom action bar
 * with the "เลือกทั้งหมด" checkbox · the live `countPay` / `price-all`
 * totals (legacy fed by AJAX calPrice.php L1327-1338) · the `#select`
 * pay button (AJAX getListPay.php L1255-1267 → POST `paymentOrder`
 * L246-438).
 *
 * Wallet-sufficient branch only — matches legacy L281-326 (the "ยอดเงินมาก
 * กว่าหรือพอดี" path). Loops `payServiceOrderFromWallet` once per
 * selected `hStatus='2'` hNo (the action verifies status + idempotency
 * server-side per row, so the loop is safe). The legacy slip-upload
 * top-up branch (L328-430) is out-of-scope here — customers without
 * enough wallet balance see an inline shortfall hint, same as
 * `pay-from-wallet-button.tsx` on the detail page.
 */
export function BulkPayBar({
  walletBalance,
}: {
  walletBalance: number;
}) {
  const { selected, toggle, totals, payableHNos } = useSelectCtx();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const selectedPayable = useMemo(
    () => payableHNos.filter((h) => selected.has(h)),
    [payableHNos, selected],
  );
  const countPay = selectedPayable.length;
  const priceAll = useMemo(
    () => selectedPayable.reduce((s, h) => s + (totals.get(h) ?? 0), 0),
    [selectedPayable, totals],
  );
  const allChecked = countPay > 0 && countPay === payableHNos.length;

  function toggleAll() {
    payableHNos.forEach((h) => {
      const isOn = selected.has(h);
      // If everything is currently on, turn each off; else turn each on.
      if (allChecked) {
        if (isOn) toggle(h);
      } else if (!isOn) {
        toggle(h);
      }
    });
  }

  function onPay() {
    if (pending) return;
    if (countPay === 0) {
      setBanner({ kind: "err", text: "กรุณาเลือกออเดอร์ที่ต้องการชำระเงิน" });
      return;
    }
    if (walletBalance < priceAll) {
      const short = priceAll - walletBalance;
      setBanner({
        kind: "err",
        text:
          `ยอดเงินในกระเป๋าไม่พอ — มี ฿${walletBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ` +
          `ต้องการ ฿${priceAll.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ` +
          `(ขาดอีก ฿${short.toLocaleString("th-TH", { minimumFractionDigits: 2 })}) — กรุณาเติมเงินก่อน`,
      });
      return;
    }
    if (!confirm(`ยืนยันชำระเงิน ${countPay} รายการ รวม ฿${priceAll.toLocaleString("th-TH", { minimumFractionDigits: 2 })} จาก wallet?`)) {
      return;
    }
    setBanner(null);
    startTransition(async () => {
      const results = await Promise.all(
        selectedPayable.map((h) => payServiceOrderFromWallet(h)),
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length === 0) {
        setBanner({ kind: "ok", text: `ชำระเงินสำเร็จ ${results.length} รายการ` });
        router.refresh();
        setTimeout(() => setBanner(null), 4000);
      } else {
        const firstErr = failed[0].ok ? "" : ` — ${failed[0].error}`;
        setBanner({
          kind: "err",
          text: `ชำระสำเร็จ ${results.length - failed.length} / ${results.length} (ล้มเหลว ${failed.length})${firstErr}`,
        });
      }
    });
  }

  // Legacy visibility gate (`page.tsx` already wraps this with
  // `countShops2 > 0 && (q === "" || q === "2")` — see L716). Hide the
  // bar if there's nothing payable in the current view.
  if (payableHNos.length === 0) return null;

  return (
    <div
      className="b-pay"
      style={{ position: "fixed", bottom: "20px", zIndex: 999 }}
    >
      <div className="row">
        <div className="col-md-6 offset-md-3" style={{ marginLeft: "9%" }}>
          <div className="row">
            <div className="col-3 p-05 text-center">
              <input
                type="checkbox"
                className="dt-checkboxes check-all c6"
                checked={allChecked}
                onChange={toggleAll}
                aria-label="เลือกทั้งหมด"
              />
              <br />
              เลือกทั้งหมด
            </div>
            <div className="col-6 p-05">
              จำนวนรายการ :{" "}
              <span className="countPay">
                {String(countPay).padStart(2, "0")}
              </span>
              <br />
              <b>
                ยอดชำระรวม :{" "}
                <span className="text-danger price-all">
                  {priceAll > 0
                    ? priceAll.toLocaleString("th-TH", { minimumFractionDigits: 2 })
                    : "00000"}
                </span>{" "}
                บ.
              </b>
            </div>
            <div className="col-3 p-05 text-right">
              <button
                type="button"
                className="btn btn-color-main waves-effect round animate__animated animate__infinite animate__headShake"
                id="select"
                onClick={onPay}
                disabled={pending}
              >
                {pending ? "กำลังชำระ..." : "ชำระเงิน"}
              </button>
            </div>
          </div>
          {banner && (
            <div
              className={
                "font-12 p-05 mt-05 " +
                (banner.kind === "ok"
                  ? "text-white bg-success"
                  : "text-white bg-danger")
              }
              role="status"
            >
              {banner.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

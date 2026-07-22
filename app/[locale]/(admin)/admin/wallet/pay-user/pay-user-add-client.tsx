"use client";

/**
 * ทำรายการแทนลูกค้า (pay-on-behalf · ADD flow) — faithful port of legacy
 * `pcs-admin/pay-users.php?action=add` + the payment modals rendered by
 * `getListPayForwarder.php` (ฝากนำเข้า · keyType=2) / `getListPay.php` (ฝากสั่ง).
 *
 * FLOW: pick a service (2=รายการนำเข้า default · 1=รายการฝากสั่งซื้อ) → type a
 * PR customer code → the customer's wallet card + a rich unpaid-items table
 * render (§0g self-explaining rows · §0h ≥text-[11px] · gridlines · zebra) →
 * tick rows → a floating "ชำระเงินแทนลูกค้า" bar opens the PAY MODAL (per-order
 * breakdown + PromptPay QR + bank card + slip upload + ยืนยัน).
 *
 * MONEY: this component ONLY calls the existing, tested actions — it NEVER
 * writes the DB directly and NEVER computes an authoritative amount. The server
 * recomputes the price on the exact selected subset (corporate 1% + PCSF ฿50
 * depend on the selection), so the modal total is an INDICATIVE preview.
 *
 * ROUTING (identical to the old pay-user-client's money decisions):
 *   • FORWARDER (keyType=2) — legacy wallet is OFF for ฝากนำเข้า on this path →
 *     slip-based DIRECT-CUT: require a slip → adminPayForwardersWithTopUp.
 *   • SHOP (keyType=1) — wallet is LIVE: if balance ≥ total → adminPayOrdersOnBehalf
 *     (pure wallet debit · no slip); else require slip + top-up amount →
 *     adminPayOrdersWithTopUp.
 */

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ArrowUpDown, ArrowUp, ArrowDown, Banknote, Printer, Phone, Mail, Globe } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { StyledFileInput } from "@/components/ui/styled-file-input";
import { PacredDialog, useConfirmDialogs } from "@/components/ui/pacred-dialog";
import { fstatusBadge } from "@/lib/admin/forwarder-status";
import { baseTracking } from "@/lib/admin/momo-bill-header";
import { formatThaiDate, formatThaiDateTime, formatThaiTimeWithSeconds } from "@/lib/utils/thai-datetime";
import { formatEtaWindowThai } from "@/lib/admin/forwarder-eta";
import { NO_COVER_IMAGE } from "@/lib/legacy-image";
import { diffDateTimeNow } from "@/lib/utils/elapsed-thai";
import { BANK, SITE_LEGAL_NAME_TH, TAX_ID, CONTACT, ADDRESSES, SITE_URL } from "@/components/seo/site";
import { readThaiBaht } from "@/lib/utils/thai-number";
import { getDepositQr } from "@/actions/wallet";
import {
  getPayUserForwarderView,
  getPayUserShopView,
  type PayUserPanel,
  type PayUserFwdRow,
  type PayUserShopRow,
} from "@/actions/admin/pay-user-view";
import {
  adminPayForwardersWithTopUp,
  adminPayOrdersOnBehalf,
  adminPayOrdersWithTopUp,
  type PayForwardersWithTopUpResult,
  type PayOnBehalfResult,
  type PayWithTopUpResult,
} from "@/actions/admin/pay-user";
import { adminSearchCustomers, type CustomerPickerRow } from "@/actions/admin/search-customers";
import { WalletBalanceCard } from "@/components/admin/wallet-balance-card";

// ── formatting ───────────────────────────────────────────────
function thb(n: number): string {
  return `฿${(Number.isFinite(n) ? n : 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** ขนาดกล่อง กว้าง×ยาว×สูง (ซม.) — "—" when no dimension is set (owner ปอน 2026-07-22). */
function dimsLabel(w: number, l: number, h: number): string {
  return w > 0 || l > 0 || h > 0 ? `${w}×${l}×${h}` : "—";
}

type KeyType = "1" | "2"; // 1 = ฝากสั่งซื้อ · 2 = ฝากนำเข้า (default)

type PayResultBanner =
  | { kind: "shop-wallet"; data: PayOnBehalfResult }
  | { kind: "shop-topup"; data: PayWithTopUpResult }
  | { kind: "fwd-topup"; data: PayForwardersWithTopUpResult };

export function PayUserAddClient() {
  const { confirm, dialogs } = useConfirmDialogs();

  // ── controls ──
  const [keyType, setKeyType] = useState<KeyType>("2");
  const [code, setCode] = useState("");
  const [searching, startSearch] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<PayResultBanner | null>(null);

  // ── customer autocomplete (owner 2026-07-16 · "พิมพ์แล้วขึ้น 7 รายการแนะนำ เหมือน Google") ──
  const [suggests, setSuggests] = useState<CustomerPickerRow[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const suggestBoxRef = useRef<HTMLDivElement>(null);

  // debounced lookup — พิมพ์ ≥2 ตัว → ค้นรหัส/ชื่อ/เบอร์ → แนะนำสูงสุด 7 (setState ใน timeout)
  useEffect(() => {
    let alive = true;
    const active = showSuggest && code.trim().length >= 2;
    const t = window.setTimeout(async () => {
      if (!alive) return;
      if (!active) { setSuggests([]); return; }
      const res = await adminSearchCustomers({ q: code.trim(), limit: 7 });
      if (!alive) return;
      setSuggests(res.ok && res.data ? res.data.rows : []);
    }, active ? 120 : 0);
    return () => { alive = false; window.clearTimeout(t); };
  }, [code, showSuggest]);

  // ปิด dropdown เมื่อคลิกนอกช่อง
  useEffect(() => {
    if (!showSuggest) return;
    const onDown = (e: MouseEvent) => {
      if (suggestBoxRef.current && !suggestBoxRef.current.contains(e.target as Node)) setShowSuggest(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showSuggest]);

  // ── loaded data ──
  const [panel, setPanel] = useState<PayUserPanel | null>(null);
  const [fwdRows, setFwdRows] = useState<PayUserFwdRow[]>([]);
  const [shopRows, setShopRows] = useState<PayUserShopRow[]>([]);
  // §0g — when the payable list is empty, the customer's order-count by fstatus
  // (so the page EXPLAINS why nothing is payable · owner 2026-07-16 PR139).
  const [pendingByStatus, setPendingByStatus] = useState<Array<{ fstatus: string; n: number }>>([]);

  // ── selection ──
  const [selFwds, setSelFwds] = useState<Set<string>>(new Set());
  const [selShops, setSelShops] = useState<Set<string>>(new Set());

  // Mount guard for the createPortal'd floating pay button (SSR has no document.body).
  // Same accepted pattern as report-cnt's cnt-list-table.tsx portalled bar.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // ── pay modal ──
  const [modalOpen, setModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [qrPending, setQrPending] = useState(false);
  const [slip, setSlip] = useState<File | null>(null);
  const [topUpAmount, setTopUpAmount] = useState<string>("");
  const [paying, startPay] = useTransition();

  function resetLoaded() {
    setPanel(null);
    setFwdRows([]);
    setShopRows([]);
    setPendingByStatus([]);
    setSelFwds(new Set());
    setSelShops(new Set());
    closeModal();
  }

  // ── search / (re)load the view for the current service ──
  function search(explicitCode?: string) {
    setErr(null);
    setResult(null);
    resetLoaded();
    setShowSuggest(false);
    const c = (explicitCode ?? code).trim().toUpperCase();
    if (!c) {
      setErr("กรุณากรอกรหัสลูกค้า (เช่น PR124)");
      return;
    }
    startSearch(async () => {
      if (keyType === "2") {
        const res = await getPayUserForwarderView(c);
        if (res.ok && res.data) {
          setPanel(res.data.panel);
          setFwdRows(res.data.rows);
          setPendingByStatus(res.data.pendingByStatus ?? []);
          setSelFwds(new Set()); // forwarder rows do NOT auto-select
        } else {
          setErr(res.ok ? "ไม่พบข้อมูล" : res.error);
        }
      } else {
        const res = await getPayUserShopView(c);
        if (res.ok && res.data) {
          setPanel(res.data.panel);
          setShopRows(res.data.rows);
          // shop rows AUTO-select on load (matching legacy).
          setSelShops(new Set(res.data.rows.map((r) => r.hno)));
        } else {
          setErr(res.ok ? "ไม่พบข้อมูล" : res.error);
        }
      }
    });
  }

  // re-fetch after a successful pay so the balance + remaining list stay correct.
  async function reload() {
    if (!panel) return;
    const c = panel.user.userid;
    if (keyType === "2") {
      const res = await getPayUserForwarderView(c);
      if (res.ok && res.data) {
        setPanel(res.data.panel);
        setFwdRows(res.data.rows);
        setSelFwds(new Set());
      }
    } else {
      const res = await getPayUserShopView(c);
      if (res.ok && res.data) {
        setPanel(res.data.panel);
        setShopRows(res.data.rows);
        setSelShops(new Set(res.data.rows.map((r) => r.hno)));
      }
    }
  }

  // switching the service dropdown clears the loaded set (services differ).
  function changeKeyType(next: KeyType) {
    setKeyType(next);
    setErr(null);
    setResult(null);
    resetLoaded();
  }

  // ── selection helpers ──
  // SHIPMENT-ATOMIC toggle (owner 2026-07-22 "จ่ายแทนลูกค้า ต่อบิล = ทั้งชิปเม้น"):
  // a MOMO box-split shipment is N tb_forwarder rows sharing one base tracking —
  // ticking ONE box of it must bring the whole shipment (and unticking drops the
  // whole shipment), so staff can't accidentally collect a partial shipment.
  // fwdRows already contains only payable rows (fstatus='5' OR fcredit='1').
  function toggleFwd(fid: string) {
    setSelFwds((prev) => {
      const next = new Set(prev);
      const row = fwdRows.find((r) => r.fid === fid);
      const base = row ? baseTracking(row.ftrackingchn) : null;
      const groupFids = base
        ? fwdRows.filter((r) => baseTracking(r.ftrackingchn) === base).map((r) => r.fid)
        : [fid];
      const adding = !next.has(fid);
      for (const f of groupFids) {
        if (adding) next.add(f);
        else next.delete(f);
      }
      return next;
    });
  }
  function toggleShop(hno: string) {
    setSelShops((prev) => {
      const next = new Set(prev);
      if (next.has(hno)) next.delete(hno);
      else next.add(hno);
      return next;
    });
  }

  const selectedFwdRows = fwdRows.filter((r) => selFwds.has(r.fid));
  const selectedShopRows = shopRows.filter((r) => selShops.has(r.hno));
  const selectedCount = keyType === "2" ? selectedFwdRows.length : selectedShopRows.length;
  const selectedTotal =
    keyType === "2"
      ? selectedFwdRows.reduce((s, r) => s + r.price_thb, 0)
      : selectedShopRows.reduce((s, r) => s + r.price_thb, 0);

  const walletBalance = panel?.wallet_balance ?? 0;
  // SHOP wallet routing — enough balance ⇒ pure wallet debit (no slip/QR).
  const shopWalletCovers = keyType === "1" && walletBalance + 0.01 >= selectedTotal;
  // FORWARDER: legacy wallet is off for ฝากนำเข้า on this path → always slip.
  const needsSlip = keyType === "2" || !shopWalletCovers;

  // ── pay modal open/close + QR generation ──
  function openModal() {
    if (!panel || selectedCount === 0) {
      setErr("กรุณาเลือกรายการอย่างน้อย 1 รายการ");
      return;
    }
    setErr(null);
    setResult(null);
    setSlip(null);
    setTopUpAmount("");
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setQrDataUrl("");
    setSlip(null);
    setTopUpAmount("");
  }

  // generate the QR when the modal opens + when the total changes (async → effect).
  // The QR is cleared in openModal/closeModal, so the effect only needs to FETCH
  // when the modal is open + a slip lane is active. All setState calls live inside
  // the async callback (never synchronously in the effect body) to satisfy the
  // react-hooks/set-state-in-effect rule.
  useEffect(() => {
    if (!modalOpen || !needsSlip || selectedTotal <= 0) return;
    let cancelled = false;
    (async () => {
      setQrPending(true);
      try {
        // lib/promptpay.ts is server-only → generate the QR via the wallet
        // server action (same helper the customer deposit flow uses).
        const res = await getDepositQr(selectedTotal);
        if (!cancelled) setQrDataUrl(res.ok ? res.data?.dataUrl ?? "" : "");
      } finally {
        if (!cancelled) setQrPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, needsSlip, selectedTotal]);

  // the summary PDF (forwarder only) — legacy opens a printable ใบสรุป in a new tab.
  function openSummaryPdf() {
    const fids = selectedFwdRows.map((r) => r.fid).join(",");
    if (!fids) return;
    const url = `/admin/wallet/pay-user/summary?fID=${encodeURIComponent(fids)}&rDate=${encodeURIComponent(new Date().toISOString())}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // ── confirm-before-mutate (§0f) → route to the right action ──
  async function submitPayment() {
    if (!panel || selectedCount === 0) return;
    const ok = await confirm(
      `ยืนยันการชำระเงินแทนลูกค้า ${panel.user.userid}?\nรวม ${selectedCount} รายการ · ${thb(selectedTotal)}`,
    );
    if (!ok) return;

    setErr(null);

    if (keyType === "2") {
      // FORWARDER — slip DIRECT-CUT (wallet off for ฝากนำเข้า on this path).
      if (!slip) {
        setErr("กรุณาแนบสลิปการโอนเงิน");
        return;
      }
      const fIds = selectedFwdRows.map((r) => r.fid);
      startPay(async () => {
        const res = await adminPayForwardersWithTopUp({ userId: panel.user.userid, fIds }, slip);
        if (res.ok && res.data) {
          setResult({ kind: "fwd-topup", data: res.data });
          closeModal();
          await reload();
        } else {
          setErr(res.ok ? "ไม่สามารถทำรายการได้" : res.error);
        }
      });
      return;
    }

    // SHOP — wallet debit or slip top-up.
    const hNos = selectedShopRows.map((r) => r.hno);
    if (shopWalletCovers) {
      startPay(async () => {
        const res = await adminPayOrdersOnBehalf({ userId: panel.user.userid, hNos });
        if (res.ok && res.data) {
          setResult({ kind: "shop-wallet", data: res.data });
          closeModal();
          await reload();
        } else {
          setErr(res.ok ? "ไม่สามารถทำรายการได้" : res.error);
        }
      });
      return;
    }

    // shop, insufficient wallet → slip + top-up.
    if (!slip) {
      setErr("กรุณาแนบสลิปการโอนเงิน");
      return;
    }
    const amt = Number(topUpAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr("กรุณากรอกยอดเงินที่โอน (มากกว่า 0)");
      return;
    }
    if (amt + walletBalance + 0.01 < selectedTotal) {
      setErr(`ยอดโอน + ยอดในกระเป๋าไม่พอ — รวม ${thb(amt + walletBalance)} ต้องชำระ ${thb(selectedTotal)}`);
      return;
    }
    startPay(async () => {
      const res = await adminPayOrdersWithTopUp({ userId: panel.user.userid, hNos, topUpAmount: amt }, slip);
      if (res.ok && res.data) {
        setResult({ kind: "shop-topup", data: res.data });
        closeModal();
        await reload();
      } else {
        setErr(res.ok ? "ไม่สามารถทำรายการได้" : res.error);
      }
    });
  }

  const hasRows = keyType === "2" ? fwdRows.length > 0 : shopRows.length > 0;

  return (
    <div className="space-y-5 pb-28">
      {/* กรอบขาวหุ้มทั้ง 3 ส่วน (ควบคุม + การ์ดกระเป๋า + รายการ) ให้เป็นกรอบเดียว บนพื้นเทา (owner 2026-07-16) */}
      <section className="space-y-5 rounded-2xl border border-border bg-white p-4 shadow-sm lg:p-6 dark:bg-surface">
      {/* ── A. controls row ── */}
      <div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-52">
            <label className="mb-1 block text-[13px] font-medium text-gray-700">ประเภทบริการ</label>
            <select
              value={keyType}
              onChange={(e) => changeKeyType(e.target.value as KeyType)}
              disabled={searching}
              className="w-full rounded-full border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:opacity-50"
            >
              <option value="2">รายการนำเข้า (ฝากนำเข้า)</option>
              <option value="1">รายการฝากสั่งซื้อ</option>
            </select>
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-[13px] font-medium text-gray-700">รหัสลูกค้า</label>
            <div className="flex gap-2">
              <div ref={suggestBoxRef} className="relative flex-1">
                <input
                  value={code}
                  onChange={(e) => { setCode(e.target.value.toUpperCase()); setShowSuggest(true); }}
                  onFocus={() => { if (code.trim().length >= 2) setShowSuggest(true); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") search();
                    else if (e.key === "Escape") setShowSuggest(false);
                  }}
                  placeholder="พิมพ์รหัส / ชื่อ / เบอร์ลูกค้า เช่น PR124"
                  disabled={searching}
                  autoComplete="off"
                  className="w-full rounded-full border border-gray-300 px-4 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:opacity-50"
                />
                {/* autocomplete — 7 รายการแนะนำ (owner 2026-07-16 · แบบ Google) */}
                {showSuggest && suggests.length > 0 && (
                  <div className="absolute z-40 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {suggests.map((s) => {
                      const nm = s.company_name || `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || "—";
                      return (
                        <button
                          key={s.ID}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setCode(s.ID); setShowSuggest(false); search(s.ID); }}
                          className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-primary-50"
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-mono font-semibold text-primary-700">{s.ID}</span>
                            <span className="text-gray-800"> · {nm}</span>
                          </span>
                          {s.phone && <span className="shrink-0 text-[12px] text-gray-400">{s.phone}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
          <Link
            href="/admin/wallet/pay-user"
            className="ml-auto rounded-full bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:from-violet-700 hover:to-blue-700"
          >
            ประวัติการทำรายการ
          </Link>
        </div>
      </div>

      {/* error / result banners */}
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}
      {result && <ResultBanner result={result} />}

      {/* ── B. wallet card (owner 2026-07-16 · การ์ดแบบเดียวกับหน้า wallet detail) ── */}
      {panel && (
        <div className="space-y-3">
          {/* การ์ดกึ่งกลาง ยาวพอดี ไม่เต็มความกว้าง (owner 2026-07-16) */}
          <div className="mx-auto max-w-2xl">
            <WalletBalanceCard
              title={panel.user.name}
              subtitle={`${panel.user.userid}${panel.user.tel ? ` · ${panel.user.tel}` : ""}${panel.is_corporate ? " · นิติบุคคล" : ""}`}
              amount={walletBalance}
              cashback={panel.cashback}
              titleTone="danger"
              compact
            />
          </div>
          {panel.is_juristic && keyType === "2" && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[13px] text-amber-800">
              <span className="font-semibold">ลูกค้านิติบุคคล:</span> ชำระในหน้านี้ได้ตามปกติ —
              ใช้ <span className="font-semibold">สลิปการโอน</span> (แนบในขั้นตอนชำระเงิน · ระบบไม่ตัดจากกระเป๋า)
              · หัก ณ ที่จ่าย 1% อัตโนมัติ (ทุกยอด) · ชำระแล้วระบบออกใบเสร็จให้เอง
            </div>
          )}
        </div>
      )}

      {/* ── C. item table ── */}
      {panel && !hasRows && (
        <div className="text-sm text-gray-600">
          <p className="text-center font-medium text-gray-700">
            {keyType === "2"
              ? "ไม่มีรายการฝากนำเข้าที่รอชำระเงิน (สถานะ 5) ของลูกค้ารายนี้"
              : "ไม่มีรายการฝากสั่งที่รอชำระเงินของลูกค้ารายนี้"}
          </p>
          {/* §0g — explain WHY nothing is payable (owner 2026-07-16 PR139): the orders
              exist but sit BEFORE รอชำระ → show the per-status breakdown + what to do. */}
          {keyType === "2" && pendingByStatus.length > 0 && (
            <div className="mx-auto mt-4 max-w-2xl rounded-lg border border-sky-200 bg-sky-50 p-3 text-[13px] text-sky-900">
              <p className="font-semibold">ลูกค้ามีงานนำเข้าอยู่ในระบบ แต่ยังไม่ถึงขั้นชำระเงิน:</p>
              <ul className="mt-1.5 space-y-0.5">
                {pendingByStatus.map((s) => {
                  const st = fstatusBadge(s.fstatus);
                  return (
                    <li key={s.fstatus}>
                      • <span className="font-medium">{s.n} รายการ</span> — สถานะ {s.fstatus} {st.label}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-[12px] text-sky-700">
                รายการจะชำระได้เมื่อ <span className="font-semibold">ถึงไทย + ตั้งราคาแล้ว (สถานะ 5 รอชำระเงิน)</span> —
                ถ้าของถึงแล้วแต่สถานะยังไม่ขยับ ให้โกดังยิงรับเข้าไทย / CS ตั้งราคาก่อน
              </p>
            </div>
          )}
        </div>
      )}

      {panel && hasRows && keyType === "2" && (
        <ForwarderTable
          rows={fwdRows}
          panel={panel}
          selected={selFwds}
          onToggle={toggleFwd}
          onSelectAll={() => setSelFwds(new Set(fwdRows.map((r) => r.fid)))}
          onClearAll={() => setSelFwds(new Set())}
        />
      )}

      {panel && hasRows && keyType === "1" && (
        <ShopTable
          rows={shopRows}
          selected={selShops}
          onToggle={toggleShop}
          onSelectAll={() => setSelShops(new Set(shopRows.map((r) => r.hno)))}
          onClearAll={() => setSelShops(new Set())}
        />
      )}
      </section>

      {/* ── D. floating pay button ──
          Portalled to <body>: a `fixed` child of a transformed/filtered ancestor
          resolves against THAT ancestor, not the viewport, and would scroll away.
          Bottom-LEFT. `left` comes from .admin-floating-action (globals.css), NOT a
          fixed Tailwind offset: the sidebar is 16rem pinned-open / 4rem as a rail, so
          report-cnt's hardcoded `lg:left-20` is covered whenever it is pinned open —
          the class tracks all three states (owner 2026-07-16 "sidebar อาจจะบังปุ่ม").
          Safe-area inline (not the legacy .pcs-safe-area-bottom class — that lives in
          admin-base.css, which this modern page does not load, so it is a no-op). */}
      {/* Sticky from the moment a customer is loaded — NOT gated on a selection
          (owner 2026-07-16 "แค่เข้ามาก็ติดอยู่บนจอ"). Disabled + dimmed until ≥1 row
          is ticked so it can't fire on an empty selection; the count badge shows
          how many are staged. `position:fixed` already pins it while scrolling. */}
      {panel && mounted && createPortal(
        <div className="admin-floating-action fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-[60] max-w-[calc(100vw-2rem)]">
          <button
            type="button"
            onClick={openModal}
            disabled={selectedCount === 0}
            className={
              selectedCount === 0
                ? "inline-flex cursor-not-allowed items-center gap-2 rounded-full bg-gray-400 px-5 py-2.5 text-sm font-semibold text-white shadow-lg opacity-70"
                : "inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-600 to-red-700 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:from-orange-700 hover:to-red-800"
            }
            title={selectedCount === 0 ? "เลือกรายการที่จะชำระก่อน (ติ๊กช่องหน้าแถว)" : undefined}
          >
            <Banknote className="h-4 w-4" aria-hidden />
            ชำระเงินแทนลูกค้า
            <span
              className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-bold ${selectedCount === 0 ? "text-gray-500" : "text-red-600"}`}
            >
              {selectedCount}
            </span>
          </button>
        </div>,
        document.body,
      )}

      {/* ── PAY MODAL ── */}
      {panel && (
        <PayModal
          open={modalOpen}
          onClose={closeModal}
          keyType={keyType}
          panel={panel}
          fwdRows={selectedFwdRows}
          shopRows={selectedShopRows}
          total={selectedTotal}
          qrDataUrl={qrDataUrl}
          qrPending={qrPending}
          needsSlip={needsSlip}
          shopWalletCovers={shopWalletCovers}
          walletBalance={walletBalance}
          slip={slip}
          onSlip={setSlip}
          topUpAmount={topUpAmount}
          onTopUpAmount={setTopUpAmount}
          paying={paying}
          onSubmit={submitPayment}
          onOpenSummary={openSummaryPdf}
        />
      )}

      {dialogs}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Result banner
// ════════════════════════════════════════════════════════════
function ResultBanner({ result }: { result: PayResultBanner }) {
  if (result.kind === "shop-wallet") {
    const d = result.data;
    return (
      <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm">
        <p className="font-semibold text-green-900">
          ✅ ชำระฝากสั่งสำเร็จ {d.paid.length} รายการ · ตัดเงินรวม {thb(d.total_debited)}
        </p>
        {d.paid.length > 0 && <p className="mt-1 text-green-800">ออเดอร์: {d.paid.join(", ")}</p>}
        {d.skipped.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-amber-800">
            {d.skipped.map((s) => (
              <li key={s.hno}>
                {s.hno}: {s.reason}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  if (result.kind === "shop-topup") {
    const d = result.data;
    return (
      <div className="rounded-lg border border-blue-300 bg-blue-50 p-4 text-sm">
        <p className="font-semibold text-blue-900">
          🧾 บันทึกเติม-แล้วจ่ายฝากสั่ง {d.paid.length} รายการ · เติม {thb(d.topup_amount)} (รออนุมัติสลิป)
        </p>
        <p className="mt-1 text-blue-800">
          รายการชำระเงิน #{d.topupWalletHsId} — ต้องให้ฝ่ายบัญชีอนุมัติสลิปก่อนจึงจะตัดเงินจริง
          {d.wallet_consumed > 0 && ` · ใช้ยอดในกระเป๋าเดิม ${thb(d.wallet_consumed)}`}
        </p>
        {d.paid.length > 0 && <p className="mt-1 text-blue-800">ออเดอร์: {d.paid.join(", ")}</p>}
        {d.skipped.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-amber-800">
            {d.skipped.map((s) => (
              <li key={s.hno}>
                {s.hno}: {s.reason}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  // fwd-topup
  const d = result.data;
  return (
    <div className="rounded-lg border border-blue-300 bg-blue-50 p-4 text-sm">
      <p className="font-semibold text-blue-900">
        🧾 บันทึกชำระฝากนำเข้าด้วยสลิป {d.paid.length} รายการ · ยอด {thb(d.topup_amount)} (รออนุมัติสลิป)
      </p>
      <p className="mt-1 text-blue-800">
        รายการชำระเงิน #{d.topupWalletHsId} — ต้องให้ฝ่ายบัญชีอนุมัติสลิปก่อนจึงจะตัดเงินจริง
      </p>
      {d.paid.length > 0 && <p className="mt-1 text-blue-800">รายการ: {d.paid.join(", ")}</p>}
      {d.skipped.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-amber-800">
          {d.skipped.map((s) => (
            <li key={s.fid}>
              #{s.fid}: {s.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Small shared cell atoms
// ════════════════════════════════════════════════════════════
/**
 * A timestamp cell: วันที่ on line 1, เวลา (to the second) on line 2.
 *
 * ONE component for every timestamp column (วันที่สร้าง · เข้าโกดัง · ออกโกดัง ·
 * ถึงไทย) so they cannot drift apart — the warehouse columns previously rendered
 * the raw DB value ("2026-07-11T04:35:26.888") while วันที่สร้าง was formatted.
 * Empty → a single em-dash, not two blank lines.
 */
function DateTimeCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-gray-400">—</span>;
  return (
    <>
      <div>{formatThaiDate(value)}</div>
      <div className="text-[11px] text-gray-500">{formatThaiTimeWithSeconds(value)}</div>
    </>
  );
}

// Degrades to the neutral NO_COVER_IMAGE rather than rendering nothing, so the
// column keeps a stable shape and "ไม่มีรูป" is stated instead of looking like a
// broken cell. Note a missing cover here is usually an ENVIRONMENT artifact, not
// missing data: the prod→dev DB sync copies tb_forwarder.fcover (the path) but not
// the storage objects, so on dev the signed-URL lookup 404s → null → placeholder.
function Thumb({ url, alt }: { url: string | null; alt: string }) {
  const [broken, setBroken] = useState(false);
  const src = !url || broken ? NO_COVER_IMAGE : url;
  return (
    <Image
      src={src}
      alt={alt}
      width={52}
      height={52}
      unoptimized
      onError={() => setBroken(true)}
      className="h-[52px] w-[52px] shrink-0 rounded-md border border-gray-200 object-cover"
    />
  );
}

// Selected-row highlight (owner 2026-07-17) — everything lives in the
// `.pcs-row-selected` rule (globals.css): ONE continuous rich-green gradient swept
// across the WHOLE row (explicit hex so the exact shade is controllable, no Tailwind
// class-regeneration), every descendant forced white (text · links · lucide icons via
// currentColor), the status-icon PNG flooded white, and softened inner cell borders
// so it reads as one unbroken sweep. Used by BOTH tables so they match.
const SELECTED_ROW_CLS = "pcs-row-selected";

// ════════════════════════════════════════════════════════════
// FORWARDER (ฝากนำเข้า) table — keyType=2 · faithful legacy pay-users
// ════════════════════════════════════════════════════════════
const FWD_COLS: {
  key: string;
  label: string;
  get?: (r: PayUserFwdRow) => string | number;
}[] = [
  { key: "date", label: "วันที่สร้าง", get: (r) => r.fdate ?? "" },
  { key: "code", label: "รหัสลูกค้า", get: (r) => Number(r.fid) },
  { key: "detail", label: "รายละเอียด", get: (r) => Number(r.fid) },
  { key: "amount", label: "ยอดค้างชำระ", get: (r) => r.price_thb },
  { key: "chn", label: "เลขพัสดุ (จีน)", get: (r) => r.ftrackingchn ?? "" },
  { key: "th", label: "เลขพัสดุ (ไทย)", get: (r) => r.ftrackingth ?? "" },
  { key: "in", label: "เข้าโกดัง", get: (r) => r.fdatestatus2 ?? "" },
  { key: "out", label: "ออกโกดัง", get: (r) => r.fdatestatus3 ?? "" },
  { key: "arrived", label: "ถึงไทย", get: (r) => r.fdatestatus4 ?? "" },
  { key: "status", label: "สถานะ", get: (r) => r.fstatus ?? "" },
  { key: "update", label: "อัปเดต", get: (r) => r.adminid_update ?? "" },
  { key: "options", label: "ตัวเลือก" },
];

function ForwarderTable({
  rows,
  panel,
  selected,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  rows: PayUserFwdRow[];
  panel: PayUserPanel;
  selected: Set<string>;
  onToggle: (fid: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  const [showN, setShowN] = useState(200);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  const sorted = useMemo(() => {
    const col = sort ? FWD_COLS.find((c) => c.key === sort.key) : null;
    if (!sort || !col?.get) return rows;
    const getter = col.get;
    const dir = sort.dir;
    return [...rows].sort((a, b) => {
      const av = getter(a);
      const bv = getter(b);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), "th", { numeric: true });
      return dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort]);
  const shown = sorted.slice(0, showN);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.fid));
  function onSort(key: string) {
    setSort((prev) =>
      !prev || prev.key !== key
        ? { key, dir: "asc" }
        : prev.dir === "asc"
          ? { key, dir: "desc" }
          : null,
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-2.5">
        {/* แสดง N รายการ (หัวมุมซ้าย · ตาม legacy) — owner 2026-07-16 */}
        <label className="flex items-center gap-1.5 text-[12px] text-gray-600">
          แสดง
          <select
            value={showN}
            onChange={(e) => setShowN(Number(e.target.value))}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[12px] focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          >
            {[10, 25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          รายการ
        </label>
      </div>
      <div className="overflow-x-auto scrollbar-x-visible">
        <table className="w-full min-w-[1320px] border-collapse text-[12px] [&_td]:border [&_td]:border-gray-200 [&_th]:border [&_th]:border-gray-200">
          <thead>
            <tr className="bg-gray-100 text-left text-[13px] font-semibold text-gray-700">
              <th className="px-2 py-2 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => (allSelected ? onClearAll() : onSelectAll())}
                  className="pcs-check h-4 w-4 accent-orange-500"
                  title="เลือกทั้งหมด"
                />
              </th>
              {FWD_COLS.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} className="px-2 py-2">
                    {c.get ? (
                      <button
                        type="button"
                        onClick={() => onSort(c.key)}
                        title="กดเพื่อเรียงลำดับ"
                        className={`inline-flex items-center gap-1 hover:text-primary-600 ${active ? "text-primary-600" : ""}`}
                      >
                        {c.label}
                        {active ? (
                          sort!.dir === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-gray-400" />
                        )}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const isSel = selected.has(r.fid);
              const b = r.breakdown;
              const st = fstatusBadge(r.fstatus ?? "");
              return (
                <tr
                  key={r.fid}
                  className={
                    isSel ? SELECTED_ROW_CLS : i % 2 === 0 ? "bg-white" : "bg-[#F2F1EF]"
                  }
                >
                  {/* center + middle to match the header select-all cell (and
                      report-cnt) so every checkbox sits at the same spot in its row
                      (owner 2026-07-16 "เรียงให้ตรงกัน"). */}
                  <td className="px-2 py-2 text-center align-middle">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => onToggle(r.fid)}
                      className="pcs-check h-4 w-4 accent-orange-500"
                    />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 align-top text-gray-600">
                    <DateTimeCell value={r.fdate} />
                  </td>
                  <td className="px-2 py-2 align-top">
                    {/* Identity + tier badges share ONE line (owner 2026-07-16); the
                        ฝากนำเข้า/ฝากสั่งซื้อ provenance pill moved to รายละเอียด. */}
                    <div className="flex flex-wrap items-center gap-1 whitespace-nowrap">
                      <span className="font-semibold text-sky-600">{panel.user.userid}</span>
                      {r.is_svip && (
                        <span className="rounded-full bg-indigo-500 px-2 py-0.5 text-[11px] font-medium text-white">SVIP</span>
                      )}
                      {r.is_credit && (
                        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-medium text-white">เครดิต</span>
                      )}
                      {r.is_juristic && (
                        <span className="rounded-full bg-slate-500 px-2 py-0.5 text-[11px] font-medium text-white">นิติบุคคล</span>
                      )}
                      {r.adminid_sale && (
                        <span className="rounded-full bg-violet-500 px-2 py-0.5 text-[11px] font-medium text-white">Sale : {r.adminid_sale}</span>
                      )}
                    </div>
                    {/* fdatetothai is the START of an arrival WINDOW, not an exact day
                        (legacy: +2d ทางรถ / +4d เรือ·แอร์) — showing the bare start date
                        read as a promise. lib/admin/forwarder-eta.ts owns the rule. */}
                    {(() => {
                      const eta = formatEtaWindowThai(r.fdatetothai, r.ftransporttype);
                      if (!eta) return null;
                      return (
                        <div className="mt-1 text-[11px] font-medium text-violet-700">
                          จะมาถึงไทย : {eta}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-2 align-top">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={`/admin/forwarders/${r.fid}`}
                            className="font-semibold text-sky-600 hover:underline"
                            title="เปิดออเดอร์ฝากนำเข้า"
                          >
                            ออเดอร์ #{r.fid} ↗
                          </Link>
                          {/* F5 — ใบวางบิล/ใบเสร็จ pill links (owner PR178) */}
                          {r.bills.map((bl) => (
                            <Link
                              key={`b${bl.id}`}
                              href={`/admin/billing-run/${bl.id}`}
                              className="inline-flex items-center rounded-full bg-indigo-500 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-indigo-600"
                              title="ดูใบวางบิล"
                            >
                              {bl.docNo}
                            </Link>
                          ))}
                          {r.receipts.map((rc) => (
                            <Link
                              key={`r${rc.id}`}
                              href={`/admin/accounting/forwarder-invoice/${rc.id}`}
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${rc.status === "2" ? "bg-gray-300 text-gray-500 line-through" : "bg-emerald-500 text-white hover:bg-emerald-600"}`}
                              title={rc.status === "2" ? "ใบเสร็จ(ยกเลิกแล้ว)" : "ดูใบเสร็จ"}
                            >
                              {rc.rid}
                            </Link>
                          ))}
                        </div>
                        {r.fdetail && (
                          <div className="line-clamp-2 text-gray-600">{r.fdetail}</div>
                        )}
                        {r.products_type_label && (
                          <div className="text-[11px] text-gray-500">ประเภท : {r.products_type_label}</div>
                        )}
                        {/* ฝากนำเข้า/ฝากสั่งซื้อ provenance — moved here from รหัสลูกค้า
                            (owner 2026-07-16): it describes the ORDER, not the customer. */}
                        {r.provenance && (
                          <span className="mt-1 inline-block rounded-full bg-orange-500 px-2 py-0.5 text-[11px] font-medium text-white">
                            {r.provenance}
                          </span>
                        )}
                        {r.fnote && (
                          <div className="mt-1 rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">
                            หมายเหตุ: {r.fnote}
                          </div>
                        )}
                      </div>
                      <Thumb url={r.cover_url} alt={`ออเดอร์ ${r.fid}`} />
                    </div>
                  </td>
                  {/* Money right-aligned (owner 2026-07-16) — figures line up on the
                      decimal so a column of amounts is scannable. */}
                  <td className="px-2 py-2 text-right align-top">
                    <span className="inline-block whitespace-nowrap rounded bg-red-600 px-2 py-0.5 font-mono text-[12px] font-semibold text-white">
                      {thb(r.price_thb)}
                    </span>
                    {/* one measurement per line — the "·"-joined run read as a single
                        blob and wrapped unpredictably in a narrow cell. */}
                    <div className="mt-1 space-y-0.5 text-[11px] text-gray-500">
                      {r.weight > 0 && <div>{r.weight} Kg</div>}
                      {r.cbm > 0 && <div>{r.cbm} CBM</div>}
                      {r.boxes > 0 && <div>{r.boxes} กล่อง</div>}
                    </div>
                    {/* The breakdown is only worth showing when it actually breaks the
                        total into parts. total = freight + อื่นๆ + เหมาๆ − ลด − หัก1%, so a
                        single non-zero component always EQUALS the red total above and the
                        line just repeats it (owner 2026-07-16 "มันซ้ำ ข้างบนก็ไฮไลท์ละ").
                        Counting components (not comparing floats) keeps that true whichever
                        component stands alone. */}
                    {(() => {
                      const parts = [b.freight, b.otherCharges, b.maoFee, b.discount, b.wht1pct];
                      if (parts.filter((v) => v > 0).length < 2) return null;
                      return (
                        <div className="mt-1 space-y-0.5 text-[11px] text-gray-500">
                          {b.freight > 0 && <div>ค่าขนส่ง {thb(b.freight)}</div>}
                          {b.otherCharges > 0 && <div>+ อื่นๆ {thb(b.otherCharges)}</div>}
                          {b.maoFee > 0 && <div className="text-sky-600">+ เหมาๆ {thb(b.maoFee)}</div>}
                          {b.discount > 0 && <div className="text-emerald-600">− ลด {thb(b.discount)}</div>}
                          {b.wht1pct > 0 && <div className="text-orange-600">− หัก1% {thb(b.wht1pct)}</div>}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-2 align-top">
                    {/* Solid-red tracking = the legacy `bg-danger text-white` rendering
                        (forwarder.php L650) ภูม already restored on /admin/forwarders —
                        matched here so the same number looks the same on both tables. */}
                    {r.ftrackingchn && (
                      <span className="inline-block rounded bg-red-600 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-white">
                        {r.ftrackingchn}
                      </span>
                    )}
                    {r.fcabinetnumber && (
                      <div className="mt-0.5 text-[11px] text-gray-600">เลขตู้ : {r.fcabinetnumber}</div>
                    )}
                    {/* วันที่ยิงของเข้าโกดังจีน (fdatestatus2 · owner 2026-07-16) — the
                        same field the customer/warehouse tables label "เข้าโกดังจีน". */}
                    {r.fdatestatus2 && (
                      <div className="text-[11px] text-emerald-700">{formatThaiDate(r.fdatestatus2)}</div>
                    )}
                    {r.transport_label && (
                      <span className="mt-0.5 inline-block rounded-full bg-teal-500 px-2 py-0.5 text-[11px] font-medium text-white">
                        {r.transport_label}
                      </span>
                    )}
                    {r.fdatecontainerclose && (
                      <div className="text-[11px] text-gray-400">ปิดตู้ : {formatThaiDate(r.fdatecontainerclose)}</div>
                    )}
                    {r.fpallet && (
                      <div className="text-[11px] text-gray-400">location : {r.fpallet}</div>
                    )}
                  </td>
                  <td className="px-2 py-2 align-top">
                    {r.ship_by_label && (
                      <div className="text-[11px] text-gray-600">{r.ship_by_label}</div>
                    )}
                    {r.ftrackingth && <div className="font-mono text-gray-700">{r.ftrackingth}</div>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 align-top text-gray-600">
                    <DateTimeCell value={r.fdatestatus2} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 align-top text-gray-600">
                    <DateTimeCell value={r.fdatestatus3} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 align-top text-gray-600">
                    <DateTimeCell value={r.fdatestatus4} />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <div className="flex flex-col items-center gap-1">
                      <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] ${st.chip}`}>
                        {st.label}
                      </span>
                      {st.icon && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={st.icon} alt="" className="pcs-status-icon h-10 w-auto" />
                      )}
                    </div>
                  </td>
                  {/* อัปเดต — ใครทำรายการล่าสุด วันไหน เวลาไหน (owner 2026-07-16).
                      3 บรรทัดแบบตารางฝากนำเข้า: วันเวลาเต็ม · "ผ่านมา …" (elapsed) ·
                      ชื่อแอดมิน. fdateadminstatus = stamp ของการเปลี่ยนล่าสุด. */}
                  <td className="px-2 py-2 align-top text-[11px] text-gray-500">
                    {r.fdateadminstatus ? (
                      <>
                        <div className="text-gray-600">{formatThaiDateTime(r.fdateadminstatus)}</div>
                        <div className="text-red-600">ผ่านมา {diffDateTimeNow(r.fdateadminstatus)}</div>
                        {r.adminid_update && <div className="font-mono text-gray-500">{r.adminid_update}</div>}
                      </>
                    ) : (
                      r.adminid_update ?? "—"
                    )}
                  </td>
                  <td className="px-2 py-2 text-center align-top">
                    <div className="flex flex-col items-stretch gap-1">
                      <Link
                        href={`/admin/forwarders/${r.fid}`}
                        className="rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-medium text-white hover:bg-emerald-600"
                        title="ดูข้อมูลออเดอร์"
                      >
                        ดูข้อมูล
                      </Link>
                      <Link
                        href={`/admin/forwarders/${r.fid}`}
                        className="rounded-full bg-orange-500 px-3 py-1 text-[11px] font-medium text-white hover:bg-orange-600"
                        title="อัปเดตออเดอร์"
                      >
                        อัปเดต
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// SHOP (ฝากสั่งซื้อ) table — keyType=1
// ════════════════════════════════════════════════════════════
function ShopTable({
  rows,
  selected,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  rows: PayUserShopRow[];
  selected: Set<string>;
  onToggle: (hno: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-2.5">
        <p className="text-sm font-semibold text-gray-800">
          รายการฝากสั่งซื้อที่รอชำระ ({rows.length})
        </p>
        <div className="flex gap-3 text-[12px]">
          <button onClick={onSelectAll} className="text-primary-600 hover:underline">
            เลือกทั้งหมด
          </button>
          <button onClick={onClearAll} className="text-gray-500 hover:underline">
            ล้าง
          </button>
        </div>
      </div>
      <div className="overflow-x-auto scrollbar-x-visible">
        <table className="w-full min-w-[640px] border-collapse text-[12px] [&_td]:border [&_td]:border-gray-200 [&_th]:border [&_th]:border-gray-200">
          <thead>
            <tr className="bg-gray-50 text-left text-[13px] font-semibold text-gray-700">
              <th className="px-2 py-2"></th>
              <th className="px-2 py-2">วันที่สร้าง</th>
              <th className="px-2 py-2">ออเดอร์</th>
              <th className="px-2 py-2">ข้อมูลสินค้า</th>
              <th className="px-2 py-2">ราคา</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isSel = selected.has(r.hno);
              return (
                <tr
                  key={r.hno}
                  className={
                    isSel ? SELECTED_ROW_CLS : i % 2 === 0 ? "bg-white" : "bg-gray-50/40"
                  }
                >
                  <td className="px-2 py-2 text-center align-middle">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => onToggle(r.hno)}
                      className="pcs-check h-4 w-4 accent-orange-500"
                    />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 align-top text-gray-600">
                    <DateTimeCell value={r.hdate} />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <div className="font-semibold text-gray-900">#{r.hno}</div>
                    {r.chprohno && <div className="text-[11px] text-gray-500">{r.chprohno}</div>}
                  </td>
                  <td className="px-2 py-2 align-top">
                    <div className="flex gap-2">
                      <Thumb url={r.cover_url} alt={`ออเดอร์ ${r.hno}`} />
                      <div className="min-w-0">
                        {r.title && <div className="line-clamp-2 text-gray-800">{r.title}</div>}
                        {r.hdatepayment && (
                          <div className="text-[11px] text-amber-700">
                            ครบกำหนด {formatThaiDateTime(r.hdatepayment)}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <span className="inline-block rounded bg-red-600 px-2 py-0.5 font-mono text-[12px] font-semibold text-white">
                      {thb(r.price_thb)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// PAY MODAL
// ════════════════════════════════════════════════════════════
function PayModal({
  open,
  onClose,
  keyType,
  panel,
  fwdRows,
  shopRows,
  total,
  qrDataUrl,
  qrPending,
  needsSlip,
  shopWalletCovers,
  walletBalance,
  slip,
  onSlip,
  topUpAmount,
  onTopUpAmount,
  paying,
  onSubmit,
  onOpenSummary,
}: {
  open: boolean;
  onClose: () => void;
  keyType: KeyType;
  panel: PayUserPanel;
  fwdRows: PayUserFwdRow[];
  shopRows: PayUserShopRow[];
  total: number;
  qrDataUrl: string;
  qrPending: boolean;
  needsSlip: boolean;
  shopWalletCovers: boolean;
  walletBalance: number;
  slip: File | null;
  onSlip: (f: File | null) => void;
  topUpAmount: string;
  onTopUpAmount: (v: string) => void;
  paying: boolean;
  onSubmit: () => void;
  onOpenSummary: () => void;
}) {
  const dialogRef = useConfirmDialogRef(open, onClose);
  const title =
    keyType === "2"
      ? "ใบแจ้งหนี้ / ชำระเงิน · ฝากนำเข้าสินค้า"
      : "ใบแจ้งหนี้ / ชำระเงิน · ฝากสั่งซื้อ";
  // shortfall the staff still has to top up when the shop wallet is short.
  const shopShortfall = Math.max(0, total - walletBalance);

  // ── invoice totals (PRESENTATION ONLY — these reconcile EXACTLY to `total`;
  //    the amount actually collected is `total`, unchanged from before) ──
  const n0 = (v: number) => (Number.isFinite(v) ? v : 0);
  const goodsSum =
    keyType === "2"
      ? fwdRows.reduce((s, r) => s + n0(r.breakdown.freight), 0)
      : shopRows.reduce((s, r) => s + n0(r.price_thb), 0);
  const otherSum =
    keyType === "2"
      ? fwdRows.reduce((s, r) => s + n0(r.breakdown.otherCharges), 0)
      : 0;
  // ค่าส่งเหมาๆ (PCSF flat) — its OWN line, not folded into ค่าบริการอื่นๆ
  // (owner 2026-07-17 "ยอดเหมาๆ ต้องมาให้ครบ").
  const maoSum =
    keyType === "2"
      ? fwdRows.reduce((s, r) => s + n0(r.breakdown.maoFee), 0)
      : 0;
  const discountSum = keyType === "2" ? fwdRows.reduce((s, r) => s + n0(r.breakdown.discount), 0) : 0;
  const whtSum = keyType === "2" ? fwdRows.reduce((s, r) => s + n0(r.breakdown.wht1pct), 0) : 0;
  // 🔴 ห้ามใส่บรรทัด VAT 7% กลับมาที่จอนี้ (owner 2026-07-21 "เอา VAT 7 ออก มันไม่ถูกต้อง
  // แต่ใบที่พิมพ์มาถูกต้องนะ"). ของเดิมถอด 7/107 ออกจาก `total` แบบเหมารวมทุกงาน — ผิด เพราะ
  // ฝากนำเข้า/บริการ วิ่งเข้าบัญชี SERVICE = ไม่มี VAT (VAT 7% เก็บเฉพาะสาย TRADING ที่ออก
  // ใบกำกับ). ฝั่งเอกสารที่พิมพ์ตัดสินด้วย doc-mode อยู่แล้ว (lib/tax/tax-doc-mode.ts) = ถูกต้อง
  // อยู่แล้ว ไม่ต้องแตะ. จอนี้แสดงยอดเก็บเฉยๆ ไม่ต้องแจง VAT.
  const fmt2 = (v: number) =>
    (Number.isFinite(v) ? v : 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Provisional document meta (a real เลขที่ is minted only when accounting issues
  // the ใบเสร็จ/ใบกำกับ at settle — this is a preview). A plain const (NOT a hook) so
  // PayModal's hook count never changes; the date-based values are stable per day.
  const dnow = new Date();
  const p2 = (x: number) => String(x).padStart(2, "0");
  const dueDate = new Date(dnow);
  dueDate.setDate(dueDate.getDate() + 7);
  const fmtD = (d: Date) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear() + 543}`;
  const doc = {
    no: `IV-${dnow.getFullYear()}${p2(dnow.getMonth() + 1)}${p2(dnow.getDate())} (ตัวอย่าง)`,
    issue: fmtD(dnow),
    due: fmtD(dueDate),
  };

  const customerName = panel.user.name || panel.user.userid;
  const siteDomain = SITE_URL.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  return (
    <PacredDialog dialogRef={dialogRef} title={title} size="xl" onClose={onClose}>
      {/* Invoice document (ใบแจ้งหนี้) layout — header · ผู้ขาย/ลูกค้า · items table ·
          QR/bank/slip + totals · footer (owner 2026-07-17 "ทำหน้าตาเป็นแบบใบแจ้งหนี้"). */}
      <div className="space-y-5 text-sm text-gray-800">
        {/* ── HEADER: โลโก้ · หัวเอกสาร · meta ── */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-4">
          {/* tight-cropped wordmark (134×36) — fills the frame with NO padding.
              ⚠️ the source is only 134×36px, so a larger display upscales + blurs;
              h-14 keeps it crisp (owner 2026-07-17 "ทำให้คมๆ"). For a BIG + sharp
              logo, replace the file with a hi-res version (≥ ~500px wide). */}
          <Image
            src="/images/pacred-logo-tight.png"
            alt="Pacred"
            width={268}
            height={72}
            className="h-12 w-auto shrink-0 object-contain sm:h-14"
            unoptimized
          />
          {/* mobile: title จั่วหัวเต็มบรรทัดบนสุด (order-first) แล้วโลโก้+meta อยู่แถวถัดไป
              (owner 2026-07-17 "ในมือถือ ตามในภาพ") · desktop: กลับมากลางเหมือนเดิม */}
          <div className="order-first w-full text-center sm:order-none sm:w-auto">
            <h3 className="text-2xl font-extrabold tracking-wide text-primary-600 sm:text-3xl">ใบแจ้งหนี้</h3>
            <p className="text-[12px] text-gray-500">สรุปรายการที่ต้องชำระ (เงินสด)</p>
          </div>
          <div className="min-w-[220px] rounded-lg border border-rose-100 bg-rose-50/60 p-3 text-[12px]">
            <MetaRow k="เลขที่เอกสาร" v={doc.no} />
            <MetaRow k="วันที่ออก" v={doc.issue} />
            <MetaRow k="ครบกำหนด" v={doc.due} valueClass="font-semibold text-rose-600" />
            <MetaRow k="หน้า" v="1 / 1" />
          </div>
        </div>

        {/* ── ผู้ออก / ผู้รับ ใบแจ้งหนี้ — 2 คอลัมน์ side-by-side ตามภาพ (owner 2026-07-17
            "สัดส่วนต้องแบบนี้ ตามภาพ") · ชื่อ → เลขภาษี → ที่อยู่ → ไอคอนติดต่อ ── */}
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 border-b border-gray-200 pb-4 text-[12px] sm:grid-cols-2">
          {/* ผู้ออกใบแจ้งหนี้ (seller) */}
          <div className="space-y-0.5">
            <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-primary-600">ผู้ออกใบแจ้งหนี้</p>
            <p className="font-semibold text-gray-900">{SITE_LEGAL_NAME_TH}</p>
            <PartyLine k="เลขที่ภาษี" v={`${TAX_ID} (สำนักงานใหญ่)`} />
            <PartyLine k="ที่อยู่" v={ADDRESSES.office.full} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
              <ContactLine icon={<Phone className="h-3.5 w-3.5" />} v={CONTACT.phoneCompanyDisplay} />
              {/* acc@ ไม่ใช่ sales@ — site.ts: emailAcc = "receipts, transactions,
                  payments, tax invoice queries · Used on receipt + invoice PDFs".
                  นี่คือใบแจ้งหนี้ · ตรงกับที่ใบพิมพ์ใช้อยู่แล้ว (2026-07-21). */}
              <ContactLine icon={<Mail className="h-3.5 w-3.5" />} v={CONTACT.emailAcc} />
              <ContactLine icon={<Globe className="h-3.5 w-3.5" />} v={siteDomain} />
            </div>
          </div>
          {/* ผู้รับใบแจ้งหนี้ (customer) */}
          <div className="space-y-0.5">
            <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-primary-600">ผู้รับใบแจ้งหนี้</p>
            <p className="font-semibold text-gray-900">
              {customerName}
              <span className="ml-2 font-normal text-gray-500">{panel.user.userid}</span>
            </p>
            {/* 🔴 owner 2026-07-21 "มันไม่มีข้อมูลวิ่งมาอะ" — these were hardcoded "—".
                Now fed by loadCustomerBillingParty (the same resolver the printable
                ใบแจ้งหนี้ runs), so modal + paper always show the same party. Still
                falls back to a muted "—" when the customer genuinely has no value. */}
            <PartyLine k="เลขที่ภาษี" v={panel.user.tax_id || "—"} muted={!panel.user.tax_id} />
            <PartyLine k="ที่อยู่" v={panel.user.address || "—"} muted={!panel.user.address} />
            {/* 🔴 owner 2026-07-21 "ประเภทลูกค้าหายนะ" — ประเภท used to be an inline
                " · นิติบุคคล" suffix on the PR code that rendered NOTHING for a
                บุคคลธรรมดา, so the type simply vanished for most customers. It is now
                its own always-present line, exactly like the printable ใบแจ้งหนี้.
                (Display flag only — the 1% WHT is decided by the debit SOT, not here.) */}
            <PartyLine k="ประเภท" v={panel.is_juristic ? "นิติบุคคล" : "บุคคลธรรมดา"} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
              <ContactLine icon={<Phone className="h-3.5 w-3.5" />} v={panel.user.tel || "-"} />
              <ContactLine icon={<Mail className="h-3.5 w-3.5" />} v={panel.user.email || "-"} />
            </div>
          </div>
        </div>

        {/* ── รายการ ── หัวข้อ + ตาราง(จอคอม) + การ์ด(มือถือ · owner 2026-07-17
            "ในมือถือ ตามในภาพ") ── */}
        <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-800">
          รายการออเดอร์ ({keyType === "2" ? fwdRows.length : shopRows.length} รายการ)
        </p>
        {/* ตาราง — จอคอม (lg+) */}
        <div className="hidden overflow-x-auto scrollbar-x-visible lg:block">
          <table className="w-full min-w-[1020px] border-collapse text-[12px] [&_td]:border [&_td]:border-gray-200 [&_th]:border [&_th]:border-gray-200">
            <thead>
              <tr className="bg-gray-100 text-[11px] font-semibold text-gray-700">
                <th className="px-2 py-2">ลำดับ</th>
                <th className="px-2 py-2">เลขออเดอร์</th>
                {keyType === "2" ? (
                  <>
                    <th className="px-2 py-2">เลขตู้</th>
                    <th className="px-2 py-2">ขนส่ง</th>
                    <th className="px-2 py-2">เลขแทรกกิ้ง</th>
                    <th className="px-2 py-2">จำนวน</th>
                    <th className="px-2 py-2">ขนาด (ก×ย×ส ซม.)</th>
                    <th className="px-2 py-2">ปริมาตร (CBM)</th>
                    <th className="px-2 py-2">น้ำหนัก (กก.)</th>
                    <th className="px-2 py-2">ประเภท</th>
                    <th className="px-2 py-2 text-right">เรทราคา</th>
                    <th className="px-2 py-2 text-right">ค่าขนส่ง</th>
                    <th className="px-2 py-2 text-right">อื่นๆ</th>
                  </>
                ) : (
                  <th className="px-2 py-2">รายละเอียดสินค้า</th>
                )}
                {keyType !== "2" && <th className="px-2 py-2 text-right">รวม</th>}
              </tr>
            </thead>
            <tbody>
              {keyType === "2"
                ? fwdRows.map((r, i) => (
                    <tr key={r.fid} className={i % 2 ? "bg-gray-50/50" : "bg-white"}>
                      <td className="px-2 py-1.5 text-center text-gray-500">{i + 1}</td>
                      <td className="px-2 py-1.5 font-mono font-semibold text-gray-900">{r.fid}</td>
                      <td className="px-2 py-1.5 font-mono text-[11px] text-gray-700">{r.fcabinetnumber ?? "—"}</td>
                      <td className="px-2 py-1.5 text-center">{r.transport_label || "—"}</td>
                      <td className="px-2 py-1.5 font-mono text-[11px] text-gray-600">{r.ftrackingchn ?? "—"}</td>
                      <td className="px-2 py-1.5 text-center">{r.boxes > 0 ? r.boxes : "—"}</td>
                      <td className="px-2 py-1.5 text-center font-mono text-[11px] text-gray-600">{dimsLabel(r.fwidth, r.flength, r.fheight)}</td>
                      <td className="px-2 py-1.5 text-center font-mono text-[11px] text-gray-600 tabular-nums">{r.cbm > 0 ? r.cbm : "—"}</td>
                      <td className="px-2 py-1.5 text-center font-mono text-[11px] text-gray-600 tabular-nums">{r.weight > 0 ? r.weight : "—"}</td>
                      <td className="px-2 py-1.5 text-center text-[11px] text-gray-600">{r.products_type_label || "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{r.rate > 0 ? fmt2(r.rate) : "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmt2(r.breakdown.freight)}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmt2(r.breakdown.otherCharges)}</td>
                    </tr>
                  ))
                : shopRows.map((r, i) => (
                    <tr key={r.hno} className={i % 2 ? "bg-gray-50/50" : "bg-white"}>
                      <td className="px-2 py-1.5 text-center text-gray-500">{i + 1}</td>
                      <td className="px-2 py-1.5 font-mono font-semibold text-gray-900">#{r.hno}</td>
                      <td className="px-2 py-1.5 text-gray-700">{r.title || "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono font-semibold tabular-nums text-gray-900">{fmt2(r.price_thb)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {/* การ์ดรายการ — มือถือ/แท็บเล็ต (< lg) · แต่ละออเดอร์เป็นการ์ด ตามภาพ */}
        <div className="space-y-3 lg:hidden">
          {keyType === "2"
            ? fwdRows.map((r, i) => (
                <div key={r.fid} className="overflow-hidden rounded-lg border border-gray-200 border-l-4 border-l-primary-500">
                  <div className="flex items-start justify-between gap-2 p-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-600 text-[11px] font-bold text-white">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900">เลขออเดอร์ {r.fid}</div>
                        {r.ftrackingchn && (
                          <div className="text-[11px] text-gray-500">
                            Tracking <span className="font-mono">{r.ftrackingchn}</span>
                          </div>
                        )}
                        {r.fcabinetnumber && (
                          <div className="text-[11px] text-gray-500">
                            เลขตู้ <span className="font-mono text-gray-700">{r.fcabinetnumber}</span>
                          </div>
                        )}
                        {(r.fwidth > 0 || r.flength > 0 || r.fheight > 0) && (
                          <div className="text-[11px] text-gray-500">
                            ขนาด <span className="font-mono">{dimsLabel(r.fwidth, r.flength, r.fheight)}</span> ซม.
                          </div>
                        )}
                        {r.rate > 0 && (
                          <div className="text-[11px] text-gray-500">
                            เรทราคา <span className="font-mono text-gray-700">{fmt2(r.rate)}</span>
                          </div>
                        )}
                        {r.transport_label && (
                          <span className="mt-0.5 inline-block rounded bg-teal-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            {r.transport_label}
                          </span>
                        )}
                        {r.products_type_label && (
                          <span className="mt-0.5 ml-1 inline-block rounded bg-slate-400 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            {r.products_type_label}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] text-gray-500">ยอดรวม</div>
                      <div className="font-mono text-base font-bold text-red-700">{fmt2(r.price_thb)}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 border-t border-gray-100 bg-gray-50/50 px-3 py-2 text-center text-[11px]">
                    <div>
                      <div className="text-gray-500">ค่าขนส่ง</div>
                      <div className="font-mono text-gray-800">{fmt2(r.breakdown.freight)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">ค่าบริการอื่นๆ</div>
                      <div className="font-mono text-gray-800">{fmt2(r.breakdown.otherCharges)}</div>
                    </div>
                  </div>
                </div>
              ))
            : shopRows.map((r, i) => (
                <div key={r.hno} className="rounded-lg border border-gray-200 border-l-4 border-l-primary-500 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-600 text-[11px] font-bold text-white">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900">#{r.hno}</div>
                        {r.title && <div className="line-clamp-2 text-[11px] text-gray-600">{r.title}</div>}
                      </div>
                    </div>
                    <div className="shrink-0 font-mono text-base font-bold text-red-700">{fmt2(r.price_thb)}</div>
                  </div>
                </div>
              ))}
        </div>
        </div>

        {/* ── BOTTOM — บรรทัดเดียว 4 คอลัมน์: QR · โอนเข้าบัญชี · อัปโหลดสลิป · สรุปยอด
            (owner 2026-07-17 "เรียงบรรทัดเดียว"). ยุบเป็น 2 คอลัมน์บนแท็บเล็ต · 1 บนมือถือ. ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-start">
          {!needsSlip && shopWalletCovers ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[13px] text-emerald-800 sm:col-span-2 lg:col-span-3">
              ยอดในกระเป๋าเพียงพอ ({thb(walletBalance)}) — จะตัดจากกระเป๋าเงินของลูกค้าทันที ไม่ต้องแนบสลิป
            </div>
          ) : (
            <>
              {/* QR + ธนาคาร — เชื่อมเป็นกล่องเดียว ไม่มีกรอบเขียว (owner 2026-07-17
                  "เอาขอบเขียวออก · qr กับ ธนาคารเชื่อมกัน") · กินพื้นที่ 2 คอลัมน์ */}
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white sm:col-span-2 lg:col-span-2">
                <div className="grid grid-cols-1 divide-y divide-gray-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                  {/* QR */}
                  <div className="p-3">
                    <p className="mb-1.5 text-[12px] font-semibold text-primary-600">ชำระเงินผ่าน QR Code</p>
                    <div className="flex flex-col items-center gap-1.5">
                      {qrPending ? (
                        <div className="flex h-[160px] w-[160px] items-center justify-center rounded-lg border border-dashed border-gray-300 text-[12px] text-gray-500">กำลังสร้าง QR…</div>
                      ) : qrDataUrl ? (
                        <div
                          role="img"
                          aria-label="PromptPay QR"
                          className="h-[160px] w-[160px] rounded-lg border border-gray-200 bg-white"
                          style={{
                            backgroundImage: `url(${qrDataUrl})`,
                            backgroundRepeat: "no-repeat",
                            backgroundSize: "148% auto",
                            backgroundPosition: "50% 40%",
                          }}
                        />
                      ) : (
                        <div className="flex h-[160px] w-[160px] items-center justify-center rounded-lg border border-dashed border-gray-300 text-center text-[11px] text-gray-400">ไม่มี QR — โอนตามเลขบัญชี</div>
                      )}
                      <p className="text-center text-[11px] text-gray-500">สแกน QR เพื่อโอน แล้วแนบหลักฐาน</p>
                    </div>
                  </div>
                  {/* ธนาคาร (พื้นขาว · ไม่มีสีเขียว) */}
                  <div className="p-3 text-[13px]">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <p className="text-[12px] font-semibold text-primary-600">หรือโอนเงินเข้าบัญชี</p>
                      <Image src="/images/bank/kbanklogo.png" alt={BANK.name} width={30} height={30} className="h-[30px] w-[30px] shrink-0 rounded object-contain" />
                    </div>
                    <div className="font-semibold text-gray-900">{BANK.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-[15px] font-semibold tracking-wide text-gray-900">{BANK.accountNumber}</span>
                      <CopyButton text={BANK.accountNumber.replace(/\D/g, "")} />
                    </div>
                    <div className="mt-1 text-gray-700">{BANK.accountName}</div>
                    <div className="text-[11px] text-gray-500">{BANK.accountType}</div>
                  </div>
                </div>
              </div>

              {/* Col 3 — upload (+ shop top-up when short) */}
              <div className="space-y-2">
                <p className="text-[12px] font-semibold text-primary-600">อัปโหลดหลักฐานการชำระเงิน</p>
                {keyType === "1" && !shopWalletCovers && (
                  <div>
                    <label className="mb-1 block text-[11px] text-gray-600">ยอดเงินที่โอน (บาท)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={topUpAmount}
                      onChange={(e) => onTopUpAmount(e.target.value)}
                      placeholder={shopShortfall.toFixed(2)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">
                      ต้องเติมอย่างน้อย {thb(shopShortfall)}
                      {walletBalance > 0 && ` (ใช้ยอดเดิม ${thb(walletBalance)} ร่วม)`}
                    </p>
                  </div>
                )}
                <StyledFileInput
                  accept="image/*,application/pdf"
                  label="แนบสลิปการโอน (คลิกเพื่อเลือกรูป/PDF)"
                  hint="รองรับรูปภาพหรือไฟล์ PDF"
                  selectedLabel={slip ? `แนบแล้ว: ${slip.name}` : undefined}
                  onChange={(e) => onSlip(e.target.files?.[0] ?? null)}
                  className="min-h-[184px] flex-col"
                />
              </div>
            </>
          )}

          {/* Col 4 — totals */}
          <div className="space-y-2">
            <div className="space-y-1 rounded-lg border border-gray-200 bg-gray-50/40 p-3 text-[12px]">
              <Row label="รวมค่าสินค้าและบริการ" value={fmt2(goodsSum)} />
              <Row label="ค่าจัดส่ง (Delivery Charge)" value={fmt2(0)} />
              {maoSum > 0 && <Row label="ค่าส่งเหมาๆ" value={fmt2(maoSum)} className="text-sky-600" />}
              {otherSum > 0 && <Row label="ค่าบริการอื่นๆ" value={fmt2(otherSum)} />}
              {discountSum > 0 && <Row label="ส่วนลด" value={`− ${fmt2(discountSum)}`} className="text-emerald-600" />}
              {whtSum > 0 && <Row label="หัก ณ ที่จ่าย 1%" value={`− ${fmt2(whtSum)}`} className="text-orange-600" />}
              <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-center">
                <div className="text-[11px] font-semibold text-red-700">ยอดรวมที่ต้องชำระ</div>
                <div key={total} className="price-bounce-fx font-mono text-xl font-bold text-red-700">{thb(total)}</div>
              </div>
              <p className="pt-0.5 text-center text-[11px] text-gray-500">({readThaiBaht(total)})</p>
            </div>
            <p className="text-[11px] text-gray-500">
              ยอดจริงคำนวณบนเซิร์ฟเวอร์ตามรายการที่เลือก (อาจต่าง ≤1% หรือ ฿50)
            </p>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-4">
          <p className="text-[11px] text-gray-500">
            🛈 เอกสารฉบับนี้ใช้แจ้งยอด/รับชำระ — ระบบออกใบเสร็จให้หลังตรวจสอบหลักฐานเรียบร้อยแล้ว
          </p>
          <div className="flex flex-wrap gap-2">
            {keyType === "2" && (
              <button
                type="button"
                onClick={onOpenSummary}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Printer className="h-4 w-4" /> พิมพ์ / บันทึก PDF
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={paying}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={paying || (needsSlip && !slip)}
              className="rounded-md bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {paying ? "กำลังทำรายการ..." : "ยืนยันการชำระเงิน"}
            </button>
          </div>
        </div>
      </div>
    </PacredDialog>
  );
}

function Row({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline gap-2 ${className}`}>
      <span className="shrink-0">{label}</span>
      <span aria-hidden className="min-w-[1rem] flex-1 self-center border-b border-dotted border-gray-300/80" />
      <span className="text-right font-mono tabular-nums">{value}</span>
    </div>
  );
}

// Doc-meta key/value line (เลขที่เอกสาร · วันที่ออก · ครบกำหนด · หน้า) for the
// invoice header's right-hand meta box.
function MetaRow({ k, v, valueClass = "" }: { k: string; v: string; valueClass?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-gray-500">{k}</span>
      <span className={`font-mono tabular-nums text-gray-800 ${valueClass}`}>{v}</span>
    </div>
  );
}

// Peak-style party row: a fixed-width muted label (ที่อยู่ : / เลขที่ภาษี :) + value.
function PartyLine({ k, v, muted = false }: { k: string; v: string; muted?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-[62px] shrink-0 text-gray-400">{k} :</span>
      <span className={`min-w-0 ${muted ? "italic text-gray-400" : "text-gray-700"}`}>{v}</span>
    </div>
  );
}

// Peak-style contact line: an icon + value (📞 phone · ✉ email · 🌐 website).
function ContactLine({ icon, v }: { icon: ReactNode; v: string }) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap text-gray-600">
      <span className="text-gray-400">{icon}</span>
      <span>{v}</span>
    </div>
  );
}

// Copy-to-clipboard chip (bank account number · "คัดลอก" → "คัดลอกแล้ว ✓").
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        try {
          navigator.clipboard?.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable — no-op */
        }
      }}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
        copied
          ? "border-emerald-500 bg-emerald-500 text-white"
          : "border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
      }`}
    >
      {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
    </button>
  );
}

// ── open/close the native <dialog> imperatively when `open` toggles ──
function useConfirmDialogRef(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);
  // when the dialog closes itself (defensive — PacredDialog blocks ESC/backdrop),
  // keep parent state in sync.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => {
      if (open) onClose();
    };
    el.addEventListener("close", handler);
    return () => el.removeEventListener("close", handler);
  }, [open, onClose]);
  return ref;
}

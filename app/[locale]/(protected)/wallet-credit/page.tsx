import { redirect } from "next/navigation";
import { CreditCard, CircleDollarSign, History, Inbox } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyCredit } from "@/actions/credit";
import { BANK } from "@/components/seo/site";
import { LegacyDepositForm } from "../wallet/deposit/legacy-deposit-form";

/**
 * Customer "กระเป๋าสตางค์เครดิต" (credit wallet) screen — a FAITHFUL 1:1
 * TRANSCRIPTION of the legacy PCS Cargo `member/wallet-credit.php` (the
 * default `page` branch — no `?page`, lines 1-532) (D1 / ADR-0017 ·
 * faithful-port transcription · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * ── Legacy mapping ──
 * The legacy `.htaccess` (member/.htaccess L27-28) rewrites:
 *   `wallet-credit/`        → `wallet-credit.php`         (no `?page`)
 *   `wallet-credit/<x>/`    → `wallet-credit.php?page=<x>`
 *
 * `wallet-credit.php` has TWO branches keyed off `?page`:
 *   - `?page` is unset OR `?page=='add'` (L3-532) → the credit-wallet
 *     view + the #wallet-add deposit modal (default landing).
 *   - `?page=='withdraw'`              (L535-803) → the credit-wallet
 *     withdraw form + the #wallet-login password-confirm modal.
 * This page transcribes the default branch; `/wallet-credit/withdraw`
 * is a separate screen (not the target of this menu link).
 *
 * ── Page structure (wallet-credit.php L76-227) ──
 * .app-content > .content-wrapper
 *   1. .content-header > … > ol.breadcrumb
 *      — "หน้าแรก" / "กระเป๋าสตางค์เครดิต"  (L80-91)
 *   2. .content-body.pr110 > section > .row > .col-md-12 > .card …
 *      a. balance card                        (L99-124)
 *         — name · "วงเงินเครดิตที่ใช้งานได้" · tam-counter (=
 *           userCreditValue - creditValue) · "ยอดเครดิตค้างชำระ" ·
 *           "กระเป๋าสตางค์เงินสด" · logo · progress · "ชำระเงินเครดิต"
 *           button (→ `forwarder/?q=c` = `/service-import?q=c`)
 *      b. tab panel                            (L125-157)
 *         — one tab: "รายการเดินบัญชี"
 *         — empty state: "คุณยังไม่มีรายการ"   (when COUNT(ID)=0)
 *   3. #wallet-add deposit modal                (L163-222)
 *      — same K-Bank top card + amount input + dropify slip uploader +
 *        QR code as wallet.php's modal, but the form posts to
 *        `wallet-credit/` (legacy basePath."wallet-credit/")
 *
 * ── Data — every wallet-credit.php mysqli query transcribed 1:1 ──
 * The `tb_*` schema is RLS-locked to service_role → reads go through the
 * admin client. Join key: `tb_*.userid === profile.member_code`
 * (the customer's "PR<n>" code).
 *   - $cbTotal          → tb_cash_back.cbtotal     (L59-66 / header.php L93)
 *   - $userCreditValue  → tb_users.usercreditvalue (L67-74)
 *   - $creditValue      → tb_credit.creditvalue   (header.php L113-120)
 *   - $walletTotal      → tb_wallet.wallettotal   (header.php L86-92)
 *   - $userName/userLastName → tb_users           (header.php L33-38)
 *   - COUNT(ID) wUserCredit=1 → tb_wallet_hs     (L141-148)
 *   - history rows      → tb_wallet_hs WHERE wusercredit=1
 *                         ORDER BY ID DESC         (load_wallet_hs.php L8 · type='c' branch)
 *
 * The legacy AJAX infinite-scroll (`include/pages/wallet/load_wallet_hs.php`
 * called from L325 with `type:'c'` → SQL `WHERE wUserCredit=1`) is
 * replaced by a server-side render of every credit row; the
 * scroll-to-load-more behaviour itself is not reproduced.
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + Pacred.
 *
 * ── FLAGGED — not strictly 1:1 (documented, never silently diverged) ──
 *  1. wallet-credit.php L4-51 (the deposit POST handler — INSERT
 *     tb_wallet_hs + move_uploaded_file + LINE Notify) → wired via the
 *     <LegacyDepositForm kind="credit" /> Client Component →
 *     actions/wallet.ts::submitLegacyWalletDeposit (same INSERT into
 *     tb_wallet_hs with `wusercredit='1'` so the row surfaces in the
 *     credit-history tab, slip → `slips` bucket, LINE Notify replaced
 *     by in-app notify because LINE Notify EOL'd Apr 2025).
 *  2. The #wallet-add deposit modal markup IS transcribed 1:1, but its
 *     jQuery behaviours (Bootstrap .modal('show') triggered by
 *     `?page=='add'`, dropify file input, PromptPay QR-code generation,
 *     SweetAlert success/error popups) need client JS not present here
 *     — the modal renders statically.
 *  3. The .tam-counter count-up animation needs client JS; the balance
 *     is rendered statically as `number_format($n,2)`.
 *  4. The legacy auto-show-modal `<script>` for `?page=='add'` (L233-241)
 *     is not reproduced — the menu link target is `/wallet-credit/` (no
 *     `?page`), so the modal stays hidden as legacy does for that path.
 */

// Server Components reading cookies/auth under a layout must be dynamic.
export const dynamic = "force-dynamic";

// load_wallet_hs.php L21 — status badge. Tailwind rebuild with clean
// semantic colours (รอ=amber · สำเร็จ=sky · ไม่สำเร็จ=red).
function statusBadge(status: string | null) {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold";
  if (status === "1") {
    return (
      <span className={`${base} border-amber-200 bg-amber-50 text-amber-700`}>
        รอตรวจสอบ
      </span>
    );
  }
  if (status === "2") {
    return (
      <span className={`${base} border-sky-200 bg-sky-50 text-sky-700`}>
        สำเร็จ
      </span>
    );
  }
  return (
    <span className={`${base} border-red-200 bg-red-50 text-red-700`}>
      ไม่สำเร็จ
    </span>
  );
}

// PHP `number_format($n, 2)` — 2 decimals, comma thousands separator.
function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Legacy `nameWallet($type)` — member/include/function.php L156-169.
const NAME_WALLET: Record<string, string> = {
  "1": "รายการเติมเงิน",
  "2": "รายการชำระเงิน\nฝากสั่งสินค้า",
  "3": "รายการถอนเงิน",
  "4": "รายการชำระเงิน\nฝากนำเข้า",
  "5": "รายการคืนเงิน",
  "6": "รายการชำระเงิน\nฝากชำระ",
  "7": "รายการชำระเงิน\nแบบเติมเพิ่ม",
};
function nameWallet(type: string): string {
  return NAME_WALLET[type] ?? "ไม่พบข้อมูล";
}

// Legacy `DateThaiWallet($strDate)` — member/include/function.php L56-66.
const THAI_MONTH_CUT = [
  "", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];
function dateThaiWallet(strDate: string | null): { date: string; time: string } {
  if (!strDate) return { date: "", time: "" };
  const d = new Date(strDate.replace(" ", "T"));
  if (isNaN(d.getTime())) return { date: "", time: "" };
  const day = d.getDate();
  const month = THAI_MONTH_CUT[d.getMonth() + 1];
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { date: `${day} ${month} ${year}`, time: `${hh}:${mm} น.` };
}

// A single wallet-hs row as load_wallet_hs.php L22-43 renders it.
type WalletHsRow = {
  ID: number;
  date: string | null;
  status: string | null;
  amount: number;
  type: string | null;
  refOrder: string | null;
};

export default async function WalletCreditPage() {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const memberCode = profile.member_code ?? "";

  // ── Credit limit / outstanding / available ────────────────────
  // ADR-0023 D-3 de-dup: the limit (tb_users.userCreditValue) + outstanding
  // (tb_credit.creditvalue) reads are shared with the /wallet/history credit
  // panel via the ONE helper getMyCredit() (one query shape, one SOT). We no
  // longer re-query tb_users.userCreditValue + tb_credit inline here — the
  // helper reads the same legacy columns by member_code.
  const creditState = await getMyCredit();
  const creditValue = creditState.ok ? creditState.data!.outstanding_thb : 0;
  // wallet-credit.php L107: $userCreditValue - $creditValue → available credit
  // (computed by getMyCredit as available_credit_thb).
  const creditAvailable = creditState.ok ? creditState.data!.available_credit_thb : 0;

  // ── Transcribed queries (wallet balance · name · cashback · history) ──
  const [walletRes, userRowRes, cbRes, hsRes] = await Promise.all([
    // header.php L86-92: SELECT walletTotal FROM tb_wallet WHERE userID=…
    admin
      .from("tb_wallet")
      .select("wallettotal")
      .eq("userid", memberCode)
      .maybeSingle<{ wallettotal: number | string | null }>(),
    // wallet-credit.php L67-74 + header.php L33-38: tb_users (display name only;
    // the credit value now comes from getMyCredit per ADR-0023 D-3).
    admin
      .from("tb_users")
      .select("userName, userLastName")
      .eq("userID", memberCode)
      .maybeSingle<{
        userName: string | null;
        userLastName: string | null;
      }>(),
    // wallet-credit.php L59-66: SELECT cbTotal FROM tb_cash_back WHERE userID=…
    admin
      .from("tb_cash_back")
      .select("cbtotal")
      .eq("userid", memberCode)
      .maybeSingle<{ cbtotal: number | string | null }>(),
    // load_wallet_hs.php L8 (type='c' branch): SELECT … FROM tb_wallet_hs
    //   WHERE userID=… AND wUserCredit=1 ORDER BY ID DESC
    admin
      .from("tb_wallet_hs")
      .select("id, date, status, amount, type, reforder")
      .eq("userid", memberCode)
      .eq("wusercredit", 1)
      .order("id", { ascending: false }),
  ]);

  const walletTotal = Number(walletRes.data?.wallettotal ?? 0);
  // wallet-credit.php L105: $userName . ' ' . $userLastName
  const legacyName = [userRowRes.data?.userName, userRowRes.data?.userLastName]
    .filter((s): s is string => !!s && s.trim() !== "")
    .join(" ")
    .trim();
  const profileName = [profile.first_name, profile.last_name]
    .filter((s): s is string => !!s && s.trim() !== "")
    .join(" ")
    .trim();
  const fullName = legacyName || profileName || profile.company_name || "";
  // wallet-credit.php L59-66 — cbTotal (unused in the rendered body but
  // read by legacy header; kept for query parity).
  void Number(cbRes.data?.cbtotal ?? 0);

  // Credit-history rows (wUserCredit=1) — load_wallet_hs.php L22-43 shape.
  const rowsHistory: WalletHsRow[] = (
    (hsRes.data ?? []) as {
      id: number;
      date: string | null;
      status: string | null;
      amount: number | string | null;
      type: string | null;
      reforder: string | null;
    }[]
  ).map((r) => ({
    ID: r.id,
    date: r.date,
    status: r.status,
    amount: Number(r.amount ?? 0),
    type: r.type,
    refOrder: r.reforder,
  }));

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS theme CSS — kept for the Bootstrap-4 #wallet-add deposit
          modal (the <LegacyDepositForm> island + jQuery .modal()) and any
          layout-scope globals. The visible surface below is Tailwind. */}
      <link rel="stylesheet" href="/legacy/pcs/wallet.css" />

      {/* wallet-credit.php <title> L53 (Next.js owns <head> — kept as a
          fidelity comment): กระเป๋าสตางค์เครดิต | Pacred */}

      {/* Page content — Tailwind rebuild. `.pcs-content-pad` so the
          (protected) layout's desktop padding (sidebar + FloatingTabs
          clearance) kicks in. */}
      <div className="pcs-content-pad w-full px-3 md:px-6 pt-3 pb-24 md:py-6">
        {/* ── Credit balance card — wallet-credit.php L99-124 ── */}
        <div className="mx-auto max-w-[640px]">
          <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-red-600 to-red-700 text-white shadow-sm">
            <div className="flex items-start justify-between gap-3 px-4 py-4 md:px-6 md:py-5">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <CreditCard className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    กระเป๋าสตางค์เครดิต ({fullName})
                  </span>
                </p>
                <p className="mt-2 text-xs text-white/80">
                  วงเงินเครดิตที่ใช้งานได้ (บาท)
                </p>
                {/* `tam-counter` + data-count kept as the legacy count-up
                    hook (animation JS may attach later). */}
                <p
                  className="tam-counter mt-0.5 font-mono text-3xl font-bold tabular-nums md:text-4xl"
                  data-count={creditAvailable}
                >
                  {numberFormat2(creditAvailable)}
                </p>
                <p className="mt-2 text-xs text-white/80">
                  ยอดเครดิตค้างชำระ :{" "}
                  <span className="font-mono tabular-nums">
                    {numberFormat2(creditValue)}
                  </span>{" "}
                  (บาท)
                </p>
                <p className="mt-0.5 text-xs text-white/80">
                  กระเป๋าสตางค์เงินสด :{" "}
                  <span className="font-mono tabular-nums">
                    {numberFormat2(walletTotal)}
                  </span>{" "}
                  (บาท)
                </p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="h-10 w-auto shrink-0 rounded bg-white/95 p-1 md:h-12"
                alt="logo"
                src="/images/pacred-logo-red.png"
              />
            </div>
            {/* progress bar — legacy 100% warning gradient → Tailwind */}
            <div className="mx-4 mb-3 h-1.5 overflow-hidden rounded-full bg-white/25 md:mx-6">
              <div
                className="h-full rounded-full bg-amber-300"
                role="progressbar"
                style={{ width: "100%" }}
                aria-valuenow={100}
                aria-valuemin={0}
                aria-valuemax={100}
              ></div>
            </div>
            {/* L120 — `forwarder/?q=c` rebrands to `/service-import?q=c`
                per AGENTS.md transcription-rules step §8. */}
            <div className="border-t border-white/15 px-4 py-3 text-center md:px-6">
              <Link
                href="/service-import?q=c"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-bold text-red-700 shadow-sm transition-colors hover:bg-red-50"
              >
                <CircleDollarSign className="h-4 w-4" />
                ชำระเงินเครดิต
              </Link>
            </div>
          </div>
        </div>

        {/* ── Single-tab history panel — wallet-credit.php L125-157 ── */}
        <div className="mx-auto mt-4 max-w-[640px]">
          <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
            {/* one tab: "รายการเดินบัญชี" (active red underline) */}
            <div className="border-b border-border px-4 pt-3 md:px-5">
              <span className="inline-flex items-center gap-1.5 border-b-2 border-red-600 px-1 pb-2.5 text-sm font-bold text-red-600 md:text-base">
                <History className="h-4 w-4" />
                รายการเดินบัญชี
              </span>
            </div>
            <div className="px-3 py-3 md:px-4 md:py-4">
              <div id="load_data_wallet_hs" className="space-y-2.5">
                {rowsHistory.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <Inbox className="h-10 w-10 text-muted/50" />
                    <p className="text-sm text-muted">คุณยังไม่มีรายการ</p>
                  </div>
                ) : (
                  rowsHistory.map((row) => (
                    <WalletHsRowView key={row.ID} row={row} />
                  ))
                )}
              </div>
              <div id="load_data_message_wallet_hs"></div>
            </div>
          </section>
        </div>
      </div>

      {/* ── Deposit modal — wallet-credit.php L163-222 ──
          STILL Bootstrap-4 markup: opened by jQuery `.modal('show')`
          (vendor bundle from the (protected) layout) and the
          <LegacyDepositForm> client island handles the dropify uploader +
          submit. id="wallet-add" + data-dismiss + #text1/#text2 +
          data-toggle/data-placement preserved verbatim.
          The addData POST handler (wallet-credit.php L4-51) is wired via
          the <LegacyDepositForm kind="credit"/> Client Component →
          actions/wallet.ts::submitLegacyWalletDeposit (INSERT tb_wallet_hs
          with wusercredit='1' + slip upload to `slips` bucket + in-app
          notify). */}
      <div
        id="wallet-add"
        className="modal fade in"
        tabIndex={-1}
        role="dialog"
        aria-hidden="true"
      >
                <div className="modal-dialog">
                  <div className="modal-content ">
                    <div className="modal-header header-from">
                      <h4 className="modal-title">
                        เติมเงินเข้าเป๋าตัง Pacred
                      </h4>
                      <button
                        type="button"
                        className="close"
                        data-dismiss="modal"
                        aria-hidden="true"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="24"
                          height="24"
                          stroke="currentColor"
                          strokeWidth="2"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="css-i6dzq1"
                        >
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>
                    <div className="modal-body header-from">
                      <div className="row border-bottom-2">
                        <div className="col-12">
                          <div className="box-blank-kbank">
                            <div className="row">
                              <div className="col-12 col-md-9">
                                <h2 className="text-white">
                                  {BANK.name}
                                </h2>
                                <div className="text-center">
                                  เลขที่บัญชี{" "}
                                  <span className="font-2rem mr-0-3" id="text2">
                                    {BANK.accountNumber}
                                  </span>
                                  <button
                                    data-toggle="tooltip"
                                    data-placement="top"
                                    title="คัดลอกข้อความ"
                                    type="button"
                                    className="btn btn-sm2 btn-rounded btn-secondary"
                                  >
                                    คัดลอก
                                  </button>
                                  <br />
                                  พร้อมเพย์{" "}
                                  <span id="text1">0-1055-64077-71-6 </span>
                                  <button
                                    data-toggle="tooltip"
                                    data-placement="top"
                                    title="คัดลอกข้อความ"
                                    type="button"
                                    className="btn btn-sm2 btn-rounded btn-secondary"
                                  >
                                    คัดลอก
                                  </button>
                                  <h5 className="text-white">
                                    บริษัท แพคเรด (ประเทศไทย) จำกัด
                                  </h5>
                                </div>
                              </div>
                              <div className="col-0 wallet-logo col-md-3 text-right">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  className="img-fluid logo-blank"
                                  src="/legacy/pcs/assets/images/theme/logo-kbank.png"
                                  alt=""
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <LegacyDepositForm kind="credit" />
                    </div>
                  </div>
                </div>
              </div>
      {/* END: Content — wallet-credit.php L227 */}
    </div>
  );
}

/**
 * One wallet-history row — a 1:1 transcription of the markup
 * `include/pages/wallet/load_wallet_hs.php` L22-43 emits per row,
 * including the legacy `nameWallet()` / `DateThaiWallet()` helpers and
 * the `$nameColor` +/- logic (L20).
 */
function WalletHsRowView({ row }: { row: WalletHsRow }) {
  // load_wallet_hs.php L20 — type 1 or 5 = green (credit), else red.
  const nameColor = row.type === "1" || row.type === "5" ? "success" : "danger";
  const sign = nameColor === "success" ? "+" : "-";
  const { date, time } = dateThaiWallet(row.date);
  const nameParts = nameWallet(row.type ?? "").split("\n");

  // load_wallet_hs.php L20 → Tailwind amount colour (credit green / debit red).
  const amountClass =
    nameColor === "success" ? "text-emerald-600" : "text-red-600";

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-white p-3 shadow-sm dark:bg-surface">
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug text-foreground">
          {nameParts.map((part, i) => (
            <span key={i}>
              {i > 0 && <br />}
              {part}
            </span>
          ))}
        </p>
        <p className="mt-1 text-[11px] text-muted">เลขที่รายการ #{row.ID}</p>
        {row.refOrder != null && row.refOrder !== "" && (
          <p className="text-[11px] text-muted">
            เลขที่ออเดอร์{" "}
            {row.type === "2" ? (
              <a
                href={`/service-order/detail/${row.refOrder}`}
                target="_blank"
                rel="noreferrer"
                className="text-sky-600 hover:underline"
              >
                {row.refOrder}
              </a>
            ) : row.type === "4" ? (
              <a
                href={`/service-import/detail/${row.refOrder}`}
                target="_blank"
                rel="noreferrer"
                className="text-sky-600 hover:underline"
              >
                {row.refOrder}
              </a>
            ) : (
              row.refOrder
            )}
          </p>
        )}
        <div className="mt-1.5">{statusBadge(row.status)}</div>
      </div>
      <div className="shrink-0 text-right">
        <p className={`font-mono text-base font-bold tabular-nums ${amountClass}`}>
          {sign}
          {numberFormat2(row.amount)}
        </p>
        <p className="mt-0.5 text-[11px] leading-tight text-muted">
          {date}
          <br />
          {time}
        </p>
      </div>
    </div>
  );
}

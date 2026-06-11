import Script from "next/script";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { LegacyDepositForm } from "./legacy-deposit-form";

/**
 * Customer "ชำระเงิน" (wallet deposit) screen — a FAITHFUL 1:1
 * TRANSCRIPTION of the legacy PCS Cargo `member/wallet.php` `?page=='add'`
 * branch (L3-596 — the default branch the .htaccess sends `wallet/add/`
 * to via `^wallet/(.*)/$ wallet.php?page=$1`) (D1 / ADR-0017 ·
 * faithful-port transcription · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * ── Legacy mapping ──
 * `member/.htaccess`: `wallet/add/` → `wallet.php?page=add`
 * `wallet.php` L3: `if(!isset($_GET['page']) || $_GET['page']=='add')` —
 *   the same code path renders the wallet landing AND the deposit modal.
 *   The L294-302 inline `<script>` then auto-opens the `#wallet-add`
 *   modal when `?page=='add'` is set.
 *
 * Pacred routes the deposit-form variant at `/wallet/deposit` (the
 * landing without the modal stays at `/wallet`).
 *
 * ── Page structure (wallet.php L85-288 with the auto-open modal) ──
 * Identical to `/wallet/page.tsx` (the same tabs + balance card render
 * for `?page=='add'`), with the `#wallet-add` Bootstrap modal auto-opened
 * by the L294-302 script. Transcribed as a static modal-open state — the
 * page renders with the deposit modal visible (the legacy intent).
 *
 * ── Data — every wallet.php mysqli query transcribed 1:1 ──
 * `tb_*` is RLS-locked to service_role → reads go through admin client.
 *   - $walletTotal     → tb_wallet.wallettotal          (header.php L86-92)
 *   - $userName etc.   → tb_users.username/userlastname (header.php L33-38)
 *   - $cbTotal         → tb_cash_back.cbtotal           (wallet.php L59-66)
 *   - history rows     → tb_wallet_hs                   (load_wallet_hs.php)
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + Pacred.
 *
 * ── FLAGGED — not strictly 1:1 (documented, never silently diverged) ──
 *  1. wallet.php L3-51 (the `addData` POST handler — INSERT tb_wallet_hs,
 *     move_uploaded_file, LINE Notify) → wired via the
 *     <LegacyDepositForm> Client Component →
 *     actions/wallet.ts::submitLegacyWalletDeposit (same INSERT into
 *     tb_wallet_hs, slip → `slips` bucket, LINE Notify replaced by
 *     in-app notify because LINE Notify EOL'd Apr 2025).
 *  2. The L294-302 jQuery auto-show `<script>` for `?page=='add'` needs
 *     client JS not present here — modal is rendered visible by default
 *     (matching the user-visible end-state of the legacy auto-open).
 *  3. The dropify slip uploader + PromptPay QR-code generation +
 *     SweetAlert popups need client JS not present here — modal renders
 *     statically.
 *  4. The .tam-counter count-up animation needs client JS; balance is
 *     rendered statically as `number_format($n,2)`.
 *  5. The 4 tabs' jQuery infinite-scroll is replaced by a server-side
 *     render of every row; scroll-to-load-more is not reproduced.
 *  6. wallet.php L595 `saveHS()` (visit-log INSERT) is a render-time
 *     write — NOT reproduced.
 */

// Server Components reading cookies/auth under a layout must be dynamic.
export const dynamic = "force-dynamic";

// Legacy `nameWallet($type)` — member/include/function.php L156-169.
// The type keys ("1".."7") are stable identifiers (legacy tb_wallet_hs.type
// data values) — only the display labels are translated.
const NAME_WALLET_KEY: Record<string, string> = {
  "1": "walletTypeDeposit",
  "2": "walletTypeOrderPayment",
  "3": "walletTypeWithdraw",
  "4": "walletTypeImportPayment",
  "5": "walletTypeRefund",
  "6": "walletTypeBillPayment",
  "7": "walletTypeTopUpExtra",
};
function nameWallet(type: string, t: (key: string) => string): string {
  const key = NAME_WALLET_KEY[type];
  return key ? t(key) : t("walletTypeNotFound");
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

// PHP `number_format($n, 2)` — 2 decimals, comma thousands separator.
function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// load_wallet_hs.php L21 — status badge.
function statusBadge(status: string | null, t: (key: string) => string) {
  if (status === "1") {
    return <span className="badge badge-warning badge-pill">{t("statusPending")}</span>;
  }
  if (status === "2") {
    return <span className="badge badge-info badge-pill">{t("statusSuccess")}</span>;
  }
  return <span className="badge badge-danger badge-pill">{t("statusFailed")}</span>;
}

type WalletHsRow = {
  ID: number;
  date: string | null;
  status: string | null;
  amount: number;
  type: string | null;
  refOrder: string | null;
};

export default async function WalletDepositPage() {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const t = await getTranslations("walletDeposit");

  const admin = createAdminClient();
  const memberCode = profile.member_code ?? "";

  // ── Transcribed queries (identical to /wallet/page.tsx) ──
  const [walletRes, userRowRes, hsRes] = await Promise.all([
    admin
      .from("tb_wallet")
      .select("wallettotal")
      .eq("userid", memberCode)
      .maybeSingle<{ wallettotal: number }>(),
    admin
      .from("tb_users")
      .select("userName, userLastName")
      .eq("userID", memberCode)
      .maybeSingle<{ userName: string | null; userLastName: string | null }>(),
    admin
      .from("tb_wallet_hs")
      .select("id, date, status, amount, type, reforder")
      .eq("userid", memberCode)
      .order("id", { ascending: false }),
  ]);

  const walletTotal = Number(walletRes.data?.wallettotal ?? 0);

  const legacyName = [userRowRes.data?.userName, userRowRes.data?.userLastName]
    .filter((s): s is string => !!s && s.trim() !== "")
    .join(" ")
    .trim();
  const profileName = [profile.first_name, profile.last_name]
    .filter((s): s is string => !!s && s.trim() !== "")
    .join(" ")
    .trim();
  const fullName = legacyName || profileName || profile.company_name || "";

  const allRows: WalletHsRow[] = (
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

  // Per-tab filters — exactly the WHERE clauses load_wallet_hs.php uses.
  const rowsHistory = allRows;
  const rowsAdd = allRows.filter((r) => r.type === "1" || r.type === "5");
  const rowsPayments = allRows.filter(
    (r) => r.type === "2" || r.type === "4" || r.type === "6" || r.type === "7",
  );
  const rowsWithdraw = allRows.filter((r) => r.type === "3");

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS theme CSS — same stylesheet wallet.php uses. */}
      <link rel="stylesheet" href="/legacy/pcs/wallet.css" />

      {/* wallet.php <title> L53 (Next.js owns <head> — kept as fidelity
          comment): กระเป๋าสตางค์ | Pacred */}

      {/* BEGIN: Content — wallet.php L85.
          Tailwind rebuild (เดฟ 2026-05-30 — ปอน: "rebuild css เป็น tailwind
          mobile-first · ห้ามแก้ relation/href/id/hook/logic"). The Bootstrap-4
          shell (.app-content > .content-wrapper > .content-body.pr110 + the
          balance .card) → `.pcs-content-pad` wrapper + Tailwind cards.
          ⚠️ The 4-tab history panel + the #wallet-add modal KEEP their
          Bootstrap hook classes (`nav-tabs`/`nav-link`/`active` ·
          `tab-content`/`tab-pane`/`active` · `data-toggle="tab"` ·
          `data-dismiss="modal"` · the pane `href="#..."` targets) because
          the kept <link href="/legacy/pcs/wallet.css"> + the layout's jQuery
          drive tab show/hide + the auto-open <Script> off exactly those
          selectors. Visual polish layered via Tailwind around them. */}
      <div className="pcs-content-pad w-full px-3 md:px-6 py-3 md:py-6">
        {/* L89-100 — breadcrumb */}
        <nav aria-label="breadcrumb" className="mb-3 md:mb-4">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
            <li>
              <Link href="/dashboard" className="hover:text-foreground transition-colors">
                <span className="menu-home">{t("breadcrumbHome")}</span>
              </Link>
            </li>
            <li aria-hidden className="text-border">/</li>
            <li className="font-medium text-foreground" aria-current="page">
              {t("breadcrumbWallet")}
            </li>
          </ol>
        </nav>
        {/* L101 — content-body */}
        <section className="max-w-3xl mx-auto">
          {/* ── Wallet balance card — wallet.php L108-131 ── */}
          <div className="mx-auto max-w-lg">
            <div className="rounded-2xl border-2 border-red-500 bg-white dark:bg-surface shadow-sm p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="text-left">
                  <span className="block text-base font-semibold text-foreground">
                    {fullName}
                  </span>
                  <span className="block text-sm text-muted">
                    {t("walletBalanceBaht")}
                  </span>
                  <span
                    className="tam-counter notranslate block text-2xl md:text-3xl font-bold text-foreground mt-1"
                    data-count={walletTotal}
                  >
                    {numberFormat2(walletTotal)}
                  </span>
                </div>
                <div className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="brand-logo logo-wallet w-12 h-auto"
                    alt="logo"
                    src="/images/pacred-logo-red.png"
                  />
                </div>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-alt">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-500 to-orange-300"
                  role="progressbar"
                  style={{ width: "100%" }}
                  aria-valuenow={100}
                  aria-valuemin={0}
                  aria-valuemax={100}
                ></div>
              </div>
              <div className="mt-4 text-center">
                <Link href="/wallet/deposit">
                  <span className="inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-red-600 to-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity">
                    <i className="ft-plus"></i> {t("topUpWallet")}
                  </span>
                </Link>
              </div>
            </div>
          </div>

          {/* ── 4-tab wallet-history panel — wallet.php L132-227 ──
              KEEP the Bootstrap tab hooks (`nav nav-tabs` · `nav-item` ·
              `nav-link`/`active` · `data-toggle="tab"` · `href="#paneId"` ·
              `role` · `tab-content`/`tab-pane`/`active` · `load_data_*` ids):
              the kept wallet.css `.tab-content > .tab-pane{display:none}` +
              the layout jQuery toggle `active` to switch panes. Tailwind only
              adds the card frame + spacing around them. */}
          <div className="mt-4">
            <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
              <ul
                className="nav nav-tabs customtab tab-wallet flex border-b border-border overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="tablist"
              >
                <li className="nav-item tab-sm-center flex-1 min-w-max">
                  <a
                    className="nav-link active block px-3 py-3 text-center text-sm font-medium whitespace-nowrap"
                    data-toggle="tab"
                    href="#history"
                    role="tab"
                  >
                    <span className="hidden-sm-up">
                      <i className="fas fa-history pr-05"></i>
                    </span>
                    <span className="hidden-xs-down">
                      {t("tabHistory")}
                    </span>
                  </a>
                </li>
                <li className="nav-item tab-sm-center flex-1 min-w-max">
                  <a
                    className="nav-link block px-3 py-3 text-center text-sm font-medium whitespace-nowrap"
                    data-toggle="tab"
                    href="#wallet-hs-add"
                    role="tab"
                  >
                    <span className="hidden-sm-up">
                      <i className="la la-money pr-05"></i>
                    </span>
                    <span className="hidden-xs-down">
                      {t("tabDeposits")}
                    </span>
                  </a>
                </li>
                <li className="nav-item tab-sm-center flex-1 min-w-max">
                  <a
                    className="nav-link block px-3 py-3 text-center text-sm font-medium whitespace-nowrap"
                    data-toggle="tab"
                    href="#wallet-payment"
                    role="tab"
                  >
                    <span className="hidden-sm-up">
                      <i className="far fa-credit-card pr-05"></i>
                    </span>
                    <span className="hidden-xs-down">
                      {t("tabPayments")}
                    </span>
                  </a>
                </li>
                <li className="nav-item tab-sm-center flex-1 min-w-max">
                  <a
                    className="nav-link block px-3 py-3 text-center text-sm font-medium whitespace-nowrap"
                    data-toggle="tab"
                    href="#wallet-hs-withdraw"
                    role="tab"
                  >
                    <span className="hidden-sm-up">
                      <i className="far fa-handshake pr-05"></i>
                    </span>
                    <span className="hidden-xs-down">
                      {t("tabWithdrawals")}
                    </span>
                  </a>
                </li>
              </ul>
              <div className="tab-content p-3 md:p-4">
                <div
                  className="tab-pane active"
                  id="history"
                  role="tabpanel"
                >
                  <div id="load_data_wallet_hs" className="space-y-2">
                    {rowsHistory.length === 0 ? (
                      <div className="text-center text-no-data text-red-500 py-6">
                        {t("noTransactions")}
                      </div>
                    ) : (
                      rowsHistory.map((row) => (
                        <WalletHsRowView key={row.ID} row={row} t={t} />
                      ))
                    )}
                  </div>
                  <div id="load_data_message_wallet_hs"></div>
                </div>
                <div
                  className="tab-pane"
                  id="wallet-hs-add"
                  role="tabpanel"
                >
                  <div id="load_data_wallet_hs_add" className="space-y-2">
                    {rowsAdd.length === 0 ? (
                      <div className="text-center text-no-data text-red-500 py-6">
                        {t("noTransactions")}
                      </div>
                    ) : (
                      rowsAdd.map((row) => (
                        <WalletHsRowView key={row.ID} row={row} t={t} />
                      ))
                    )}
                  </div>
                  <div id="load_data_message_wallet_hs_add"></div>
                </div>
                <div
                  className="tab-pane"
                  id="wallet-payment"
                  role="tabpanel"
                >
                  <div id="load_data_wallet_hs_payments" className="space-y-2">
                    {rowsPayments.length === 0 ? (
                      <div className="text-center text-no-data text-red-500 py-6">
                        {t("noTransactions")}
                      </div>
                    ) : (
                      rowsPayments.map((row) => (
                        <WalletHsRowView key={row.ID} row={row} t={t} />
                      ))
                    )}
                  </div>
                  <div id="load_data_message_wallet_payments"></div>
                </div>
                <div
                  className="tab-pane"
                  id="wallet-hs-withdraw"
                  role="tabpanel"
                >
                  <div id="load_data_wallet_hs_withdraw" className="space-y-2">
                    {rowsWithdraw.length === 0 ? (
                      <div className="text-center text-no-data text-red-500 py-6">
                        {t("noTransactions")}
                      </div>
                    ) : (
                      rowsWithdraw.map((row) => (
                        <WalletHsRowView key={row.ID} row={row} t={t} />
                      ))
                    )}
                  </div>
                  <div id="load_data_message_wallet_hs_withdraw"></div>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* ── Deposit modal — wallet.php L233-283 ──
            In legacy, the L294-302 inline <script> auto-opens this
            via $("#wallet-add").modal("show") because `?page=='add'`.
            KEEP the Bootstrap modal hooks (`modal`/`modal-dialog`/
            `modal-content` · `data-dismiss="modal"` · `close`): the
            layout's jQuery `$.fn.modal` + the auto-open <Script> read
            exactly those. Tailwind restyles the dialog/header/body frame
            (Bootstrap modal CSS is not in the kept wallet.css) + centers
            the deposit form `max-w-xl`.
            The `addData` POST handler (wallet.php L4-51) is wired via the
            <LegacyDepositForm> Client Component →
            actions/wallet.ts::submitLegacyWalletDeposit (INSERT
            tb_wallet_hs + slip upload to `slips` bucket + in-app notify;
            LINE Notify replaced by the in-app feed since LINE Notify
            EOL'd Apr 2025). */}
        <div
          id="wallet-add"
          className="modal fade in fixed inset-0 z-50 overflow-y-auto bg-black/50 p-3 md:p-6"
          tabIndex={-1}
          role="dialog"
          aria-hidden="true"
        >
          <div className="modal-dialog mx-auto w-full max-w-xl my-6">
            <div className="modal-content rounded-2xl border border-border bg-white dark:bg-surface shadow-lg overflow-hidden">
              <div className="modal-header header-from flex items-center justify-between border-b border-border px-4 py-3 md:px-5 md:py-4">
                <h4 className="modal-title text-base md:text-lg font-bold text-foreground">
                  {t("modalTitle")}
                </h4>
                <button
                  type="button"
                  className="close inline-flex items-center justify-center w-9 h-9 rounded-lg text-muted hover:bg-surface-alt hover:text-foreground transition-colors"
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
              <div className="modal-body header-from px-4 py-4 md:px-5">
                <LegacyDepositForm kind="wallet" />
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* END: Content — wallet.php L288 */}

      {/* wallet.php L294-302 — auto-open the #wallet-add modal because
          ?page=='add' (Pacred routes this URL at /wallet/deposit, which
          matches the legacy `?page=add` branch).
          Poll for $ — both this script and vendors.min.js (jQuery 537KB)
          are strategy="afterInteractive" and race; the small script wins
          the race and hits "$ is not defined" without the poll guard. */}
      <Script
        id="wallet-deposit-auto-open"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function waitForJQuery() {
              if (typeof window.$ !== 'undefined' && typeof window.$.fn.modal !== 'undefined') {
                window.$("#wallet-add").modal("show");
              } else {
                setTimeout(waitForJQuery, 50);
              }
            })();
          `,
        }}
      />
    </div>
  );
}

/**
 * One wallet-history row — a 1:1 transcription of the markup
 * `include/pages/wallet/load_wallet_hs.php` L22-43 emits per row,
 * including the legacy `nameWallet()` / `DateThaiWallet()` helpers and
 * the `$nameColor` +/- logic (L20).
 */
function WalletHsRowView({
  row,
  t,
}: {
  row: WalletHsRow;
  t: (key: string) => string;
}) {
  const nameColor = row.type === "1" || row.type === "5" ? "success" : "danger";
  const sign = nameColor === "success" ? "+" : "-";
  const { date, time } = dateThaiWallet(row.date);
  const nameParts = nameWallet(row.type ?? "", t).split("\n");

  // amount sign colour — legacy $nameColor (success = เงินเข้า / danger = เงินออก)
  const amountColor =
    nameColor === "success" ? "text-emerald-600" : "text-red-600";

  return (
    <div className="rounded-xl border border-border bg-white dark:bg-surface px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-left">
          <h4 className="text-sm md:text-base font-semibold text-foreground leading-snug">
            {nameParts.map((part, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {part}
              </span>
            ))}
          </h4>
          <span className="block text-xs text-muted mt-0.5">
            {t("transactionNo")} #{row.ID}
          </span>
          {row.refOrder != null && row.refOrder !== "" && (
            <span className="block text-xs text-muted">
              {t("orderNo")}{" "}
              {row.type === "2" ? (
                <a
                  href={`/service-order/${row.refOrder}`}
                  target="_blank"
                  className="text-red-600 hover:underline"
                >
                  {row.refOrder}
                </a>
              ) : row.type === "4" ? (
                <a
                  href={`/service-import/${row.refOrder}`}
                  target="_blank"
                  className="text-red-600 hover:underline"
                >
                  {row.refOrder}
                </a>
              ) : (
                row.refOrder
              )}
            </span>
          )}
          <div className="mt-1.5">{statusBadge(row.status, t)}</div>
        </div>
        <div className="shrink-0 text-right">
          <h4 className={`text-base md:text-lg font-bold ${amountColor}`}>
            {sign}
            {numberFormat2(row.amount)}
          </h4>
          <span className="block text-xs text-muted leading-snug">
            {date}
            <br />
            {time}
          </span>
        </div>
      </div>
    </div>
  );
}

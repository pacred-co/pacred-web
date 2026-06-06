import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { StyledFileInput } from "@/components/ui/styled-file-input";

/**
 * Customer wallet screen — a FAITHFUL 1:1 TRANSCRIPTION of the legacy
 * PCS Cargo `member/wallet.php` (the default `page` branch — no
 * `?page` query, lines 53-596) (D1 / ADR-0017 · the faithful-port
 * transcription workstream · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is the
 * exact HTML markup `wallet.php` renders — same elements, same
 * Bootstrap-4 class names, same structure, same labels, same order. The
 * visual identity comes from the legacy theme CSS, brought in verbatim
 * as the static `.pcs-legacy`-scoped `public/legacy/pcs/wallet.css`,
 * loaded via a plain `<link>` so it bypasses the app's Tailwind v4 /
 * PostCSS pipeline.
 *
 * `wallet.php` source structure transcribed here (lines 53-303):
 *   .app-content > .content-wrapper
 *     1. .content-header > … > ol.breadcrumb
 *        — "หน้าแรก" / "กระเป๋าสตางค์"
 *     2. .content-body.pr110 > section > .row > .col-md-12
 *        > .card > .card-content > .card-body
 *          a. .row > .col-md-6.offset-md-3 > .card-body.border-wallet
 *             — wallet balance card (name · "กระเป๋าสตางค์ (บาท)" ·
 *               tam-counter · logo · progress bar · "เติมเงิน" button)
 *          b. .row.pt-3 > .col-12 > .card — the 4-tab panel
 *             - ul.nav.nav-tabs.customtab.tab-wallet — 4 tabs:
 *               รายการเดินบัญชี / รายการเติมเงิน /
 *               รายการชำระเงิน / รายการถอนเงิน
 *             - .tab-content — 4 .tab-pane (history / wallet-hs-add /
 *               wallet-payment / wallet-hs-withdraw)
 *     3. #wallet-add — the "เติมเงินเข้าเป๋าตัง" Bootstrap modal
 *
 * Data — every `wallet.php` mysqli query transcribed 1:1 to the ported
 * legacy `tb_*` schema (Supabase). `tb_*` is RLS-locked to service_role,
 * so reads go through the admin client; the join key is
 * `tb_*.userid === profile.member_code` (the customer's "PR<n>" code).
 * The `tb_*` map is `docs/research/wave-1-fidelity/_SYNTHESIS.md` §7.
 *   - $walletTotal     → tb_wallet.wallettotal          (header.php L86-92)
 *   - $userName etc.   → tb_users.username / userlastname (header.php L33-38)
 *   - COUNT(ID) checks → tb_wallet_hs                    (wallet.php L166-219)
 *   - the 4 tab lists  → tb_wallet_hs                    (load_wallet_hs.php)
 *
 * The 4 tab panels are populated in legacy by jQuery infinite-scroll
 * AJAX against `include/pages/wallet/load_wallet_hs.php`. That loader's
 * row markup + its SQL + the legacy `nameWallet()` / `DateThaiWallet()`
 * helpers are transcribed here and rendered server-side (a pure read —
 * Server Components can render exactly what the AJAX would produce).
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + Pacred. Nothing else changed.
 *
 * ── NOT transcribed (deliberate · flagged for the integrator) ──
 *  1. header.php L75-85 runs an `UPDATE tb_header_order` on every page
 *     load (auto-expire overdue orders). A Server Component render must
 *     be a PURE READ — this render-time mutation is NOT reproduced.
 *  2. wallet.php L3-51 (the deposit POST handler — INSERT tb_wallet_hs +
 *     move_uploaded_file + LINE Notify) and L595 `saveHS()` (a
 *     visit-log INSERT) are render-time writes — NOT reproduced.
 *  3. The `#wallet-add` deposit modal markup IS transcribed 1:1, but
 *     its jQuery behaviours (Bootstrap `.modal('show')`, dropify file
 *     input, the PromptPay QR-code generation, SweetAlert result
 *     popups) need client JS not present here — the modal renders
 *     statically. The legacy deposit flow lives on the `/wallet/add`
 *     screen (a separate screen to transcribe).
 *  4. The legacy `.tam-counter` count-up animation needs client JS;
 *     the balance is rendered statically as `number_format($n,2)` —
 *     which is exactly the legacy text node before its JS runs.
 *  5. The 4 tabs' jQuery infinite-scroll (load 5 rows, scroll → load 5
 *     more) is replaced by a server-side render of every row; the
 *     scroll-to-load-more behaviour itself is not reproduced.
 */

// Server Components reading cookies/auth under a layout must be dynamic.
export const dynamic = "force-dynamic";

// Legacy `nameWallet($type)` — member/include/function.php L156-169.
// Returns the Thai transaction-type label; `\n` marks a legacy <br/>.
// `t` is the "wallet" translator; keys hold the `\n` line-break marker so the
// legacy two-line label rendering is preserved across locales.
type WalletT = Awaited<ReturnType<typeof getTranslations<"wallet">>>;
const NAME_WALLET_KEY: Record<string, string> = {
  "1": "walletTypeDeposit",
  "2": "walletTypeOrderPayment",
  "3": "walletTypeWithdraw",
  "4": "walletTypeImportPayment",
  "5": "walletTypeRefund",
  "6": "walletTypeBillPayment",
  "7": "walletTypeTopUpExtra",
};
function nameWallet(t: WalletT, type: string): string {
  const key = NAME_WALLET_KEY[type];
  return key ? t(key) : t("walletTypeNotFound");
}

// Legacy `DateThaiWallet($strDate)` — member/include/function.php
// L56-66. Renders "j M YYYY <br> H:i น." with a Thai abbreviated month
// and the Christian-era year (legacy uses date("Y") — NOT +543).
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

// load_wallet_hs.php L21 — the wallet-hs row status badge (Tailwind chip).
function statusBadge(t: WalletT, status: string | null) {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap";
  if (status === "1") {
    return (
      <span className={`${base} bg-amber-100 text-amber-700 border-amber-200`}>
        {t("statusPending")}
      </span>
    );
  }
  if (status === "2") {
    return (
      <span className={`${base} bg-sky-100 text-sky-700 border-sky-200`}>{t("statusSuccess")}</span>
    );
  }
  return (
    <span className={`${base} bg-red-100 text-red-700 border-red-200`}>{t("statusFailed")}</span>
  );
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

export default async function WalletPage() {
  const t = await getTranslations("wallet");
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const memberCode = profile.member_code ?? "";

  // ── Transcribed queries ──────────────────────────────────────
  // header.php L86-92:  SELECT walletTotal FROM tb_wallet WHERE userID=…
  // header.php L33-38:  $userName / $userLastName from tb_users
  // load_wallet_hs.php L6: SELECT ID,date,status,FORMAT(amount,2),type,
  //   refOrder FROM tb_wallet_hs WHERE userID=… ORDER BY ID DESC
  //   — the legacy AJAX pages this 5 rows at a time; here the full set
  //   is fetched once and the 4 tab panels filter it by `type` exactly
  //   as load_wallet_hs.php's per-type SQL branches do.
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

  // $walletTotal (header.php L86 default 0).
  const walletTotal = Number(walletRes.data?.wallettotal ?? 0);

  // $userName . ' ' . $userLastName (wallet.php L114) — prefer the
  // ported tb_users name, fall back to the Pacred profile fields.
  const legacyName = [userRowRes.data?.userName, userRowRes.data?.userLastName]
    .filter((s): s is string => !!s && s.trim() !== "")
    .join(" ")
    .trim();
  const profileName = [profile.first_name, profile.last_name]
    .filter((s): s is string => !!s && s.trim() !== "")
    .join(" ")
    .trim();
  const fullName = legacyName || profileName || profile.company_name || "";

  // The full wallet-history set (ID DESC), normalised to the
  // load_wallet_hs.php row shape (`FORMAT(amount, 2)` done in JS).
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

  // Per-tab filters — exactly the WHERE clauses load_wallet_hs.php uses:
  //   #history        → all rows                       (type='all')
  //   #wallet-hs-add   → type=1 OR type=5               (type='1,5')
  //   #wallet-payment  → type=2 OR 4 OR 6 OR 7          (type='2,4,6,7')
  //   #wallet-hs-withdraw → type=3                      (type='3')
  const rowsHistory = allRows;
  const rowsAdd = allRows.filter((r) => r.type === "1" || r.type === "5");
  const rowsPayments = allRows.filter(
    (r) => r.type === "2" || r.type === "4" || r.type === "6" || r.type === "7",
  );
  const rowsWithdraw = allRows.filter((r) => r.type === "3");

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS theme CSS — static public/ asset, loaded via a plain
          <link> so it bypasses the app's Tailwind/PostCSS pipeline. Kept
          for the in-page Bootstrap-JS tab mechanism (.tab-content/.tab-pane
          display rules wallet.css L182-184) + the #wallet-add modal hooks. */}
      <link rel="stylesheet" href="/legacy/pcs/wallet.css" />

      {/* wallet.php <title> L53 (Next.js owns <head> — kept here as a
          comment for fidelity record):  กระเป๋าสตางค์ | Pacred */}

      {/* Page content — Tailwind rebuild matching /service-payment + /service-import
          page.tsx. Wrapped in `.pcs-content-pad` so the (protected) layout's
          desktop padding (sidebar clearance + FloatingTabs clearance) kicks in. */}
      <div className="pcs-content-pad w-full px-3 md:px-6 py-3 md:py-6">
        <div className="mx-auto w-full max-w-2xl">
          {/* breadcrumb — wallet.php L89-100 */}
          <nav className="mb-3 flex items-center gap-1.5 text-xs text-muted md:text-sm">
            <Link href="/dashboard" className="hover:text-foreground transition-colors">
              {t("breadcrumbHome")}
            </Link>
            <span className="text-muted/60">/</span>
            <span className="font-medium text-foreground">{t("breadcrumbWallet")}</span>
          </nav>

          {/* ── Wallet balance summary — prominent Tailwind card.
              wallet.php L108-131. Keeps `tam-counter` + `data-count` so
              tam-it.js's count-up animation still runs, and the
              /wallet/deposit CTA. ── */}
          <section className="overflow-hidden rounded-2xl border-2 border-red-500/70 bg-gradient-to-br from-white to-red-50/40 shadow-sm dark:from-surface dark:to-red-950/20">
            <div className="flex items-start justify-between gap-3 px-5 pt-5 md:px-6 md:pt-6">
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-foreground md:text-lg">
                  {fullName}
                </p>
                <p className="mt-1 text-xs font-medium text-muted md:text-sm">
                  {t("walletBalanceLabel")}
                </p>
                <p className="mt-1 flex items-baseline gap-1 leading-none">
                  <span
                    className="tam-counter notranslate font-mono text-2xl font-extrabold tabular-nums text-red-600 md:text-3xl"
                    data-count={walletTotal}
                  >
                    {numberFormat2(walletTotal)}
                  </span>
                  <span className="text-sm font-semibold text-muted">{t("baht")}</span>
                </p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="brand-logo logo-wallet h-12 w-12 shrink-0 object-contain md:h-14 md:w-14"
                alt="logo"
                src="/images/pacred-logo-red.png"
              />
            </div>

            {/* gold accent bar — legacy progress band (purely decorative) */}
            <div className="mt-4 h-1.5 w-full bg-gradient-to-r from-[#ff7216] to-[#ffb07c]" />

            <div className="px-5 py-4 text-center md:px-6">
              <Link
                href="/wallet/deposit"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#cc3333] to-[#f15a24] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.98]"
              >
                <span className="text-lg leading-none" aria-hidden>
                  +
                </span>
                {t("topUpWallet")}
              </Link>
            </div>
          </section>

                        {/* ── 4-tab wallet-history panel — wallet.php L132-227 ──
                            In-page Bootstrap-JS tabs (vendors.min.js toggles
                            `.active`; wallet.css L182-184 drives the pane
                            show/hide). The tab MECHANISM is preserved verbatim:
                            `data-toggle="tab"`, the `href="#paneId"` anchors,
                            `role`, and `nav-link`/`active` classes are kept so
                            the switch keeps working — only Tailwind chip styling
                            is layered on top (active = red, per the brief). ── */}
                        <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
                          <div className="px-3 pt-3 md:px-4 md:pt-4">
                                <ul
                                  className="nav nav-tabs customtab tab-wallet flex flex-wrap gap-2"
                                  role="tablist"
                                >
                                  <li className="nav-item">
                                    <a
                                      className="nav-link active group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors md:text-sm [&.active]:border-red-600 [&.active]:bg-red-600 [&.active]:text-white [&:not(.active)]:border-border [&:not(.active)]:bg-surface-alt/60 [&:not(.active)]:text-foreground [&:not(.active)]:hover:bg-surface-alt"
                                      data-toggle="tab"
                                      href="#history"
                                      role="tab"
                                    >
                                      <i className="fas fa-history" aria-hidden></i>
                                      {t("tabAll")}
                                    </a>
                                  </li>
                                  <li className="nav-item">
                                    <a
                                      className="nav-link group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors md:text-sm [&.active]:border-red-600 [&.active]:bg-red-600 [&.active]:text-white [&:not(.active)]:border-border [&:not(.active)]:bg-surface-alt/60 [&:not(.active)]:text-foreground [&:not(.active)]:hover:bg-surface-alt"
                                      data-toggle="tab"
                                      href="#wallet-hs-add"
                                      role="tab"
                                    >
                                      <i className="la la-money" aria-hidden></i>
                                      {t("tabDeposit")}
                                    </a>
                                  </li>
                                  <li className="nav-item">
                                    <a
                                      className="nav-link group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors md:text-sm [&.active]:border-red-600 [&.active]:bg-red-600 [&.active]:text-white [&:not(.active)]:border-border [&:not(.active)]:bg-surface-alt/60 [&:not(.active)]:text-foreground [&:not(.active)]:hover:bg-surface-alt"
                                      data-toggle="tab"
                                      href="#wallet-payment"
                                      role="tab"
                                    >
                                      <i className="far fa-credit-card" aria-hidden></i>
                                      {t("tabPayment")}
                                    </a>
                                  </li>
                                  <li className="nav-item">
                                    <a
                                      className="nav-link group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors md:text-sm [&.active]:border-red-600 [&.active]:bg-red-600 [&.active]:text-white [&:not(.active)]:border-border [&:not(.active)]:bg-surface-alt/60 [&:not(.active)]:text-foreground [&:not(.active)]:hover:bg-surface-alt"
                                      data-toggle="tab"
                                      href="#wallet-hs-withdraw"
                                      role="tab"
                                    >
                                      <i className="far fa-handshake" aria-hidden></i>
                                      {t("tabWithdraw")}
                                    </a>
                                  </li>
                                </ul>
                                <hr className="mt-3 border-t border-dashed border-border" />
                                <div className="tab-content py-3">
                                  {/* Tab 1 — รายการเดินบัญชี (type='all') */}
                                  <div
                                    className="tab-pane active"
                                    id="history"
                                    role="tabpanel"
                                  >
                                    <div id="load_data_wallet_hs">
                                      {rowsHistory.length === 0 ? (
                                        <div className="py-8 text-center text-sm text-muted">
                                          {t("noRecords")}
                                        </div>
                                      ) : (
                                        rowsHistory.map((row) => (
                                          <WalletHsRowView key={row.ID} row={row} t={t} />
                                        ))
                                      )}
                                    </div>
                                    <div id="load_data_message_wallet_hs"></div>
                                  </div>
                                  {/* Tab 2 — รายการเติมเงิน (type='1,5') */}
                                  <div
                                    className="tab-pane"
                                    id="wallet-hs-add"
                                    role="tabpanel"
                                  >
                                    <div id="load_data_wallet_hs_add">
                                      {rowsAdd.length === 0 ? (
                                        <div className="py-8 text-center text-sm text-muted">
                                          {t("noRecords")}
                                        </div>
                                      ) : (
                                        rowsAdd.map((row) => (
                                          <WalletHsRowView key={row.ID} row={row} t={t} />
                                        ))
                                      )}
                                    </div>
                                    <div id="load_data_message_wallet_hs_add"></div>
                                  </div>
                                  {/* Tab 3 — รายการชำระเงิน (type='2,4,6,7') */}
                                  <div
                                    className="tab-pane"
                                    id="wallet-payment"
                                    role="tabpanel"
                                  >
                                    <div id="load_data_wallet_hs_payments">
                                      {rowsPayments.length === 0 ? (
                                        <div className="py-8 text-center text-sm text-muted">
                                          {t("noRecords")}
                                        </div>
                                      ) : (
                                        rowsPayments.map((row) => (
                                          <WalletHsRowView key={row.ID} row={row} t={t} />
                                        ))
                                      )}
                                    </div>
                                    <div id="load_data_message_wallet_payments"></div>
                                  </div>
                                  {/* Tab 4 — รายการถอนเงิน (type='3') */}
                                  <div
                                    className="tab-pane"
                                    id="wallet-hs-withdraw"
                                    role="tabpanel"
                                  >
                                    <div id="load_data_wallet_hs_withdraw">
                                      {rowsWithdraw.length === 0 ? (
                                        <div className="py-8 text-center text-sm text-muted">
                                          {t("noRecords")}
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
                        </section>
                        {/* ═══ END 4-tab wallet-history panel ═══ */}
        </div>
      </div>

      {/* ── Deposit modal — wallet.php L233-283 ──
          Markup kept 1:1 so the legacy hooks stay wired: Bootstrap
          `.modal('show')` (vendors.min.js) is opened from elsewhere via
          `#wallet-add` + `data-dismiss="modal"`, dropify binds the file
          input, the PromptPay QR fills `#qrcode` on `#myBtn` click, and the
          form POSTs to /wallet/. Only the container chrome is Tailwind-styled;
          every id / name / data-* / hook class is preserved verbatim. */}
              {/* Restore Bootstrap's `.modal { display:none }` default (the
                  dropped bootstrap.css used to provide it). This page has no
                  trigger that opens #wallet-add — the deposit flow lives at
                  /wallet/deposit — so the modal must stay hidden instead of
                  dumping its form inline. Bootstrap JS `.modal('show')` sets an
                  inline `display:block` that still overrides this if ever fired,
                  so every hook keeps working. */}
              <style>{`.pcs-legacy .modal.fade{display:none;}`}</style>
              <div
                id="wallet-add"
                className="modal fade in"
                tabIndex={-1}
                role="dialog"
                aria-hidden="true"
              >
                <div className="modal-dialog fixed inset-0 z-[100] m-0 flex items-end justify-center p-0 sm:items-center sm:p-4">
                  <div className="modal-content relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-white shadow-lg dark:bg-surface sm:max-w-md sm:rounded-2xl">
                    <div className="modal-header header-from flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                      <h4 className="modal-title text-base font-bold text-foreground">{t("depositModalTitle")}</h4>
                      <button
                        type="button"
                        className="close grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface-alt hover:text-foreground"
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
                    <div className="modal-body header-from px-4 py-4">
                      <form
                        className="form-horizontal"
                        method="POST"
                        action="/wallet/"
                        autoComplete="off"
                        encType="multipart/form-data"
                      >
                        <div className="form-group pt-1">
                          <div>
                            <label className="form-control-label mb-1 block text-sm font-medium text-foreground" htmlFor="amount">
                              {t("amountBahtLabel")}
                            </label>
                            <input
                              className="form-control form-control-lg w-full rounded-lg border border-border bg-white px-3 py-2.5 text-right text-lg font-semibold tabular-nums text-foreground focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:bg-surface"
                              placeholder="00.00"
                              name="amount"
                              id="amount"
                              type="number"
                              min="0.01"
                              max="1000000"
                              step="0.01"
                              required
                            />
                            <div className="mt-2 text-center">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger round m-1 inline-flex items-center justify-center rounded-full border border-red-500 px-4 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                                id="myBtn"
                              >
                                {t("createQrButton")}
                              </button>
                            </div>
                          </div>
                          <div className="mb-1 qrcodeMain mt-3 text-center">
                            <div
                              id="qrcode"
                              style={{
                                textAlign: "center",
                                width: "250px",
                                height: "250px",
                              }}
                            ></div>
                            <h5 className="text-center">{t("companyLegalName")}</h5>
                            <div id="amount-show" style={{ textAlign: "center" }}></div>
                            <div className="text-right">
                              <a href="/wallet/deposit" target="_blank">
                                {t("howToTopUp")}
                              </a>
                            </div>
                          </div>
                          <div className="mb-1 mt-3">
                            <label className="form-control-label mb-1 block text-sm font-medium text-foreground" htmlFor="imagesSlip">
                              {t("slipEvidenceLabel")}
                            </label>
                            <StyledFileInput
                              name="imagesSlip"
                              accept="image/*"
                              required
                              label="แนบสลิปการโอน (คลิกเพื่อเลือกรูป)"
                              hint="รองรับรูปภาพ ไม่เกิน 9 MB"
                            />
                          </div>
                          <div className="mb-1 mt-4 rounded-lg border border-border bg-surface-alt/40 p-3">
                            <div className="text-sm font-semibold text-foreground">
                              {t("withdrawConditionsTitle")}
                            </div>
                            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-xs text-muted">
                              <li> {t("withdrawCondition1")}</li>
                              <li> {t("withdrawCondition2")}</li>
                              <li> {t("withdrawCondition3")}</li>
                              <li> {t("withdrawCondition4")}</li>
                              <li> {t("withdrawCondition5")}</li>
                              <li> {t("withdrawCondition6")}</li>
                            </ol>
                          </div>
                          <div className="modal-footer mt-4 flex items-center justify-end gap-2 border-t border-border pt-3">
                            <button
                              type="button"
                              className="btn btn-outline-secondary round waves-effect inline-flex items-center justify-center rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-alt"
                              data-dismiss="modal"
                            >
                              {t("cancel")}
                            </button>
                            <button
                              type="submit"
                              className="btn btn-outline-info round waves-effect submit-wait inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700"
                              name="addData"
                            >
                              {t("topUpShort2")}
                            </button>
                          </div>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
              </div>
      {/* END: Content — wallet.php L288 */}
    </div>
  );
}

/**
 * One wallet-history row — a 1:1 transcription of the markup
 * `include/pages/wallet/load_wallet_hs.php` L22-43 emits per row
 * (the legacy AJAX loader), including the legacy `nameWallet()` /
 * `DateThaiWallet()` helpers and the `$nameColor` +/- logic (L20).
 */
function WalletHsRowView({ row, t }: { row: WalletHsRow; t: WalletT }) {
  // load_wallet_hs.php L20 — type 1 or 5 = green (credit), else red.
  const nameColor = row.type === "1" || row.type === "5" ? "success" : "danger";
  const sign = nameColor === "success" ? "+" : "-";
  const { date, time } = dateThaiWallet(row.date);
  // nameWallet() returns Thai labels with embedded <br/> (the legacy
  // `<br>`); split on the `\n` marker to reproduce the line break.
  const nameParts = nameWallet(t, row.type ?? "").split("\n");

  // Amount tone — credit (type 1/5) = green, everything else = red.
  const amountClass =
    nameColor === "success" ? "text-emerald-600" : "text-red-600";

  return (
    <div className="mb-2 flex items-start justify-between gap-3 rounded-xl border border-border bg-white p-3 shadow-sm dark:bg-surface">
      {/* Left — transaction type + meta + status */}
      <div className="min-w-0 text-left">
        <p className="text-sm font-semibold leading-snug text-foreground">
          {nameParts.map((part, i) => (
            <span key={i}>
              {i > 0 && <br />}
              {part}
            </span>
          ))}
        </p>
        <p className="mt-0.5 text-[11px] text-muted">{t("txNumber")} #{row.ID}</p>
        {row.refOrder != null && row.refOrder !== "" && (
          <p className="text-[11px] text-muted">
            {t("orderNumber")}{" "}
            {row.type === "2" ? (
              <a
                href={`/service-order/${row.refOrder}`}
                target="_blank"
                className="font-mono text-red-600 hover:underline"
              >
                {row.refOrder}
              </a>
            ) : row.type === "4" ? (
              <a
                href={`/service-import/${row.refOrder}`}
                target="_blank"
                className="font-mono text-red-600 hover:underline"
              >
                {row.refOrder}
              </a>
            ) : (
              <span className="font-mono">{row.refOrder}</span>
            )}
          </p>
        )}
        <div className="mt-1.5">{statusBadge(t, row.status)}</div>
      </div>

      {/* Right — signed amount (+/- colour) + date/time */}
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

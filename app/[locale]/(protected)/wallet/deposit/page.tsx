import Script from "next/script";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { LegacyDepositForm } from "./legacy-deposit-form";

/**
 * Customer "เติมเงินเข้ากระเป๋า" (wallet deposit) screen — a FAITHFUL 1:1
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

// PHP `number_format($n, 2)` — 2 decimals, comma thousands separator.
function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// load_wallet_hs.php L21 — status badge.
function statusBadge(status: string | null) {
  if (status === "1") {
    return <span className="badge badge-warning badge-pill">รอตรวจสอบ</span>;
  }
  if (status === "2") {
    return <span className="badge badge-info badge-pill">สำเร็จ</span>;
  }
  return <span className="badge badge-danger badge-pill">ไม่สำเร็จ</span>;
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

      {/* BEGIN: Content — wallet.php L85 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* L89-100 — breadcrumb */}
          <div className="content-header row">
            <div className="content-header-left col-12 mb-2">
              <div className="row breadcrumbs-top ">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb ">
                    <li className="breadcrumb-item">
                      <Link href="/dashboard">
                        <span className="menu-home">หน้าแรก</span>
                      </Link>
                    </li>
                    <li className="breadcrumb-item active">กระเป๋าสตางค์ </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
          {/* L101 — content-body */}
          <div className="content-body pr110">
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        {/* ── Wallet balance card — wallet.php L108-131 ── */}
                        <div className="row">
                          <div className="col-md-6 offset-md-3">
                            <div className="card-body border-wallet pb-0">
                              <div className="media d-flex">
                                <div className="media-body text-left">
                                  <h3 className="warning mb-0">
                                    <span className="text-black-1">{fullName}</span>
                                    <br />
                                    <span className="text-black-1 font-14 ">
                                      กระเป๋าสตางค์ (บาท)
                                    </span>
                                    <br />
                                    <span
                                      className="tam-counter font-3rem notranslate"
                                      data-count={walletTotal}
                                    >
                                      {numberFormat2(walletTotal)}
                                    </span>
                                    <br />
                                  </h3>
                                </div>
                                <div>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    className="brand-logo logo-wallet"
                                    alt="logo"
                                    src="/images/pacred-logo-red.png"
                                  />
                                </div>
                              </div>
                              <div className="progress progress-sm mt-1 mb-0 box-shadow-2">
                                <div
                                  className="progress-bar bg-gradient-x-warning"
                                  role="progressbar"
                                  style={{ width: "100%" }}
                                  aria-valuenow={100}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                ></div>
                              </div>
                              <div
                                className="text-center pt-1"
                                style={{ marginBottom: "-20px" }}
                              >
                                <Link href="/wallet/deposit">
                                  <div className="btn-add-wallet">
                                    {" "}
                                    <i className="ft-plus"></i> เติมเงินเข้ากระเป๋า{" "}
                                  </div>
                                </Link>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* ── 4-tab wallet-history panel — wallet.php L132-227 ── */}
                        <div className="row pt-3">
                          <div className="col-12">
                            <div className="card">
                              <div className="pt-0">
                                <ul
                                  className="nav nav-tabs customtab tab-wallet"
                                  role="tablist"
                                >
                                  <li className="nav-item tab-sm-center">
                                    <a
                                      className="nav-link active"
                                      data-toggle="tab"
                                      href="#history"
                                      role="tab"
                                    >
                                      <span className="hidden-sm-up">
                                        <i className="fas fa-history pr-05"></i>
                                      </span>
                                      <span className="hidden-xs-down">
                                        รายการเดินบัญชี
                                      </span>
                                    </a>
                                  </li>
                                  <li className="nav-item tab-sm-center">
                                    <a
                                      className="nav-link"
                                      data-toggle="tab"
                                      href="#wallet-hs-add"
                                      role="tab"
                                    >
                                      <span className="hidden-sm-up">
                                        <i className="la la-money pr-05"></i>
                                      </span>
                                      <span className="hidden-xs-down">
                                        รายการเติมเงิน
                                      </span>
                                    </a>
                                  </li>
                                  <li className="nav-item tab-sm-center">
                                    <a
                                      className="nav-link"
                                      data-toggle="tab"
                                      href="#wallet-payment"
                                      role="tab"
                                    >
                                      <span className="hidden-sm-up">
                                        <i className="far fa-credit-card pr-05"></i>
                                      </span>
                                      <span className="hidden-xs-down">
                                        รายการชำระเงิน
                                      </span>
                                    </a>
                                  </li>
                                  <li className="nav-item tab-sm-center">
                                    <a
                                      className="nav-link"
                                      data-toggle="tab"
                                      href="#wallet-hs-withdraw"
                                      role="tab"
                                    >
                                      <span className="hidden-sm-up">
                                        <i className="far fa-handshake pr-05"></i>
                                      </span>
                                      <span className="hidden-xs-down">
                                        รายการถอนเงิน
                                      </span>
                                    </a>
                                  </li>
                                </ul>
                                <div className="tab-content">
                                  <div
                                    className="tab-pane active"
                                    id="history"
                                    role="tabpanel"
                                  >
                                    <div id="load_data_wallet_hs">
                                      {rowsHistory.length === 0 ? (
                                        <div className="text-center text-no-data text-danger">
                                          คุณยังไม่มีรายการ
                                        </div>
                                      ) : (
                                        rowsHistory.map((row) => (
                                          <WalletHsRowView key={row.ID} row={row} />
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
                                    <div id="load_data_wallet_hs_add">
                                      {rowsAdd.length === 0 ? (
                                        <div className="text-center text-no-data text-danger">
                                          คุณยังไม่มีรายการ
                                        </div>
                                      ) : (
                                        rowsAdd.map((row) => (
                                          <WalletHsRowView key={row.ID} row={row} />
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
                                    <div id="load_data_wallet_hs_payments">
                                      {rowsPayments.length === 0 ? (
                                        <div className="text-center text-no-data text-danger">
                                          คุณยังไม่มีรายการ
                                        </div>
                                      ) : (
                                        rowsPayments.map((row) => (
                                          <WalletHsRowView key={row.ID} row={row} />
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
                                    <div id="load_data_wallet_hs_withdraw">
                                      {rowsWithdraw.length === 0 ? (
                                        <div className="text-center text-no-data text-danger">
                                          คุณยังไม่มีรายการ
                                        </div>
                                      ) : (
                                        rowsWithdraw.map((row) => (
                                          <WalletHsRowView key={row.ID} row={row} />
                                        ))
                                      )}
                                    </div>
                                    <div id="load_data_message_wallet_hs_withdraw"></div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* ── Deposit modal — wallet.php L233-283 ──
                  In legacy, the L294-302 inline <script> auto-opens this
                  via $("#wallet-add").modal("show") because `?page=='add'`.
                  Transcribed 1:1; the auto-open script needs Bootstrap-4
                  jQuery (loaded by the protected layout) — the modal
                  markup itself is identical to wallet.php's modal.
                  The `addData` POST handler (wallet.php L4-51) is wired
                  via the <LegacyDepositForm> Client Component →
                  actions/wallet.ts::submitLegacyWalletDeposit (INSERT
                  tb_wallet_hs + slip upload to `slips` bucket + in-app
                  notify; LINE Notify replaced by the in-app feed
                  because LINE Notify EOL'd Apr 2025). */}
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
                      <h4 className="modal-title">เติมเงินเข้าเป๋าตัง Pacred</h4>
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
                      <LegacyDepositForm kind="wallet" />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
      {/* END: Content — wallet.php L288 */}

      {/* wallet.php L294-302 — auto-open the #wallet-add modal because
          ?page=='add' (Pacred routes this URL at /wallet/deposit, which
          matches the legacy `?page=add` branch). */}
      <Script
        id="wallet-deposit-auto-open"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            $(document).ready(function() {
              $("#wallet-add").modal("show");
            });
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
function WalletHsRowView({ row }: { row: WalletHsRow }) {
  const nameColor = row.type === "1" || row.type === "5" ? "success" : "danger";
  const sign = nameColor === "success" ? "+" : "-";
  const { date, time } = dateThaiWallet(row.date);
  const nameParts = nameWallet(row.type ?? "").split("\n");

  return (
    <div className="pt-1 pl-1 pr-1">
      <div className="row border-success-2 p-1">
        <div className="col-6">
          <div className="text-left">
            <h4>
              {nameParts.map((part, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {part}
                </span>
              ))}
            </h4>
            <span className="text-muted font-12">เลขที่รายการ #{row.ID}</span>
            {row.refOrder != null && row.refOrder !== "" && (
              <>
                <br />
                <span className="text-muted font-12">
                  เลขที่ออเดอร์{" "}
                  {row.type === "2" ? (
                    <a href={`/service-order/detail/${row.refOrder}`} target="_blank">
                      {row.refOrder}
                    </a>
                  ) : row.type === "4" ? (
                    <a href={`/service-import/detail/${row.refOrder}`} target="_blank">
                      {row.refOrder}
                    </a>
                  ) : (
                    row.refOrder
                  )}
                </span>
              </>
            )}
            <br />
            {statusBadge(row.status)}
          </div>
        </div>
        <div className="col-6">
          <div className="text-right">
            <h4 className={`text-${nameColor}`}>
              {sign}
              {numberFormat2(row.amount)}
            </h4>
            <span className="font-13">
              {date}
              <br />
              {time}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

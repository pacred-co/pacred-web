import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";

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

// load_wallet_hs.php L21 — the legacy status badge for a wallet-hs row.
function statusBadge(status: string | null) {
  if (status === "1") {
    return <span className="badge badge-warning badge-pill">รอตรวจสอบ</span>;
  }
  if (status === "2") {
    return <span className="badge badge-info badge-pill">สำเร็จ</span>;
  }
  return <span className="badge badge-danger badge-pill">ไม่สำเร็จ</span>;
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
          <link> so it bypasses the app's Tailwind/PostCSS pipeline. */}
      <link rel="stylesheet" href="/legacy/pcs/wallet.css" />

      {/* wallet.php <title> L53 (Next.js owns <head> — kept here as a
          comment for fidelity record):  กระเป๋าสตางค์ | Pacred */}

      {/* BEGIN: Content — wallet.php L85 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* L89-100 — breadcrumb header */}
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
                                  {/* Tab 1 — รายการเดินบัญชี (type='all') */}
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
                                  {/* Tab 2 — รายการเติมเงิน (type='1,5') */}
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
                                  {/* Tab 3 — รายการชำระเงิน (type='2,4,6,7') */}
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
                                  {/* Tab 4 — รายการถอนเงิน (type='3') */}
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
                  Transcribed 1:1. The legacy jQuery behaviours
                  (Bootstrap .modal('show'), dropify, PromptPay QR,
                  SweetAlert) need client JS not present here — the
                  modal renders statically (see the file header §3). */}
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
                      <form
                        className="form-horizontal"
                        method="POST"
                        action="/wallet/"
                        autoComplete="off"
                        encType="multipart/form-data"
                      >
                        <div className="form-group pt-1">
                          <div className="">
                            <label className="form-control-label" htmlFor="amount">
                              จำนวนเงิน (บาท)
                            </label>
                            <input
                              className="form-control form-control-lg text-right"
                              placeholder="00.00"
                              name="amount"
                              id="amount"
                              type="number"
                              min="0.01"
                              max="1000000"
                              step="0.01"
                              required
                            />
                            <div className="text-center">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger round m-1"
                                id="myBtn"
                              >
                                สร้าง QR Code ชำระเงิน
                              </button>
                            </div>
                          </div>
                          <div className="mb-1 qrcodeMain text-center">
                            <div
                              id="qrcode"
                              style={{
                                textAlign: "center",
                                width: "250px",
                                height: "250px",
                              }}
                            ></div>
                            <h5 className="text-center">บริษัท แพคเรด (ประเทศไทย) จำกัด</h5>
                            <div id="amount-show" style={{ textAlign: "center" }}></div>
                            <div className="text-right">
                              <a href="/wallet/deposit" target="_blank">
                                ดูวิธีการเติมเงิน
                              </a>
                            </div>
                          </div>
                          <div className="mb-1">
                            <label className="form-control-label" htmlFor="imagesSlip">
                              หลักฐานการโอน (สลิปรายการ)
                            </label>
                            <div className="fallback">
                              <input
                                type="file"
                                name="imagesSlip"
                                className="dropify"
                                accept="image/*"
                                data-max-file-size="9M"
                                required
                              />
                            </div>
                          </div>
                          <div className="mb-1">
                            <div>
                              เงื่อนไขการถอนเงิน ที่ต้องทราบก่อนเติมเงินเข้าระบบ
                            </div>
                            <ol className="">
                              <li>
                                {" "}
                                สามารถถอนเงินได้เมื่อ
                                ท่านเคยชำระเงินบริการฝากสั่งซื้อสินค้าหรือฝากนำเข้าสินค้ากับทางบริษัท
                                Pacred มาก่อน
                              </li>
                              <li>
                                {" "}
                                การถอนเงินต้องแนบเอกสาร
                                บัตรประจำตัวประชาชนและหน้าสมุดบัญชีธนาคาร
                              </li>
                              <li> ยอดถอนเงินขั้นต่ำ คือ 25 บาท</li>
                              <li>
                                {" "}
                                หากยอดที่ทำรายการถอนเงินน้อยกว่า 500 บาท
                                จะมีค่าบริการถอนเงิน 25 บาทต่อครั้ง
                              </li>
                              <li>
                                {" "}
                                ระยะเวลาดำเนินการใช้เวลา 7-10 วันทำการ
                                (ไม่รวมวันหยุดนักขัตฤกษ์และวันอาทิตย์)
                                เนื่องจากทางบริษัทจำเป็นต้องตรวจสอบข้อมูลและยอดเงินเพื่อดำเนินการประสานงานกับทางธนาคารที่ให้บริการ
                              </li>
                              <li>
                                {" "}
                                ทางบริษัทขอสงวนสิทธิ์ในการเปลี่ยนแปลงนโยบายไปตามเงื่อนไขที่บริษัทกำหนด
                              </li>
                            </ol>
                          </div>
                          <div className="modal-footer">
                            <button
                              type="button"
                              className="btn btn-outline-secondary round waves-effect"
                              data-dismiss="modal"
                            >
                              ยกเลิก
                            </button>
                            <button
                              type="submit"
                              className="btn btn-outline-info round waves-effect submit-wait"
                              name="addData"
                            >
                              เติมเงิน
                            </button>
                          </div>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
              </div>
            </section>
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
function WalletHsRowView({ row }: { row: WalletHsRow }) {
  // load_wallet_hs.php L20 — type 1 or 5 = green (credit), else red.
  const nameColor = row.type === "1" || row.type === "5" ? "success" : "danger";
  const sign = nameColor === "success" ? "+" : "-";
  const { date, time } = dateThaiWallet(row.date);
  // nameWallet() returns Thai labels with embedded <br/> (the legacy
  // `<br>`); split on the `\n` marker to reproduce the line break.
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
                    <a href={`/shops/detail/${row.refOrder}`} target="_blank">
                      {row.refOrder}
                    </a>
                  ) : row.type === "4" ? (
                    <a href={`/forwarder/detail/${row.refOrder}`} target="_blank">
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

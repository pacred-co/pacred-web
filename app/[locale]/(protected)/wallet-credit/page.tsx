import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";

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
 *     tb_wallet_hs + move_uploaded_file + LINE Notify) is a render-time
 *     write — NOT reproduced here (Server Components must stay pure).
 *     Belongs to a Server Action: TODO(server-action).
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

  // ── Transcribed queries ──────────────────────────────────────
  const [walletRes, userRowRes, cbRes, creditRes, hsRes] = await Promise.all([
    // header.php L86-92: SELECT walletTotal FROM tb_wallet WHERE userID=…
    admin
      .from("tb_wallet")
      .select("wallettotal")
      .eq("userid", memberCode)
      .maybeSingle<{ wallettotal: number | string | null }>(),
    // wallet-credit.php L67-74 + header.php L33-38: tb_users
    admin
      .from("tb_users")
      .select("username, userlastname, usercreditvalue")
      .eq("userid", memberCode)
      .maybeSingle<{
        username: string | null;
        userlastname: string | null;
        usercreditvalue: number | string | null;
      }>(),
    // wallet-credit.php L59-66: SELECT cbTotal FROM tb_cash_back WHERE userID=…
    admin
      .from("tb_cash_back")
      .select("cbtotal")
      .eq("userid", memberCode)
      .maybeSingle<{ cbtotal: number | string | null }>(),
    // header.php L113-120: SELECT creditValue FROM tb_credit WHERE userID=…
    admin
      .from("tb_credit")
      .select("creditvalue")
      .eq("userid", memberCode)
      .maybeSingle<{ creditvalue: number | string | null }>(),
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
  const userCreditValue = Number(userRowRes.data?.usercreditvalue ?? 0);
  // wallet-credit.php L107: $userCreditValue - $creditValue → available credit
  const creditValue = Number(creditRes.data?.creditvalue ?? 0);
  const creditAvailable = userCreditValue - creditValue;
  // wallet-credit.php L105: $userName . ' ' . $userLastName
  const legacyName = [userRowRes.data?.username, userRowRes.data?.userlastname]
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
      {/* Legacy PCS theme CSS — same stylesheet wallet.php uses (the
          credit screen reuses the wallet card / tab / modal styles). */}
      <link rel="stylesheet" href="/legacy/pcs/wallet.css" />

      {/* wallet-credit.php <title> L53 (Next.js owns <head> — kept as a
          fidelity comment): กระเป๋าสตางค์เครดิต | Pacred */}

      {/* BEGIN: Content — wallet-credit.php L76 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* L80-91 — breadcrumb header */}
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
                    <li className="breadcrumb-item active">
                      กระเป๋าสตางค์เครดิต{" "}
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
          {/* L92 — content-body */}
          <div className="content-body pr110">
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        {/* ── Credit balance card — wallet-credit.php L99-124 ── */}
                        <div className="row">
                          <div className="col-md-6 offset-md-3">
                            <div className="card-body border-wallet pb-0">
                              <div className="media d-flex">
                                <div className="media-body text-left">
                                  <h3 className="danger mb-0">
                                    <span className="text-black-1">
                                      กระเป๋าสตางค์เครดิต ({fullName})
                                    </span>
                                    <br />
                                    <span className="text-black-1 font-14 ">
                                      วงเงินเครดิตที่ใช้งานได้ (บาท)
                                    </span>
                                    <br />
                                    <span
                                      className="tam-counter font-3rem"
                                      data-count={creditAvailable}
                                    >
                                      {numberFormat2(creditAvailable)}
                                    </span>
                                    <br />
                                    <span className="text-black-1 font-14 ">
                                      ยอดเครดิตค้างชำระ :{" "}
                                      {numberFormat2(creditValue)} (บาท)
                                    </span>
                                    <br />
                                    <span className="text-black-1 font-14 ">
                                      กระเป๋าสตางค์เงินสด :{" "}
                                      {numberFormat2(walletTotal)} (บาท)
                                    </span>
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
                                {/* L120 — `forwarder/?q=c` rebrands to
                                    `/service-import?q=c` per AGENTS.md
                                    transcription-rules step §8. */}
                                <Link href="/service-import?q=c">
                                  <div className="btn-add-wallet">
                                    {" "}
                                    <i className="la la-money"></i>{" "}
                                    ชำระเงินเครดิต{" "}
                                  </div>
                                </Link>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* ── Single-tab history panel — wallet-credit.php L125-157 ── */}
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
                                          <WalletHsRowView
                                            key={row.ID}
                                            row={row}
                                          />
                                        ))
                                      )}
                                    </div>
                                    <div id="load_data_message_wallet_hs"></div>
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

              {/* ── Deposit modal — wallet-credit.php L163-222 ──
                  Transcribed 1:1. The legacy jQuery behaviours
                  (Bootstrap .modal('show') triggered by ?page=='add',
                  dropify file input, PromptPay QR-code generation,
                  SweetAlert result popups) need client JS not present
                  here — the modal renders statically.
                  TODO(server-action): wire the addData POST handler
                  (L4-51) — INSERT tb_wallet_hs + move_uploaded_file +
                  LINE Notify. */}
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
                                  ธนาคารกสิกรไทย
                                </h2>
                                <div className="text-center">
                                  เลขที่บัญชี{" "}
                                  <span className="font-2rem mr-0-3" id="text2">
                                    064-174-3836
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
                      <form
                        className="form-horizontal"
                        method="POST"
                        action="/wallet-credit"
                        autoComplete="off"
                        encType="multipart/form-data"
                      >
                        <div className="form-group pt-1">
                          <div className="">
                            <label
                              className="form-control-label"
                              htmlFor="amount"
                            >
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
                            <div style={{ textAlign: "center", marginTop: "10px" }}>
                              เลขที่บัญชี : <span>064-174-3836</span>
                            </div>
                            <div style={{ textAlign: "center" }}>
                              พร้อมเพย์ :{" "}
                              <span id="pp-id-show2">0-1055-64077-71-6</span>
                            </div>
                            <h5 className="text-center">
                              บริษัท แพคเรด (ประเทศไทย) จำกัด
                            </h5>
                            <div
                              id="amount-show"
                              style={{ textAlign: "center" }}
                            ></div>
                            <div className="text-right">
                              {/* Legacy linked out to pcscargo.co.th/การเติมเงิน/
                                  — rewritten to internal /wallet/deposit so
                                  the customer stays inside Pacred. */}
                              <a
                                href="/wallet/deposit"
                                target="_blank"
                                rel="noreferrer"
                              >
                                ดูวิธีการเติมเงิน
                              </a>
                            </div>
                          </div>
                          <div className="mb-1">
                            <label
                              className="form-control-label"
                              htmlFor="imagesSlip"
                            >
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
                    <a
                      href={`/service-order/detail/${row.refOrder}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {row.refOrder}
                    </a>
                  ) : row.type === "4" ? (
                    <a
                      href={`/service-import/detail/${row.refOrder}`}
                      target="_blank"
                      rel="noreferrer"
                    >
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

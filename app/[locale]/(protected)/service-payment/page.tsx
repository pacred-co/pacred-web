import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Customer ฝากชำระ / โอนหยวน screen — a FAITHFUL 1:1 TRANSCRIPTION of
 * the legacy PCS Cargo `member/payment.php` (the default `page` branch
 * — no `?page` query, or `?page=add`; lines 4-540) (D1 / ADR-0017 ·
 * the faithful-port transcription workstream · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is the
 * exact HTML markup `payment.php` renders — same elements, same
 * Bootstrap-4 class names, same structure, same labels, same order. The
 * visual identity comes from the legacy theme CSS, brought in verbatim
 * as the static `.pcs-legacy`-scoped `public/legacy/pcs/payment.css`,
 * loaded via a plain `<link>` so it bypasses the app's Tailwind v4 /
 * PostCSS pipeline.
 *
 * `payment.php` source structure transcribed here (lines 251-540):
 *   .app-content > .content-wrapper > .content-body.pr110
 *     The page renders ONE of three states (legacy L256-452):
 *      A. nิติบุคคล pending  — a red bg-danger block (L450) shown when
 *         the customer HAS a `tb_corporate` row with corporateStatus=1.
 *      B. never-paid block   — a red bg-danger block (L278-280) shown
 *         when the customer has NOT used ฝากสั่งซื้อ/ฝากนำเข้า before.
 *      C. the list view (L284-444) — the normal screen:
 *         - .card.border-black header row: title + "เพิ่มรายการ" btn
 *           (opens the #add-payment modal)
 *         - .nav.nav-tabs.nav-underline status-filter tabs (ทั้งหมด /
 *           รอดำเนินการ / สำเร็จ / ไม่สำเร็จ) with pcs-badge counts
 *         - the #myTable DataTables list of tb_payment rows
 *   #add-payment — the "สร้างออเดอร์ฝากชำระสินค้า" Bootstrap modal
 *     (L457-530): a wallet card + the payType / payDetail /
 *     certifiedTrueCopy / payYuan form.
 *
 * Data — every `payment.php` mysqli query transcribed 1:1 to the ported
 * legacy `tb_*` schema (Supabase). `tb_*` is RLS-locked to service_role,
 * so reads go through the admin client; the join key is
 * `tb_*.userid === profile.member_code` (the customer's "PR<n>" code).
 * The `tb_*` map is `docs/research/wave-1-fidelity/_SYNTHESIS.md` §7.
 *   - juristic check  → tb_corporate.corporatestatus  (payment.php L258)
 *   - used-forwarder  → tb_forwarder WHERE fstatus>5   (payment.php L264)
 *   - used-shop       → tb_header_order WHERE hstatus>3 AND <>6 (L270)
 *   - rate            → tb_settings.rpdefault          (payment.php L246)
 *   - status counts   → tb_payment.paystatus           (payment.php L313)
 *   - the list rows   → tb_payment                     (payment.php L379)
 *   - $userName etc.  → tb_users.username / userlastname (header.php L33)
 *   - $walletTotal    → tb_wallet.wallettotal          (header.php L86-92)
 *   - numberPaymemt   → tb_settings.numberpaymemt      (payment.php L487)
 *
 * The `?q=` URL filter (all / 1 / 2 / 3 → the four status tabs) is the
 * legacy `$_GET['q']` (L380-390) — exposed here as `searchParams`.
 *
 * Rebrand: legacy `PCS<n>` → `PR<n>` (member codes) + "PCS Cargo" →
 * "PR Cargo" branding text only. Nothing else changed.
 *
 * ── NOT transcribed (deliberate · flagged for the integrator) ──
 *  1. payment.php L4-215 — the `if(isset($_POST["payment"]))` handler:
 *     a multi-branch render-time write (image→webp cURL upload + INSERT
 *     tb_wallet_hs + INSERT tb_payment). A Server Component render must
 *     be a PURE READ — this render-time mutation is NOT reproduced.
 *  2. header.php L75-85 runs an `UPDATE tb_header_order` on every page
 *     load (auto-expire overdue orders) — likewise NOT reproduced.
 *  3. payment.php L611 `saveHS(...)` is a visit-log INSERT — NOT
 *     reproduced (render-time write).
 *  4. The `#add-payment` modal markup IS transcribed 1:1. The form's
 *     `method="POST"` submit (the legacy create-payment action) is
 *     unwired here — it needs a Server Action + the image-upload
 *     pipeline (a separate `/service-payment/add` screen). The modal
 *     opens 1:1 via the globally-staged Bootstrap-4 vendor JS
 *     (`data-toggle="modal"`); the dropify file input + the
 *     calculatePay() live JS are not transcribed — the inputs render
 *     statically. FLAGGED: the create-payment submit is a no-op here.
 *  5. The legacy `.tam-counter` count-up animation needs client JS;
 *     the modal balance is rendered statically as `number_format($n,2)`
 *     — exactly the legacy text node before its JS runs.
 *  6. The `#myTable` DataTables JS (sort / paginate / search) is not
 *     ported — the table renders statically with the legacy classes so
 *     it looks identical at rest; the `?q=` status filter is server-side.
 *
 * The legacy `?page=detail&id=X` branch (payment.php L614-805) is a
 * separate screen → a separate Next.js route (`/service-payment/[id]`),
 * transcribed separately — same split as the wallet.php pilot.
 */

// Server Components reading cookies/auth under a layout must be dynamic.
export const dynamic = "force-dynamic";

// payment.php L379 — the four status-filter tabs. Legacy `$_GET['q']`
// is sanitised `preg_replace("/[^a-z\d]/i", '', …)` then switched on
// "1" / "2" / "3"; anything else = all. payStatus enum: 1=รอดำเนินการ
// 2=สำเร็จ 3=ไม่สำเร็จ.
type PayQ = "1" | "2" | "3";

// payment.php L396-399 — the payType badge (วิธีการชำระ column).
function payTypeBadge(payType: string | null) {
  switch (payType) {
    case "1":
      return (
        <span className="font-11 badge badge-primary badge-pill">
          จ่ายผ่านเว็บไซต์จีน
        </span>
      );
    case "2":
      return (
        <span className="font-11 badge badge-info badge-pill">
          โอนเข้าบัญชี Alipay ร้านค้าจีน
        </span>
      );
    case "3":
      return (
        <span className="font-11 badge badge-dark badge-pill"> อื่นๆ </span>
      );
    default:
      return null;
  }
}

// payment.php L400-404 — the payStatus badge (สถานะ column).
function payStatusBadge(payStatus: string | null) {
  switch (payStatus) {
    case "1":
      return (
        <span className="badge badge-warning badge-pill">รอดำเนินการ</span>
      );
    case "2":
      return <span className="badge badge-info badge-pill">สำเร็จ</span>;
    case "3":
      return (
        <span className="badge badge-danger badge-pill"> ไม่สำเร็จ </span>
      );
    default:
      return null;
  }
}

// Legacy `numberLimit($limit)` — member/include/function.php L10-13.
// Caps a tab count at "99+".
function numberLimit(limit: number): string {
  return limit > 99 ? "99+" : String(limit);
}

// Legacy `countText($text,$num)` — member/include/function.php L14-24.
// UTF-8-aware truncate to `num` characters with a trailing "...".
function countText(text: string | null, num: number): string {
  const s = text ?? "";
  const chars = Array.from(s); // Array.from counts code points (UTF-8 safe)
  if (chars.length >= num) {
    return chars.slice(0, num).join("") + "...";
  }
  return s;
}

// PHP `number_format($n, 2)` — 2 decimals, comma thousands separator.
function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// payment.php L408/L410 — DATE(payDate) + TIME(payDate). Legacy MySQL
// renders DATE() as "YYYY-MM-DD" and TIME() as "HH:MM:SS".
function splitDateTime(strDate: string | null): { date: string; time: string } {
  if (!strDate) return { date: "", time: "" };
  const d = new Date(strDate.replace(" ", "T"));
  if (isNaN(d.getTime())) {
    // Fall back to a raw split if it is already "YYYY-MM-DD HH:MM:SS".
    const [date = "", time = ""] = strDate.split(" ");
    return { date, time };
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}:${ss}` };
}

// A single tb_payment row as payment.php L406-430 renders it.
type PaymentRow = {
  ID: number;
  payDate: string | null;
  payStatus: string | null;
  payType: string | null;
  payDetail: string | null;
  payTHB: number;
};

export default async function ServicePaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;

  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const memberCode = profile.member_code ?? "";

  // payment.php L380-390 — sanitise `?q=` exactly like the legacy
  // preg_replace, then keep only the recognised "1"/"2"/"3" values.
  const rawQ = (sp.q ?? "").replace(/[^a-z\d]/gi, "");
  const q: PayQ | null =
    rawQ === "1" || rawQ === "2" || rawQ === "3" ? (rawQ as PayQ) : null;

  // ── Transcribed queries ──────────────────────────────────────
  // payment.php L246: SELECT rpDefault FROM tb_settings WHERE ID=1
  // payment.php L258: SELECT ID FROM tb_corporate WHERE userID=…
  //                   AND corporateStatus=1
  // payment.php L264: SELECT ID FROM tb_forwarder WHERE userID=…
  //                   AND fStatus>5
  // payment.php L270: SELECT ID FROM tb_header_order WHERE userID=…
  //                   AND hStatus>3 AND hStatus<>6
  // payment.php L313: SELECT payStatus FROM tb_payment WHERE userID=…
  // header.php L33-38 / L86-92: tb_users name + tb_wallet balance
  // payment.php L487: SELECT numberPaymemt FROM tb_settings WHERE ID=1
  const [
    settingsRes,
    corporateRes,
    forwarderRes,
    headerOrderRes,
    payCountRes,
    userRowRes,
    walletRes,
  ] = await Promise.all([
    admin
      .from("tb_settings")
      .select("rpdefault, numberpaymemt")
      .eq("id", 1)
      .maybeSingle<{ rpdefault: number | null; numberpaymemt: string | null }>(),
    admin
      .from("tb_corporate")
      .select("id")
      .eq("userid", memberCode)
      .eq("corporatestatus", "1"),
    // legacy `fStatus>5` — fstatus is a 1-char string ('1'..'7') in the
    // ported schema; MySQL coerced the varchar for `>5`, and for
    // single-digit strings lexical order == numeric order, so `.gt('5')`
    // is the faithful 1:1 (selects fstatus '6' or '7').
    admin
      .from("tb_forwarder")
      .select("id")
      .eq("userid", memberCode)
      .gt("fstatus", "5"),
    admin
      .from("tb_header_order")
      .select("id, hstatus")
      .eq("userid", memberCode),
    admin
      .from("tb_payment")
      .select("paystatus")
      .eq("userid", memberCode),
    admin
      .from("tb_users")
      .select("username, userlastname")
      .eq("userid", memberCode)
      .maybeSingle<{ username: string | null; userlastname: string | null }>(),
    admin
      .from("tb_wallet")
      .select("wallettotal")
      .eq("userid", memberCode)
      .maybeSingle<{ wallettotal: number }>(),
  ]);

  // payment.php L245-249 / L518 — the yuan rate (1 หยวน = rpDefault บาท).
  const rpDefault = Number(settingsRes.data?.rpdefault ?? 0);

  // payment.php L487-489 — the customer's ฝากจ่าย number.
  const numberPaymemt = settingsRes.data?.numberpaymemt ?? "";

  // payment.php L256-276 — the gate logic.
  //  $statusCheckJuristic = 1 only when the customer has NO active
  //  tb_corporate row; otherwise the "นิติบุคคล pending" block shows.
  const statusCheckJuristic = (corporateRes.data?.length ?? 0) === 0;

  //  legacy `hStatus>3 AND hStatus<>6` — hstatus is stored as a 1-char
  //  string in the ported schema; compare numerically. (>3 and <>6 =
  //  hstatus 4 or 5.)
  const usedShop = (headerOrderRes.data ?? []).some((r) => {
    const h = Number(r.hstatus);
    return h > 3 && h !== 6;
  });
  //  legacy `fStatus>5` — fstatus 6 or 7.
  const usedForwarder = (forwarderRes.data?.length ?? 0) > 0;

  //  payment.php L276 — `if(!$usedShop || !$usedForwarder)` shows the
  //  never-paid block; the list shows only when BOTH are true.
  const showNeverPaidBlock = !usedShop || !usedForwarder;

  // payment.php L309-326 — tally the payStatus counts for the tab badges.
  let countStatusAll = 0;
  let countStatusF1 = 0;
  let countStatusF2 = 0;
  let countStatusF3 = 0;
  for (const r of payCountRes.data ?? []) {
    const ps = (r as { paystatus: string | null }).paystatus;
    if (ps === "1") countStatusF1++;
    else if (ps === "2") countStatusF2++;
    else if (ps === "3") countStatusF3++;
    countStatusAll++;
  }

  // $userName . ' ' . $userLastName (payment.php L470) — prefer the
  // ported tb_users name, fall back to the Pacred profile fields.
  const legacyName = [userRowRes.data?.username, userRowRes.data?.userlastname]
    .filter((s): s is string => !!s && s.trim() !== "")
    .join(" ")
    .trim();
  const profileName = [profile.first_name, profile.last_name]
    .filter((s): s is string => !!s && s.trim() !== "")
    .join(" ")
    .trim();
  const fullName = legacyName || profileName || profile.company_name || "";

  // $walletTotal (header.php L86 default 0).
  const walletTotal = Number(walletRes.data?.wallettotal ?? 0);

  // payment.php L378-391 — the list query. Built only when the list
  // view will render (statusCheckJuristic && !showNeverPaidBlock).
  let rows: PaymentRow[] = [];
  if (statusCheckJuristic && !showNeverPaidBlock) {
    let listQuery = admin
      .from("tb_payment")
      .select("id, paydate, paystatus, paytype, paydetail, paythb")
      .eq("userid", memberCode);
    // payment.php L382-387 — when ?q is set, also filter by payStatus.
    if (q) listQuery = listQuery.eq("paystatus", q);
    const { data: listData } = await listQuery;
    rows = (
      (listData ?? []) as {
        id: number;
        paydate: string | null;
        paystatus: string | null;
        paytype: string | null;
        paydetail: string | null;
        paythb: number | string | null;
      }[]
    ).map((r) => ({
      ID: r.id,
      payDate: r.paydate,
      payStatus: r.paystatus,
      payType: r.paytype,
      payDetail: r.paydetail,
      payTHB: Number(r.paythb ?? 0),
    }));
  }

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS theme CSS — static public/ asset, loaded via a plain
          <link> so it bypasses the app's Tailwind/PostCSS pipeline. */}
      <link rel="stylesheet" href="/legacy/pcs/payment.css" />

      {/* payment.php <title> L217 (Next.js owns <head> — kept here as a
          comment for fidelity record):  รายการฝากชำระเงิน | PR Cargo */}

      {/* BEGIN: Content — payment.php L251 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          <div className="content-body pr110">
            {!statusCheckJuristic ? (
              /* payment.php L448-451 — the customer has an active
                 tb_corporate row → waiting for staff approval. */
              <div className="text-center">
                <h2
                  style={{
                    maxWidth: "670px",
                    margin: "auto",
                    marginTop: "10%",
                  }}
                  className="text-white bg-danger p-1"
                >
                  รอเจ้าหน้าที่ดำเนิน อนุมัติการเป็นนิติบุคคล ภายใน 24 ชม.{" "}
                  <br /> (ยกเว้นวันอาทิตย์และวันหยุดนักขัตฤกษ์)
                </h2>
              </div>
            ) : showNeverPaidBlock ? (
              /* payment.php L278-280 — the customer has not used
                 ฝากสั่งซื้อ / ฝากนำเข้า before. */
              <div className="text-center">
                <h2
                  style={{
                    maxWidth: "600px",
                    margin: "auto",
                    marginTop: "15%",
                  }}
                  className="text-white bg-danger p-1"
                >
                  คุณต้องเคยชำระเงินบริการ
                  <br />
                  ฝากสั่งซื้อ หรือ ฝากนำเข้าสินค้ามาก่อน
                  <br /> <br />
                  ถึงจะสามารถทำฝากโอนหยวน/ฝากชำระเงินได้
                </h2>
              </div>
            ) : (
              /* payment.php L284-444 — the list view. */
              <section>
                <div className="row">
                  <div className="col-md-12 col-sm-12">
                    <div className="card border-black">
                      {/* L288-307 — header row: title + เพิ่มรายการ btn */}
                      <div className="p-1 row">
                        <div className="content-header-left col-md-6 col-12">
                          <div className="text-center text-md-left">
                            <h3 className="text-center text-md-left">
                              <span className="font-30 ">
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
                                  <line x1="12" y1="1" x2="12" y2="23"></line>
                                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                                </svg>
                              </span>{" "}
                              รายการฝากชำระสินค้า/ฝากโอนหยวน
                            </h3>
                          </div>
                        </div>
                        <div className="content-header-right col-md-6 col-12">
                          <div className="float-md-right">
                            <div className="text-center text-md-right">
                              {/* payment.php L298 — opens the #add-payment
                                  modal via the globally-staged BS4 JS. */}
                              <a
                                href="#add-payment"
                                data-toggle="modal"
                                data-target="#add-payment"
                              >
                                <button className="btn btn-sm btn-circle btn-success text-white">
                                  <i className="ft-plus"></i>
                                </button>
                                <span className="font-normal text-dark">
                                  เพิ่มรายการ
                                </span>
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* L328-440 — status tabs + the #myTable list */}
                      <div className="row">
                        <div className="col-md-12">
                          {/* L330-362 — status-filter tabs */}
                          <div className="p-1">
                            <h5>สถานะรายการ</h5>
                            <ul className="nav nav-tabs nav-underline pcs-tabs no-hover-bg">
                              <li className="nav-item">
                                <Link className="nav-link" href="/service-payment">
                                  ทั้งหมด
                                  {countStatusAll > 0 && (
                                    <div className="pcs-badge badge-info pcs-badge-pill">
                                      {numberLimit(countStatusAll)}
                                    </div>
                                  )}
                                </Link>
                              </li>
                              <li className="nav-item">
                                <Link
                                  className="nav-link"
                                  href="/service-payment?q=1"
                                >
                                  รอดำเนินการ
                                  {countStatusF1 > 0 && (
                                    <div className="pcs-badge badge-warning pcs-badge-pill">
                                      {numberLimit(countStatusF1)}
                                    </div>
                                  )}
                                </Link>
                              </li>
                              <li className="nav-item">
                                <Link
                                  className="nav-link"
                                  href="/service-payment?q=2"
                                >
                                  สำเร็จ
                                  {countStatusF2 > 0 && (
                                    <div className="pcs-badge badge-danger pcs-badge-pill">
                                      {numberLimit(countStatusF2)}
                                    </div>
                                  )}
                                </Link>
                              </li>
                              <li className="nav-item">
                                <Link
                                  className="nav-link"
                                  href="/service-payment?q=3"
                                >
                                  ไม่สำเร็จ
                                  {countStatusF3 > 0 && (
                                    <div className="pcs-badge badge-warning pcs-badge-pill">
                                      {numberLimit(countStatusF3)}
                                    </div>
                                  )}
                                </Link>
                              </li>
                            </ul>
                          </div>
                          {/* L363-438 — the #myTable DataTables list */}
                          <div className="p-1">
                            <div className="table-responsive">
                              <table
                                id="myTable"
                                className="table display table-bordered table-striped dataTable no-footer dtr-inline"
                              >
                                <thead>
                                  <tr className="text-center">
                                    <th>วันที่สร้าง</th>
                                    <th>เลขที่ออเดอร์</th>
                                    <th>รายละเอียด</th>
                                    <th>วิธีการชำระ</th>
                                    <th>ยอดรวม(บาท)</th>
                                    <th>สถานะ</th>
                                    <th>ตัวเลือก</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((row) => {
                                    const { date, time } = splitDateTime(
                                      row.payDate,
                                    );
                                    return (
                                      <tr key={row.ID}>
                                        <td className="text-center">
                                          {date}
                                          <br />
                                          {time + " น."}
                                        </td>
                                        <td>{row.ID}</td>
                                        <td title={row.payDetail ?? ""}>
                                          {countText(row.payDetail, 120)}
                                        </td>
                                        <td className="text-center">
                                          {payTypeBadge(row.payType)}
                                        </td>
                                        <td className="text-right text-danger">
                                          <b>-{numberFormat2(row.payTHB)}</b>
                                        </td>
                                        <td className="text-center">
                                          {payStatusBadge(row.payStatus)}
                                        </td>
                                        <td className="text-center">
                                          <Link
                                            href={`/service-payment/${row.ID}`}
                                          >
                                            <p className="btn font-12 btn-sm btn-outline-success btn-rounded">
                                              {" "}
                                              ดูรายละเอียด{" "}
                                            </p>
                                          </Link>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
      {/* END: Content — payment.php L456 */}

      {/* ── #add-payment modal — payment.php L457-530 ──
          Transcribed 1:1. Opens via the globally-staged Bootstrap-4
          vendor JS (data-toggle="modal"). The form's POST submit (the
          legacy create-payment action) is UNWIRED here — see the file
          header §4: it needs a Server Action + the image-upload
          pipeline. The dropify file input + the calculatePay() live JS
          are not transcribed; the inputs render statically. */}
      {statusCheckJuristic && !showNeverPaidBlock && (
        <div
          id="add-payment"
          className="modal fade in"
          tabIndex={-1}
          role="dialog"
          aria-hidden="true"
        >
          <div className="modal-dialog">
            <div className="modal-content header-from">
              <div className="modal-header">
                <h4 className="modal-title">สร้างออเดอร์ฝากชำระสินค้า</h4>
                <button
                  type="button"
                  className="close"
                  data-dismiss="modal"
                  aria-hidden="true"
                >
                  <i className="la la-close"> </i>
                </button>
              </div>
              <div className="modal-body header-from">
                {/* payment.php L465 — legacy `action="payment/"` POST.
                    UNWIRED in this transcription (see file header §4). */}
                <form
                  id="order2"
                  className="form-horizontal"
                  method="POST"
                  action="/service-payment/"
                  autoComplete="off"
                  encType="multipart/form-data"
                >
                  {/* L466-485 — the wallet balance card */}
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
                            className="tam-counter font-3rem"
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
                          src="/legacy/pcs/logo.png"
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
                  {/* L491-525 — the create-payment form fields */}
                  <div className="form-group pt-2">
                    <h5 className="text-right text-danger">
                      เลขฝากจ่าย : <b>{numberPaymemt}</b>
                    </h5>
                    <div className="mb-1">
                      <label className="form-control-label" htmlFor="payType">
                        วิธีการชำระ
                      </label>
                      <select
                        className="form-control"
                        name="payType"
                        required
                        defaultValue=""
                      >
                        <option value="">กรุณาเลือกช่องทาง...</option>
                        <option value="1" className="text-primary">
                          จ่ายผ่านเว็บไซต์จีน
                        </option>
                        <option value="2" className="text-info">
                          โอนเข้าบัญชี Alipay ร้านค้าจีน
                        </option>
                        <option value="3">อื่นๆ</option>
                      </select>
                    </div>
                    <div className="mb-1">
                      <label
                        className="form-control-label"
                        htmlFor="payDetail"
                      >
                        รายละเอียด
                      </label>
                      <textarea
                        className="form-control"
                        name="payDetail"
                        rows={3}
                        placeholder="รายละเอียดการชำระ"
                        maxLength={2500}
                        required
                      ></textarea>
                    </div>
                    <div className="mt-2 mb-1">
                      <label
                        className="form-control-label"
                        htmlFor="certifiedTrueCopy"
                      >
                        หลักฐานสำเนาบัตรประจำตัวประชาชนหรือหนังสือเดินทางพร้อมรับรองสำเนาถูกต้อง
                        (รูปภาพ หรือ pdf) [
                        <a href="" target="_blank">
                          คลิกเพื่อดูตัวอย่าง
                        </a>
                        ]
                      </label>
                      <div className="fallback">
                        <input
                          type="file"
                          name="certifiedTrueCopy"
                          className="dropify"
                          accept="image/*,.pdf"
                          data-max-file-size="9M"
                          required
                        />
                      </div>
                    </div>
                    <div className="mb-1">
                      <label className="form-control-label" htmlFor="payYuan">
                        ยอดเงินที่ฝากชำระ (หยวนจีน)
                      </label>
                      <input
                        id="payYuan"
                        className="form-control form-control-lg notranslate"
                        name="payYuan"
                        type="number"
                        pattern="\d+(\.\d*)?"
                        step="0.01"
                        placeholder="0.00"
                        required
                        defaultValue="0.00"
                      />
                    </div>
                    <div className="notranslate text-right text-danger">
                      <span className="text-danger">
                        1 หยวน = <span id="rpDefault">{rpDefault}</span> บาท
                      </span>
                    </div>
                    <div className="notranslate text-right text-danger">
                      ยอดเงินที่ต้องชำระ{" "}
                      <h3 className="text-danger">
                        <span id="pay_thb">0.00</span> บาท
                      </h3>
                    </div>
                    <div className="QRPayment"></div>
                    <div className="modal-footer">
                      <button
                        type="reset"
                        className="btn btn-outline-secondary round waves-effect"
                        data-dismiss="modal"
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="submit"
                        className="btn btn-color-main round waves-effect"
                        name="payment"
                      >
                        ยืนยัน
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

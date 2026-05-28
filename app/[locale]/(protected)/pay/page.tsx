import Script from "next/script";
import { Link } from "@/i18n/navigation";
import { requireAuth } from "@/lib/auth/require-auth";

/**
 * PromptPay QR-generator utility — a FAITHFUL 1:1 TRANSCRIPTION of the
 * legacy PCS Cargo `member/pay.php` (D1 / ADR-0017 · the faithful-port
 * transcription workstream · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is the
 * exact HTML markup `pay.php` renders — same elements, same Bootstrap-4
 * class names, same structure, same labels, same order. The visual
 * identity comes from the legacy theme CSS, brought in verbatim as the
 * static `.pcs-legacy`-scoped `public/legacy/pcs/pay.css`, loaded via a
 * plain `<link>` so it bypasses the app's Tailwind v4 / PostCSS pipeline.
 *
 * Route: NEW screen `/pay` — `pay.php` is a standalone customer utility
 * (a "สร้าง QR Code รับเงิน" PromptPay-QR generator); it is not a
 * sub-view of any other screen, so it gets its own top-level
 * `(protected)/pay` route.
 *
 * `pay.php` source structure transcribed here (lines 11-99):
 *   .app-content > .content-wrapper
 *     1. .content-header > … > ol.breadcrumb — "หน้าแรก" / "ชื่อหน้า"
 *        (the legacy literally renders the placeholder text "ชื่อหน้า"
 *        as the active crumb — transcribed verbatim, NOT "improved").
 *     2. .content-body > section > .row > .col-md-12 > .card …
 *        > section#generate > .generate-section > .container
 *        > .row.generate-form > .col-md-8.mx-auto > <form>:
 *          - "พร้อมเพย์ ไอดี" number input (#pp-id), pre-filled with the
 *            company PromptPay ID `0105564077716` (verbatim — pay.php
 *            L43)
 *          - "จำนวนเงิน" number input (#amount)
 *          - "สร้าง QR Code รับเงิน" button (#myBtn)
 *     3. #myModal — the "QR Code รับเงิน" Bootstrap-4 modal:
 *        the PromptPay logo, the #qrcode canvas slot, #pp-id-show /
 *        #amount-show / #info-show text slots, a Close button.
 *
 * Data — `pay.php` issues NO database query at all. It is a pure
 * client-side UI utility: the PromptPay ID is hardcoded in the markup
 * and the QR is built entirely in the browser. The legacy
 * `header.php` / `header-theme.php` includes run a `tb_cart` count for
 * the page chrome (top-menu / left-menu), but that chrome is stripped
 * by the minimal `(protected)/layout.tsx` — the screen itself reads
 * nothing. So there is no SQL to transcribe and no `tb_*` query here.
 *
 * Client JS — `pay.php`'s page JS (L106-163) IS the screen's whole
 * function (build + show the PromptPay QR). Per the runbook's
 * vendor-JS rule (gotcha #3 — transcribe vendor-driven markup VERBATIM,
 * do not re-implement Bootstrap/jQuery behaviour in React) the page
 * JS is transcribed verbatim into the <Script> blocks below:
 *   - the two legacy QR plugins (`qrcode.min.js` + `promptpay.js`)
 *     staged under `public/legacy/pcs/vendor/qrcode-pay/`
 *   - the inline init script (L108-162) — verbatim; it uses the jQuery
 *     `$` + Bootstrap-4 `.modal()` from the global vendor bundle the
 *     `(protected)` layout already stages.
 *   - the one piece NOT in the legacy page-JS block but inline on the
 *     #pp-id markup — the `onKeyPress="if(this.value.length==15)
 *     return false;"` 15-char cap (pay.php L46). A Server Component
 *     cannot carry a JSX event-handler prop, so the cap is moved into
 *     the inline init <Script> as a jQuery `keypress` listener — same
 *     behaviour, no design change. (runbook gotcha #5 family — derive
 *     behaviour without an illegal Server-Component handler.)
 *
 * A Server Component render is a PURE READ — `pay.php` has no
 * render-time INSERT/UPDATE, so there is nothing to defer.
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + Pacred. `pay.php` carries no PCS branding
 * text in its visible markup, so nothing changed there.
 *
 * ── FLAGGED — binary asset + brand asset (documented, never silently
 *    diverged) ──
 *   A. `qrcode.min.js` — `pay.php` L106 loads
 *      `assets/plugins/qrcode-pay/qrcode.min.js` (19 KB minified vendor
 *      lib). A spawned worktree agent cannot copy a binary/minified
 *      asset (runbook gotcha #8) — it is LISTED for the integrator to
 *      copy (source → dest in the report). `promptpay.js` IS plain
 *      text and is transcribed directly to
 *      `public/legacy/pcs/vendor/qrcode-pay/promptpay.js`. Until
 *      `qrcode.min.js` is copied the <Script> 404s harmlessly and the
 *      QR build is inert — the screen still renders 1:1.
 *   B. The modal's PromptPay logo — `pay.php` L78 points at
 *      `img/PromptPay-logo.jpg`, but the legacy `member/img/` folder
 *      ships NO such file (the legacy itself renders a broken image
 *      here). Per the runbook (never ship a broken image, gotcha #6)
 *      the official PromptPay brand mark is referenced from its
 *      canonical source instead; flagged for ปอน's brand-asset sweep.
 */

export const dynamic = "force-dynamic";

export default async function PayPage() {
  // header.php L9-72: a logged-out visitor is redirected to /login.
  // `pay.php` reads no per-user data — the auth gate is the only thing
  // header.php contributes that survives into the transcription.
  await requireAuth();
  const promptPayId = process.env.PROMPTPAY_ID ?? "";

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS theme CSS — static public/ asset, loaded via a plain
          <link> so it bypasses the app's Tailwind/PostCSS pipeline. */}
      <link rel="stylesheet" href="/legacy/pcs/pay.css" />

      {/* pay.php <title> L4 (Next.js owns <head> — kept here as a
          comment for the fidelity record):  | Pacred */}

      {/* BEGIN: Content — pay.php L11 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* L15-26 — breadcrumb header. The legacy active crumb is the
              literal placeholder "ชื่อหน้า" — transcribed verbatim. */}
          <div className="content-header row">
            <div className="content-header-left col-12 mb-2">
              <div className="row breadcrumbs-top ">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb ">
                    <li className="breadcrumb-item">
                      <Link href="/dashboard">หน้าแรก</Link>
                    </li>
                    <li className="breadcrumb-item active">ชื่อหน้า</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
          {/* L27 — content-body */}
          <div className="content-body">
            {/* Basic Carousel start — pay.php L28 */}
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        {/* ── QR-generator form — pay.php L35-62 ── */}
                        <section className="text-center" id="generate">
                          <div className="generate-section">
                            <div className="container generate-content">
                              <div className="row generate-form">
                                <div
                                  className="col-md-8 mx-auto"
                                  style={{ marginTop: "90px" }}
                                >
                                  <form>
                                    <div className="form-group">
                                      <label>พร้อมเพย์ ไอดี</label>
                                      {/* pay.php L46 puts an inline
                                          `onKeyPress="if(this.value.length==15)
                                          return false;"` on this input
                                          (a 15-char cap). A Server
                                          Component cannot carry a JSX
                                          event-handler prop, so the cap
                                          is wired identically by the
                                          inline page <Script> below
                                          (a keypress listener on
                                          #pp-id) — same behaviour, 1:1. */}
                                      <input
                                        type="number"
                                        inputMode="numeric"
                                        pattern="\d*"
                                        defaultValue={promptPayId}
                                        className="form-control"
                                        id="pp-id"
                                        placeholder="เบอร์มือถือ, รหัสประจำตัวประชาชน, TAX ID, e-Wallet"
                                        required
                                      />
                                    </div>
                                    <div className="form-group error">
                                      <label>จำนวนเงิน</label>
                                      <input
                                        type="number"
                                        inputMode="decimal"
                                        step="0.01"
                                        className="form-control"
                                        id="amount"
                                        placeholder="1000.00 (Optional)"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      className="btn btn-primary btn-lg"
                                      id="myBtn"
                                    >
                                      สร้าง QR Code รับเงิน
                                    </button>
                                  </form>
                                </div>
                              </div>
                            </div>
                          </div>
                        </section>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* ── QR-code modal — pay.php L69-94 ──
                  Transcribed 1:1. The legacy jQuery `.modal()` open is
                  driven by the inline script below + the global vendor
                  bundle; the QR canvas is filled by the qrcode-pay
                  plugins. */}
              <div
                className="modal fade"
                id="myModal"
                tabIndex={-1}
                role="dialog"
                aria-labelledby="myModalLabel"
              >
                <div className="modal-dialog" role="document">
                  <div className="modal-content">
                    <div className="modal-header">
                      <button
                        type="button"
                        className="close"
                        data-dismiss="modal"
                        aria-label="Close"
                      >
                        <span aria-hidden="true">&times;</span>
                      </button>
                      <h4 className="modal-title" id="myModalLabel">
                        QR Code รับเงิน
                      </h4>
                    </div>
                    <div className="modal-body" style={{ margin: "auto" }}>
                      {/* pay.php L78 points at the legacy img/PromptPay-logo.jpg
                          which does not exist in the legacy tree (the
                          legacy itself renders broken here). Reference
                          the official PromptPay mark — FLAG (B). */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/legacy/pcs/PromptPay-logo.jpg"
                        alt="พร้อมเพย์"
                        style={{ maxWidth: "250px", marginBottom: "10px" }}
                      />
                      <div
                        id="qrcode"
                        style={{ width: "250px", height: "250px" }}
                      ></div>
                      <div
                        id="pp-id-show"
                        style={{ textAlign: "center", marginTop: "10px" }}
                      ></div>
                      <div id="amount-show" style={{ textAlign: "center" }}></div>
                      <div
                        id="info-show"
                        style={{
                          textAlign: "center",
                          fontSize: "70%",
                          marginTop: "10px",
                          color: "#A6A6A6",
                        }}
                      >
                        สร้าง QR Code เองที่ pp.js.org
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button
                        type="button"
                        className="btn btn-default close-button"
                        data-dismiss="modal"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {/* Basic Carousel end — pay.php L95 */}
            </section>
          </div>
        </div>
      </div>
      {/* END: Content — pay.php L99 */}

      {/* ── Page JS — pay.php L105-164 ──
          The two legacy QR plugins + the inline init script,
          transcribed VERBATIM. `qrcode.min.js` is staged for the
          integrator (FLAG A); `promptpay.js` is transcribed directly.
          afterInteractive = run after the page is interactive AND
          after the global vendor bundle (jQuery + Bootstrap-4) the
          (protected) layout stages — so `$` and `.modal()` exist. */}
      <Script
        src="/legacy/pcs/vendor/qrcode-pay/qrcode.min.js"
        strategy="afterInteractive"
      />
      <Script
        src="/legacy/pcs/vendor/qrcode-pay/promptpay.js"
        strategy="afterInteractive"
      />
      <Script id="pay-qrcode-init" strategy="afterInteractive">
        {`
    var qrcode = new QRCode(document.getElementById("qrcode"), {
        width: 250,
        height: 250,
        correctLevel: QRCode.CorrectLevel.L
    });

    function makeCode() {
        var ppID = document.getElementById("pp-id").value;
        var amount = parseFloat(document.getElementById("amount").value);
        if (!ppID) {
            ppID = "promptpay.github.io";
        }

        qrcode.makeCode(generatePayload(ppID, amount));
        $("#pp-id-show").html(ppID);
        if (amount > 0.0) {
            $("#amount-show").html(Number(amount.toFixed(2)).toLocaleString() + " บาท");
        } else {
            $("#amount-show").html("");
        }
    }

    $(document).ready(function() {
        // pay.php L46 — the inline onKeyPress 15-char cap on #pp-id.
        // Transcribed here (a Server Component cannot carry a JSX
        // handler prop) — identical behaviour: block the keypress
        // once the value already has 15 characters.
        $("#pp-id").on("keypress", function() {
            if (this.value.length == 15) return false;
        });
        $("#myBtn").click(function() {
            var ppID = document.getElementById("pp-id").value;
            var amount = parseFloat(document.getElementById("amount").value);
            if (ppID == '') {
                $('#pp-id').addClass('is-invalid')
            } else {
                $('#amount').removeClass('is-invalid')
                $('#pp-id').removeClass('is-invalid')
                makeCode();
                $("#pp-id").
                on("blur", function() {
                    makeCode();
                }).
                on("keydown", function(e) {
                    if (e.keyCode == 13) {
                        makeCode();
                    }
                });
                $("#amount").
                on("blur", function() {
                    makeCode();
                }).
                on("keydown", function(e) {
                    if (e.keyCode == 13) {
                        makeCode();
                    }
                });
                $("#myModal").modal();
            }
        });
    });
        `}
      </Script>
      {/* END: Page JS — pay.php L164 */}
    </div>
  );
}

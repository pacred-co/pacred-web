import Script from "next/script";
import { QrCode } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";

/**
 * PromptPay QR-generator utility — ported from the legacy PCS Cargo
 * `member/pay.php` (D1 / ADR-0017 · the faithful-port workstream ·
 * runbook `docs/runbook/faithful-port-transcription.md`).
 *
 * ── Tailwind rebuild (2026-05-30 · ปอน) ──
 * The page's FUNCTION is the legacy pay.php PromptPay-QR generator (same
 * #pp-id / #amount inputs, same #myBtn, same #myModal QR popup, same
 * qrcode-pay vendor plugins + inline init script); the CHROME is now our
 * own Tailwind, mobile-first design (per AGENTS.md §0a — "we copy the
 * working system, polish the look ourselves"). NO client wiring / id /
 * script changed — pure presentation. The #myModal stays Bootstrap-4
 * markup because the inline init script opens it via jQuery `.modal()`
 * (the vendor bundle the (protected) layout stages); `.pcs-legacy` +
 * pay.css are kept for that modal + any layout-scope globals.
 *
 * Legacy reference (the exact HTML pay.php renders — same elements,
 * Bootstrap-4 class names, labels, order — preserved as the fidelity
 * record): visual identity used to come from the legacy theme CSS, the
 * static `.pcs-legacy`-scoped `public/legacy/pcs/pay.css`, loaded via a
 * plain `<link>` so it bypassed the app's Tailwind v4 / PostCSS pipeline.
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
      {/* Legacy PCS theme CSS — kept for the Bootstrap-4 #myModal (opened
          by the inline jQuery `.modal()` init script) + layout-scope
          globals. The visible form below is Tailwind. */}
      <link rel="stylesheet" href="/legacy/pcs/pay.css" />

      {/* pay.php <title> L4 (Next.js owns <head> — kept here as a
          comment for the fidelity record):  | Pacred */}

      {/* Page content — Tailwind rebuild. `.pcs-content-pad` so the
          (protected) layout's desktop padding (sidebar + FloatingTabs
          clearance) kicks in. */}
      <div className="pcs-content-pad w-full px-3 md:px-6 py-3 md:py-6">
        <section className="mx-auto max-w-[640px] overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
          {/* ── Header ── */}
          <div className="border-b border-border px-4 py-3 md:px-5 md:py-4">
            <h1 className="flex items-center gap-2 text-base md:text-xl font-bold text-foreground">
              <QrCode className="h-5 w-5 md:h-6 md:w-6 shrink-0 text-primary-600" />
              <span>สร้าง QR Code รับเงิน</span>
            </h1>
            <p className="mt-1 text-xs md:text-sm text-muted">
              สร้างคิวอาร์โค้ดพร้อมเพย์สำหรับรับเงิน
            </p>
          </div>

          {/* ── QR-generator form — pay.php L35-62. Same #pp-id / #amount /
              #myBtn ids the inline init script binds to. ── */}
          <div className="px-4 py-5 md:px-8 md:py-8">
            <form className="space-y-4">
              <div>
                <label
                  htmlFor="pp-id"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  พร้อมเพย์ ไอดี
                </label>
                {/* pay.php L46 puts an inline
                    `onKeyPress="if(this.value.length==15) return false;"`
                    on this input (a 15-char cap). A Server Component cannot
                    carry a JSX event-handler prop, so the cap is wired
                    identically by the inline page <Script> below (a
                    keypress listener on #pp-id) — same behaviour, 1:1. */}
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="\d*"
                  defaultValue={promptPayId}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-foreground placeholder:text-muted transition-colors focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:bg-surface"
                  id="pp-id"
                  placeholder="เบอร์มือถือ, รหัสประจำตัวประชาชน, TAX ID, e-Wallet"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="amount"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  จำนวนเงิน
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-foreground placeholder:text-muted transition-colors focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:bg-surface"
                  id="amount"
                  placeholder="1000.00 (Optional)"
                />
              </div>
              <button
                type="button"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700 active:bg-red-800"
                id="myBtn"
              >
                <QrCode className="h-4 w-4" />
                สร้าง QR Code รับเงิน
              </button>
            </form>
          </div>
        </section>
      </div>

      {/* ── QR-code modal — pay.php L69-94 ──
          STILL Bootstrap-4 markup: the inline init script opens it with
          jQuery `.modal()` (vendor bundle from the (protected) layout) and
          the qrcode-pay plugins fill #qrcode. ids/data-dismiss preserved
          verbatim. */}
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
                  which does not exist in the legacy tree (the legacy itself
                  renders broken here). Reference the official PromptPay
                  mark — FLAG (B). */}
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

"use client";

/**
 * Password-change form for the faithful-port `/account-settings` screen —
 * a 1:1 transcription of the legacy PCS Cargo `member/account-settings.php`
 * <form> markup (lines 79-113) + its jQuery page-script (lines 134-203)
 * + its SweetAlert result popups (lines 206-247).
 *
 * D1 / ADR-0017 · runbook `docs/runbook/faithful-port-transcription.md`.
 *
 * This is a transcription, NOT a reinterpretation. The JSX is the exact
 * Bootstrap-4 markup the legacy <form> renders — same elements, same
 * class names, same labels, same placeholders, same id attributes,
 * same order. The legacy markup is server-rendered HTML; only the
 * jQuery behaviours need a client component, so the visible surface
 * here is the legacy <form> and the three interactive behaviours it
 * has are reproduced 1:1 with React state:
 *
 *   - `#show_hide_password` / `2` / `3` eye toggles  → show/hide each
 *     input (account-settings.php L135-176). The legacy <i> swaps
 *     `fa-eye-slash` ⇄ `fa-eye`; reproduced.
 *   - `#password1` focusout → if equal to `#password` show
 *     `#showText` ("รหัสผ่านใหม่ต้องไม่ตรงกับรหัสผ่านเดิม"), mark the
 *     input `is-invalid`, disable submit (L190-202).
 *   - `#password2` focusout → if not equal to `#password1` show
 *     `#showText2` ("รหัสผ่านใหม่ไม่ตรงกัน"), mark `is-invalid`,
 *     disable submit (L177-189).
 *
 * The form posts (legacy: to `account-settings/`) to the transcribed
 * Server Action `updatePasswordAction`; the action returns the legacy
 * `$sweetalert` outcome code and this component renders the matching
 * SweetAlert text (L206-247). On `sPass` it redirects to logout after
 * 4.5s — exactly as the legacy `window.setTimeout(... logout/ ,4500)`.
 * The SweetAlert content is DERIVED from the action result during
 * render (not set inside an effect); only the success→logout timer is
 * a real side effect, so it stays in a `useEffect`.
 *
 * Rebrand: PCS -> PR is branding text + member codes only.
 */

import { useActionState, useEffect, useState } from "react";
import {
  updatePasswordAction,
  accountSettingsLogoutAction,
  type AccountSettingsResult,
} from "./actions";

/** Eye-toggle state for the three legacy `show_hide_password*` blocks. */
function useShowPassword(): [boolean, () => void] {
  const [shown, setShown] = useState(false);
  return [shown, () => setShown((s) => !s)];
}

type SwalContent = { title: string; text: string; type: "success" | "error" };

/**
 * Maps the legacy `$sweetalert` outcome code to the SweetAlert title/text/
 * type — account-settings.php L206-247. Pure: the popup is fully derived
 * from the action result, so it is computed during render (no effect).
 */
function deriveSwal(state: AccountSettingsResult | null): SwalContent | null {
  if (!state) return null;
  switch (state.sweetalert) {
    case "sPass": // L208-219
      return {
        title: "อัปเดตข้อมูลสำเร็จ",
        text: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง!!!",
        type: "success",
      };
    case "eSQL": // L220-228
      return { title: "ผิดพลาด", text: "กรุณาลองใหม่อีกครั้ง!!!", type: "error" };
    case "ePass": // L229-237
      return { title: "ผิดพลาด", text: "รหัสผ่านเดิมไม่ถูกต้อง!!!", type: "error" };
    case "eConfirm": // L238-246
      return { title: "ผิดพลาด", text: "รหัสใหม่ไม่ตรงกัน!!!", type: "error" };
    case "empty": // L7 — legacy alert("กรุณากรอกข้อมูลให้ครบ")
      return { title: "กรุณากรอกข้อมูลให้ครบ", text: "", type: "error" };
    default:
      return null;
  }
}

export function PasswordForm() {
  const [state, formAction] = useActionState<AccountSettingsResult | null, FormData>(
    updatePasswordAction,
    null,
  );

  // The three legacy eye-toggles (#show_hide_password / 2 / 3).
  const [show1, toggle1] = useShowPassword();
  const [show2, toggle2] = useShowPassword();
  const [show3, toggle3] = useShowPassword();

  // Legacy focusout-validation state — #showText / #showText2 + is-invalid
  // + the disabled submit button (account-settings.php L177-202).
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  // `showText`  — new password equals old (L190-202)
  const [newSameAsOld, setNewSameAsOld] = useState(false);
  // `showText2` — confirm does not match new (L177-189)
  const [confirmMismatch, setConfirmMismatch] = useState(false);

  // L182/L195 — document.getElementById("btnSubmit").disabled = true/false
  const submitDisabled = newSameAsOld || confirmMismatch;

  // ── SweetAlert result (account-settings.php L206-247) ──
  // The popup is DERIVED from the action result during render. The error
  // popup has a "ตกลง" dismiss button — remembering which result the user
  // dismissed (by object identity — `useActionState` mints a fresh result
  // object per submit) hides it without a derive-in-effect anti-pattern.
  const [dismissed, setDismissed] = useState<AccountSettingsResult | null>(null);
  const alertMsg = state && state !== dismissed ? deriveSwal(state) : null;

  // The ONLY real side effect: on `sPass` the legacy page does
  // `window.setTimeout(... logout/ ,4500)`. No setState here.
  useEffect(() => {
    if (state?.sweetalert !== "sPass") return;
    const timer = window.setTimeout(() => {
      void accountSettingsLogoutAction();
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [state]);

  return (
    <>
      {/* account-settings.php L79-113 — the password-change <form>.
          Tailwind rebuild of the Bootstrap-4 chrome (เดฟ 2026-05-30): same
          form wiring (ids · names · types · server action · validation
          state), only presentation classes converted. Mobile-first inputs
          use text-base to stop iOS zoom. */}
      <span className="text-base font-bold text-foreground">เปลี่ยนรหัสผ่านใหม่ </span>
      <hr className="my-3 border-t border-border" />
      <form className="mt-2" action={formAction} autoComplete="off">
        {/* L80-88 — รหัสผ่านเดิม */}
        <div className="mb-3">
          <div className="relative" id="show_hide_password">
            <label className="block text-xs font-medium text-muted mb-1">รหัสผ่านเดิม</label>
            <input
              id="password"
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 pr-11 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
              name="password"
              type={show1 ? "text" : "password"}
              required
              placeholder="รหัสผ่านเดิม"
              minLength={6}
              maxLength={20}
              value={oldPass}
              onChange={(e) => setOldPass(e.target.value)}
            />
            <div className="absolute right-1 bottom-0 h-[42px] flex items-center">
              <a
                href=""
                className="flex items-center justify-center w-10 h-10 text-muted hover:text-foreground"
                onClick={(e) => {
                  e.preventDefault();
                  toggle1();
                }}
              >
                <i className={show1 ? "fa fa-eye" : "fa fa-eye-slash"} aria-hidden="true"></i>
              </a>
            </div>
          </div>
        </div>
        <hr className="my-3 border-t border-border" />
        {/* L90-99 — รหัสผ่านใหม่ */}
        <div className="mb-3">
          <div className="relative" id="show_hide_password2">
            <label className="block text-xs font-medium text-muted mb-1">
              รหัสผ่านใหม่{" "}
              <span id="showText" className={`text-red-600 ${newSameAsOld ? "" : "hidden"}`}>
                {" "}
                รหัสผ่านใหม่ต้องไม่ตรงกับรหัสผ่านเดิม
              </span>
            </label>
            <input
              id="password1"
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 pr-11 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
              name="password1"
              type={show2 ? "text" : "password"}
              required
              placeholder="รหัสผ่านใหม่"
              minLength={6}
              maxLength={20}
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              onBlur={() => {
                // L191-201 — equal to old (and old not empty) → invalid
                setNewSameAsOld(oldPass === newPass && oldPass !== "");
              }}
            />
            <div className="absolute right-1 top-[26px] h-[42px] flex items-center">
              <a
                href=""
                className="flex items-center justify-center w-10 h-10 text-muted hover:text-foreground"
                onClick={(e) => {
                  e.preventDefault();
                  toggle2();
                }}
              >
                <i className={show2 ? "fa fa-eye" : "fa fa-eye-slash"} aria-hidden="true"></i>
              </a>
            </div>
            <div className="text-xs text-muted mt-1">(6-20 ตัวอักษร)</div>
          </div>
        </div>
        {/* L100-108 — ยืนยันรหัสผ่านใหม่ */}
        <div className="mb-3">
          <div className="relative" id="show_hide_password3">
            <label className="block text-xs font-medium text-muted mb-1">
              ยืนยันรหัสผ่านใหม่{" "}
              <span id="showText2" className={`text-red-600 ${confirmMismatch ? "" : "hidden"}`}>
                {" "}
                รหัสผ่านใหม่ไม่ตรงกัน
              </span>
            </label>
            <input
              id="password2"
              className={`w-full rounded-lg border bg-white dark:bg-surface px-3 py-2 pr-11 text-base md:text-sm focus:outline-none focus:ring-2 ${
                confirmMismatch
                  ? "is-invalid border-red-500 focus:ring-red-500/30 focus:border-red-500"
                  : "border-border focus:ring-red-500/30 focus:border-red-500"
              }`}
              name="password2"
              type={show3 ? "text" : "password"}
              required
              placeholder="ยืนยันรหัสผ่านใหม่"
              minLength={6}
              maxLength={20}
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              onBlur={() => {
                // L178-188 — confirm not equal to new → invalid
                setConfirmMismatch(newPass !== confirmPass);
              }}
            />
            <div className="absolute right-1 bottom-0 h-[42px] flex items-center">
              <a
                href=""
                className="flex items-center justify-center w-10 h-10 text-muted hover:text-foreground"
                onClick={(e) => {
                  e.preventDefault();
                  toggle3();
                }}
              >
                <i className={show3 ? "fa fa-eye" : "fa fa-eye-slash"} aria-hidden="true"></i>
              </a>
            </div>
          </div>
        </div>
        {/* L109-112 — modal-footer action bar */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-5 pt-4 border-t border-border">
          <button
            type="button"
            className="rounded-lg border border-border bg-white dark:bg-surface text-foreground hover:bg-surface-alt px-4 py-2 text-sm font-bold"
            data-dismiss="modal"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            name="update"
            value="update"
            id="btnSubmit"
            className="rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={submitDisabled}
          >
            เปลี่ยนรหัสผ่านใหม่
          </button>
        </div>
      </form>

      {/* account-settings.php L206-247 — the SweetAlert result popup.
          The legacy plugin SweetAlert2 is not an app dependency, so the
          legacy popup's title/text/type are reproduced as a scoped
          overlay using the same Thai strings + the same success-then-
          logout timing. */}
      {alertMsg && (
        <div className="pcs-swal-overlay" role="alert">
          <div className="pcs-swal-box">
            <div className={`pcs-swal-icon pcs-swal-icon-${alertMsg.type}`}>
              {alertMsg.type === "success" ? "✓" : "!"}
            </div>
            <h2 className="pcs-swal-title">{alertMsg.title}</h2>
            {alertMsg.text && <div className="pcs-swal-text">{alertMsg.text}</div>}
            {alertMsg.type === "error" && (
              <button
                type="button"
                className="btn btn-outline-info round btn-min-width"
                onClick={() => setDismissed(state)}
              >
                ตกลง
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

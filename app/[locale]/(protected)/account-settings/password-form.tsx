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

  // ── SweetAlert result handling (account-settings.php L206-247) ──
  const [alertMsg, setAlertMsg] = useState<{
    title: string;
    text: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    if (!state) return;
    switch (state.sweetalert) {
      case "sPass":
        // L208-219 — success + redirect to logout/ after 4500ms
        setAlertMsg({
          title: "อัปเดตข้อมูลสำเร็จ",
          text: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง!!!",
          type: "success",
        });
        window.setTimeout(() => {
          void accountSettingsLogoutAction();
        }, 4500);
        break;
      case "eSQL":
        // L220-228
        setAlertMsg({
          title: "ผิดพลาด",
          text: "กรุณาลองใหม่อีกครั้ง!!!",
          type: "error",
        });
        break;
      case "ePass":
        // L229-237
        setAlertMsg({
          title: "ผิดพลาด",
          text: "รหัสผ่านเดิมไม่ถูกต้อง!!!",
          type: "error",
        });
        break;
      case "eConfirm":
        // L238-246
        setAlertMsg({
          title: "ผิดพลาด",
          text: "รหัสใหม่ไม่ตรงกัน!!!",
          type: "error",
        });
        break;
      case "empty":
        // L7 — legacy alert("กรุณากรอกข้อมูลให้ครบ")
        setAlertMsg({
          title: "กรุณากรอกข้อมูลให้ครบ",
          text: "",
          type: "error",
        });
        break;
    }
  }, [state]);

  return (
    <>
      {/* account-settings.php L79-113 — the password-change <form> */}
      <span className="font-16">เปลี่ยนรหัสผ่านใหม่ </span>
      <hr />
      <form className="form-horizontal mt-2" action={formAction} autoComplete="off">
        {/* L80-88 — รหัสผ่านเดิม */}
        <div className="form-group row">
          <div className="col-12" id="show_hide_password">
            <label className="form-control-label">รหัสผ่านเดิม</label>
            <input
              id="password"
              className="form-control form-control-lg"
              name="password"
              type={show1 ? "text" : "password"}
              required
              placeholder="รหัสผ่านเดิม"
              minLength={6}
              maxLength={20}
              value={oldPass}
              onChange={(e) => setOldPass(e.target.value)}
            />
            <div className="input-group-addon input-show-pass">
              {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
              <a
                href=""
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
        <div>
          <hr />
        </div>
        {/* L90-99 — รหัสผ่านใหม่ */}
        <div className="form-group row">
          <div className="col-12" id="show_hide_password2">
            <label className="form-control-label">
              รหัสผ่านใหม่{" "}
              <span id="showText" className={`text-danger ${newSameAsOld ? "" : "d-none"}`}>
                {" "}
                รหัสผ่านใหม่ต้องไม่ตรงกับรหัสผ่านเดิม
              </span>
            </label>
            <input
              id="password1"
              className="form-control form-control-lg"
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
            <div className="input-info">(6-20 ตัวอักษร)</div>
            <div className="input-group-addon input-show-pass">
              {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
              <a
                href=""
                onClick={(e) => {
                  e.preventDefault();
                  toggle2();
                }}
              >
                <i className={show2 ? "fa fa-eye" : "fa fa-eye-slash"} aria-hidden="true"></i>
              </a>
            </div>
          </div>
        </div>
        {/* L100-108 — ยืนยันรหัสผ่านใหม่ */}
        <div className="form-group row">
          <div className="col-12" id="show_hide_password3">
            <label className="form-control-label">
              ยืนยันรหัสผ่านใหม่{" "}
              <span id="showText2" className={`text-danger ${confirmMismatch ? "" : "d-none"}`}>
                {" "}
                รหัสผ่านใหม่ไม่ตรงกัน
              </span>
            </label>
            <input
              id="password2"
              className={`form-control form-control-lg${confirmMismatch ? " is-invalid" : ""}`}
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
            <div className="input-group-addon input-show-pass">
              {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
              <a
                href=""
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
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-outline-secondary round btn-min-width waves-effect"
            data-dismiss="modal"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            name="update"
            value="update"
            id="btnSubmit"
            className="btn btn-outline-info round btn-min-width waves-effect"
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
                onClick={() => setAlertMsg(null)}
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

"use client";

/**
 * Edit-profile modal + form for the faithful-port `/profile` screen — a
 * 1:1 transcription of the legacy PCS Cargo `member/profile.php`
 * `#edit-profile` Bootstrap-4 modal (lines 120-194) + its jQuery
 * page-script (lines 419-456) + its SweetAlert result popups
 * (lines 534-554).
 *
 * D1 / ADR-0017 · runbook `docs/runbook/faithful-port-transcription.md`.
 *
 * This is a transcription, NOT a reinterpretation. The JSX is the exact
 * Bootstrap-4 markup the legacy modal renders — same `#edit-profile`
 * `.modal.animated.bounce` shell, same `.modal-dialog/.modal-content`,
 * same red `.header-from` header, same `<form id="updateProfile">`,
 * same `.form-group > .mb-1` field rows, same labels / placeholders /
 * id attributes / validation attrs / order, same modal-footer. The
 * modal is opened by the page's `data-toggle="modal" data-target=
 * "#edit-profile"` corner button — Bootstrap-4 vendor JS (staged
 * globally in the (protected) layout) wires it 1:1.
 *
 * Only the legacy jQuery behaviours need a client component, so the
 * visible surface here is the legacy modal + form, and the two
 * interactive behaviours it has are reproduced 1:1 with React state:
 *
 *   - `#userEmail` focusout → AJAX `checkEmailUser.php` (profile.php
 *     L422-438): if the email is already taken show the message under
 *     the field, mark `#userEmail` `is-invalid`, disable submit. The
 *     legacy hits a PHP endpoint; the faithful equivalent calls the
 *     `checkEmailTaken` Server Action (same dedupe, same effect).
 *   - `#userTel` focusout → AJAX `checkTelUser.php` (profile.php
 *     L439-455): same, for the phone via `checkTelTaken`.
 *
 * The form posts (legacy: to `profile/`) to the transcribed Server
 * Action `updateProfileAction`; the action returns the legacy
 * `$sweetalert` / `alert()` outcome code and this component renders the
 * matching popup (profile.php L10/27/32/534-554). On `successUpdate`
 * the legacy SweetAlert auto-closes after 2.5s and the page reload then
 * shows fresh data — reproduced via `revalidatePath` in the action +
 * the popup auto-dismissing after 2.5s.
 *
 * The `#userSex` <select> preselect (profile.php L164-172 — the legacy
 * PHP echoes the `selected` option based on `$row['userSex']`) is the
 * `defaultValue` on the controlled-by-default <select> here.
 *
 * Rebrand: PCS -> PR is branding text + member codes only.
 */

import { useActionState, useEffect, useState } from "react";
import {
  updateProfileAction,
  checkEmailTaken,
  checkTelTaken,
  type ProfileUpdateResult,
} from "./actions";

export type EditProfileFields = {
  userName: string;
  userLastName: string;
  userEmail: string;
  userTel: string;
  userBirthday: string;
  userSex: string;
  userFacebook: string;
  userLineID: string;
};

type SwalContent = { title: string; text: string; type: "success" | "error" };

/**
 * Maps the legacy `$sweetalert` outcome + the inline `alert()` branches
 * of profile.php to a popup title/text/type. Pure — derived from the
 * action result during render (no effect).
 *   successUpdate — L536-543 SweetAlert "อัปเดตข้อมูลสำเร็จ"
 *   errorUpdate   — L544-552 SweetAlert "ผิดพลาด" / "กรุณาลองใหม่อีกครั้ง!!!"
 *   empty         — L10  alert("กรุณากรอกข้อมูลให้ครบ")
 *   noAccount     — L27  alert("ไม่มีบัญชีผู้ใช้นี้แล้ว")
 *   dupTel        — L32  alert("มีอีเมลนี้แล้วในระบบ")
 */
function deriveSwal(state: ProfileUpdateResult | null): SwalContent | null {
  if (!state) return null;
  switch (state.sweetalert) {
    case "successUpdate":
      return { title: "อัปเดตข้อมูลสำเร็จ", text: "", type: "success" };
    case "errorUpdate":
      return { title: "ผิดพลาด", text: "กรุณาลองใหม่อีกครั้ง!!!", type: "error" };
    case "empty":
      return { title: "กรุณากรอกข้อมูลให้ครบ", text: "", type: "error" };
    case "noAccount":
      return { title: "ไม่มีบัญชีผู้ใช้นี้แล้ว", text: "", type: "error" };
    case "dupTel":
      return { title: "มีอีเมลนี้แล้วในระบบ", text: "", type: "error" };
    default:
      return null;
  }
}

export function EditProfileForm({ fields }: { fields: EditProfileFields }) {
  const [state, formAction] = useActionState<ProfileUpdateResult | null, FormData>(
    updateProfileAction,
    null,
  );

  // Legacy focusout-AJAX validation state (profile.php L422-455) —
  // the message under #userEmail / #userTel + the is-invalid class +
  // the disabled submit button.
  const [email, setEmail] = useState(fields.userEmail);
  const [tel, setTel] = useState(fields.userTel);
  const [emailMsg, setEmailMsg] = useState("");
  const [telMsg, setTelMsg] = useState("");

  // L431/L447 — document.getElementById("btnSubmit").disabled = true
  // when either AJAX check returned a non-empty (taken) message.
  const submitDisabled = emailMsg !== "" || telMsg !== "";

  // ── SweetAlert result (profile.php L534-554) ──
  // Derived from the action result during render. A dismissed-result
  // ref (by object identity — useActionState mints a fresh result per
  // submit) hides it after the user closes it / the success timer fires.
  const [dismissed, setDismissed] = useState<ProfileUpdateResult | null>(null);
  const alertMsg = state && state !== dismissed ? deriveSwal(state) : null;

  // The ONLY real side effect: the legacy success SweetAlert has
  // `timer: 2500` (profile.php L539) — auto-close after 2.5s. The
  // action already `revalidatePath("/profile")`d, so the refreshed
  // server data shows once the popup clears. No setState beyond the
  // dismissal flag.
  useEffect(() => {
    if (state?.sweetalert !== "successUpdate") return;
    const timer = window.setTimeout(() => setDismissed(state), 2500);
    return () => window.clearTimeout(timer);
  }, [state]);

  return (
    <>
      {/* profile.php L120-194 — the #edit-profile Bootstrap-4 modal.
          Opened by the page's data-toggle button; vendor JS wires it. */}
      <div
        id="edit-profile"
        className="modal animated bounce"
        tabIndex={-1}
        role="dialog"
        aria-hidden="true"
      >
        <div className="modal-dialog">
          <div className="modal-content ">
            <div className="modal-header header-from">
              <h4 className="modal-title">แก้ไขข้อมูลโปรไฟล์</h4>
              <button
                type="button"
                className="close"
                data-dismiss="modal"
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="css-i6dzq1">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="modal-body header-from">
              {/* L128 — legacy form action=profile/ method=POST; here it
                  posts to the transcribed Server Action. Tailwind chrome
                  (ปอน 2026-05-30 · mobile-first): inputs text-base on mobile
                  to dodge iOS zoom, tap targets ≥40px. ZERO logic changed —
                  same name/id/type/defaultValue/required/value/onChange/
                  onBlur/pattern + the is-invalid + messageEmail/messageTel
                  hook classes the focusout-dedupe still targets. */}
              <form
                id="updateProfile"
                className="form-horizontal"
                action={formAction}
                autoComplete="off"
              >
                <div className="grid grid-cols-1 gap-3">
                  {/* L130-133 — ชื่อจริง */}
                  <div>
                    <label
                      className="block text-xs font-medium text-muted mb-1"
                      htmlFor="userName"
                    >
                      ชื่อจริง
                    </label>
                    <input
                      className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-base md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                      name="userName"
                      type="text"
                      placeholder="กรุณากรอกชื่อจริง"
                      maxLength={200}
                      defaultValue={fields.userName}
                      required
                    />
                  </div>
                  {/* L134-137 — นามสกุล */}
                  <div>
                    <label
                      className="block text-xs font-medium text-muted mb-1"
                      htmlFor="userLastName"
                    >
                      นามสกุล
                    </label>
                    <input
                      id="userLastName"
                      className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-base md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                      name="userLastName"
                      type="text"
                      placeholder="กรุณากรอกนามสกุล"
                      maxLength={100}
                      defaultValue={fields.userLastName}
                      required
                    />
                  </div>
                  {/* L138-142 — อีเมล (focusout dedupe → checkEmailUser).
                      Keep `is-invalid` (red ring toggled by emailMsg) +
                      `messageEmail` (legacy AJAX target) classes. */}
                  <div>
                    <label
                      className="block text-xs font-medium text-muted mb-1"
                      htmlFor="userEmail"
                    >
                      อีเมล
                    </label>
                    <input
                      id="userEmail"
                      className={`w-full rounded-lg border bg-white dark:bg-surface px-3 py-2 text-base md:text-sm text-foreground focus:outline-none focus:ring-2 ${
                        emailMsg
                          ? "is-invalid border-red-500 focus:ring-red-500/30 focus:border-red-500"
                          : "border-border focus:ring-red-500/30 focus:border-red-500"
                      }`}
                      name="userEmail"
                      type="email"
                      placeholder="กรุณากรอกอีเมล"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={async () => {
                        // profile.php L422-438 — AJAX checkEmailUser.php
                        const msg = await checkEmailTaken(email);
                        setEmailMsg(msg);
                      }}
                    />
                    <span className="messageEmail block mt-1 text-xs text-red-600">
                      {emailMsg}
                    </span>
                  </div>
                  {/* L150-154 — เบอร์โทร (focusout dedupe → checkTelUser).
                      Keep `is-invalid` + `messageTel` hook classes. */}
                  <div>
                    <label
                      className="block text-xs font-medium text-muted mb-1"
                      htmlFor="userTel"
                    >
                      เบอร์โทร
                    </label>
                    <input
                      id="userTel"
                      className={`w-full rounded-lg border bg-white dark:bg-surface px-3 py-2 text-base md:text-sm text-foreground focus:outline-none focus:ring-2 ${
                        telMsg
                          ? "is-invalid border-red-500 focus:ring-red-500/30 focus:border-red-500"
                          : "border-border focus:ring-red-500/30 focus:border-red-500"
                      }`}
                      name="userTel"
                      type="text"
                      pattern="\d*"
                      placeholder="กรุณากรอกหมายเลขโทรศัพท์ (ไม่มีขีด)"
                      minLength={10}
                      maxLength={10}
                      value={tel}
                      onChange={(e) => setTel(e.target.value)}
                      onBlur={async () => {
                        // profile.php L439-455 — AJAX checkTelUser.php
                        const msg = await checkTelTaken(tel);
                        setTelMsg(msg);
                      }}
                      required
                    />
                    <div className="messageTel mt-1 text-xs text-red-600"> {telMsg} </div>
                  </div>
                  {/* L156-159 — วันเกิด */}
                  <div>
                    <label
                      className="block text-xs font-medium text-muted mb-1"
                      htmlFor="userBirthday"
                    >
                      วันเกิด (ตัวอย่าง. 1998-01-01)
                    </label>
                    <input
                      id="userBirthday"
                      className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-base md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                      name="userBirthday"
                      minLength={10}
                      maxLength={10}
                      type="text"
                      pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
                      placeholder="กรุณากรอกวันเกิด (ปี ค.ศ.-เดือน-วัน)"
                      defaultValue={fields.userBirthday}
                      required
                    />
                  </div>
                  {/* L161-174 — เพศ (legacy PHP echoes the selected option) */}
                  <div>
                    <label
                      className="block text-xs font-medium text-muted mb-1"
                      htmlFor="userSex"
                    >
                      เพศ
                    </label>
                    <select
                      id="userSex"
                      className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-base md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                      name="userSex"
                      defaultValue={fields.userSex}
                      required
                    >
                      {fields.userSex === "" && (
                        <option value="">กรุณาเลือกเพศ</option>
                      )}
                      {fields.userSex !== "" && (
                        <option value="">กรุณาเลือกเพศ...</option>
                      )}
                      <option value="ชาย">ชาย</option>
                      <option value="หญิง">หญิง</option>
                    </select>
                  </div>
                  {/* L176-179 — เฟสบุ๊ค */}
                  <div>
                    <label
                      className="block text-xs font-medium text-muted mb-1"
                      htmlFor="userFacebook"
                    >
                      เฟสบุ๊ค
                    </label>
                    <input
                      id="userFacebook"
                      className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-base md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                      name="userFacebook"
                      type="url"
                      placeholder="URL เฟสบุ๊ค"
                      defaultValue={fields.userFacebook}
                    />
                  </div>
                  {/* L181-184 — ไอดีไลน์ */}
                  <div>
                    <label
                      className="block text-xs font-medium text-muted mb-1"
                      htmlFor="userLineID"
                    >
                      ไอดีไลน์
                    </label>
                    <input
                      id="userLineID"
                      className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-base md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                      name="userLineID"
                      type="text"
                      placeholder="ไอดีไลน์"
                      defaultValue={fields.userLineID}
                    />
                  </div>
                  {/* L185-188 — modal-footer action bar. Keep `modal-footer`
                      + `data-dismiss="modal"` (Bootstrap-JS close wiring) +
                      id/name/value/type/disabled. */}
                  <div className="modal-footer flex flex-wrap items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      className="rounded-lg border border-border bg-white dark:bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-alt"
                      data-dismiss="modal"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      name="update"
                      value="update"
                      id="btnSubmit"
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
                      disabled={submitDisabled}
                    >
                      บันทึก
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* profile.php L534-554 — the SweetAlert result popup. The legacy
          plugin SweetAlert2 is not an app dependency, so the popup's
          title/text/type are reproduced as a scoped overlay using the
          same Thai strings + the same success auto-close timing. */}
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

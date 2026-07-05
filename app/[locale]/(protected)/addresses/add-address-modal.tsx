"use client";

/**
 * The "เพิ่มที่อยู่" entry — a real client-side popup (no navigation).
 *
 * Legacy address.php opened the add-address form as an auto-toggled
 * Bootstrap-4 modal; the first Tailwind rebuild faked it by linking to
 * `/addresses?page=1` and re-rendering the modal server-side (a FULL
 * navigation). This rebuilds it as our own React-state modal — the exact
 * pattern shipped on /service-import (`add-forwarder-modal.tsx`): a green
 * pill trigger → `useState` open → `createPortal` to <body> → backdrop /
 * X / "ยกเลิก" / Escape all close it · body-scroll-lock while open ·
 * bottom-sheet on phones, centred card on `sm+`.
 *
 * The whole `<form action={addAddressAction}>` body lives here. The form
 * contract is preserved 100% (every input name/type/required/maxLength/
 * pattern + the hidden lat/long) — addAddressAction (`./add-address-action`)
 * is unchanged. The prefill name/lastname/tel come from the page (server →
 * tb_users) as props.
 *
 * BUG FIX (2026-05-30 · ปอน): the four required location fields
 * (district ตำบล/แขวง · amphoe อำเภอ/เขต · province จังหวัด · zipcode
 * รหัสไปรษณีย์) were hidden inside `#demo1 { display:none }` (a legacy
 * jQuery.Thailand autocomplete that was never ported), so EVERY submit
 * failed the action's required-field guard → `?error=incomplete` and
 * nothing saved. They are now normal visible labelled inputs. The inert
 * `#map` Google-Maps div + the "ปักหมุดตำแหน่ง" block were dropped (inert
 * legacy plugins); the hidden lat/long inputs stay (the action reads them ·
 * empty → stored as 0).
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { Plus, X, MapPin } from "lucide-react";
import { addAddressAction } from "./add-address-action";

const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500";
const LABEL_CLASS = "block text-xs font-medium text-muted mb-1";

export function AddAddressModal({
  userName,
  userLastName,
  userTel,
}: {
  userName: string;
  userLastName: string;
  userTel: string;
}) {
  const t = useTranslations("addressPage");
  const [open, setOpen] = useState(false);

  // Lock body scroll + wire Escape-to-close while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {/* Trigger — the green "เพิ่มที่อยู่" pill (same classes as the legacy
          rebuild's <Link>, now a button that opens the popup). */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 py-2 pl-2 pr-4 text-sm font-semibold text-white shadow-sm transition-colors"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-white/25">
          <Plus className="h-4 w-4" />
        </span>
        {t("addAddress")}
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" aria-hidden />

            {/* Panel — bottom-sheet on mobile, centred card on sm+ */}
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-address-title"
              className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-white shadow-xl dark:bg-surface sm:max-w-[640px] sm:rounded-2xl"
            >
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-4 py-3 dark:bg-surface md:px-5 md:py-4">
                <h2
                  id="add-address-title"
                  className="inline-flex items-center gap-2 text-base font-bold text-foreground sm:text-lg"
                >
                  <MapPin className="h-5 w-5 shrink-0 text-primary-600" />
                  {t("addModalTitle")}
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t("close")}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-alt hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="overflow-y-auto px-4 py-4 sm:px-5">
                {/* address.php L497 — the legacy form POSTs to address/; here it
                    submits to the addAddressAction Server Action. */}
                <form action={addAddressAction} autoComplete="off" className="space-y-3">
                  <input type="hidden" name="latitude" id="latitude" />
                  <input type="hidden" name="longitude" id="longitude" />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={LABEL_CLASS} htmlFor="addressName">
                        {t("firstName")}
                      </label>
                      <input
                        className={INPUT_CLASS}
                        id="addressName"
                        name="addressName"
                        type="text"
                        defaultValue={userName}
                        placeholder={t("firstName")}
                        maxLength={200}
                        required
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS} htmlFor="addressLastname">
                        {t("lastName")}
                      </label>
                      <input
                        className={INPUT_CLASS}
                        id="addressLastname"
                        name="addressLastname"
                        type="text"
                        defaultValue={userLastName}
                        placeholder={t("lastName")}
                        maxLength={200}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={LABEL_CLASS} htmlFor="addressTel">
                        {t("tel")}
                      </label>
                      <input
                        className={INPUT_CLASS}
                        id="addressTel"
                        name="addressTel"
                        type="tel"
                        pattern="\d*"
                        defaultValue={userTel}
                        placeholder={t("telPlaceholder")}
                        minLength={10}
                        maxLength={10}
                        required
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS} htmlFor="addressTel2">
                        {t("tel2")}
                      </label>
                      <input
                        className={INPUT_CLASS}
                        id="addressTel2"
                        name="addressTel2"
                        type="tel"
                        pattern="\d*"
                        placeholder={t("telPlaceholder")}
                        minLength={10}
                        maxLength={10}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={LABEL_CLASS} htmlFor="addressNo">
                      {t("addressNo")}{" "}
                      <span className="text-red-600">{t("addressNoEmphasis")}</span>
                    </label>
                    <input
                      className={INPUT_CLASS}
                      id="addressNo"
                      name="addressNo"
                      type="text"
                      placeholder={t("addressNoPlaceholder")}
                      maxLength={200}
                      required
                    />
                    <p className="mt-1 text-xs text-muted">
                      {t("addressNoHelp")}
                    </p>
                  </div>

                  {/* BUG FIX — these 4 fields used to be hidden inside
                      `#demo1 { display:none }`; now visible + required so the
                      save action's required-field guard passes. */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={LABEL_CLASS} htmlFor="district">
                        {t("subdistrict")}
                      </label>
                      <input
                        className={INPUT_CLASS}
                        id="district"
                        name="district"
                        type="text"
                        placeholder={t("subdistrict")}
                        required
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS} htmlFor="amphoe">
                        {t("district")}
                      </label>
                      <input
                        className={INPUT_CLASS}
                        id="amphoe"
                        name="amphoe"
                        type="text"
                        placeholder={t("district")}
                        required
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS} htmlFor="province">
                        {t("province")}
                      </label>
                      <input
                        className={INPUT_CLASS}
                        id="province"
                        name="province"
                        type="text"
                        placeholder={t("province")}
                        required
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS} htmlFor="zipcode">
                        {t("zipcode")}
                      </label>
                      <input
                        className={INPUT_CLASS}
                        id="zipcode"
                        name="zipcode"
                        type="text"
                        pattern="\d*"
                        placeholder={t("zipcode")}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className={LABEL_CLASS} htmlFor="addressNote">
                      {t("noteOptional")}
                    </label>
                    <textarea
                      className={INPUT_CLASS}
                      id="addressNote"
                      name="addressNote"
                      rows={3}
                      placeholder={t("note")}
                      maxLength={500}
                    ></textarea>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-alt dark:bg-surface"
                    >
                      {t("cancel")}
                    </button>
                    <button
                      type="submit"
                      name="add"
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700"
                    >
                      {t("save")}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

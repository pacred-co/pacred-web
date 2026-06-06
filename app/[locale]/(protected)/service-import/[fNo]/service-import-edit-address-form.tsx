"use client";

/**
 * Inline "แก้ไข ที่อยู่จัดส่ง" form on the forwarder detail page.
 *
 * Faithful 1:1 with forwarder.php L1953-2011 — same markup, same Thai
 * labels, same `name="update_fAddress"`. The legacy jQuery slide-down
 * is reproduced as a useState toggle.
 *
 * Server Action: updateLegacyForwarderAddress (forwarder.php L1620-1658
 * POST handler) — UPDATE tb_forwarder SET fAddress*=… copied from the
 * selected tb_address row.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { updateLegacyForwarderAddress } from "@/actions/forwarder-legacy";

type AddressOption = {
  addressid: number | string;
  label: string;
  isMain: boolean;
};

type Props = {
  forwarderId: number;
  options: AddressOption[];
  isEditable: boolean;
};

export function ServiceImportEditAddressForm({
  forwarderId,
  options,
  isEditable,
}: Props) {
  const t = useTranslations("serviceImportEditAddressForm");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, FormDataEntryValue> = {};
    for (const [k, v] of fd.entries()) payload[k] = v;

    startTransition(async () => {
      const res = await updateLegacyForwarderAddress(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <span id="text-fAddress">
        <span className="inline-block" id="to-edit-fAddress">
          {!open && (
            <a
              href="javascript:void(0)"
              className="ml-1 text-xs font-medium text-sky-600 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                setOpen(true);
              }}
            >
              {t("edit")}
            </a>
          )}
        </span>
      </span>
      <div
        id="fAddressForm"
        style={{ display: open ? "block" : "none" }}
        className="mt-2"
      >
        {isEditable ? (
          <form
            className="rounded-xl border border-border bg-surface-alt/40 p-3"
            method="POST"
            action="#"
            autoComplete="off"
            onSubmit={handleSubmit}
            aria-busy={isPending}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="block text-xs font-medium text-muted" htmlFor="addressID">
                {t("deliveryAddress")}
              </label>
              <Link
                href="/addresses/add"
                target="_blank"
                className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:underline"
              >
                {t("addNewAddress")} <i className="fa fa-plus"></i>
              </Link>
            </div>
            {error && (
              <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}
            <input type="hidden" name="ID" value={forwarderId} />
            <select
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-base md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-colors"
              name="addressID"
              id="addressID"
              required
              defaultValue=""
            >
              <option value="">{t("selectAddressPlaceholder")}</option>
              {options.map((o) => (
                <option key={o.addressid} value={o.addressid}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full border border-border bg-white dark:bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-alt active:scale-[0.98] transition-all"
                id="to-text-fAddress"
                onClick={() => setOpen(false)}
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                name="update_fAddress"
                className="inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-60"
                disabled={isPending}
              >
                {t("save")}
              </button>
            </div>
          </form>
        ) : (
          <span className="inline-flex items-center rounded bg-red-600 px-2 py-1 text-sm text-white">
            {t("cannotChangeArrived")}
          </span>
        )}
      </div>
    </>
  );
}

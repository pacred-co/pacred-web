"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { updateProfileBasic, upsertCorporate, updateNotifyChannels, unlinkLine } from "@/actions/profile";
import type { Profile } from "@/lib/auth/get-user";

type Corporate = {
  profile_id: string;
  tax_id: string;
  company_name: string;
  company_address: string | null;
  status: "pending" | "verified" | "rejected";
  rejection_reason: string | null;
};

type Props = {
  profile: Profile;
  corporate: Corporate | null;
};

export function ProfileForm({ profile, corporate }: Props) {
  const t = useTranslations("profile");
  const isJuristic = profile.account_type === "juristic";
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  }

  async function onSubmitBasic(formData: FormData) {
    startTransition(async () => {
      const res = await updateProfileBasic({
        first_name:     String(formData.get("first_name") ?? ""),
        last_name:      String(formData.get("last_name") ?? ""),
        phone:          String(formData.get("phone") ?? ""),
        email:          String(formData.get("email") ?? ""),
        sex:            (formData.get("sex") || undefined) as "male" | "female" | "other" | undefined,
        birthday:       String(formData.get("birthday") ?? ""),
        line_id:        String(formData.get("line_id") ?? ""),
        facebook_url:   String(formData.get("facebook_url") ?? ""),
        freight_type:   (formData.get("freight_type") || undefined) as "seafreight" | "cargo" | undefined,
        pay_method:     (formData.get("pay_method") || undefined) as "origin" | "destination" | undefined,
        transport_type: String(formData.get("transport_type") ?? ""),
        ship_by:        String(formData.get("ship_by") ?? ""),
        shop_user:      formData.get("shop_user") === "on",
        note:           String(formData.get("note") ?? ""),
      });
      flash(res.ok ? "ok" : "err", res.ok ? t("savedBasic") : res.error);
    });
  }

  async function onSubmitCorporate(formData: FormData) {
    startTransition(async () => {
      const res = await upsertCorporate({
        tax_id:          String(formData.get("tax_id") ?? ""),
        company_name:    String(formData.get("company_name") ?? ""),
        company_address: String(formData.get("company_address") ?? ""),
      });
      flash(res.ok ? "ok" : "err", res.ok ? t("savedCorporate") : res.error);
    });
  }

  async function onToggleChannel(channel: "line" | "email", checked: boolean) {
    const next = {
      line:  profile.notify_channels?.line ?? true,
      email: profile.notify_channels?.email ?? true,
      [channel]: checked,
    };
    startTransition(async () => {
      const res = await updateNotifyChannels(next);
      flash(res.ok ? "ok" : "err", res.ok ? t("savedNotify") : res.error);
    });
  }

  async function onUnlinkLine() {
    if (!confirm(t("lineUnlinkConfirm"))) return;
    startTransition(async () => {
      const res = await unlinkLine();
      flash(res.ok ? "ok" : "err", res.ok ? t("lineUnlinked") : res.error);
    });
  }

  return (
    <div className="space-y-8">
      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          msg.kind === "ok"
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {msg.text}
        </div>
      )}

      {/* BASIC */}
      <form action={onSubmitBasic} className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-foreground">{t("sectionBasic")}</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("firstName")} required>
            <input name="first_name" defaultValue={profile.first_name ?? ""} className={inputCls} required />
          </FormField>
          <FormField label={t("lastName")} required>
            <input name="last_name" defaultValue={profile.last_name ?? ""} className={inputCls} required />
          </FormField>
          <FormField label={t("phone")} required hint={t("phoneHint")}>
            <input name="phone" defaultValue={profile.phone ?? ""} className={inputCls} required />
          </FormField>
          <FormField label={t("email")}>
            <input name="email" type="email" defaultValue={profile.email ?? ""} className={inputCls} />
          </FormField>
          <FormField label={t("sex")}>
            <select name="sex" defaultValue={profile.sex ?? ""} className={inputCls}>
              <option value="">{t("sexUnspecified")}</option>
              <option value="male">{t("sexMale")}</option>
              <option value="female">{t("sexFemale")}</option>
              <option value="other">{t("sexOther")}</option>
            </select>
          </FormField>
          <FormField label={t("birthday")}>
            <input name="birthday" type="date" defaultValue={profile.birthday ?? ""} className={inputCls} />
          </FormField>
          <FormField label={t("lineId")}>
            <input name="line_id" defaultValue={profile.line_id ?? ""} className={inputCls} />
          </FormField>
          <FormField label={t("facebookUrl")}>
            <input name="facebook_url" defaultValue={profile.facebook_url ?? ""} className={inputCls} />
          </FormField>
        </div>

        <hr className="border-border" />

        <h3 className="text-sm font-semibold text-foreground">{t("sectionShipping")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("freightType")}>
            <select name="freight_type" defaultValue={profile.freight_type ?? ""} className={inputCls}>
              <option value="">{t("sexUnspecified")}</option>
              <option value="cargo">{t("freightTypeCargo")}</option>
              <option value="seafreight">{t("freightTypeSeafreight")}</option>
            </select>
          </FormField>
          <FormField label={t("payMethod")}>
            <select name="pay_method" defaultValue={profile.pay_method ?? ""} className={inputCls}>
              <option value="">{t("sexUnspecified")}</option>
              <option value="origin">{t("payMethodOrigin")}</option>
              <option value="destination">{t("payMethodDestination")}</option>
            </select>
          </FormField>
          <FormField label={t("transportType")}>
            <input name="transport_type" defaultValue={profile.transport_type ?? ""} className={inputCls} placeholder={t("transportTypePlaceholder")} />
          </FormField>
          <FormField label={t("shipBy")}>
            <input name="ship_by" defaultValue={profile.ship_by ?? ""} className={inputCls} />
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="shop_user" defaultChecked={profile.shop_user} />
            <span>{t("shopUser")}</span>
          </label>
        </div>

        <FormField label={t("note")}>
          <textarea name="note" rows={3} defaultValue={profile.note ?? ""} className={inputCls} />
        </FormField>

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? t("saving") : t("saveBasic")}
          </Button>
        </div>
      </form>

      {/* CORPORATE */}
      {isJuristic && (
        <form action={onSubmitCorporate} className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">{t("sectionCorporate")}</h2>
            {corporate && <StatusBadge status={corporate.status} t={t} />}
          </div>
          {corporate?.status === "rejected" && corporate.rejection_reason && (
            <p className="text-sm text-red-700 bg-red-50 rounded p-3">
              {t("rejectionReason")}: {corporate.rejection_reason}
            </p>
          )}

          <FormField label={t("taxId")} required hint={t("taxIdHint")}>
            <input name="tax_id" defaultValue={corporate?.tax_id ?? profile.tax_id ?? ""} className={inputCls} required maxLength={13} />
          </FormField>
          <FormField label={t("companyName")} required>
            <input name="company_name" defaultValue={corporate?.company_name ?? profile.company_name ?? ""} className={inputCls} required />
          </FormField>
          <FormField label={t("companyAddress")} required>
            <textarea name="company_address" rows={3} defaultValue={corporate?.company_address ?? ""} className={inputCls} required />
          </FormField>

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? t("saving") : t("saveCorporate")}
            </Button>
          </div>
        </form>
      )}

      {/* NOTIFY */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-foreground">{t("sectionNotify")}</h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">{t("lineChannelTitle")}</p>
            <p className="text-xs text-muted">
              {profile.line_user_id
                ? t("lineLinked", {
                    date: profile.line_linked_at
                      ? new Date(profile.line_linked_at).toLocaleDateString("th-TH")
                      : "",
                  })
                : t("lineNotLinked")}
            </p>
          </div>
          {profile.line_user_id ? (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={profile.notify_channels?.line ?? true}
                onChange={(e) => onToggleChannel("line", e.target.checked)}
                disabled={pending}
              />
              <Button type="button" variant="outline" size="sm" onClick={onUnlinkLine} disabled={pending}>
                {t("lineUnlinkButton")}
              </Button>
            </div>
          ) : (
            // D-1-LIFF: page does its own LIFF init + auth gate.  We do not
            // need to feature-flag the link by NEXT_PUBLIC_LIFF_ID here —
            // /liff/link surfaces a "ระบบยังไม่พร้อม" notice when unset.
            <Link
              href="/liff/link"
              className="inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors px-4 py-1.5 text-sm border border-border bg-surface hover:bg-surface-alt"
            >
              {t("lineLinkButton")}
            </Link>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">{t("emailChannelTitle")}</p>
            <p className="text-xs text-muted">{t("emailChannelDesc")}</p>
          </div>
          <input
            type="checkbox"
            checked={profile.notify_channels?.email ?? true}
            onChange={(e) => onToggleChannel("email", e.target.checked)}
            disabled={pending}
          />
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

function FormField({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-foreground">
        {label}{required && <span className="text-red-600 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

function StatusBadge({ status, t }: { status: "pending" | "verified" | "rejected"; t: ReturnType<typeof useTranslations<"profile">> }) {
  const styles = {
    pending:  "bg-yellow-50 text-yellow-700 border-yellow-200",
    verified: "bg-green-50 text-green-700 border-green-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
  };
  const label =
    status === "pending"  ? t("corporateStatusPending")
  : status === "verified" ? t("corporateStatusVerified")
  : t("corporateStatusRejected");
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${styles[status]}`}>
      {label}
    </span>
  );
}

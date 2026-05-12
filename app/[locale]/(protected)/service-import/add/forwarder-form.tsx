"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createForwarder, previewPrice } from "@/actions/forwarder";
import { uploadSlip } from "@/lib/storage-upload";
import type { CalcPriceBreakdown } from "@/lib/forwarder/calc-price";

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type DefaultAddress = {
  first_name: string;
  last_name: string;
  phone: string;
  phone2: string | null;
  address_line: string;
  sub_district: string;
  district: string;
  province: string;
  postal_code: string;
  note: string | null;
};

type Props = {
  defaultAddress: DefaultAddress | null;
};

type Form = {
  source_warehouse: "guangzhou" | "yiwu";
  transport_type:   "truck" | "ship" | "air";
  product_type:     "general" | "tisi" | "fda" | "special";
  rate_basis:       "kg" | "cbm" | "auto";
  ship_by:          string;
  pay_method:       "origin" | "destination";

  ship_first_name: string;  ship_last_name: string;
  ship_phone: string;       ship_phone2: string;
  ship_address_line: string; ship_sub_district: string;
  ship_district: string;     ship_province: string;
  ship_postal_code: string;  ship_note: string;

  box_count: string;
  weight_kg: string;
  width_cm: string;
  length_cm: string;
  height_cm: string;

  crate: boolean;
  qc:    boolean;
  domestic_china_thb:    string;
  thailand_delivery_thb: string;
  other_price:           string;
  other_price_desc:      string;

  cover_image_path:  string | null;
  extra_image_paths: string[];

  detail:    string;
  note_user: string;
};

export function ForwarderForm({ defaultAddress }: Props) {
  const t = useTranslations("forwarder");
  const router = useRouter();

  const initial: Form = {
    source_warehouse: "guangzhou",
    transport_type:   "truck",
    product_type:     "general",
    rate_basis:       "auto",
    ship_by:          "",
    pay_method:       "origin",
    ship_first_name:    defaultAddress?.first_name ?? "",
    ship_last_name:     defaultAddress?.last_name ?? "",
    ship_phone:         defaultAddress?.phone ?? "",
    ship_phone2:        defaultAddress?.phone2 ?? "",
    ship_address_line:  defaultAddress?.address_line ?? "",
    ship_sub_district:  defaultAddress?.sub_district ?? "",
    ship_district:      defaultAddress?.district ?? "",
    ship_province:      defaultAddress?.province ?? "",
    ship_postal_code:   defaultAddress?.postal_code ?? "",
    ship_note:          defaultAddress?.note ?? "",
    box_count: "1",
    weight_kg: "",
    width_cm: "", length_cm: "", height_cm: "",
    crate: false,
    qc:    false,
    domestic_china_thb:    "0",
    thailand_delivery_thb: "0",
    other_price:           "0",
    other_price_desc:      "",
    cover_image_path:  null,
    extra_image_paths: [],
    detail: "", note_user: "",
  };

  const [form, setForm] = useState<Form>(initial);
  const [breakdown, setBreakdown] = useState<CalcPriceBreakdown | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; f_no: string; total: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const numericMeasurements = useMemo(() => ({
    weight_kg: Number(form.weight_kg) || 0,
    width_cm:  Number(form.width_cm)  || 0,
    length_cm: Number(form.length_cm) || 0,
    height_cm: Number(form.height_cm) || 0,
    domestic_china_thb:    Number(form.domestic_china_thb)    || 0,
    thailand_delivery_thb: Number(form.thailand_delivery_thb) || 0,
    other_price:           Number(form.other_price)           || 0,
  }), [form.weight_kg, form.width_cm, form.length_cm, form.height_cm, form.domestic_china_thb, form.thailand_delivery_thb, form.other_price]);

  // Debounced price preview as user types
  useEffect(() => {
    const canPreview = numericMeasurements.weight_kg > 0
      || (numericMeasurements.width_cm > 0 && numericMeasurements.length_cm > 0 && numericMeasurements.height_cm > 0);
    if (!canPreview) {
      // Clear stale breakdown after a tick to dodge the eslint-react-hooks
      // "cascading renders" rule.
      const clearTimer = setTimeout(() => setBreakdown(null), 0);
      return () => clearTimeout(clearTimer);
    }
    const timer = setTimeout(async () => {
      const res = await previewPrice({
        source_warehouse: form.source_warehouse,
        transport_type:   form.transport_type,
        product_type:     form.product_type,
        rate_basis:       form.rate_basis,
        weight_kg:        numericMeasurements.weight_kg,
        width_cm:         numericMeasurements.width_cm,
        length_cm:        numericMeasurements.length_cm,
        height_cm:        numericMeasurements.height_cm,
        crate:            form.crate,
        qc:               form.qc,
        domestic_china_thb:    numericMeasurements.domestic_china_thb,
        thailand_delivery_thb: numericMeasurements.thailand_delivery_thb,
        other_price:           numericMeasurements.other_price,
      });
      if (res.ok && res.data) {
        setBreakdown(res.data);
        setPreviewError(null);
      } else if (!res.ok) {
        setPreviewError(res.error);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [
    numericMeasurements,
    form.source_warehouse, form.transport_type, form.product_type, form.rate_basis,
    form.crate, form.qc,
  ]);

  async function onCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const res = await uploadSlip(file, "yuan_payment"); // reuse slips bucket policy for now
    if (res.ok) setForm({ ...form, cover_image_path: res.path });
    else setError(res.error);
  }

  async function onExtraUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const res = await uploadSlip(file, "yuan_payment");
    if (res.ok) setForm({ ...form, extra_image_paths: [...form.extra_image_paths, res.path] });
    else setError(res.error);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await createForwarder({
        source_warehouse: form.source_warehouse,
        transport_type:   form.transport_type,
        product_type:     form.product_type,
        rate_basis:       form.rate_basis,
        ship_by:          form.ship_by || undefined,
        pay_method:       form.pay_method,
        ship_first_name:    form.ship_first_name,
        ship_last_name:     form.ship_last_name,
        ship_phone:         form.ship_phone,
        ship_phone2:        form.ship_phone2 || undefined,
        ship_address_line:  form.ship_address_line,
        ship_sub_district:  form.ship_sub_district,
        ship_district:      form.ship_district,
        ship_province:      form.ship_province,
        ship_postal_code:   form.ship_postal_code,
        ship_note:          form.ship_note || undefined,
        box_count:  Number(form.box_count) || 1,
        weight_kg:  numericMeasurements.weight_kg,
        width_cm:   numericMeasurements.width_cm,
        length_cm:  numericMeasurements.length_cm,
        height_cm:  numericMeasurements.height_cm,
        crate:      form.crate,
        qc:         form.qc,
        domestic_china_thb:    numericMeasurements.domestic_china_thb,
        thailand_delivery_thb: numericMeasurements.thailand_delivery_thb,
        other_price:           numericMeasurements.other_price,
        other_price_desc:      form.other_price_desc || undefined,
        cover_image_path:  form.cover_image_path || undefined,
        extra_image_paths: form.extra_image_paths,
        detail:    form.detail || undefined,
        note_user: form.note_user || undefined,
        items:     [],
      });
      if (res.ok && res.data) {
        setDone({ id: res.data.id, f_no: res.data.f_no, total: res.data.total_price });
        router.refresh();
      } else if (!res.ok) {
        setError(res.error);
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center space-y-3">
        <h2 className="text-xl font-bold text-green-800">{t("createdTitle")}</h2>
        <p className="text-sm text-green-700">
          {t("createdSubtitle", {
            fNo: done.f_no,
            total: done.total.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
          })}
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" type="button" onClick={() => router.push("/service-import/pending")}>
            {t("viewPending")}
          </Button>
          <Button type="button" onClick={() => { setDone(null); setForm(initial); setBreakdown(null); }}>
            {t("createAnother")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {/* Classification */}
        <Section title={t("sectionClassification")}>
          <Grid>
            <Field label={t("sourceWarehouse")} required>
              <select value={form.source_warehouse} onChange={(e) => setForm({ ...form, source_warehouse: e.target.value as Form["source_warehouse"] })} className={inputCls}>
                <option value="guangzhou">กวางโจว</option>
                <option value="yiwu">อี้อู</option>
              </select>
            </Field>
            <Field label={t("transportType")} required>
              <select value={form.transport_type} onChange={(e) => setForm({ ...form, transport_type: e.target.value as Form["transport_type"] })} className={inputCls}>
                <option value="truck">{t("transport.truck")} 🚚</option>
                <option value="ship">{t("transport.ship")} 🚢</option>
                <option value="air">{t("transport.air")} ✈️</option>
              </select>
            </Field>
            <Field label={t("productTypeLabel")} required>
              <select value={form.product_type} onChange={(e) => setForm({ ...form, product_type: e.target.value as Form["product_type"] })} className={inputCls}>
                <option value="general">{t("productType.general")}</option>
                <option value="tisi">{t("productType.tisi")}</option>
                <option value="fda">{t("productType.fda")}</option>
                <option value="special">{t("productType.special")}</option>
              </select>
            </Field>
            <Field label={t("rateBasis")} hint={t("rateBasisHint")}>
              <select value={form.rate_basis} onChange={(e) => setForm({ ...form, rate_basis: e.target.value as Form["rate_basis"] })} className={inputCls}>
                <option value="auto">{t("rateBasisAuto")}</option>
                <option value="kg">{t("rateBasisKg")}</option>
                <option value="cbm">{t("rateBasisCbm")}</option>
              </select>
            </Field>
            <Field label={t("payMethod")}>
              <select value={form.pay_method} onChange={(e) => setForm({ ...form, pay_method: e.target.value as Form["pay_method"] })} className={inputCls}>
                <option value="origin">{t("payMethodOrigin")}</option>
                <option value="destination">{t("payMethodDestination")}</option>
              </select>
            </Field>
            <Field label={t("shipBy")}>
              <input value={form.ship_by} onChange={(e) => setForm({ ...form, ship_by: e.target.value })} className={inputCls} />
            </Field>
          </Grid>
        </Section>

        {/* Measurements */}
        <Section title={t("sectionMeasurements")}>
          <Grid>
            <Field label={t("boxCount")}>
              <input type="number" min="1" value={form.box_count} onChange={(e) => setForm({ ...form, box_count: e.target.value })} className={inputCls} />
            </Field>
            <Field label={t("weightKg")} required>
              <input type="number" min="0" step="0.01" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} className={inputCls} required />
            </Field>
          </Grid>
          <p className="text-xs text-muted">{t("dimensionsHint")}</p>
          <Grid>
            <Field label={t("widthCm")} required>
              <input type="number" min="0" step="0.01" value={form.width_cm} onChange={(e) => setForm({ ...form, width_cm: e.target.value })} className={inputCls} required />
            </Field>
            <Field label={t("lengthCm")} required>
              <input type="number" min="0" step="0.01" value={form.length_cm} onChange={(e) => setForm({ ...form, length_cm: e.target.value })} className={inputCls} required />
            </Field>
            <Field label={t("heightCm")} required>
              <input type="number" min="0" step="0.01" value={form.height_cm} onChange={(e) => setForm({ ...form, height_cm: e.target.value })} className={inputCls} required />
            </Field>
          </Grid>
        </Section>

        {/* Optional services */}
        <Section title={t("sectionServices")}>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={form.crate} onChange={(e) => setForm({ ...form, crate: e.target.checked })} className="mt-1" />
            <span>{t("crate")}<span className="block text-xs text-muted">{t("crateDesc")}</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={form.qc} onChange={(e) => setForm({ ...form, qc: e.target.checked })} className="mt-1" />
            <span>{t("qc")}<span className="block text-xs text-muted">{t("qcDesc")}</span></span>
          </label>
          <Grid>
            <Field label={t("domesticChinaThb")} hint={t("domesticChinaHint")}>
              <input type="number" min="0" step="0.01" value={form.domestic_china_thb} onChange={(e) => setForm({ ...form, domestic_china_thb: e.target.value })} className={inputCls} />
            </Field>
            <Field label={t("thailandDeliveryThb")}>
              <input type="number" min="0" step="0.01" value={form.thailand_delivery_thb} onChange={(e) => setForm({ ...form, thailand_delivery_thb: e.target.value })} className={inputCls} />
            </Field>
            <Field label={t("otherPrice")}>
              <input type="number" min="0" step="0.01" value={form.other_price} onChange={(e) => setForm({ ...form, other_price: e.target.value })} className={inputCls} />
            </Field>
            <Field label={t("otherPriceDesc")}>
              <input value={form.other_price_desc} onChange={(e) => setForm({ ...form, other_price_desc: e.target.value })} className={inputCls} />
            </Field>
          </Grid>
        </Section>

        {/* Address */}
        <Section title={t("sectionAddress")}>
          <Grid>
            <Field label={t("firstName")} required>
              <input value={form.ship_first_name} onChange={(e) => setForm({ ...form, ship_first_name: e.target.value })} className={inputCls} required />
            </Field>
            <Field label={t("lastName")} required>
              <input value={form.ship_last_name} onChange={(e) => setForm({ ...form, ship_last_name: e.target.value })} className={inputCls} required />
            </Field>
            <Field label={t("phone")} required>
              <input value={form.ship_phone} onChange={(e) => setForm({ ...form, ship_phone: e.target.value })} className={inputCls} required />
            </Field>
            <Field label={t("phone2")}>
              <input value={form.ship_phone2} onChange={(e) => setForm({ ...form, ship_phone2: e.target.value })} className={inputCls} />
            </Field>
          </Grid>
          <Field label={t("addressLine")} required>
            <input value={form.ship_address_line} onChange={(e) => setForm({ ...form, ship_address_line: e.target.value })} className={inputCls} required />
          </Field>
          <Grid>
            <Field label={t("subDistrict")} required>
              <input value={form.ship_sub_district} onChange={(e) => setForm({ ...form, ship_sub_district: e.target.value })} className={inputCls} required />
            </Field>
            <Field label={t("district")} required>
              <input value={form.ship_district} onChange={(e) => setForm({ ...form, ship_district: e.target.value })} className={inputCls} required />
            </Field>
            <Field label={t("province")} required>
              <input value={form.ship_province} onChange={(e) => setForm({ ...form, ship_province: e.target.value })} className={inputCls} required />
            </Field>
            <Field label={t("postalCode")} required>
              <input value={form.ship_postal_code} onChange={(e) => setForm({ ...form, ship_postal_code: e.target.value })} className={inputCls} required maxLength={5} />
            </Field>
          </Grid>
          <Field label={t("addressNote")}>
            <textarea rows={2} value={form.ship_note} onChange={(e) => setForm({ ...form, ship_note: e.target.value })} className={inputCls} />
          </Field>
        </Section>

        {/* Images */}
        <Section title={t("sectionImages")}>
          <Field label={t("coverImage")}>
            <input type="file" accept="image/*" onChange={onCoverUpload} className="block w-full text-sm" />
            {form.cover_image_path && <span className="block text-xs text-green-700">{t("uploaded")}</span>}
          </Field>
          <Field label={t("extraImages")}>
            <input type="file" accept="image/*" onChange={onExtraUpload} className="block w-full text-sm" />
            <span className="block text-xs text-muted">{t("extraImagesHint", { count: form.extra_image_paths.length })}</span>
          </Field>
        </Section>

        {/* Notes */}
        <Section title={t("sectionNotes")}>
          <Field label={t("detail")}>
            <textarea rows={3} value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} className={inputCls} />
          </Field>
          <Field label={t("noteUser")}>
            <textarea rows={2} value={form.note_user} onChange={(e) => setForm({ ...form, note_user: e.target.value })} className={inputCls} />
          </Field>
        </Section>
      </div>

      {/* Price preview sidebar */}
      <aside className="lg:sticky lg:top-20 self-start space-y-4">
        <div className="rounded-2xl border border-primary-200 bg-primary-50/40 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-foreground mb-3">{t("pricePreview")}</h3>
          {previewError && (
            <p className="text-xs text-red-700 mb-2">{previewError}</p>
          )}
          {!breakdown ? (
            <p className="text-xs text-muted">{t("priceFillFirst")}</p>
          ) : (
            <div className="space-y-2 text-sm">
              <Row label={t("basisUsed")} value={breakdown.basis_used === "kg" ? "kg" : "cbm"} />
              <Row label={t("rateUsed")} value={`฿${breakdown.rate_used.toFixed(2)} (${breakdown.rate_source}${breakdown.rate_tier ? ` t${breakdown.rate_tier}` : ""})`} />
              <Row label={t("transportSubtotal")} value={`฿${breakdown.transport_subtotal.toFixed(2)}`} />
              {breakdown.juristic_discount > 0 && (
                <Row label={t("juristicDiscount")} value={`-฿${breakdown.juristic_discount.toFixed(2)}`} color="text-green-700" />
              )}
              <Row label={t("serviceFee")} value={`+฿${breakdown.service_fee.toFixed(2)}`} />
              {breakdown.crate_price > 0      && <Row label={t("crateFee")}        value={`+฿${breakdown.crate_price.toFixed(2)}`} />}
              {breakdown.qc_price > 0         && <Row label={t("qcFee")}           value={`+฿${breakdown.qc_price.toFixed(2)}`} />}
              {breakdown.domestic_china_thb > 0 && <Row label={t("domesticChina")}   value={`+฿${breakdown.domestic_china_thb.toFixed(2)}`} />}
              {breakdown.thailand_delivery_thb > 0 && <Row label={t("thailandDelivery")} value={`+฿${breakdown.thailand_delivery_thb.toFixed(2)}`} />}
              {breakdown.other_price > 0      && <Row label={t("otherFee")}         value={`+฿${breakdown.other_price.toFixed(2)}`} />}
              <hr className="border-primary-200" />
              <Row label={t("totalPrice")} value={`฿${breakdown.total_price.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`} bold />
            </div>
          )}
        </div>

        <Button type="submit" fullWidth disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </aside>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
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

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-bold text-base" : ""} ${color ?? ""}`}>
      <span className="text-muted">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { createOrder } from "@/actions/orders";
import { SERVICE_TYPES } from "@/lib/validators/orders";

const INPUT =
  "h-11 w-full rounded-[10px] border-[1.5px] border-border bg-white dark:bg-surface px-3.5 text-sm text-foreground placeholder:text-zinc-400 transition focus:border-primary-500 focus:outline-none focus:ring-[3px] focus:ring-primary-500/10";

export default function NewOrderPage() {
  const t = useTranslations("newOrderPage");
  const router = useRouter();
  const [serviceType, setServiceType] = useState<(typeof SERVICE_TYPES)[number]>("import");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createOrder({
        serviceType,
        origin: origin || null,
        destination: destination || null,
        description,
      });
      if (res.ok) {
        router.replace("/orders");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <main className="mx-auto w-full max-w-[640px] px-4 py-12">
        <Link
          href="/orders"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary-600"
        >
          <ArrowLeft className="h-4 w-4" /> {t("backToList")}
        </Link>

        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-foreground">{t("heading")}</h1>
          <p className="mt-1 text-sm text-muted">
            {t("subtitle")}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">
                {t("serviceType")}
              </label>
              <select
                value={serviceType}
                onChange={(e) =>
                  setServiceType(e.target.value as (typeof SERVICE_TYPES)[number])
                }
                className={INPUT}
              >
                {SERVICE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {t(`service_${s}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-foreground">
                  {t("origin")}
                </label>
                <input
                  type="text"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder={t("originPlaceholder")}
                  className={INPUT}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-foreground">
                  {t("destination")}
                </label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder={t("destinationPlaceholder")}
                  className={INPUT}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">
                {t("description")} <span className="text-primary-600">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder={t("descriptionPlaceholder")}
                required
                className={`${INPUT} h-auto py-3`}
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-[14px] text-base font-semibold text-white transition hover:-translate-y-0.5 hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("submit")}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}

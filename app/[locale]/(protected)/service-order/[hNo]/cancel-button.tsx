"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cancelServiceOrder } from "@/actions/service-order";

export function CancelButton({ hNo }: { hNo: string }) {
  const t = useTranslations("serviceOrder");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onCancel() {
    if (!confirm(t("cancelConfirm", { hNo }))) return;
    startTransition(async () => {
      const res = await cancelServiceOrder(hNo);
      if (res.ok) {
        router.push("/service-order");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div>
      <Button variant="outline" size="sm" type="button" onClick={onCancel} disabled={pending}>
        {pending ? t("cancelling") : t("cancelOrder")}
      </Button>
      {error && <p className="text-xs text-red-700 mt-1">{error}</p>}
    </div>
  );
}

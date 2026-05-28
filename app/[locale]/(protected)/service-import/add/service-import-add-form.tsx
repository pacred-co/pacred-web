"use client";

/**
 * The `<form>` body of the legacy `#add-forwarder` modal — extracted into a
 * Client Component so onSubmit can call the `createLegacyForwarder`
 * Server Action (forwarder.php L9-160 `save` POST).
 *
 * Faithful 1:1 with the legacy modal markup — same Bootstrap-4 classes,
 * same Thai labels, same field names (`fTrackingCHN`, `fDetail`, `fAmount`,
 * `addressID`, `hTransportType`, `crate`, `pro`, `hShipBy`). The submit
 * collects the FormData, hands it to the Server Action, and on success
 * routes to `/service-import` (the legacy `sweetalert='sSave'` + reload
 * pattern, replaced with a client router refresh).
 */

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createLegacyForwarder } from "@/actions/forwarder-legacy";

type Props = {
  children: ReactNode;
};

export function ServiceImportAddForm({ children }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, FormDataEntryValue> = {};
    for (const [k, v] of fd.entries()) {
      // Server Action only handles primitive fields — the legacy `fCover`
      // image upload is NOT ported here (the legacy itself accepts the
      // create without an image; image upload stays a separate AJAX in
      // the legacy and is unwired in this faithful port).
      if (k === "fCover") continue;
      payload[k] = v;
    }

    startTransition(async () => {
      const res = await createLegacyForwarder(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Legacy reload + redirect to the list (sweetalert='sSave' then go).
      router.push("/service-import");
      router.refresh();
    });
  }

  return (
    // The legacy form had `method="POST" action="/service-import"` +
    // `encType="multipart/form-data"` — preserved verbatim so the markup
    // matches; `onSubmit` overrides the default submit and routes through
    // the Server Action.
    <form
      className="form-horizontal"
      method="POST"
      action="/service-import"
      encType="multipart/form-data"
      autoComplete="off"
      onSubmit={handleSubmit}
      aria-busy={isPending}
    >
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      {children}
    </form>
  );
}

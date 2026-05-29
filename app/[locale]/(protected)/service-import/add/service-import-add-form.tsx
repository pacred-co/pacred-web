"use client";

/**
 * The new-order form body — a Client Component so onSubmit can call the
 * `createLegacyForwarder` Server Action (legacy `forwarder.php` L9-160
 * `save` POST).
 *
 * Workflow is faithful to legacy PCS Cargo; the UI is Pacred's own Tailwind
 * design (AGENTS.md §0a — we copy the working system, polish the look).
 * Field names are preserved verbatim so the Server Action contract holds:
 * `fTrackingCHN`, `fDetail`, `fAmount`, `addressID`, `hTransportType`,
 * `crate`, `pro`. The submit collects FormData, hands it to the action,
 * and on success routes to `/service-import`.
 *
 * The footer (ยกเลิก / สร้างออเดอร์) lives here so it can reflect the
 * pending state (disable + spinner) while the action runs.
 */

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createLegacyForwarder } from "@/actions/forwarder-legacy";

type Props = {
  children: ReactNode;
  /**
   * When rendered inside the list-view modal, the parent owns the close
   * affordance — pass `onCancel` so the "ยกเลิก" button closes the dialog
   * (instead of navigating away) and `onSuccess` so the dialog closes after
   * a successful create. On the standalone /service-import/add page neither
   * is passed, so the footer falls back to <Link> navigation + a redirect.
   */
  onCancel?: () => void;
  onSuccess?: () => void;
};

export function ServiceImportAddForm({ children, onCancel, onSuccess }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, FormDataEntryValue> = {};
    for (const [k, v] of fd.entries()) {
      // The legacy `fCover` image upload is NOT ported here (the create
      // succeeds without an image; admin attaches photos in back-office).
      if (k === "fCover") continue;
      payload[k] = v;
    }

    startTransition(async () => {
      const res = await createLegacyForwarder(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (onSuccess) {
        onSuccess();
        router.refresh();
      } else {
        router.push("/service-import");
        router.refresh();
      }
    });
  }

  return (
    <form
      autoComplete="off"
      onSubmit={handleSubmit}
      aria-busy={isPending}
      className="space-y-4"
    >
      {children}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-xl border border-border bg-white px-5 py-3 text-base font-medium text-foreground transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
          >
            ยกเลิก
          </button>
        ) : (
          <Link
            href="/service-import"
            className="inline-flex items-center justify-center rounded-xl border border-border bg-white px-5 py-3 text-base font-medium text-foreground transition hover:bg-surface"
          >
            ยกเลิก
          </Link>
        )}
        <button
          type="submit"
          name="save"
          disabled={isPending}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending && <Loader2 className="h-5 w-5 animate-spin" />}
          {isPending ? "กำลังสร้างออเดอร์…" : "สร้างออเดอร์"}
        </button>
      </div>
    </form>
  );
}

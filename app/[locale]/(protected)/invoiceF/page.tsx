import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";

/**
 * Customer ใบเสร็จรับเงิน (forwarder receipt PDF) — a FAITHFUL 1:1
 * URL-mirror of the legacy PCS Cargo `member/invoiceF.php` entry point
 * (D1 / ADR-0017 · faithful-port transcription · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * ── Why this route exists ────────────────────────────────────────
 * The legacy URL contract is `invoiceF.php?id=<rID>` (a comma-joined
 * receipt id list when `?type=1`). SMS notifications, email links and
 * old customer bookmarks all point at that URL. A faithful port keeps
 * the URL the same so those external references keep working.
 *
 * The 2026-05-22 gap audit (docs/research/php-vs-pacred-gap-2026-05-22.md
 * §1) flagged this page as missing: "Customer-side standalone invoice
 * PDF for forwarder orders. We have admin-side at /admin/accounting/
 * forwarder-invoice but no customer download endpoint." This file
 * closes that gap on the customer URL surface.
 *
 * ── Implementation ───────────────────────────────────────────────
 * The actual rendered document is the existing faithful transcription
 * at `/freight/invoice/[id]` (created earlier in the D1 wave — see
 * `app/[locale]/(protected)/freight/invoice/[id]/page.tsx` for the full
 * 1:1 reproduction of every invoiceF.php mysqli query + every
 * Bootstrap-4 markup block + the WHT-1% personal-receipt gate + the
 * Convert() baht-text reader + the 13-rows-per-page pagination). This
 * route is the legacy URL mirror; it forwards the request there.
 *
 * The forwarding form is a server-side `redirect()` (NOT a client
 * link) so:
 *  - It preserves the legacy URL semantics: old bookmarks land on a
 *    canonical Pacred URL.
 *  - The ownership gate at `/freight/invoice/[id]` (verifying the
 *    receipt's `tb_receipt.userid` matches the requester's
 *    `member_code`) is the single source of truth — duplicating it
 *    here would be drift waiting to happen. The `requireAuth()` call
 *    below is the only authn gate this redirect needs; the authz
 *    gate runs at the destination.
 *
 * ── Transcription notes ──────────────────────────────────────────
 *  - `?id` accepts a single rID or a comma-joined list (legacy
 *    `explode(",", $_GET['id'])`). Both forms are forwarded as a
 *    single URL-encoded path segment to `/freight/invoice/[id]`
 *    which itself splits on comma (same as the legacy).
 *  - `?type=1` is the legacy bulk-print marker — read with no visible
 *    effect by invoiceF.php (both branches assign `$nameDocs='<br/>'`).
 *    Forwarded verbatim for fidelity.
 *  - A missing/empty `?id` → 404 (legacy returns a blank PDF; Pacred
 *    surfaces a 404 instead per runbook §9.7 — empty PDFs are
 *    hostile UX).
 */

export const dynamic = "force-dynamic";

type SearchParams = {
  id?: string;
  type?: string;
};

export default async function InvoiceFPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // invoiceF.php L6-10 — a logged-out visitor is redirected to /login.
  // requireAuth() handles the redirect chain (Pacred equivalent of the
  // legacy `if(!isset($_COOKIE["pcs_userID"]))` redirect to login/?url=).
  await requireAuth();

  const sp = await searchParams;

  // invoiceF.php L11: `if(isset($_GET['id']))`. Empty / missing → 404.
  const id = (sp.id ?? "").trim();
  if (id === "") notFound();

  // Forward to the existing faithful transcription, preserving the
  // legacy `?type` query param (legacy reads it without rendering it,
  // but a verbatim forward keeps the URL contract honest for future
  // additions that might depend on it).
  const target = sp.type
    ? `/freight/invoice/${encodeURIComponent(id)}?type=${encodeURIComponent(sp.type)}`
    : `/freight/invoice/${encodeURIComponent(id)}`;

  redirect(target);
}

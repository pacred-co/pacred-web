/**
 * Public quotation page — `/q/[token]` (owner ภูม 2026-06-22).
 *
 * The login-free surface a customer opens from the share-link the sales rep sent
 * them. The ใบเสนอราคา twin of the public receipt `/r/[token]`: NO auth — the
 * `[token]` is an unguessable HMAC capability link (`{id}-{32hex}`, see
 * lib/quote/quote-token.ts) so the row id stays non-enumerable while the link
 * holder can open their own quotation directly.
 *
 * Renders the EXACT same `<QuoteCard>` the admin tool renders, from the STORED
 * `QuoteModel` payload (no recompute) → the customer sees the same numbers the
 * sales rep saw. The only extra here is a print/download toolbar (print-hidden).
 */

import { notFound } from "next/navigation";
import { QuoteCard } from "@/components/quote/quote-paper";
import { loadQuotation } from "@/lib/quote/load-quotation";
import { verifyQuoteToken } from "@/lib/quote/quote-token";
import PublicQuoteToolbar from "./public-quote-toolbar";

export const dynamic = "force-dynamic";

// A quotation (price + customer PII) must never be indexed.
export const metadata = {
  title: "ใบเสนอราคา — Pacred",
  robots: { index: false, follow: false },
};

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Capability gate: a valid HMAC token resolves to a quotation id; anything
  // malformed / forged / tampered → 404 (no enumeration, no info leak).
  const id = verifyQuoteToken(token);
  if (id === null) notFound();

  const quote = await loadQuotation(id);
  if (!quote) notFound();

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div id="publicQuoteDoc" className="mx-auto max-w-3xl px-2 py-4 sm:px-4 print:max-w-none print:p-0">
        <QuoteCard model={quote.model} />
      </div>

      <PublicQuoteToolbar model={quote.model} />
    </div>
  );
}

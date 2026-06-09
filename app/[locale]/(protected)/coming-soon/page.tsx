/* eslint-disable @next/next/no-img-element */
import { Link } from "@/i18n/navigation";
import { MessageCircle, Phone, Mail } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { CONTACT, LINE_OA } from "@/components/seo/site";

/**
 * Placeholder page for customer services not built yet (ส่งออก / พิธีการศุลกากร).
 * Contact banner pulled up flush at the top + Add-LINE / Call / Contact CTAs
 * (owner 2026-06-09 — "ยกขึ้นชนขอบแบบ booking · ตรงกดเป็นปุ่ม Add Line โทร Contact").
 * Param-driven (?service=export|customs) only for the alt text.
 */
export const dynamic = "force-dynamic";

const TITLES: Record<string, string> = {
  export: "ส่งออกสินค้า",
  customs: "พิธีการศุลกากร",
};

export default async function ComingSoonPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  await requireAuth();
  const sp = await searchParams;
  const title = TITLES[sp.service ?? ""] ?? "บริการนี้";

  return (
    <main className="mx-auto w-full max-w-4xl px-3 pt-2 pb-12 md:px-4 md:pt-3">
      {/* Banner — flush at the top (no vertical centering gap). */}
      <img
        src="/images/newset/contactbanner.png"
        alt={title}
        className="w-full rounded-2xl shadow-sm"
      />

      {/* Contact CTAs — Add LINE · Call · Contact */}
      <div className="mt-5 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
        <a
          href={LINE_OA.addFriendUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#06C755] px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#05b14c]"
        >
          <MessageCircle className="h-5 w-5" />
          แอดไลน์ @pacred
        </a>
        <a
          href={`tel:${CONTACT.phone}`}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700"
        >
          <Phone className="h-5 w-5" />
          โทร {CONTACT.phoneDisplay}
        </a>
        <Link
          href="/contact"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-white px-6 py-3 text-sm font-bold text-foreground transition-colors hover:bg-gray-50"
        >
          <Mail className="h-5 w-5" />
          ติดต่อเรา
        </Link>
      </div>
    </main>
  );
}

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { AccountingMenubar } from "@/components/admin/accounting-menubar";
import { listDocBotHsLibrary } from "@/actions/admin/doc-bot-hs";

import { HsLibraryBotClient } from "./hs-library-bot-client";

/**
 * /admin/accounting/hs-library/bot — คลังจากบอท (DOC BOT HS library · READ-ONLY).
 *
 * The DOC BOT's real HS knowledge base (doc_bot_hs_codes · 749 rows · mig 0249)
 * grouped BY PRODUCT into พิกัดหลัก (a computed most-complete default) + พิกัดรอง
 * (every other distinct code for that product) — the owner's "ที่อยู่หลัก/ที่อยู่
 * รอง" model so the Doc team CHOOSES per case (เลี่ยงพิกัด when a code is ติด).
 *
 * ⚠️ READ-ONLY (§0e) — this page only DISPLAYS the bot library. It never edits /
 * merges / dedups into the canonical hs_codes; the owner picks the primaries in
 * a later slice. §0c: the initial read destructures error. §0d: reachable from
 * the sibling /admin/accounting/hs-library header (itself in the accounting
 * sidebar). Gate = same roles as hs-library.
 */

export const dynamic = "force-dynamic";

const VIEW_ROLES = [
  "super",
  "accounting",
  "pricing",
  "freight_import_doc",
  "freight_clearance_both",
] as const;

export default async function HsLibraryBotPage() {
  await requireAdmin([...VIEW_ROLES]);

  const res = await listDocBotHsLibrary();
  const rows = res.ok && res.data ? res.data : [];

  return (
    <>
      <AccountingMenubar activeHref="/admin/accounting/hs-library" />
      <main className="p-6 lg:p-8 space-y-5 max-w-5xl">
        <header className="space-y-1">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · บัญชี · คลัง HS · บอท</p>
            <Link
              href="/admin/accounting/hs-library"
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-alt"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> กลับคลัง HS (หลัก)
            </Link>
          </div>
          <h1 className="text-2xl font-bold">คลัง HS จาก DOC BOT</h1>
          <p className="text-xs text-muted leading-relaxed">
            คลังพิกัดที่ <b>DOC BOT</b> เรียนรู้ไว้ (749 รายการ) จัดกลุ่มตามสินค้า — แต่ละสินค้ามี
            <b> พิกัดหลัก</b> (ระบบเลือกให้จากรายการที่ข้อมูลครบสุด) + <b>พิกัดรอง</b> (เลขพิกัดอื่นที่เคยตอบกับสินค้าเดียวกัน)
            เพื่อให้ฝ่ายเอกสาร <b>เลือกใช้เองตามเคส</b>. สินค้าที่เคยถูกตอบด้วยพิกัดต่างกันจะมีป้าย ⚠️ <b>พิกัดขัดกัน</b>.
          </p>
          <p className="text-[11px] text-muted">
            ⚠️ อ่านอย่างเดียว — ยังไม่รวมเข้าคลัง HS หลัก (จะให้เจ้าของเลือกพิกัดหลักในขั้นตอนถัดไป).
          </p>
        </header>

        {!res.ok && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            โหลดคลัง DOC BOT ไม่สำเร็จ: {res.error}
          </p>
        )}

        <HsLibraryBotClient rows={rows} />
      </main>
    </>
  );
}

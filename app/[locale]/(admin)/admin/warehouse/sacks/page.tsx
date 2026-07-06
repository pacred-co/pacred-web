/**
 * /admin/warehouse/sacks — กระสอบรวม (consolidated-sack) list.
 *
 * READ-ONLY partner MIRROR. A "กระสอบ" = a GROUP of momo_import_tracks rows sharing
 * momo_sack_no (the MOMO partner data already on prod). Pacred mirrors it — it does
 * not create sacks (warehouse-created sacks are a future own-freight feature).
 * PHYSICAL-ONLY (qty / cbm / weight + status) — NO money.
 *
 * 🔒 Role-gated: super / warehouse / ops.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listSacks } from "@/actions/admin/sack";
import { SackListClient } from "./sack-list-client";

export const dynamic = "force-dynamic";

type SearchParams = {
  container?: string;
  sackNo?: string;
  memberCode?: string;
};

export default async function WarehouseSacksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin(["super", "warehouse", "ops"]);
  const sp = await searchParams;

  const res = await listSacks({
    container: sp.container,
    sackNo: sp.sackNo,
    memberCode: sp.memberCode,
  });
  const sacks = res.ok ? (res.data ?? []) : [];

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl">
      <header>
        <div className="text-[11px] text-gray-400 mb-1">
          <Link href="/admin" className="hover:underline">
            แอดมิน
          </Link>{" "}
          / คลัง / กระสอบรวม
        </div>
        <h1 className="text-2xl font-bold text-gray-900">กระสอบรวม</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          กระสอบที่พาร์ทเนอร์รวมพัสดุชิ้นเล็กหลายรายการเข้าเป็นหน่วยเดียวที่โกดังจีน →
          เข้าตู้ LCL · ข้อมูล sync มาจาก MOMO (อ่านอย่างเดียว)
        </p>
      </header>

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs text-sky-800">
        กระสอบ sync จาก MOMO — ระบบนี้แสดงเพื่อดูอย่างเดียว (Pacred สร้าง/แก้กระสอบเองตอนทำเฟรทเอง · เร็วๆนี้)
      </div>

      {!res.ok && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          โหลดรายการกระสอบไม่สำเร็จ: {res.error}
        </div>
      )}

      <SackListClient sacks={sacks} filters={sp} />
    </main>
  );
}

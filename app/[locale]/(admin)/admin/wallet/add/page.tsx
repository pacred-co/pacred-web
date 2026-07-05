/**
 * /admin/wallet/add — admin-initiated manual wallet entry (Wave 8).
 *
 * Faithful port of the legacy `pcs-admin/wallet.php?page=add` admin
 * branch. Writes to `tb_wallet_hs` (with side-effect on `tb_wallet`)
 * via `adminCreateWalletHsManual` in actions/admin/wallet-hs.ts.
 *
 * Wave 20 P1 batch 2-a (2026-05-26): UI rewrite ONLY — drop
 * `.pcs-legacy` scope + `<link>` to admin-base.css + Bootstrap-4
 * markup → Pacred Tailwind v4 (chrome modeled on
 * `/admin/customers/transfer-rep/page.tsx` and
 * `/admin/forwarders/combine-bill/add/page.tsx`).
 *
 * Existing wired functionality preserved:
 *   - AdminWalletAddForm — client island with controlled inputs +
 *     adminCreateWalletHsManual. The form's Bootstrap-4 class chrome
 *     renders unstyled here (no `.pcs-legacy` scope) but is fully
 *     functional; Wave 21 will restyle that island in Tailwind.
 *
 * Query-param prefill: pass `?q=PR1234` to pre-select a customer.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { GuideNote } from "@/components/ui/guide-note";
import { fetchCorporateNameMap } from "@/lib/admin/customer-identity";
import { AdminWalletAddForm, type CustomerLite } from "./form";

export const dynamic = "force-dynamic";

type SP = { q?: string };

export default async function AdminWalletAddPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // Preselect from ?q=PR1234 (case-insensitive)
  let preset: CustomerLite | null = null;
  const qRaw = (sp.q ?? "").trim();
  if (qRaw) {
    const candidate = qRaw.toUpperCase();
    const { data, error } = await admin
      .from("tb_users")
      // tb_users columns are camelCase on prod+dev; alias back to the lowercase
      // CustomerLite field names so the form's reads (c.userid/c.username) work.
      .select("userid:userID, username:userName, userlastname:userLastName, usertel:userTel, useremail:userEmail")
      .eq("userID", candidate)
      .maybeSingle<CustomerLite>();
    if (error) {
      console.error(`[tb_users list] failed`, { code: error.code, message: error.message });
    }
    preset = data ?? null;
  }

  // Current wallet balance for the preset customer — so the form can pre-fill
  // the exact amount to CLEAR a negative balance (owner 2026-06-26: "จ่ายนอกระบบ
  // → แนบสลิป+ตรวจ ในขั้นตอนเดียว → ไม่ติดลบ"). Negative = a legacy "เติม-แล้วจ่าย"
  // pair whose top-up leg was never recorded; recording the missing payment here
  // (status='2' = ตรวจแล้วทันที) nets it back to ≥0.
  let presetBalance: number | null = null;
  if (preset) {
    const { data: wRow, error: wErr } = await admin
      .from("tb_wallet")
      .select("wallettotal")
      .eq("userid", preset.userid)
      .maybeSingle<{ wallettotal: number | string | null }>();
    if (wErr) {
      console.error(`[tb_wallet balance] failed`, { code: wErr.code, message: wErr.message });
    }
    presetBalance = wRow ? Number(wRow.wallettotal ?? 0) : 0;
  }

  // Recent customers — order by registered desc · cap 20 for the dropdown.
  const { data: recentRaw, error: recentRawErr } = await admin
    .from("tb_users")
    // camelCase columns aliased to lowercase CustomerLite field names.
    .select("userid:userID, username:userName, userlastname:userLastName, usertel:userTel, useremail:userEmail")
    .eq("userStatus", "1")
    .order("userRegistered", { ascending: false })
    .limit(20);
  if (recentRawErr) {
    console.error(`[tb_users list] failed`, { code: recentRawErr.code, message: recentRawErr.message });
  }
  const recent = (recentRaw ?? []) as unknown as CustomerLite[];

  // นิติบุคคล — resolve company names for the picker (preset + recent) in ONE
  // batched tb_corporate lookup so a juristic customer shows the COMPANY, not
  // the contact person (owner directive · N+1-free · soft-fails to person name).
  const pickerUserIds = [preset?.userid, ...recent.map((c) => c.userid)];
  const corpNames = await fetchCorporateNameMap(admin, pickerUserIds);
  if (preset) preset.corporatename = corpNames.get(preset.userid) ?? null;
  for (const c of recent) c.corporatename = corpNames.get(c.userid) ?? null;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <title>เพิ่ม Topup ด้วยมือ | PR Admin</title>

      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="text-xs text-muted flex gap-1.5 items-center flex-wrap">
        <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
        <span>/</span>
        <Link href="/admin/wallet" className="hover:text-primary-600">กระเป๋าสตางค์</Link>
        <span>/</span>
        <span className="text-foreground">เพิ่มรายการด้วยมือ</span>
      </nav>

      {/* Header */}
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">กระเป๋าสตางค์</p>
        <h1 className="mt-1 text-2xl font-bold">เพิ่มรายการ Wallet ด้วยมือ</h1>
        <p className="mt-1 text-sm text-muted">
          เขียนแถวลงตาราง <code className="rounded bg-surface-alt px-1 text-xs">tb_wallet_hs</code> + อัปเดต{" "}
          <code className="rounded bg-surface-alt px-1 text-xs">tb_wallet.wallettotal</code> อัตโนมัติ
        </p>
      </div>

      {/* owner 2026-06-26 — จ่ายนอกระบบ = แนบสลิป + ตรวจ ในขั้นตอนเดียว. ย้ำให้ชัดว่า
          บันทึกที่นี่ = ตรวจแล้วทันที (ไม่เข้าคิว pending) เพราะแอดมินที่กด = ผู้ตรวจ. */}
      <GuideNote variant="tip" title="จ่ายนอกระบบ → แนบสลิป + ตรวจ จบในขั้นตอนเดียว">
        ลูกค้าโอนจ่ายนอกแอป (โอนเข้าบัญชีตรง) → เลือกลูกค้า → ใส่ยอดตรงสลิป → <strong>แนบสลิป</strong> → กดบันทึก.
        บันทึกที่นี่ <strong>= ตรวจแล้วทันที</strong> (แอดมินที่กด = ผู้ตรวจ) — <strong>ไม่เข้าคิวรอตรวจ ไม่ค้าง pending</strong> —
        ยอดกระเป๋าเด้งขึ้นทันที จึง<strong>ไม่ทำให้ติดลบ</strong>.
      </GuideNote>

      {preset && presetBalance != null && presetBalance < 0 && (
        <GuideNote variant="warn" title={`ลูกค้ารายนี้ยอดติดลบอยู่ −฿${Math.abs(presetBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}>
          ติดลบ = เคยมีรายการ “เติม-แล้วจ่าย” ที่ขาเติม (เงินเข้า) ไม่ถูกบันทึก. ฟอร์มด้านล่าง
          <strong>ใส่ยอดให้เคลียร์พอดีเป็น 0 ไว้แล้ว</strong> — แค่แนบสลิปการโอนของลูกค้า → กดบันทึก → ติดลบหายทันที.
        </GuideNote>
      )}

      {/* Form card — wraps the existing wired client island */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <AdminWalletAddForm preset={preset} recent={recent} presetBalance={presetBalance} />
      </section>
    </main>
  );
}

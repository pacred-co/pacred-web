/**
 * /admin/wallet/[id] — rich topup-detail view + edit form (Wave 19 BUG #3).
 *
 * Faithful port of `pcs-admin/include/pages/wallet/w-s-deposit-detail.php`
 * (~530 LOC). Replaces the Wave 7 read-only stub.
 *
 * Layout (top-to-bottom):
 *   1. TWO TOP CARDS  — left: this customer's wallet + cash-back balance
 *                       right: system-wide wallet + cash-back totals
 *                       Each has a "+ เติมเงินเข้ากระเป๋า" CTA → /admin/wallet/add
 *   2. BREADCRUMB     — หน้าแรก / กระเป๋าสตางค์ / รายการเติมเงิน / #<id>
 *   3. DETAIL CARD (2-col on md+):
 *      LEFT  — rich row info: timestamp, customer link, target bank,
 *              slip date (with collapsible <EditDateSlipForm>), amount,
 *              (if linked to a wallet-shop spending) reference rows.
 *      RIGHT — status badge, "ดำเนินรายการแล้ว โดย <admin>" if completed,
 *              <ApproveRejectForm> if still pending (status='1'),
 *              SLIP IMAGE (signed URL, click-to-zoom).
 *   4. SIMILAR-TX WARNING — red banner listing other tb_wallet_hs rows with
 *      the same DATE(dateslip) + amount + status='1' (excluding self).
 *
 * Design philosophy (AGENTS §0a): rebuild the SAME LOGIC in Tailwind v4 +
 * Lucide. Don't copy the Bootstrap-4 markup verbatim — `text-danger`,
 * `card-body pb-0`, `progress-bar` are out. Same fields + same buttons +
 * same status flow are in.
 *
 * Role gate (AGENTS §0c, legacy L17): CEO/Manager/Accounting/ITDT →
 * Pacred roles ["super", "ops", "accounting"]. requireAdmin already grants
 * "super" implicit access to every role-gated page.
 */

import { notFound } from "next/navigation";
import { ArrowLeft, Plus, User as UserIcon, AlertTriangle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { EditDateSlipForm, ApproveRejectForm } from "./edit-form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ",
  "2": "อนุมัติแล้ว",
  "3": "ปฏิเสธ",
};
const STATUS_CLS: Record<string, string> = {
  "1": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "2": "bg-green-100 text-green-700 border-green-200",
  "3": "bg-red-100 text-red-700 border-red-200",
};

type WalletHsRow = {
  id: number;
  date: string | null;
  dateslip: string | null;
  amount: number;
  status: string | null;
  type: string | null;
  imagesslip: string | null;
  userid: string;
  note: string | null;
  nouserbank: string | null;
  nameuserbank: string | null;
  depositnamebank: string | null;
  adminidupdate: string | null;
  reforder: string | null;
};

type UserRow = {
  userid: string;
  username: string | null;
  userlastname: string | null;
  usertel: string | null;
  useremail: string | null;
  userpicture: string | null;
};

type LinkedWalletHsRow = {
  id: number;
  amount: number;
};

type SimilarRow = {
  id: number;
  status: string | null;
  imagesslip: string | null;
};

type SimilarResolved = SimilarRow & { slipUrl: string | null };

export default async function AdminWalletDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(["ops", "accounting", "super"]);
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const admin = createAdminClient();

  // ── Main row ──
  const { data: rowRaw, error: rowErr } = await admin
    .from("tb_wallet_hs")
    .select(
      "id,date,dateslip,amount,status,type,imagesslip,userid,note,nouserbank,nameuserbank,depositnamebank,adminidupdate,reforder",
    )
    .eq("id", id)
    .maybeSingle();
  if (rowErr) {
    console.error(`[tb_wallet_hs list] failed`, {
      code: rowErr.code,
      message: rowErr.message,
      details: rowErr.details,
      hint: rowErr.hint,
    });
    throw new Error(
      `Failed to load tb_wallet_hs (${rowErr.code ?? "unknown"}): ${rowErr.message}`,
    );
  }
  if (!rowRaw) notFound();
  const row = rowRaw as unknown as WalletHsRow;

  // ── Parallel reads for the rest of the page ──
  const [
    { data: userRaw, error: userErr },
    { data: walletRaw, error: walletErr },
    { data: cbRaw, error: cbErr },
    { data: allWallets, error: allWalletsErr },
    { data: allCb, error: allCbErr },
    { data: linkedRaw, error: linkedErr },
  ] = await Promise.all([
    admin
      .from("tb_users")
      .select("userid,username,userlastname,usertel,useremail,userpicture")
      .eq("userid", row.userid)
      .maybeSingle(),
    admin
      .from("tb_wallet")
      .select("wallettotal")
      .eq("userid", row.userid)
      .maybeSingle(),
    admin
      .from("tb_cash_back")
      .select("cbtotal")
      .eq("userid", row.userid)
      .maybeSingle(),
    admin.from("tb_wallet").select("wallettotal").limit(50_000),
    admin.from("tb_cash_back").select("cbtotal").limit(50_000),
    admin
      .from("tb_wallet_hs")
      .select("id,amount")
      .eq("reforder", String(row.id))
      .eq("userid", row.userid),
  ]);
  if (userErr) console.error(`[tb_users list] failed`, { code: userErr.code, message: userErr.message });
  if (walletErr) console.error(`[tb_wallet list] failed`, { code: walletErr.code, message: walletErr.message });
  if (cbErr) console.error(`[tb_cash_back list] failed`, { code: cbErr.code, message: cbErr.message });
  if (allWalletsErr)
    console.error(`[tb_wallet list-all] failed`, { code: allWalletsErr.code, message: allWalletsErr.message });
  if (allCbErr)
    console.error(`[tb_cash_back list-all] failed`, { code: allCbErr.code, message: allCbErr.message });
  if (linkedErr)
    console.error(`[tb_wallet_hs linked] failed`, { code: linkedErr.code, message: linkedErr.message });

  const user = userRaw as unknown as UserRow | null;
  const walletTotalUser = Number((walletRaw as { wallettotal: number | null } | null)?.wallettotal ?? 0);
  const cbTotalUser = Number((cbRaw as { cbtotal: number | null } | null)?.cbtotal ?? 0);
  const walletTotalAll = (allWallets ?? []).reduce(
    (s, r) => s + Number((r as { wallettotal: number | null }).wallettotal ?? 0),
    0,
  );
  const cbTotalAll = (allCb ?? []).reduce(
    (s, r) => s + Number((r as { cbtotal: number | null }).cbtotal ?? 0),
    0,
  );
  const linkedRows = (linkedRaw ?? []) as LinkedWalletHsRow[];
  const linkedSpentTotal = linkedRows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const linkedDebitAndCredit = linkedSpentTotal + Number(row.amount ?? 0);

  // ── Resolve slip URL ──
  const slipUrl = await resolveLegacyUrl(row.imagesslip, "slip");

  // ── Similar-tx detector (legacy L487-501): same DATE(dateslip) + amount,
  //    type<>5, exclude self. Render as red banner.
  //    PostgREST has no DATE() helper, so we filter by [day_start, day_end]
  //    range derived from dateslip. Skip the check when dateslip is null.
  let similar: SimilarResolved[] = [];
  if (row.dateslip) {
    const slipDate = new Date(row.dateslip);
    if (!Number.isNaN(slipDate.getTime())) {
      const dayStart = new Date(slipDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(slipDate);
      dayEnd.setHours(23, 59, 59, 999);
      const { data: simRaw, error: simErr } = await admin
        .from("tb_wallet_hs")
        .select("id,status,imagesslip")
        .eq("amount", row.amount)
        .neq("id", row.id)
        .neq("type", "5")
        .gte("dateslip", dayStart.toISOString())
        .lte("dateslip", dayEnd.toISOString());
      if (simErr) {
        console.error(`[tb_wallet_hs similar] failed`, { code: simErr.code, message: simErr.message });
      } else {
        const sims = (simRaw ?? []) as SimilarRow[];
        similar = await Promise.all(
          sims.map(async (s) => ({ ...s, slipUrl: await resolveLegacyUrl(s.imagesslip, "slip") })),
        );
      }
    }
  }

  // ── Derive view-bits ──
  const amount = Number(row.amount ?? 0);
  const status = row.status ?? "1";
  const isPending = status === "1";
  const userid = row.userid;
  const customerName = `${user?.username ?? ""} ${user?.userlastname ?? ""}`.trim() || "—";
  const userAvatar = await resolveLegacyUrl(user?.userpicture ?? null, "profile-thumb");

  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────
  return (
    <main className="p-4 lg:p-6 max-w-6xl mx-auto space-y-4">
      {/* ── 1. TOP CARDS: per-user + system-wide ── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <BalanceCard
          title="ยอดเงินของสมาชิก"
          subtitle={`กระเป๋าสตางค์ ${userid} (บาท)`}
          amount={walletTotalUser}
          cashback={cbTotalUser}
        />
        <BalanceCard
          title="ยอดรวมทั้งหมดในระบบ"
          subtitle="กระเป๋าสตางค์ (บาท)"
          amount={walletTotalAll}
          cashback={cbTotalAll}
        />
      </section>

      {/* ── 2. BREADCRUMB ── */}
      <nav aria-label="breadcrumb" className="text-xs text-muted flex gap-1.5 items-center flex-wrap">
        <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
        <span>/</span>
        <Link href="/admin/wallet" className="hover:text-primary-600">กระเป๋าสตางค์</Link>
        <span>/</span>
        <Link href="/admin/wallet?view=tx" className="hover:text-primary-600">รายการเติมเงิน</Link>
        <span>/</span>
        <span className="font-mono text-foreground">#{row.id}</span>
      </nav>

      {/* ── 3. DETAIL CARD (2-col) ── */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
          {/* LEFT — info pane */}
          <div className="p-5 space-y-3 border-b md:border-b-0 md:border-r border-border">
            <h2 className="text-lg font-bold">
              รายการเติมเงินกระเป๋าสตางค์ <span className="font-mono">#{row.id}</span>
            </h2>

            <KV label="เวลาทำรายการ" value={row.date ? formatThai(row.date) : "—"} />

            <div className="text-sm">
              <span className="text-muted">จาก: </span>
              <Link
                href={`/admin/customers/${userid}`}
                className="inline-flex items-center gap-2 text-primary-600 hover:underline"
              >
                {userAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={userAvatar}
                    alt={customerName}
                    className="h-7 w-7 rounded-full object-cover border border-border"
                  />
                ) : (
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-alt text-muted">
                    <UserIcon className="h-3.5 w-3.5" />
                  </span>
                )}
                <span className="font-mono">[{userid}]</span>
                <span>{customerName}</span>
              </Link>
            </div>

            <div className="text-sm">
              <span className="text-red-700 font-semibold">โอนเข้าบัญชี: </span>
              <span>{row.depositnamebank || "—"}</span>
            </div>

            <div className="text-sm">
              <span className={
                `inline-block rounded px-2 py-0.5 text-xs font-semibold ` +
                (isPending && !row.dateslip ? "bg-red-600 text-white" : "bg-amber-100 text-amber-900")
              }>
                เวลาโอนเงินในสลิป: {row.dateslip ? formatThai(row.dateslip) : "(ยังไม่ได้กรอก)"}
              </span>
              {isPending && (
                <EditDateSlipForm id={row.id} initialDateSlip={row.dateslip} />
              )}
            </div>

            <div className="text-sm">
              <span className="font-semibold text-green-700">จำนวนเงินในสลิป: </span>
              <span className="font-mono font-bold text-green-700">
                +{amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
              </span>
            </div>

            {linkedRows.length > 0 && (
              <div className="text-sm space-y-1 rounded-lg border border-border bg-surface-alt/40 p-2">
                {linkedRows.map((l) => (
                  <div key={l.id}>
                    <span className="text-red-700 font-semibold">ยอดในเป๋าตัง: </span>
                    <span className="font-mono font-bold text-red-700">
                      −{Number(l.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
                    </span>
                  </div>
                ))}
                <div>
                  <span className="text-red-700 font-semibold">ยอดที่ใช้ชำระ: </span>
                  <span className="font-mono font-bold text-red-700">
                    {linkedDebitAndCredit.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
                  </span>
                </div>
              </div>
            )}

            <div className="pt-1">
              <span className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${STATUS_CLS[status]}`}>
                {STATUS_LABEL[status] ?? `status ${status}`}
              </span>
              {row.note && (
                <p className="mt-2 text-xs text-muted whitespace-pre-line">หมายเหตุ: {row.note}</p>
              )}
            </div>
          </div>

          {/* RIGHT — slip + actions pane */}
          <div className="p-5 space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-muted">สถานะรายการ</h3>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_CLS[status]}`}>
                {STATUS_LABEL[status] ?? `status ${status}`}
              </span>
            </div>

            {/* Pending → action form · Completed → audit line */}
            {isPending ? (
              <ApproveRejectForm id={row.id} hasDateSlip={Boolean(row.dateslip)} />
            ) : (
              <div className="rounded-xl border border-border bg-surface-alt/40 px-3 py-2 text-xs text-muted">
                ดำเนินรายการแล้ว โดย: <span className="font-mono text-foreground">{row.adminidupdate ?? "—"}</span>
              </div>
            )}

            {/* Slip image */}
            <div className="pt-2">
              <p className="text-xs font-semibold text-muted mb-2">หลักฐานการโอน (Pay slip)</p>
              {slipUrl ? (
                <a
                  href={slipUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-border overflow-hidden hover:border-primary-500 bg-black/5 dark:bg-black/30"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={slipUrl} alt="สลิป" className="max-w-full max-h-[420px] mx-auto object-contain" />
                </a>
              ) : row.imagesslip ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-semibold">⚠ ไม่สามารถสร้างลิงก์สลิปได้</p>
                  <p className="mt-1 font-mono text-[10px] break-all text-amber-800">
                    filename = {row.imagesslip}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted italic">
                  ลูกค้าไม่ได้อัพโหลดสลิป
                </div>
              )}
            </div>

            {/* Bank/ref mini-table */}
            {(row.nameuserbank || row.nouserbank) && (
              <dl className="grid grid-cols-3 gap-x-2 gap-y-1.5 text-xs pt-2 border-t border-border/50">
                {row.nameuserbank && <Field label="ชื่อบัญชี" value={row.nameuserbank} />}
                {row.nouserbank && <Field label="เลขที่บัญชี" value={row.nouserbank} mono />}
              </dl>
            )}
          </div>
        </div>
      </section>

      {/* ── 4. SIMILAR-TX WARNING (legacy L487-501) ── */}
      {similar.length > 0 && (
        <section className="rounded-2xl border-2 border-red-400 bg-red-50 p-4 space-y-3 animate-pulse-slow">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h3 className="text-base font-bold text-red-900">
              รายการนี้ใกล้เคียงกับรายการอื่น ({similar.length} รายการ)
            </h3>
          </div>
          <p className="text-xs text-red-800">
            พบ tb_wallet_hs อื่นที่วันที่+จำนวนเงินเหมือนรายการนี้ — ตรวจสอบก่อนอนุมัติเพื่อหลีกเลี่ยงเครดิตซ้ำ
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {similar.map((s) => (
              <Link
                key={s.id}
                href={`/admin/wallet/${s.id}`}
                target="_blank"
                className="block rounded-xl border border-red-200 bg-white p-2 hover:border-red-500"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-sm text-red-700">#{s.id}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_CLS[s.status ?? "1"]}`}>
                    {STATUS_LABEL[s.status ?? "1"] ?? s.status}
                  </span>
                </div>
                {s.slipUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.slipUrl} alt="slip" className="mt-1 max-h-32 w-full object-contain" />
                ) : (
                  <p className="mt-1 text-[10px] text-muted italic">ไม่มีสลิป</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Footer nav ── */}
      <div className="flex flex-wrap gap-2 pt-2">
        <Link
          href="/admin/wallet?view=tx"
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> ย้อนกลับ
        </Link>
        <Link
          href={`/admin/wallet?userid=${encodeURIComponent(userid)}`}
          className="inline-flex items-center rounded-lg border border-primary-500 bg-primary-500 px-3 py-2 text-xs text-white hover:bg-primary-600"
        >
          ดูประวัติ wallet ของลูกค้านี้ →
        </Link>
      </div>
    </main>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

function BalanceCard({
  title,
  subtitle,
  amount,
  cashback,
}: {
  title: string;
  subtitle: string;
  amount: number;
  cashback: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-red-700">{title}</p>
          <p className="text-[11px] text-muted">{subtitle}</p>
          <p className="mt-1 text-3xl font-bold text-foreground font-mono">
            ฿{amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-purple-700">
            Cash Back: {cashback.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
          </p>
        </div>
      </div>
      {/* Progress bar — kept as a visual nod to legacy (decorative) */}
      <div className="h-1 bg-gradient-to-r from-amber-400 to-amber-200" />
      <div className="px-4 py-2 text-center">
        <Link
          href="/admin/wallet/add"
          className="inline-flex items-center gap-1 rounded-full bg-primary-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-600"
        >
          <Plus className="h-3 w-3" /> เติมเงินเข้ากระเป๋า
        </Link>
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm">
      <span className="text-muted">{label}: </span>
      <span className="font-medium">{value}</span>
    </p>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted col-span-1">{label}</dt>
      <dd className={`col-span-2 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </>
  );
}

function formatThai(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

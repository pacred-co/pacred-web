/**
 * /admin/api-forwarder-momo — landing for the MOMO carrier integration.
 *
 * Wave 17 P1-1 (2026-05-23) — port `pcs-admin/api-forwarder-momo.php` (the
 * carrier-dispatch page that switches on `?page=<sub>`). Per the Wave 16
 * audit, only `manualUpdate` is in scope for this wave (the form admin
 * actually uses daily); the other sub-pages (updateAPI, APICheckSM,
 * APICheckSMDetail, pageHome dashboard) are P2 and need API tokens +
 * retry/backoff design.
 *
 * Behaviour: this top-level route renders a small hub card with a primary
 * CTA → "อัปเดต MOMO ด้วยมือ" (the only sub-page wired in Wave 17). The
 * other 4 sub-pages are shown as "Coming soon · Phase C" buttons per the
 * design philosophy in AGENTS.md §0a (banner deferred features, don't
 * silently link).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { PageHeader } from "@/components/admin/page-header";
import {
  Truck,
  PencilLine,
  RefreshCw,
  BarChart3,
  CheckCircle2,
  Activity,
  AlertTriangle,
  XCircle,
  Search,
  PackageSearch,
  ShieldAlert,
  Scale,
  PackageOpen,
  ReceiptText,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// Wave 30.6 #230 — MOMO health snapshot (ภูม flag 2026-05-30):
// "เวลาดึงจากmomoจะเช็คยังไง ว่าไม่ได้ตกหล่นอะ".
// Reads momo_sync_logs (cron history) to compute 3 health metrics:
//   1. Freshness — minutes since the last successful sync.
//   2. Fail streak — count of consecutive `status=failed` rows since last
//      successful run. Surfaces the silent "env vars missing on Vercel"
//      bug type that bit us 2026-05-29.
//   3. Drift — tb_forwarder rows whose ftrackingchn matches a MOMO row
//      with a clearly-newer status (heuristic: MOMO shipment_status
//      indicates "at Thailand warehouse or later" but tb_forwarder.fstatus
//      is still 1/2/3). The remediation count.
// ─────────────────────────────────────────────────────────────
type HealthSnapshot = {
  lastSuccessMinAgo: number | null;
  failStreak:        number;
  lastFailMessage:   string | null;
  driftCount:        number;
  totalTracks:       number;
  uncommitted:       number;
};

async function loadHealth(): Promise<HealthSnapshot> {
  const admin = createAdminClient();

  // Latest 30 sync log rows — enough to compute streak in the typical case.
  const { data: logs, error: logsErr } = await admin
    .from("momo_sync_logs")
    .select("status, created_at, errors")
    .order("created_at", { ascending: false })
    .limit(30);
  if (logsErr) {
    console.error("[momo health] logs query failed", {
      code: logsErr.code,
      message: logsErr.message,
    });
  }
  const rows = (logs ?? []) as Array<{
    status: string | null;
    created_at: string | null;
    errors: Array<{ message?: string }> | null;
  }>;

  let lastSuccessMinAgo: number | null = null;
  let failStreak = 0;
  let lastFailMessage: string | null = null;
  for (const r of rows) {
    if (r.status === "success") {
      lastSuccessMinAgo = r.created_at
        ? Math.round((Date.now() - new Date(r.created_at).getTime()) / 60000)
        : null;
      break;
    }
    if (r.status === "failed") {
      failStreak += 1;
      if (!lastFailMessage && r.errors && r.errors.length > 0) {
        const m = r.errors[0]?.message;
        if (typeof m === "string") lastFailMessage = m.slice(0, 180);
      }
    }
  }

  // Drift heuristic — fetch up to 200 most recent MOMO tracks with arrived
  // status, then look up matching tb_forwarder rows still at 1/2/3.
  const { data: arrived, error: arrivedErr } = await admin
    .from("momo_import_tracks")
    .select("momo_tracking_no, shipment_status")
    .in("shipment_status", [
      "AT_WAREHOUSE_TH",
      "WAITING_PAYMENT",
      "DISTRIBUTING",
      "DELIVERING",
      "DELIVERED",
    ])
    .order("last_synced_at", { ascending: false })
    .limit(200);
  if (arrivedErr) {
    console.error("[momo health] arrived tracks query failed", {
      code: arrivedErr.code,
      message: arrivedErr.message,
    });
  }
  const arrivedTrackings = (arrived ?? [])
    .map((r) => (r as { momo_tracking_no: string | null }).momo_tracking_no)
    .filter((t): t is string => !!t);
  let driftCount = 0;
  if (arrivedTrackings.length > 0) {
    const { count } = await admin
      .from("tb_forwarder")
      .select("id", { count: "exact", head: true })
      .in("ftrackingchn", arrivedTrackings)
      .in("fstatus", ["1", "2", "3"]);
    driftCount = count ?? 0;
  }

  const { count: totalTracks } = await admin
    .from("momo_import_tracks")
    .select("id", { count: "exact", head: true });

  const { count: uncommitted } = await admin
    .from("momo_import_tracks")
    .select("id", { count: "exact", head: true })
    .is("committed_at", null);

  return {
    lastSuccessMinAgo,
    failStreak,
    lastFailMessage,
    driftCount,
    totalTracks: totalTracks ?? 0,
    uncommitted: uncommitted ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────
// 2026-06-05 ภูม flag — top-of-page "ยอดรวมคิวจาก MOMO" card.
// "ภูมิต้องการแค่โชว์จำนวนคิวทั้งหมด ให้พี่ป๊อปดูได้ว่าตั้งแต่รับลูกค้า
//  มาได้กี่คิวแล้ว แค่นั้นเอง"
//
// Strategy: SUM cbm/weight_kg/quantity across ALL momo_import_tracks rows
// — the canonical "ตั้งแต่รับลูกค้ามา" lifetime aggregate.
//
// Why JS sum vs Postgres RPC: momo_import_tracks is delta-synced (MOMO
// only pushes recent rows), so the working set stays in the low-thousands
// even on a busy month. Range(0, 49999) is 1 round-trip + plenty of
// headroom; promote to an RPC if/when row count crosses 50k.
//
// "ของยังไม่เข้า MOMO" (status = WAITING_SELLER_SHIP) excluded — those
// are rows where MOMO knows the tracking but hasn't physically received
// the parcel yet, so CBM is usually 0 anyway. Including them never hurts
// the total; the filter is just for honesty in the row count.
// ─────────────────────────────────────────────────────────────
type CbmSummary = {
  totalCbm:    number;
  totalKgs:    number;
  totalQty:    number;
  totalRows:   number;
  excludedWaiting: number;
};

// 2026-06-05 ภูม flag — accept optional date range. Filters on `created_at`
// (when Pacred first saw this MOMO row · = "ลูกค้าเริ่มส่งของผ่าน MOMO").
async function loadCbmSummary(
  fromIso?: string | null,
  toIso?: string | null,
): Promise<CbmSummary> {
  const admin = createAdminClient();
  let q = admin
    .from("momo_import_tracks")
    .select("cbm, weight_kg, quantity, shipment_status");
  if (fromIso) q = q.gte("created_at", fromIso);
  if (toIso)   q = q.lte("created_at", toIso);
  const { data, error } = await q.range(0, 49_999);
  if (error) {
    console.error("[momo cbm summary] failed", { code: error.code, message: error.message });
    return { totalCbm: 0, totalKgs: 0, totalQty: 0, totalRows: 0, excludedWaiting: 0 };
  }
  let totalCbm = 0;
  let totalKgs = 0;
  let totalQty = 0;
  let totalRows = 0;
  let excludedWaiting = 0;
  for (const r of (data ?? []) as Array<{
    cbm: number | string | null;
    weight_kg: number | string | null;
    quantity: number | string | null;
    shipment_status: string | null;
  }>) {
    // "รอต้นทางส่งเข้าโกดัง" = MOMO ยังไม่ได้รับของจริง → exclude จากยอดรวม
    // (นับแยกใน chip เพื่อความโปร่งใส)
    if (r.shipment_status === "WAITING_SELLER_SHIP") {
      excludedWaiting += 1;
      continue;
    }
    totalCbm += Number(r.cbm ?? 0);
    totalKgs += Number(r.weight_kg ?? 0);
    totalQty += Number(r.quantity ?? 0);
    totalRows += 1;
  }
  return { totalCbm, totalKgs, totalQty, totalRows, excludedWaiting };
}

// Date range parser — accepts YYYY-MM-DD; clamps invalid to null.
function parseDateParam(v: string | string[] | undefined, endOfDay = false): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return endOfDay ? `${s}T23:59:59.999+07:00` : `${s}T00:00:00+07:00`;
}

function freshnessTone(min: number | null): {
  bg: string;
  border: string;
  fg: string;
  label: string;
} {
  if (min === null) {
    return {
      bg: "bg-red-50",
      border: "border-red-300",
      fg: "text-red-800",
      label: "ไม่มีบันทึก sync success เลย",
    };
  }
  if (min <= 15) {
    return {
      bg: "bg-emerald-50",
      border: "border-emerald-300",
      fg: "text-emerald-800",
      label: `${min} นาทีก่อน · ปกติ`,
    };
  }
  if (min <= 60) {
    return {
      bg: "bg-amber-50",
      border: "border-amber-300",
      fg: "text-amber-800",
      label: `${min} นาทีก่อน · ช้ากว่าปกติ`,
    };
  }
  const hr = Math.floor(min / 60);
  return {
    bg: "bg-red-50",
    border: "border-red-300",
    fg: "text-red-800",
    label: `${hr} ชม. ${min % 60} นาทีก่อน · ต้องตรวจ`,
  };
}

// ─────────────────────────────────────────────────────────────
// 2026-07-13 ภูม — จัดหน้า MOMO ใหม่เป็น 3 กลุ่ม + ใส่ "วิธีใช้" ทุก
// เครื่องมือ เพื่อให้แอดมินเข้าใจ + ใช้งานถูก ไม่กดมั่ว.
// LAYOUT-ONLY: ทุก href/ทางเข้าเดิมยังอยู่ครบ · ไม่แตะ data/logic/money.
// ─────────────────────────────────────────────────────────────
type Accent = "primary" | "emerald" | "amber" | "rose" | "sky" | "slate";

const ACCENT: Record<
  Accent,
  { border: string; hoverBorder: string; bg: string; iconBg: string; iconFg: string; step: string }
> = {
  primary: { border: "border-primary-300", hoverBorder: "hover:border-primary-500", bg: "bg-white", iconBg: "bg-primary-50 group-hover:bg-primary-100", iconFg: "text-primary-600", step: "text-primary-700" },
  emerald: { border: "border-emerald-400", hoverBorder: "hover:border-emerald-600", bg: "bg-emerald-50/30", iconBg: "bg-emerald-100 group-hover:bg-emerald-200", iconFg: "text-emerald-700", step: "text-emerald-700" },
  amber:   { border: "border-amber-300", hoverBorder: "hover:border-amber-500", bg: "bg-amber-50/40", iconBg: "bg-amber-100 group-hover:bg-amber-200", iconFg: "text-amber-700", step: "text-amber-700" },
  rose:    { border: "border-rose-300", hoverBorder: "hover:border-rose-500", bg: "bg-rose-50/40", iconBg: "bg-rose-100 group-hover:bg-rose-200", iconFg: "text-rose-700", step: "text-rose-700" },
  sky:     { border: "border-sky-300", hoverBorder: "hover:border-sky-500", bg: "bg-sky-50/40", iconBg: "bg-sky-100 group-hover:bg-sky-200", iconFg: "text-sky-700", step: "text-sky-700" },
  slate:   { border: "border-gray-300", hoverBorder: "hover:border-gray-500", bg: "bg-gray-50/60", iconBg: "bg-gray-100 group-hover:bg-gray-200", iconFg: "text-gray-600", step: "text-gray-700" },
};

/** A tool card carrying: title · step badge · what-it-does · numbered "วิธีใช้" · when-to-use · status pill. */
function ToolCard({
  href,
  icon: Icon,
  title,
  step,
  accent,
  what,
  steps,
  when,
  pill,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  step?: string;
  accent: Accent;
  what: string;
  steps: string[];
  when?: string;
  pill: { text: string; cls: string };
}) {
  const a = ACCENT[accent];
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-2xl border-2 ${a.border} ${a.bg} p-4 shadow-sm ${a.hoverBorder} hover:shadow-md transition`}
    >
      <div className="flex items-start gap-3">
        <div className={`shrink-0 rounded-xl p-3 ${a.iconBg} ${a.iconFg}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {step && <span className={`text-[11px] font-bold ${a.step}`}>{step}</span>}
            <h3 className="text-base font-bold text-foreground leading-tight">{title}</h3>
          </div>
          <p className="mt-1 text-xs text-muted leading-snug">{what}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${pill.cls}`}>
          {pill.text}
        </span>
      </div>
      <div className="mt-3 rounded-lg border border-black/5 bg-white/70 p-2.5">
        <p className="mb-1 text-[11px] font-semibold text-gray-500">วิธีใช้</p>
        <ol className="list-inside list-decimal space-y-0.5 text-[11px] leading-snug text-gray-700">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        {when && <p className="mt-1.5 text-[11px] text-gray-500">🕑 {when}</p>}
      </div>
    </Link>
  );
}

/** A titled group of tool cards with a one-line "เมื่อไหร่ใช้กลุ่มนี้" hint. */
function GroupSection({
  badge,
  label,
  hint,
  children,
}: {
  badge: string;
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="rounded-md bg-gray-900 px-2 py-0.5 text-[11px] font-bold text-white">{badge}</span>
        <h2 className="text-base font-bold text-foreground">{label}</h2>
        <p className="text-[11px] text-muted">{hint}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

export default async function AdminApiForwarderMomoPage({
  searchParams,
}: {
  // 2026-06-05 ภูม flag — date range filter for the CBM summary card.
  searchParams?: Promise<{ from?: string; to?: string }>;
}) {
  const { roles } = await requireAdmin(["super", "ops", "warehouse"]);
  const canEditCost = canViewCostProfit(roles);

  const sp = (await searchParams) ?? {};
  const fromIso = parseDateParam(sp.from, false);
  const toIso   = parseDateParam(sp.to, true);
  const hasFilter = !!(fromIso || toIso);

  const [health, cbm] = await Promise.all([
    loadHealth(),
    loadCbmSummary(fromIso, toIso),
  ]);
  const freshTone = freshnessTone(health.lastSuccessMinAgo);

  // History link preserves the current date filter
  const historyHref = (() => {
    const params = new URLSearchParams();
    if (sp.from) params.set("from", sp.from);
    if (sp.to)   params.set("to",   sp.to);
    const qs = params.toString();
    return `/admin/api-forwarder-momo/history${qs ? `?${qs}` : ""}`;
  })();

  return (
    <main className="p-4 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>›</span>
        <span className="text-foreground font-medium">MOMO</span>
      </nav>

      {/* §0h — one consistent page-title hierarchy via <PageHeader>. */}
      <PageHeader
        eyebrow="ADMIN · ฝากนำเข้า · MOMO Integration"
        title="แดชบอร์ด Cargo Center · MOMO"
        subtitle="ศูนย์รวมเครื่องมือเชื่อมข้อมูล MOMO เข้าระบบ — ดึงของ · ตรวจ+สร้างบิล · ตามเก็บของหาย · ปิดตู้/ลงต้นทุน"
      />

      {/* 2026-07-13 ภูม — flow explainer: ให้เข้าใจ "ลูป" ของ MOMO ก่อน
          แล้วค่อยลงมือ. ของถึงจีน → ดึงเข้าระบบ → ตรวจ+สร้างบิล → ปิดตู้. */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-gray-900">ภาพรวม — MOMO ทำงานยังไง</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-gray-700">📦 ของถึงโกดังจีน (MOMO)</span>
          <ArrowRight className="h-4 w-4 text-gray-400" />
          <span className="rounded-lg bg-primary-50 px-3 py-1.5 text-primary-700">① ดึงเข้าระบบ</span>
          <ArrowRight className="h-4 w-4 text-gray-400" />
          <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-emerald-700">② ตรวจ + สร้างบิล</span>
          <ArrowRight className="h-4 w-4 text-gray-400" />
          <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-gray-700">💰 ออกบิล / ปิดตู้</span>
        </div>
        <p className="mt-3 text-[11px] leading-snug text-muted">
          ปกติระบบ (cron) ทำขั้น ① ให้อัตโนมัติทุก 10 นาที — เครื่องมือด้านล่างไว้กดเองเวลาต้องการ
          หรือไว้ <span className="font-semibold text-amber-700">ตามเก็บของที่ MOMO ส่งมาไม่ครบ</span>.
          ทำตามลำดับกลุ่ม A → B → C จะไม่พลาด.
        </p>
      </section>

      {/* กลุ่ม A · งานประจำวัน (ทำเรียงลำดับ 1 → 2) */}
      <GroupSection
        badge="กลุ่ม A"
        label="งานประจำวัน — ทำเรียงลำดับ"
        hint="ลูปหลักของ MOMO · ทำ ① ก่อนแล้วค่อย ② · ปกติ cron ทำ ① ให้อยู่แล้ว"
      >
        <ToolCard
          href="/admin/api-forwarder-momo/sync"
          icon={RefreshCw}
          title="ดึงสถานะ MOMO"
          step="ขั้นที่ ①"
          accent="primary"
          what="ดึงรายการของ (แทรกกิ้ง · น้ำหนัก · เลขตู้ · สถานะ) จาก MOMO เข้าระบบเรา"
          steps={[
            "เลือกช่วงวันที่ที่อยากดึง",
            "กดปุ่ม “ดึงข้อมูล”",
            "รอจนขึ้นสรุปว่าดึงมากี่รายการ",
          ]}
          when="ทุกเช้า หรือเมื่ออยากได้ข้อมูลล่าสุดเดี๋ยวนั้น"
          pill={{ text: "✓ พร้อมใช้", cls: "bg-green-100 text-green-700" }}
        />
        <ToolCard
          href="/admin/api-forwarder-momo/review"
          icon={CheckCircle2}
          title="Review & Commit"
          step="ขั้นที่ ②"
          accent="emerald"
          what="ตรวจรายการที่ดึงมา แล้วกดสร้างเข้าระบบ → กลายเป็นรายการนำเข้าที่ออกบิลได้"
          steps={[
            "ดูรายการที่ยัง “ไม่ commit”",
            "ตรวจ PR / ขนส่ง / น้ำหนัก ให้ถูก",
            "กด “สร้าง” ทีละตัวหรือหลายตัว",
          ]}
          when="หลังดึงเสร็จ · ทำให้คิว “ยังไม่ commit” เหลือ 0"
          pill={{ text: "✓ พร้อมใช้", cls: "bg-green-100 text-green-700" }}
        />
        <ToolCard
          href="/admin/api-forwarder-momo/manual"
          icon={PencilLine}
          title="อัปเดตด้วยมือ"
          accent="slate"
          what="กรอกรายการเองทีละตัว — ใช้เฉพาะตอน MOMO ไม่มีข้อมูล หรือต้องแก้เอง"
          steps={[
            "กรอกแทรกกิ้ง / PR / น้ำหนัก / ขนส่ง",
            "กดบันทึก",
          ]}
          when="กรณีพิเศษเท่านั้น · ปกติใช้ ① + ② พอ"
          pill={{ text: "ทางเลือก", cls: "bg-gray-200 text-gray-700" }}
        />
      </GroupSection>

      {/* กลุ่ม B · ตามเก็บของหาย + ตรวจให้ตรง (ตัวอุดรู MOMO) */}
      <GroupSection
        badge="กลุ่ม B"
        label="ตามเก็บของหาย + ตรวจให้ตรง"
        hint="ไว้อุดรู MOMO · ของหลุด feed / เลขไม่ตรง เข้ามาที่นี่ · ตรวจไม่กี่วันครั้งก็ได้"
      >
        <ToolCard
          href="/admin/api-forwarder-momo/missing"
          icon={PackageSearch}
          title="พัสดุที่ขาด"
          accent="amber"
          what="หาพัสดุที่อยู่ในตู้ MOMO แต่ยังไม่เข้าระบบเรา → ดึงกลับเข้ามา"
          steps={[
            "เปิดดูรายการที่ยังขาด",
            "กดดึงเข้าระบบ",
            "ไปที่ Review & Commit (②) เพื่อสร้างต่อ",
          ]}
          when="เมื่อสงสัยว่าของตกหล่น (MOMO API ทิ้งของที่เดินหน้าไปแล้ว)"
          pill={{ text: "⚠️ ตรวจ-เก็บ", cls: "bg-amber-100 text-amber-700" }}
        />
        <ToolCard
          href="/admin/api-forwarder-momo/drift"
          icon={ShieldAlert}
          title="จุดบอด (แต้ม vs ระบบ)"
          accent="rose"
          what="คิวกู้ของที่ MOMO API ทิ้งไป (~฿294,000) โดยเทียบกับ packing list ของแต้ม"
          steps={[
            "ดูรายการที่แต้มมี แต่ระบบไม่มี",
            "ตรวจให้ชัวร์ว่าถูก",
            "กด apply เพื่อเติมกลับ (มี audit)",
          ]}
          when="⚠️ กระทบเงิน — ตรวจก่อน apply เสมอ"
          pill={{ text: "🚨 กู้เงิน", cls: "bg-rose-100 text-rose-700" }}
        />
        <ToolCard
          href="/admin/api-forwarder-momo/warehouse-reconcile"
          icon={Scale}
          title="เทียบข้อมูลกับแต้ม"
          accent="amber"
          what="เอา packing list แต้มมาเทียบ ว่าน้ำหนัก / กล่อง / ตู้ตรงกับ MOMO ไหม (แต้มแม่นกว่า)"
          steps={[
            "วาง/อัปโหลดข้อมูลจากแต้ม",
            "ดูรายการที่ไม่ตรง",
            "กดอัปเดตให้ตรง",
          ]}
          when="เมื่อ MOMO ให้เลขน่าสงสัย (MOMO ชอบให้ตัวเลขมั่ว)"
          pill={{ text: "🔄 เทียบ", cls: "bg-amber-100 text-amber-700" }}
        />
        <ToolCard
          href="/admin/api-forwarder-momo/live"
          icon={Search}
          title="ดูข้อมูล MOMO (Live)"
          accent="sky"
          what="กระจกส่องเว็บ MOMO — ดูอย่างเดียว ไม่เขียนอะไรลงระบบ"
          steps={[
            "เปิดดูว่า MOMO ฝั่งเค้ามีอะไรบ้าง",
            "เอาไว้เทียบเวลาสงสัยว่าของหาย/ไม่ตรง",
          ]}
          when="ใช้ตรวจสอบ · ปลอดภัย 100% (อ่านอย่างเดียว)"
          pill={{ text: "👁️ อ่านอย่างเดียว", cls: "bg-sky-100 text-sky-700" }}
        />
      </GroupSection>

      {/* กลุ่ม C · เงิน & ปิดตู้ */}
      <GroupSection
        badge="กลุ่ม C"
        label="เงิน & ปิดตู้"
        hint="ทำตอนตู้ปิด / ตอนลงต้นทุน"
      >
        <ToolCard
          href="/admin/api-forwarder-momo/packing-upload"
          icon={PackageOpen}
          title="อัปโหลด packing list (ปิดตู้)"
          accent="emerald"
          what="ตอนปิดตู้ อัปไฟล์ packing list → อัปเดต CBM / น้ำหนัก / เลขตู้จริงเข้าทุกแทรกในตู้"
          steps={[
            "เลือกไฟล์ packing list",
            "ตรวจ preview ว่าจับคู่แทรกถูก",
            "กดยืนยัน (ปิดตู้)",
          ]}
          when="ตอนตู้ถูกปิดที่จีน · อัปเดตน้ำหนัก/ตู้จริงทีเดียวทั้งตู้"
          pill={{ text: "📦 ปิดตู้", cls: "bg-emerald-100 text-emerald-700" }}
        />
        {canEditCost && (
          <ToolCard
            href="/admin/api-forwarder-momo/invoice-cost"
            icon={ReceiptText}
            title="ลงต้นทุนจากใบแจ้งหนี้"
            accent="amber"
            what="เอาต้นทุนจากใบแจ้งหนี้ MOMO มาลงว่าตู้นี้ต้นทุนเท่าไหร่ (ไว้คิดกำไร)"
            steps={[
              "วางข้อมูลจากใบแจ้งหนี้ MOMO",
              "จับคู่แทรก",
              "กด apply ลงต้นทุน",
            ]}
            when="เมื่อ MOMO วางบิลต้นทุนมา · เห็นเฉพาะฝ่ายบัญชี"
            pill={{ text: "💰 ต้นทุน", cls: "bg-amber-100 text-amber-700" }}
          />
        )}
      </GroupSection>

      {/*
        2026-06-05 ภูม flag — ยอดรวมคิวสะสม (สำหรับพี่ป๊อปดู).
        Single big number — total CBM cumulative since MOMO sync started.
        kg + qty + row count = supplementary stats.
        Excludes WAITING_SELLER_SHIP (MOMO ยังไม่ได้รับของจริง) —
        จำนวน excluded แสดง chip ด้านล่างเพื่อความโปร่งใส.
      */}
      <section
        aria-labelledby="momo-cbm-h"
        className="rounded-2xl border border-primary-200 bg-gradient-to-br from-primary-50 to-white p-5 shadow-sm"
      >
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <h2 id="momo-cbm-h" className="flex items-center gap-2 text-sm font-bold text-primary-700">
            <BarChart3 className="h-4 w-4" />
            ยอดรวมคิวจาก MOMO {hasFilter ? "(ตามช่วงเวลา)" : "(สะสม)"}
          </h2>
          <p className="text-[11px] text-muted">
            {hasFilter
              ? `${sp.from ?? "(ไม่ระบุต้น)"} → ${sp.to ?? "(วันนี้)"}`
              : "ตั้งแต่รับลูกค้ามา · นับจากที่ MOMO sync เข้าระบบ"}
          </p>
        </div>

        {/* 2026-06-05 ภูม flag — date range filter + "ประวัติ" link.
            Plain HTML <form method="GET"> reloads the page with new
            searchParams — no client component needed. */}
        <form
          method="GET"
          className="mb-4 flex items-end gap-2 flex-wrap p-2 rounded-lg bg-white/60 border border-primary-100"
        >
          <label className="text-[11px] font-medium text-primary-700">
            <span className="block mb-0.5">ตั้งแต่</span>
            <input
              type="date"
              name="from"
              defaultValue={sp.from ?? ""}
              className="rounded border border-primary-200 bg-white px-2 py-1 text-xs"
            />
          </label>
          <label className="text-[11px] font-medium text-primary-700">
            <span className="block mb-0.5">ถึง</span>
            <input
              type="date"
              name="to"
              defaultValue={sp.to ?? ""}
              className="rounded border border-primary-200 bg-white px-2 py-1 text-xs"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-primary-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-primary-700"
          >
            กรองข้อมูล
          </button>
          {hasFilter && (
            <Link
              href="/admin/api-forwarder-momo"
              className="rounded-md border border-gray-300 bg-white text-gray-700 px-3 py-1.5 text-xs hover:bg-gray-50"
            >
              ล้างตัวกรอง
            </Link>
          )}
          <Link
            href={historyHref}
            className="ml-auto rounded-md border border-primary-300 bg-white text-primary-700 px-3 py-1.5 text-xs font-medium hover:bg-primary-50 inline-flex items-center gap-1"
          >
            📊 ประวัติ (ตามลูกค้า)
          </Link>
        </form>

        <div className="grid gap-4 sm:grid-cols-3 items-end">
          {/* Big CBM number (the headline) */}
          <div className="sm:col-span-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-600">
              CBM รวม (ลบ.ม.)
            </p>
            <p className="mt-1 font-mono text-5xl font-bold text-primary-700 leading-none">
              {cbm.totalCbm.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          {/* Supplementary: kg + qty + rows */}
          <div className="sm:col-span-2 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">น้ำหนัก (kg)</p>
              <p className="mt-1 font-mono text-xl font-bold text-gray-800">
                {cbm.totalKgs.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">จำนวนชิ้น</p>
              <p className="mt-1 font-mono text-xl font-bold text-gray-800">
                {cbm.totalQty.toLocaleString("th-TH")}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">รายการ tracking</p>
              <p className="mt-1 font-mono text-xl font-bold text-gray-800">
                {cbm.totalRows.toLocaleString("th-TH")}
              </p>
            </div>
          </div>
        </div>

        {cbm.excludedWaiting > 0 && (
          <p className="mt-3 text-[11px] text-muted">
            * ไม่นับ {cbm.excludedWaiting.toLocaleString("th-TH")} รายการที่
            สถานะ &quot;รอต้นทางส่งเข้าโกดัง&quot; (MOMO ยังไม่ได้รับของจริง)
          </p>
        )}
      </section>

      {/* Wave 30.6 #230 — MOMO Health Snapshot. ภูม flag 2026-05-30:
          "เวลาดึงจากmomoจะเช็คยังไง ว่าไม่ได้ตกหล่นอะ". 3 cards: freshness,
          cron-fail streak, drift count. Surfaces the silent failures that
          caused the 2026-05-29 5-hour blackout (env vars dropped on Vercel). */}
      <section
        aria-labelledby="momo-health-h"
        className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 id="momo-health-h" className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <Activity className="h-4 w-4 text-primary-600" />
            สุขภาพการ sync MOMO
          </h2>
          <p className="text-[11px] text-muted">
            อัปเดตทุกครั้งที่เปิดหน้านี้ · cron run ทุก 10 นาที
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {/* Card 1: Freshness */}
          <div className={`rounded-xl border ${freshTone.border} ${freshTone.bg} p-3`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
              Sync success ล่าสุด
            </p>
            <p className={`mt-1 text-lg font-bold ${freshTone.fg}`}>
              {freshTone.label}
            </p>
            <p className="mt-1 text-[11px] text-gray-600">
              ปกติ ≤ 15 นาที · ช้า 15-60 · ต้องตรวจ {">"} 60
            </p>
          </div>
          {/* Card 2: Fail streak */}
          <div
            className={`rounded-xl border p-3 ${
              health.failStreak === 0
                ? "border-emerald-300 bg-emerald-50"
                : health.failStreak < 3
                  ? "border-amber-300 bg-amber-50"
                  : "border-red-300 bg-red-50"
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
              จำนวน cron ล่าสุดที่ FAIL ต่อกัน
            </p>
            <p
              className={`mt-1 text-lg font-bold ${
                health.failStreak === 0
                  ? "text-emerald-800"
                  : health.failStreak < 3
                    ? "text-amber-800"
                    : "text-red-800"
              }`}
            >
              {health.failStreak === 0 ? (
                <>
                  <CheckCircle2 className="inline h-4 w-4 mr-1" />0 — ปกติ
                </>
              ) : (
                <>
                  {health.failStreak >= 3 ? (
                    <XCircle className="inline h-4 w-4 mr-1" />
                  ) : (
                    <AlertTriangle className="inline h-4 w-4 mr-1" />
                  )}
                  {health.failStreak} รอบ
                </>
              )}
            </p>
            {health.lastFailMessage && (
              <p className="mt-1 text-[11px] text-gray-700 break-words">
                error: <span className="font-mono">{health.lastFailMessage}</span>
              </p>
            )}
          </div>
          {/* Card 3: Drift */}
          <div
            className={`rounded-xl border p-3 ${
              health.driftCount === 0
                ? "border-emerald-300 bg-emerald-50"
                : health.driftCount < 10
                  ? "border-amber-300 bg-amber-50"
                  : "border-red-300 bg-red-50"
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
              จำนวน tb_forwarder ที่สถานะ DRIFT vs MOMO
            </p>
            <p
              className={`mt-1 text-lg font-bold ${
                health.driftCount === 0
                  ? "text-emerald-800"
                  : health.driftCount < 10
                    ? "text-amber-800"
                    : "text-red-800"
              }`}
            >
              {health.driftCount === 0 ? (
                <>
                  <CheckCircle2 className="inline h-4 w-4 mr-1" />0 — ตรงกัน
                </>
              ) : (
                <>{health.driftCount} รายการ</>
              )}
            </p>
            <p className="mt-1 text-[11px] text-gray-600">
              ตู้/พัสดุที่ MOMO บอกถึงไทย แต่ของเรายัง fstatus 1/2/3
              {" · "}
              <span className="text-emerald-700 font-medium">cron ซิงค์สถานะให้อัตโนมัติแล้ว</span>{" "}
              (เปิดเป็นค่าเริ่มต้น · ปิดได้ด้วย env <code className="rounded bg-white/60 px-1">MOMO_SYNC_PROPAGATE_STATUS=false</code>)
            </p>
          </div>
        </div>
        <p className="text-[11px] text-muted">
          MOMO ทั้งหมดที่ sync แล้ว: {health.totalTracks.toLocaleString()} ·{" "}
          ยังไม่ commit ลง tb_forwarder: {health.uncommitted.toLocaleString()} ({" "}
          <Link href="/admin/api-forwarder-momo/review" className="text-primary-600 hover:underline">
            ดู / commit
          </Link>
          )
        </p>
      </section>

      {/* Footer hint */}
      <div className="flex gap-2 flex-wrap pt-2">
        <Link
          href="/admin/forwarders"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          <Truck className="inline h-3 w-3 mr-1" />
          ดูรายการฝากนำเข้าทั้งหมด
        </Link>
      </div>
    </main>
  );
}

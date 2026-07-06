/**
 * /admin/drivers/monitor — จอมอนิเตอร์ "กำลังจัดส่ง" (live delivery board).
 *
 * พี่ป๊อป spec 2026-07-06 §3 ("monitor กำลังจัดส่ง"): a real-time wall board of
 * the drivers who are OUT delivering right now — each with their photo, phone,
 * nickname/name, and delivery progress (ส่งแล้ว N/M + the drop-off photos as
 * they arrive). The "one-call บันทึกเสียง" is a future item and is intentionally
 * SKIPPED here (spec: อนาคต).
 *
 * "Currently delivering" = an OPEN driver batch:
 *   tb_forwarder_driver.fdstatus = '1' (กำลังดำเนินการ)
 * (cf. actions/admin/driver-batches.ts L26 + lib/admin/driver-batch-complete.ts
 *  — a batch auto-flips '1'→'2' when every stop is delivered, so '1' is exactly
 *  "still on the road"). Each batch's stops live in tb_forwarder_driver_item;
 *  a stop is delivered when its fdistatus = '2' (driver-work.ts L52-55), and its
 *  drop-off photo is in fdipictureoff.
 *
 * DISPLAY-ONLY. No writes. Warehouse/ops audience — money fields
 * (cost/profit/ค่าตู้/ค่าส่ง) are NEVER shown here (warehouse-visibility rule ·
 * SPEC §0h/§42 "คลังห้ามเห็นต้นทุน/กำไรเด็ดขาด"): this board carries delivery
 * ops data only.
 *
 * AGENTS.md §0a — legacy IA + Pacred Tailwind polish · §0c — every query
 * destructures `error` · §0g — self-explaining rows.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSignedBucketUrl } from "@/lib/storage/upload";
import { isUsableImageSrc } from "@/lib/admin/usable-image-src";
import { formatThaiDateTime } from "@/lib/utils/thai-datetime";
import { SlipImage } from "@/components/admin/slip-image";
import { AutoRefresh } from "./auto-refresh";
import {
  Truck, Phone, MapPin, Package, CheckCircle2, Clock,
  ArrowLeft, User, RefreshCw, Camera, AlertTriangle,
} from "lucide-react";

export const dynamic = "force-dynamic";

const REFRESH_MS = 30_000;

type BatchRow = {
  id:        number;
  fdname:    string | null;
  fddate:    string | null;
  fdadminid: string | null; // driver member_code
  fdamount:  number | null; // stop count
  endtime:   string | null;
};

type ItemRow = {
  fdid:          number;
  fid:           number;
  fdistatus:     string | null;
  fdipictureoff: string | null;
};

type Forwarder = {
  id:                  number;
  fidorco:             string | null;
  userid:              string | null;
  faddressname:        string | null;
  faddresslastname:    string | null;
  faddressdistrict:    string | null;
  faddressprovince:    string | null;
  ftrackingchn:        string | null;
};

type DriverInfo = {
  code:      string;
  name:      string;   // full name (fallback = code)
  nickname:  string;   // ชื่อเล่น / ชื่อ — best-effort (first_name)
  phone:     string | null;
  avatarUrl: string | null; // usable http(s)/leading-slash only, else null
};

export default async function DriverMonitorPage() {
  // Warehouse-primary board — the people who watch deliveries go out.
  // (ops/warehouse are the on-site audience; super/accounting/driver may view.)
  await requireAdmin(["super", "ops", "warehouse", "driver", "accounting"]);

  const admin = createAdminClient();

  // 1. OPEN batches = drivers currently out (fdstatus='1'), newest first.
  const { data: batchData, error: batchErr } = await admin
    .from("tb_forwarder_driver")
    .select("id, fdname, fddate, fdadminid, fdamount, endtime")
    .eq("fdstatus", "1")
    .order("id", { ascending: false })
    .limit(200);
  if (batchErr) {
    console.error("/admin/drivers/monitor: open-batch read failed", batchErr);
    throw new Error(`ไม่สามารถอ่านรอบจัดส่งที่กำลังดำเนินการ: ${batchErr.message}`);
  }
  const batches = (batchData ?? []) as BatchRow[];

  // 2. All items across the open batches (progress + drop-off photos).
  const batchIds = batches.map((b) => b.id);
  let items: ItemRow[] = [];
  if (batchIds.length > 0) {
    const { data: itemData, error: itemErr } = await admin
      .from("tb_forwarder_driver_item")
      .select("fdid, fid, fdistatus, fdipictureoff")
      .in("fdid", batchIds);
    if (itemErr) {
      console.error("/admin/drivers/monitor: item read failed", itemErr);
    }
    items = (itemData ?? []) as ItemRow[];
  }
  const itemsByBatch = new Map<number, ItemRow[]>();
  for (const it of items) {
    const arr = itemsByBatch.get(it.fdid) ?? [];
    arr.push(it);
    itemsByBatch.set(it.fdid, arr);
  }

  // 3. Forwarder detail for the pending-stops mini list (recipient + destination).
  const fwdIds = Array.from(new Set(items.map((i) => i.fid)));
  let forwarders: Forwarder[] = [];
  if (fwdIds.length > 0) {
    const { data: fwdData, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fidorco, userid, faddressname, faddresslastname, faddressdistrict, faddressprovince, ftrackingchn")
      .in("id", fwdIds);
    if (fwdErr) {
      console.error("/admin/drivers/monitor: forwarder read failed", fwdErr);
    }
    forwarders = (fwdData ?? []) as unknown as Forwarder[];
  }
  const fwdById = new Map(forwarders.map((f) => [f.id, f]));

  // 4. Driver identity per batch (photo + phone + nickname + name).
  //    tb_users carries the display name/phone keyed by userID = fdadminid
  //    (CAMELCASE cols · CLAUDE.md exception). profiles (via the admins→profiles
  //    join, keyed by member_code) carries the avatar + phone + first_name.
  const driverCodes = Array.from(
    new Set(batches.map((b) => (b.fdadminid ?? "").trim()).filter(Boolean)),
  );
  const driverByCode = new Map<string, DriverInfo>();

  if (driverCodes.length > 0) {
    // (a) tb_users — name + phone fallback.
    const { data: userRows, error: userErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userTel")
      .in("userID", driverCodes);
    if (userErr) {
      console.error("/admin/drivers/monitor: driver tb_users lookup failed", userErr);
    }
    type URow = { userID: string; userName: string | null; userLastName: string | null; userTel: string | null };
    for (const u of (userRows ?? []) as URow[]) {
      const first = (u.userName ?? "").trim();
      const full = `${first} ${(u.userLastName ?? "").trim()}`.trim();
      driverByCode.set(u.userID, {
        code:      u.userID,
        name:      full || u.userID,
        nickname:  first || full || u.userID,
        phone:     (u.userTel ?? "").trim() || null,
        avatarUrl: null,
      });
    }

    // (b) admins→profiles — avatar + first_name/phone (the modern edit-in-app
    //     source · preferred over the legacy tb_users name/phone when present).
    const { data: profRows, error: profErr } = await admin
      .from("admins")
      .select("profile:profiles!profile_id(member_code, first_name, last_name, avatar_url, phone)")
      .eq("role", "driver")
      .eq("is_active", true);
    if (profErr) {
      console.error("/admin/drivers/monitor: driver profiles lookup failed", profErr);
    }
    type PProf = { member_code: string | null; first_name: string | null; last_name: string | null; avatar_url: string | null; phone: string | null };
    for (const r of (profRows ?? []) as unknown as { profile: PProf | PProf[] | null }[]) {
      const p = Array.isArray(r.profile) ? r.profile[0] : r.profile;
      const code = (p?.member_code ?? "").trim();
      if (!code || !driverCodes.includes(code)) continue;
      const first = (p?.first_name ?? "").trim();
      const full = `${first} ${(p?.last_name ?? "").trim()}`.trim();
      const avatar = isUsableImageSrc(p?.avatar_url) ? p!.avatar_url : null;
      const existing = driverByCode.get(code);
      driverByCode.set(code, {
        code,
        // Prefer a modern-profile name/nickname/phone when present; keep the
        // legacy tb_users value as the fallback.
        name:      full || existing?.name || code,
        nickname:  first || existing?.nickname || code,
        phone:     (p?.phone ?? "").trim() || existing?.phone || null,
        avatarUrl: avatar ?? existing?.avatarUrl ?? null,
      });
    }
  }

  // 5. Build one card per open batch, sign the delivered drop-off photos.
  const cards = await Promise.all(
    batches.map(async (b) => {
      const its = itemsByBatch.get(b.id) ?? [];
      const total = its.length;
      const delivered = its.filter((i) => i.fdistatus === "2").length;
      const loaded = its.filter((i) => i.fdistatus === "1").length;
      const failed = its.filter((i) => i.fdistatus === "3").length;
      const pendingCount = total - delivered - failed;

      // Delivered-stop drop-off photos (newest handful for the board).
      const photoPaths = Array.from(
        new Set(
          its
            .filter((i) => i.fdistatus === "2" && (i.fdipictureoff ?? "").trim())
            .map((i) => (i.fdipictureoff ?? "").trim()),
        ),
      );
      const photoUrls = (
        await Promise.all(
          photoPaths.slice(0, 6).map((p) =>
            getSignedBucketUrl("forwarder-covers", p).catch(() => null),
          ),
        )
      ).filter((u): u is string => Boolean(u));

      // Pending stops (compact self-explaining list — who + where + tracking).
      const pending = its
        .filter((i) => i.fdistatus !== "2" && i.fdistatus !== "3")
        .map((i) => {
          const f = fwdById.get(i.fid);
          if (!f) return null;
          const recipient =
            `${(f.faddressname ?? "").trim()} ${(f.faddresslastname ?? "").trim()}`.trim();
          const dest = [f.faddressdistrict, f.faddressprovince].filter(Boolean).join(" · ");
          return {
            fid:       f.id,
            fNo:       f.fidorco ?? `#${f.id}`,
            userid:    (f.userid ?? "").trim() || null,
            recipient: recipient || null,
            dest:      dest || null,
            tracking:  (f.ftrackingchn ?? "").trim() || null,
            onTruck:   i.fdistatus === "1",
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      const code = (b.fdadminid ?? "").trim();
      const driver = code ? driverByCode.get(code) ?? null : null;
      const pct = total > 0 ? Math.round((delivered / total) * 100) : 0;
      const expired = b.endtime ? new Date(b.endtime) < new Date() : false;

      return {
        batch: b,
        driver,
        driverCode: code,
        total,
        delivered,
        loaded,
        failed,
        pendingCount,
        pct,
        expired,
        photoUrls,
        pending,
      };
    }),
  );

  const totalDriversOut = cards.length;
  const totalStops = cards.reduce((s, c) => s + c.total, 0);
  const totalDelivered = cards.reduce((s, c) => s + c.delivered, 0);

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5">
      {/* near-real-time refresh (display-only · triggers RSC re-render) */}
      <AutoRefresh intervalMs={REFRESH_MS} />

      {/* Breadcrumb */}
      <Link href="/admin/drivers" className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline">
        <ArrowLeft className="h-3 w-3" />
        กลับรายการมอบงานคนขับ
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">CARGO · จัดส่ง</p>
          <h1 className="mt-1 text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6" />
            จอมอนิเตอร์ · กำลังจัดส่ง
          </h1>
          <p className="mt-1 text-sm text-muted">
            คนขับที่กำลังออกส่งของตอนนี้ — รูป · เบอร์โทร · ชื่อเล่น · ความคืบหน้าการส่ง (real-time)
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
          <RefreshCw className="h-3.5 w-3.5" />
          อัปเดตอัตโนมัติ ≈ ทุก 30 วินาที
        </span>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-2">
        <Metric icon={<User className="h-4 w-4" />} label="คนขับกำลังส่ง" value={totalDriversOut} />
        <Metric icon={<MapPin className="h-4 w-4" />} label="จุดส่งทั้งหมด" value={totalStops} />
        <Metric
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="ส่งแล้ว"
          value={`${totalDelivered} / ${totalStops}`}
          tone={totalStops > 0 && totalDelivered === totalStops ? "success" : "default"}
        />
      </div>

      {cards.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-10 text-center">
          <Truck className="mx-auto h-10 w-10 text-muted/40 mb-3" />
          <p className="text-sm text-muted">ตอนนี้ยังไม่มีคนขับกำลังออกส่งของ</p>
          <p className="mt-1 text-[11px] text-muted">
            เมื่อหัวหน้าคลังมอบงานคนขับ (สถานะ "กำลังดำเนินการ") รอบจัดส่งจะขึ้นบนจอนี้ทันที
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cards.map((c) => (
            <section
              key={c.batch.id}
              className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden flex flex-col"
            >
              {/* Driver identity header */}
              <div className="flex items-start gap-3 p-4 border-b border-border bg-surface-alt/30">
                {/* avatar */}
                {c.driver?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.driver.avatarUrl}
                    alt={c.driver.nickname}
                    className="h-14 w-14 rounded-full border border-border object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-full border border-border bg-primary-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg font-bold text-primary-600">
                      {(c.driver?.nickname ?? c.driverCode ?? "?").slice(0, 1).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {/* nickname (prominent) + full name + code */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-base text-foreground truncate">
                      {c.driver?.nickname ?? "— ไม่ระบุคนขับ —"}
                    </span>
                    {c.driverCode && (
                      <span className="font-mono text-[11px] text-muted">{c.driverCode}</span>
                    )}
                  </div>
                  {c.driver?.name && c.driver.name !== c.driver.nickname && (
                    <p className="text-xs text-muted truncate">{c.driver.name}</p>
                  )}
                  {/* phone (tap-to-call) */}
                  {c.driver?.phone ? (
                    <a
                      href={`tel:${c.driver.phone}`}
                      className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 text-[11px] hover:bg-blue-100"
                    >
                      <Phone className="h-3 w-3" /> {c.driver.phone}
                    </a>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted">ไม่มีเบอร์โทร</p>
                  )}
                </div>
                {/* batch link */}
                <Link
                  href={`/admin/drivers/${c.batch.id}`}
                  className="text-[11px] text-primary-600 hover:underline whitespace-nowrap"
                >
                  รอบ #{c.batch.id}
                </Link>
              </div>

              {/* Progress */}
              <div className="p-4 space-y-3 flex-1">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                      <Package className="h-3.5 w-3.5" />
                      ส่งแล้ว {c.delivered} / {c.total} กล่อง
                    </span>
                    <span className="tabular-nums font-semibold text-emerald-700">{c.pct}%</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-surface-alt overflow-hidden">
                    <div
                      className={`h-full rounded-full ${c.pct === 100 ? "bg-emerald-500" : "bg-primary-500"}`}
                      style={{ width: `${Math.max(c.pct, 3)}%` }}
                    />
                  </div>
                </div>

                {/* status chips */}
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {c.pendingCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                      <Clock className="h-3 w-3" /> ยังไม่ส่ง {c.pendingCount}
                    </span>
                  )}
                  {c.loaded > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                      <Truck className="h-3 w-3" /> บนรถ {c.loaded}
                    </span>
                  )}
                  {c.failed > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-medium text-rose-700">
                      <AlertTriangle className="h-3 w-3" /> ส่งไม่ได้ {c.failed}
                    </span>
                  )}
                  {c.batch.endtime && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
                        c.expired
                          ? "border-rose-200 bg-rose-50 text-rose-700 font-medium"
                          : "border-border bg-surface-alt/50 text-muted"
                      }`}
                    >
                      <Clock className="h-3 w-3" /> ส่งก่อน {formatThaiDateTime(c.batch.endtime)}
                      {c.expired ? " (เลย)" : ""}
                    </span>
                  )}
                </div>

                {/* delivery photos (real-time as drivers upload) */}
                {c.photoUrls.length > 0 ? (
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-muted inline-flex items-center gap-1">
                      <Camera className="h-3 w-3" /> รูปถ่ายส่งของ ({c.photoUrls.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {c.photoUrls.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block">
                          <SlipImage
                            src={url}
                            alt="รูปส่งของ"
                            pdfMode="tile"
                            className="h-16 w-16 rounded-lg border border-border object-cover hover:ring-2 hover:ring-primary-300"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                ) : c.delivered > 0 ? (
                  <p className="text-[11px] text-muted inline-flex items-center gap-1">
                    <Camera className="h-3 w-3" /> ส่งแล้วบางส่วน (ยังไม่มีรูป)
                  </p>
                ) : null}

                {/* pending stops mini list (self-explaining rows) */}
                {c.pending.length > 0 && (
                  <div className="rounded-lg border border-border divide-y divide-border">
                    <p className="px-2.5 py-1.5 text-[11px] font-medium text-muted bg-surface-alt/40">
                      จุดที่ยังไม่ส่ง ({c.pending.length})
                    </p>
                    <ul className="divide-y divide-border max-h-52 overflow-y-auto">
                      {c.pending.map((p) => (
                        <li key={p.fid} className="px-2.5 py-1.5 text-[11px]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {p.userid ? (
                              <Link href={`/admin/customers/${p.userid}`} className="font-mono font-semibold text-primary-600 hover:underline">
                                {p.userid}
                              </Link>
                            ) : (
                              <span className="font-mono text-muted">—</span>
                            )}
                            <Link href={`/admin/forwarders/${p.fid}`} className="font-mono text-primary-600 hover:underline">
                              {p.fNo}
                            </Link>
                            {p.onTruck && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 px-1.5 py-0.5">
                                <Truck className="h-2.5 w-2.5" /> บนรถ
                              </span>
                            )}
                          </div>
                          {p.recipient && (
                            <div className="text-foreground/80 truncate">ผู้รับ: {p.recipient}</div>
                          )}
                          {p.dest && (
                            <div className="text-muted inline-flex items-center gap-1">
                              <MapPin className="h-2.5 w-2.5" /> {p.dest}
                            </div>
                          )}
                          {p.tracking && (
                            <div className="text-muted font-mono">{p.tracking}</div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted">
        ฐานข้อมูล: legacy <code className="rounded bg-surface-alt px-1">tb_forwarder_driver</code> (สถานะ
        กำลังดำเนินการ) + <code className="rounded bg-surface-alt px-1">tb_forwarder_driver_item</code> —
        แสดงข้อมูลการจัดส่งเท่านั้น (ไม่แสดงต้นทุน/กำไร)
      </p>
    </main>
  );
}

function Metric({
  icon, label, value, tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone?: "default" | "success";
}) {
  const cls = tone === "success"
    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
    : "bg-surface-alt border-border";
  return (
    <div className={`rounded-lg border px-3 py-2 ${cls}`}>
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
        {icon}
        {label}
      </div>
      <div className="text-lg font-bold mt-0.5">{value}</div>
    </div>
  );
}

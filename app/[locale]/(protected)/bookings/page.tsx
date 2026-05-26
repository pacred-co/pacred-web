import { Link } from "@/i18n/navigation";
import { Plus, Calendar, MapPin } from "lucide-react";
import { getMyBookings, type MyBookingSummary } from "@/actions/bookings";
import { getServiceConfig } from "@/lib/booking/service-config";

export const dynamic = "force-dynamic";

/**
 * BK-1.12 — customer-portal booking list ("การจองของฉัน").
 *
 * Reached from the protected sidebar / dashboard after a customer submits
 * a booking. Excludes `draft` (a pre-gate draft isn't an own booking yet
 * from the customer's perspective). Newest-first by created_at.
 *
 * Pattern mirrors `/shipments` (card list, mobile-friendly) more than
 * `/orders` (table) because most booking customers will be on phones and
 * cards scan better at 360px. Each row links to `/bookings/[bookingNo]`.
 *
 * Design: docs/research/booking-flow-system-2026-05-18.md §3.2 + §5.3.
 */

// i18n-key: booking.list.status.{key}
const STATUS_LABEL: Record<string, string> = {
  submitted: "ส่งคำขอแล้ว",
  contacted: "ทีมขายติดต่อแล้ว",
  quoted: "ออกใบเสนอราคาแล้ว",
  won: "ตกลงรับงาน",
  lost: "ยกเลิก",
  cancelled: "ยกเลิก",
};

const STATUS_BADGE: Record<string, string> = {
  submitted:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  contacted:
    "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800",
  quoted:
    "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
  won:
    "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  lost:
    "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700",
  cancelled:
    "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700",
};

export default async function MyBookingsPage() {
  const res = await getMyBookings();
  const bookings = res.ok ? res.data : [];

  return (
    <main className="mx-auto w-full max-w-[1140px] px-4 py-10 lg:py-12 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {/* i18n-key: booking.list.kicker */}
          <p className="text-xs font-semibold tracking-widest text-primary-600">
            BOOKINGS
          </p>
          {/* i18n-key: booking.list.title */}
          <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
            การจองของฉัน
          </h1>
          {/* i18n-key: booking.list.subtitle */}
          <p className="mt-1 text-sm text-muted">
            ดูสถานะและรายละเอียดการจองที่ส่งไป — ทีมขายจะติดต่อกลับเพื่อยืนยันราคาจริง
          </p>
        </div>
        <Link
          href="/book"
          className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          {/* i18n-key: booking.list.newAction */}
          จองใหม่
        </Link>
      </div>

      {!res.ok && (
        <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {/* i18n-key: booking.list.loadError */}
          โหลดข้อมูลไม่สำเร็จ: {res.error}
        </div>
      )}

      {res.ok && bookings.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bookings.map((b) => (
            <BookingCard key={b.id} booking={b} />
          ))}
        </ul>
      )}
    </main>
  );
}

function BookingCard({ booking: b }: { booking: MyBookingSummary }) {
  const badge =
    STATUS_BADGE[b.status] ??
    "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700";
  const label = STATUS_LABEL[b.status] ?? b.status;

  const cfg = getServiceConfig(b.service_slug);
  const serviceTitle = cfg ? cfg.titleTh : b.service_slug;

  const dateLabel = b.submitted_at ?? b.created_at;
  // Bookings without a booking_no shouldn't appear (we exclude draft),
  // but render defensively just in case.
  const href = b.booking_no ? `/bookings/${b.booking_no}` : "/bookings";

  return (
    <Link
      href={href}
      className="block rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm transition-shadow hover:shadow-md space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {b.booking_no && (
            <p className="text-xs font-mono text-muted truncate">
              {b.booking_no}
            </p>
          )}
          <p className="mt-0.5 text-sm font-semibold text-foreground line-clamp-2">
            {serviceTitle}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge}`}
        >
          {label}
        </span>
      </div>

      {b.route_slug && (
        <p className="text-xs text-muted flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          <span className="font-mono">{b.route_slug}</span>
        </p>
      )}

      <div className="border-t border-border pt-2 flex items-baseline justify-between">
        <p className="text-[11px] text-muted flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {new Date(dateLabel).toLocaleDateString("th-TH", {
            day: "numeric",
            month: "short",
            year: "2-digit",
          })}
        </p>
        <p className="text-sm font-bold text-primary-600 tabular-nums">
          ฿{Number(b.estimate_total ?? 0).toLocaleString("th-TH")}
        </p>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-white dark:bg-surface p-10 text-center space-y-3">
      <p className="text-4xl">📋</p>
      {/* i18n-key: booking.list.empty.title */}
      <h2 className="text-lg font-bold text-foreground">ยังไม่มีการจอง</h2>
      {/* i18n-key: booking.list.empty.body */}
      <p className="text-sm text-muted max-w-sm mx-auto">
        เริ่มต้นจองบริการกับ Pacred — เลือกบริการ ใส่ข้อมูลคร่าวๆ ทีมขายจะติดต่อกลับเพื่อยืนยันราคาจริง
      </p>
      <Link
        href="/book"
        className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700"
      >
        <Plus className="h-4 w-4" />
        {/* i18n-key: booking.list.empty.action */}
        เริ่มจองเลย
      </Link>
    </div>
  );
}

/**
 * <ContainerJourneyPanel> — the G4 per-container JOURNEY timeline (read-only).
 *
 * Answers the recurring "ตู้นี้ถึงไหนแล้ว?" the Momo+Pacred status-chase chats
 * are full of. Mounted on /admin/report-cnt/[fNo] (the per-container detail page)
 * below the header card. A vertical stage strip (ปิดตู้→กำลังมา→ถึงท่า→ตรวจปล่อย→
 * โกดัง→เตรียมส่ง→ส่งลูกค้า) with each stage's real date + state, transport mode,
 * ETD/ETA, box/weight/CBM totals, and a compact "💬 จีนว่าไงเรื่องตู้นี้" mini-feed.
 *
 * PURE DISPLAY · server component · no client state, no mutation. All data is
 * computed server-side (buildContainerJourney) + passed in.
 *
 * Honest gaps: "ถึงท่าไทย" shows only the ETA estimate (no real port-arrival feed);
 * "ตรวจปล่อย / ติดด่าน" has no DB stamp → renders "รอข้อมูล" + the chat feed is the
 * real-world signal. No date is ever fabricated.
 *
 * §0g self-explaining (icon + title + meaning + date + next) · §0h text ≥ 11px.
 */

import { Link } from "@/i18n/navigation";
import type { ContainerJourney, JourneyStage } from "@/lib/admin/container-journey";

const TRANSPORT_LABEL: Record<string, string> = {
  "1": "🚛 ทางรถ", "2": "🚢 ทางเรือ", "3": "✈️ ทางอากาศ",
};

function fmtNum(n: number, digits: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtChatTime(s: string | null): string {
  if (!s) return "";
  // sent_at is already Asia/Bangkok in the archive; show yyyy-mm-dd HH:mm.
  const d = s.replace("T", " ");
  return d.length >= 16 ? d.slice(0, 16) : d;
}

// Per-state visuals for a stage node (dot color + connector + text emphasis).
function stageVisual(state: JourneyStage["state"]): {
  dot: string;
  ring: string;
  title: string;
  dateText: string;
} {
  switch (state) {
    case "done":
      return { dot: "bg-emerald-500", ring: "ring-emerald-200", title: "text-foreground", dateText: "text-emerald-700" };
    case "current":
      return { dot: "bg-primary-500 animate-pulse", ring: "ring-primary-200", title: "font-semibold text-primary-700", dateText: "text-primary-700 font-medium" };
    case "no_data":
      return { dot: "bg-amber-400", ring: "ring-amber-200", title: "text-foreground", dateText: "text-amber-600" };
    default: // pending
      return { dot: "bg-gray-300", ring: "ring-gray-100", title: "text-muted", dateText: "text-muted" };
  }
}

export function ContainerJourneyPanel({
  journey,
  totals,
  etd,
  eta,
}: {
  journey: ContainerJourney;
  totals: { trackCount: number; boxes: number; volumeCbm: number; weightKg: number };
  etd: string | null;
  eta: string | null;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
      {/* Header band — the at-a-glance "ถึงไหนแล้ว" answer */}
      <div
        className={`rounded-t-2xl px-4 lg:px-6 py-3 border-b border-border ${
          journey.isStuck ? "bg-amber-50 dark:bg-amber-900/20" : "bg-surface-alt/40"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold flex items-center gap-2">
            🗺️ เส้นทางตู้ — ตู้นี้ถึงไหนแล้ว?
          </h2>
          <span className="text-[11px] text-muted">
            {TRANSPORT_LABEL[journey.transportMode] ?? journey.transportMode}
            {etd && <> · ETD {etd}</>}
            {eta && <> · ETA {eta}</>}
          </span>
        </div>
        <p className={`mt-1 text-sm ${journey.isStuck ? "font-semibold text-amber-800 dark:text-amber-200" : "text-foreground"}`}>
          {journey.headline}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 lg:p-6">
        {/* ── Timeline (2/3) ── */}
        <div className="lg:col-span-2">
          <ol className="relative">
            {journey.stages.map((s, i) => {
              const v = stageVisual(s.state);
              const isLast = i === journey.stages.length - 1;
              return (
                <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {/* connector line */}
                  {!isLast && (
                    <span
                      aria-hidden
                      className={`absolute left-[11px] top-6 bottom-0 w-px ${
                        s.state === "done" ? "bg-emerald-300" : "bg-border"
                      }`}
                    />
                  )}
                  {/* node dot */}
                  <span
                    aria-hidden
                    className={`relative z-10 mt-0.5 h-6 w-6 shrink-0 rounded-full ring-4 ${v.ring} ${v.dot} flex items-center justify-center text-[11px]`}
                  >
                    <span className="text-white">{s.icon}</span>
                  </span>
                  {/* body */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className={`text-sm ${v.title}`}>{s.title}</span>
                      <span className={`text-xs ${v.dateText}`}>
                        {s.date
                          ? `${s.date}${s.isEstimate ? " (ประมาณ)" : ""}`
                          : s.state === "pending"
                            ? "ยังไม่ถึง"
                            : "รอข้อมูล"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted">{s.detail}</p>
                    {s.state === "current" && journey.isStuck && (
                      <p className="mt-1 text-[11px] font-medium text-amber-700">
                        ⚠️ ค้างขั้นตอนนี้ — เช็คแชทจีนด้านขวา / สอบถามด่าน
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {/* totals strip (reuses already-computed container aggregates) */}
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs border-t border-border pt-3">
            <Metric label="ชิปเมนต์" value={totals.trackCount.toLocaleString()} />
            <Metric label="กล่อง (CTNS)" value={totals.boxes.toLocaleString()} />
            <Metric label="ปริมาตร (CBM)" value={fmtNum(totals.volumeCbm, 4)} />
            <Metric label="น้ำหนัก (KG)" value={fmtNum(totals.weightKg, 2)} />
          </div>
        </div>

      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white dark:bg-surface border border-border px-2.5 py-1.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

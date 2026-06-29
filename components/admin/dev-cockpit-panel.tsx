import { Link } from "@/i18n/navigation";
import type { DevCockpit, CockpitTone, CockpitMetric } from "@/lib/admin/dev-cockpit";

/**
 * Dev cockpit panel — ภูม's hi-tech "mission-control" hero on /admin/board/inbox.
 * Dark terminal aesthetic regardless of the app theme: LED glows, monospace,
 * scanline grid. Pure presentational (server component) — data from loadDevCockpit.
 */

const TONE: Record<CockpitTone, { dot: string; glow: string; text: string }> = {
  ok: { dot: "bg-emerald-400", glow: "shadow-[0_0_10px_2px_rgba(52,211,153,0.55)]", text: "text-emerald-300" },
  warn: { dot: "bg-amber-400", glow: "shadow-[0_0_10px_2px_rgba(251,191,36,0.55)]", text: "text-amber-300" },
  alert: { dot: "bg-rose-500", glow: "shadow-[0_0_10px_3px_rgba(244,63,94,0.65)]", text: "text-rose-300" },
  info: { dot: "bg-sky-400", glow: "shadow-[0_0_10px_2px_rgba(56,189,248,0.55)]", text: "text-sky-300" },
};

function MetricTile({ m }: { m: CockpitMetric }) {
  const t = TONE[m.tone];
  const inner = (
    <div className="group relative h-full rounded-lg border border-zinc-800 bg-zinc-900/60 p-3.5 transition-colors hover:border-zinc-600 hover:bg-zinc-800/60">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          <span className={`inline-block h-2 w-2 rounded-full ${t.dot} ${t.glow} ${m.tone !== "ok" ? "animate-pulse" : ""}`} />
          {m.label}
        </span>
        {m.href && (
          <span className="text-zinc-600 transition-colors group-hover:text-zinc-300">→</span>
        )}
      </div>
      <div className={`mt-2 font-mono text-2xl font-bold tabular-nums ${t.text}`}>{m.value}</div>
      <div className="mt-1 text-[11px] leading-snug text-zinc-500">{m.hint}</div>
    </div>
  );
  if (!m.href) return inner;
  return (
    <Link href={m.href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded-lg">
      {inner}
    </Link>
  );
}

export function DevCockpitPanel({
  cockpit,
  adminName,
  adminCode,
}: {
  cockpit: DevCockpit;
  adminName: string;
  adminCode: string;
}) {
  const overall: CockpitTone = cockpit.alertCount > 0 ? "alert" : cockpit.warnCount > 0 ? "warn" : "ok";
  const overallText =
    overall === "alert"
      ? `🔴 ต้องแก้ ${cockpit.alertCount} จุด`
      : overall === "warn"
        ? `🟡 มี ${cockpit.warnCount} รายการรอดู`
        : "🟢 ระบบปกติ";
  const ot = TONE[overall];

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-zinc-100 shadow-xl"
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
        backgroundSize: "26px 26px",
      }}
      aria-label="Dev mission control"
    >
      {/* glow corner */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />

      {/* Terminal title bar */}
      <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          </span>
          <span className="font-mono text-xs text-zinc-500">
            <span className="text-emerald-400">pacred@ops</span>
            <span className="text-zinc-600">:~$</span> status --live
            <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-emerald-400" />
          </span>
        </div>
        <span className={`rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 font-mono text-[11px] font-bold ${ot.text}`}>
          {overallText}
        </span>
      </div>

      {/* Identity line */}
      <div className="relative mt-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-base font-bold tracking-tight text-white">⌬ PACRED · DEV MISSION CONTROL</span>
        <span className="rounded border border-emerald-700/50 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-300">
          {adminCode} · Ultra Admin Z
        </span>
        <span className="font-mono text-[11px] text-zinc-500">{adminName}</span>
      </div>
      <p className="relative mt-1 font-mono text-[11px] text-zinc-500">
        แผงเฉพาะของภูม · ข้อมูลสด tb_* / momo_* · อัปเดตทุกครั้งที่เปิดหน้า
      </p>

      {/* Groups */}
      <div className="relative mt-4 space-y-4">
        {cockpit.groups.map((g) => (
          <div key={g.title}>
            <h3 className="mb-2 flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-400">
              <span aria-hidden>{g.icon}</span>
              {g.title}
            </h3>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {g.metrics.map((m) => (
                <MetricTile key={m.key} m={m} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

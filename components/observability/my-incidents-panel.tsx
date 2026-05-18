import { createClient } from "@/lib/supabase/server";
import { redactId } from "@/lib/logger";
import {
  INCIDENT_USER_STATUS_LABEL,
  INCIDENT_STATUS_BADGE,
  type IncidentStatus,
} from "@/lib/validators/platform-incident";

/**
 * IO-1 — the user-facing "ปัญหาที่ฉันแจ้ง" panel (design doc §6.6).
 *
 * The owner's headline ask, made visible: a signed-in user sees the
 * lifecycle status of incidents THEY hit — "ส่งเรื่องแล้ว" /
 * "กำลังดำเนินการ" / "แก้ไขแล้ว" — in plain Thai.
 *
 * It is a PURE RLS-scoped read: it uses the user's own Supabase client
 * (createClient — RLS enforced), and the 0077 platform_incidents
 * "owner_select" policy lets a user read ONLY rows whose actor_ref
 * equals the redacted form of their own auth uid. The query below
 * filters on the same redacted id as defence-in-depth — RLS is the
 * real gate, this just narrows the result set.
 *
 * Deliberately minimal for IO-1 (§6.6): no comment thread, no realtime,
 * no email-on-resolve — those are Stage-2 polish. IO-1 delivers the
 * capture + the VISIBLE STATUS, which this does. Refreshes on visit.
 *
 * A Server Component — drop it onto any signed-in page (the dashboard,
 * a /my-issues route). Renders nothing when the user has no incidents.
 */

type IncidentRow = {
  id:               string;
  title:            string;
  status:           string;
  route:            string | null;
  occurrence_count: number;
  first_seen:       string;
  last_seen:        string;
};

export async function MyIncidentsPanel({
  userId,
  /** When true, render a "nothing to show" card instead of null. */
  showEmpty = false,
}: {
  userId: string;
  showEmpty?: boolean;
}) {
  const supabase = await createClient();

  // actor_ref is stored as redactId(uid). Filter on that — RLS already
  // restricts to the same value, this keeps the query tight.
  const actorRef = redactId(userId);

  const { data } = await supabase
    .from("platform_incidents")
    .select("id, title, status, route, occurrence_count, first_seen, last_seen")
    .eq("actor_ref", actorRef)
    .order("last_seen", { ascending: false })
    .limit(20);

  const rows = (data ?? []) as IncidentRow[];

  if (rows.length === 0) {
    if (!showEmpty) return null;
    return (
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <h2 className="text-base font-bold">ปัญหาที่ฉันแจ้ง</h2>
        <p className="mt-2 text-sm text-muted">
          ยังไม่มีปัญหาที่ระบบบันทึกจากการใช้งานของคุณ — ดีมาก 🎉
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
      <div>
        <h2 className="text-base font-bold">ปัญหาที่ฉันแจ้ง</h2>
        <p className="mt-0.5 text-xs text-muted">
          ระบบบันทึกข้อผิดพลาดให้อัตโนมัติ — ไม่ต้องกดส่ง. ดูสถานะการแก้ไขได้ที่นี่
        </p>
      </div>

      <ul className="space-y-2">
        {rows.map((r) => {
          const status = r.status as IncidentStatus;
          return (
            <li
              key={r.id}
              className="rounded-xl border border-border bg-surface-alt/30 p-3 space-y-1.5"
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <p className="min-w-0 text-sm font-medium break-words">{r.title}</p>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${INCIDENT_STATUS_BADGE[status] ?? ""}`}
                >
                  {INCIDENT_USER_STATUS_LABEL[status] ?? "ส่งเรื่องแล้ว"}
                </span>
              </div>
              <p className="text-[11px] text-muted">
                {r.route && <span className="font-mono">{r.route}</span>}
                {r.route && " · "}
                แจ้งเมื่อ{" "}
                {new Date(r.first_seen).toLocaleDateString("th-TH", { dateStyle: "medium" })}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] text-muted">
        เมื่อทีมงานแก้ไขเสร็จ สถานะจะเปลี่ยนเป็น &quot;แก้ไขแล้ว&quot; — ขอบคุณที่ช่วยให้ระบบดีขึ้น
      </p>
    </section>
  );
}

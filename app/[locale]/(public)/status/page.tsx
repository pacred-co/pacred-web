import { createAdminClient } from "@/lib/supabase/admin";
import { CONTACT, LINE_OA } from "@/components/seo/site";

/**
 * Public system status page — closes U1-1 from PORT_PLAN Part U.
 *
 * Inspired by chat audit L-1: PHP "เว็ปล่ม" 24x in 6 weeks. Customers
 * had no way to know "is this me or them?" Pacred now provides a
 * single-glance traffic-light view.
 *
 * Cache: 60s (server-side revalidate). DB ping runs at most once per
 * minute regardless of traffic. Each visit reads the cached snapshot.
 *
 * Public — no auth. Render even if Supabase is fully down (try/catch
 * around the ping). NavBar/Footer come from the (public) layout; if
 * those fail it's a separate layout issue.
 */
export const revalidate = 60;

type Status = "ok" | "degraded" | "down" | "not_configured";

type Check = {
  name:   string;
  status: Status;
  detail?: string;
};

async function checkSupabase(): Promise<Check> {
  try {
    const admin = createAdminClient();
    const start = Date.now();
    const { error } = await admin.from("profiles").select("id").limit(1);
    const ms = Date.now() - start;
    if (error) return { name: "Supabase Database", status: "down", detail: error.message };
    if (ms > 1500) return { name: "Supabase Database", status: "degraded", detail: `${ms}ms (ช้ากว่าปกติ)` };
    return { name: "Supabase Database", status: "ok", detail: `${ms}ms` };
  } catch (err) {
    return {
      name: "Supabase Database",
      status: "down",
      detail: (err instanceof Error ? err.message : String(err)).slice(0, 120),
    };
  }
}

/**
 * Config check — just looks at env var presence + that the value isn't
 * the `.env.example` placeholder string (e.g. `<from-line-developer-console>`).
 */
function checkConfig(envKey: string, label: string): Check {
  const value = process.env[envKey];
  if (!value || value.startsWith("<") || value === "") {
    return { name: label, status: "not_configured", detail: "ยังไม่ตั้งค่า env" };
  }
  return { name: label, status: "ok", detail: "ตั้งค่าแล้ว" };
}

function StatusDot({ status }: { status: Status }) {
  const color =
    status === "ok"             ? "bg-green-500"  :
    status === "degraded"       ? "bg-yellow-500" :
    status === "down"           ? "bg-red-500"    :
    /* not_configured */          "bg-gray-300";
  return <span className={`inline-block size-3 rounded-full ${color}`} aria-hidden />;
}

const STATUS_LABEL: Record<Status, string> = {
  ok:             "ปกติ · OK",
  degraded:       "ช้ากว่าปกติ · Degraded",
  down:           "ขัดข้อง · Down",
  not_configured: "ยังไม่เปิดใช้งาน · Not configured",
};

export const metadata = {
  title: "สถานะระบบ · System status — Pacred",
  description:
    "เช็คสถานะระบบ Pacred แบบเรียลไทม์ — ถ้าหน้านี้ขึ้นสีเขียวแสดงว่าระบบทำงานปกติ; ถ้าแดงคือเรากำลังแก้ไข Real-time Pacred system status — green = operational, red = we're on it.",
};

export default async function StatusPage() {
  const supabase = await checkSupabase();

  const checks: Check[] = [
    supabase,
    checkConfig("LINE_CHANNEL_ACCESS_TOKEN",         "LINE Messaging API (push)"),
    checkConfig("THAIBULKSMS_API_KEY",               "ThaiBulkSMS (SMS OTP)"),
    checkConfig("MOMO_JMF_TOKEN",                    "MOMO JMF (cargo container partner)"),
    checkConfig("SENTRY_DSN",                        "Sentry (error tracking)"),
    checkConfig("UPSTASH_REDIS_REST_URL",            "Upstash (rate limit)"),
    checkConfig("NEXT_PUBLIC_HCAPTCHA_SITE_KEY",     "hCaptcha (bot filter)"),
    checkConfig("NEXT_PUBLIC_GTM_ID",                "GTM (analytics)"),
    checkConfig("NEXT_PUBLIC_CLARITY_ID",            "Microsoft Clarity (heatmap)"),
    checkConfig("PROMPTPAY_ID",                      "PromptPay (payment QR)"),
    checkConfig("RESEND_API_KEY",                    "Resend (transactional email)"),
    checkConfig("NEXT_PUBLIC_LIFF_ID",               "LINE LIFF (customer linking)"),
  ];

  const anyDown     = checks.some((c) => c.status === "down");
  const anyDegraded = checks.some((c) => c.status === "degraded");
  const overall: Status = anyDown ? "down" : anyDegraded ? "degraded" : "ok";

  const overallHeadline =
    overall === "ok"       ? "ระบบทำงานปกติ · All systems operational"   :
    overall === "degraded" ? "ระบบช้ากว่าปกติ · Degraded performance"     :
                             "บางส่วนของระบบขัดข้อง · Partial outage";

  const now = new Date();
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      {/* Big overall card */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 sm:p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="mt-1.5">
            <StatusDot status={overall} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">{overallHeadline}</h1>
            <p className="mt-2 text-xs text-muted">
              อัปเดต {now.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
              {" · "}
              build <span className="font-mono">{sha}</span>
              {" · "}
              cache 60s
            </p>
          </div>
        </div>
      </div>

      {/* Per-component table */}
      <div className="mt-6 rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 w-10" aria-label="dot"></th>
                <th className="px-4 py-3">Component</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.name} className="border-t border-border align-top">
                  <td className="px-4 py-3"><StatusDot status={c.status} /></td>
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">{STATUS_LABEL[c.status]}</td>
                  <td className="px-4 py-3 text-xs text-muted">{c.detail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Help / footer */}
      <div className="mt-6 rounded-xl border border-border bg-surface-alt/30 px-4 py-4 text-xs text-muted space-y-1.5">
        <p>• หน้านี้รีเฟรชอัตโนมัติทุก 60 วินาที (server-side cache)</p>
        <p>• <strong>เขียว/เหลือง = ระบบทำงาน</strong> — ถ้าใช้งานไม่ได้ ลองล้าง cookie/cache เบราว์เซอร์ก่อน</p>
        <p>• <strong>แดง = ทีม Pacred แก้ไขอยู่</strong> — คาดว่าจะแก้ไขเสร็จภายในไม่กี่นาที</p>
        <p>
          • แจ้งปัญหาฉุกเฉิน LINE OA{" "}
          <a href={LINE_OA.addFriendUrl} className="text-primary-600 hover:underline" target="_blank" rel="noopener noreferrer">
            {LINE_OA.premiumId}
          </a>
          {" "}หรือโทร{" "}
          <a href={`tel:${CONTACT.phoneCompany}`} className="text-primary-600 hover:underline">
            {CONTACT.phoneCompanyDisplay}
          </a>
        </p>
        <p className="pt-2 border-t border-border/50">
          <em className="text-foreground/80">Customer note (EN):</em> if you are trying to sign up / log in / place an order and seeing errors, check this page first. Green = problem is most likely on your end (browser cache, network). Red/yellow = we are already aware and fixing.
        </p>
      </div>
    </main>
  );
}

import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { NavBar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { Package } from "lucide-react";

export default async function DashboardPage() {
  const data = await getCurrentUserWithProfile();
  // Layout already enforced auth, this is just for displaying
  const profile = data?.profile;
  const user = data?.user;

  const displayName = profile?.first_name
    ? `${profile.first_name}${profile.last_name ? " " + profile.last_name : ""}`
    : profile?.company_name ?? user?.email ?? user?.phone ?? "ลูกค้า";

  return (
    <>
      <NavBar />
      <main className="mx-auto w-full max-w-[1140px] px-4 py-12">
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-8 shadow-sm">
          <p className="text-sm font-semibold tracking-widest text-primary-500">
            DASHBOARD
          </p>
          <h1 className="mt-2 text-3xl font-bold text-foreground">
            สวัสดี, {displayName}
          </h1>
          {profile?.member_code && (
            <p className="mt-2 text-sm text-muted">
              รหัสสมาชิก:{" "}
              <span className="font-mono font-semibold text-primary-600">
                {profile.member_code}
              </span>
            </p>
          )}

          <div className="mt-6 grid gap-4 text-sm">
            <Field k="ประเภทบัญชี" v={profile?.account_type ?? "—"} />
            <Field k="สถานะ" v={profile?.status ?? "—"} />
            <Field k="เบอร์โทร" v={profile?.phone ?? "—"} />
            <Field k="อีเมล" v={profile?.email ?? user?.email ?? "—"} />
            {profile?.account_type === "juristic" && (
              <>
                <Field k="ชื่อบริษัท" v={profile?.company_name ?? "—"} />
                <Field k="เลขผู้เสียภาษี" v={profile?.tax_id ?? "—"} />
              </>
            )}
            <Field
              k="บริการที่สนใจ"
              v={profile?.services?.join(", ") || "—"}
            />
          </div>

          <p className="mt-8 text-xs text-muted">
            หน้านี้เป็น placeholder — feature ของ dashboard จะถูกเพิ่มในเฟสถัดไป
          </p>
        </div>

        {/* Quick links */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            href="/orders"
            className="group flex items-center gap-3 rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary-500 hover:shadow-md"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/30">
              <Package className="h-6 w-6 text-primary-600" />
            </span>
            <div>
              <p className="font-semibold text-foreground group-hover:text-primary-600">
                ออเดอร์ของคุณ
              </p>
              <p className="text-xs text-muted">
                ดูและสร้างคำสั่งงานใหม่
              </p>
            </div>
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3 border-b border-border pb-2">
      <span className="w-32 shrink-0 text-muted">{k}</span>
      <span className="text-foreground">{v}</span>
    </div>
  );
}

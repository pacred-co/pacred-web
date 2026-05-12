import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { Footer } from "@/components/sections/footer";

export default async function ProfilePage() {
  const data = await getCurrentUserWithProfile();
  const profile = data?.profile;
  const user = data?.user;

  const displayName = profile?.first_name
    ? `${profile.first_name}${profile.last_name ? " " + profile.last_name : ""}`
    : profile?.company_name ?? user?.email ?? user?.phone ?? "ลูกค้า";

  return (
    <>
      <main className="mx-auto w-full max-w-[1140px] px-4 py-12">
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-8 shadow-sm">
          <p className="text-sm font-semibold tracking-widest text-primary-500">
            PROFILE
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
            หน้านี้เป็น placeholder — feature ของโปรไฟล์จะถูกเพิ่มในเฟสถัดไป
          </p>
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

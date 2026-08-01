import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyLiffLinkToken } from "@/lib/line/liff-link-token";
import { LinkLineClient } from "./link-line-client";

/** เฉพาะฟิลด์ที่หน้านี้ใช้ — มาได้จาก session หรือจาก token (คนละแหล่ง รูปเดียวกัน) */
type LinkProfile = { id: string; first_name: string | null; status: string | null; line_user_id: string | null };

/**
 * D-1-LIFF — LINE customer→profile linkage entrypoint.
 *
 * Spec: Part Q in PORT_PLAN.md.  Without this page, every push from
 * `lib/notifications/index.ts` to a customer is a silent no-op because
 * `profiles.line_user_id` stays NULL forever (no other populator exists).
 *
 * Flow:
 *   1. Customer (must already be signed in to Pacred) opens this URL —
 *      typically from "เชื่อม LINE OA" CTA at /profile, or from a LINE OA
 *      rich menu / push that links here.
 *   2. Client component initialises @line/liff with NEXT_PUBLIC_LIFF_ID,
 *      triggers liff.login() if needed, then liff.getProfile() to obtain
 *      the LINE userId.
 *   3. POSTs the userId to actions/profile.ts → linkLineAccount() which
 *      writes profiles.line_user_id + line_linked_at.
 *
 * The Pacred-session check is enforced *here* (server) — the LIFF SDK
 * itself only proves the user is a LINE user, not which Pacred account to
 * attach the linkage to.
 *
 * `allowIncomplete: true` so a user mid-onboarding can still link LINE; the
 * server action does the same auth check independently anyway.
 */
export default async function LiffLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  // 🔴 owner 2026-07-30 ("เชื่อมต่อไม่ได้สักที ลองหลายครั้งแล้ว") — หน้านี้ถูกเปิดใน
  // **เบราว์เซอร์ของแอป LINE** ซึ่งไม่มีคุกกี้ session ของ Pacred ⇒ requireAuth()
  // เด้ง /login วนไม่จบ (prod พิสูจน์: 0 จาก 9,465 profiles เคยเชื่อมสำเร็จ).
  // จึงรับ 2 ทาง: (1) มี session อยู่แล้ว = ใช้เลย (เปิดจากเบราว์เซอร์ปกติ)
  // (2) ไม่มี session แต่มี `?t=` ที่เซ็นถูกและยังไม่หมดอายุ = ใช้ profile นั้น
  // token ทำได้แค่ผูก LINE เข้าบัญชีนั้น · อายุ 30 นาที (lib/line/liff-link-token.ts)
  const { t: rawToken } = await searchParams;
  const tokenProfileId = verifyLiffLinkToken(rawToken);

  const session = await getCurrentUserWithProfile();
  const user = session?.user ?? null;
  let profile: LinkProfile | null = session?.profile
    ? {
        id: session.profile.id,
        first_name: session.profile.first_name ?? null,
        status: session.profile.status ?? null,
        line_user_id: session.profile.line_user_id ?? null,
      }
    : null;

  if (!profile && tokenProfileId) {
    // ไม่มี session → เชื่อ token (อ่านอย่างเดียว · ใช้ admin client เพราะ RLS
    // ไม่ปล่อยให้ anonymous อ่าน profile)
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("id, first_name, status, line_user_id")
      .eq("id", tokenProfileId)
      .maybeSingle<LinkProfile>();
    if (error) {
      console.error("[liff/link] token profile lookup failed", { code: error.code, message: error.message });
    }
    if (data) profile = data;
  }

  // ไม่มีทั้ง session และ token ที่ใช้ได้ → บอกให้กลับไปกดปุ่มจากหน้าเว็บ
  // (ห้าม redirect ไป /login — นั่นคือลูปที่ทำให้ลูกค้าเชื่อมไม่ได้มาตลอด)
  if (!profile) {
    const t0 = await getTranslations("liff");
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-surface p-6 shadow-[0_8px_40px_rgba(0,0,0,0.10)] space-y-3">
          <h1 className="text-xl font-bold text-foreground">{t0("title")}</h1>
          <p className="text-sm text-amber-700 dark:text-amber-400">
            ลิงก์เชื่อมต่อหมดอายุหรือไม่สมบูรณ์
          </p>
          <p className="text-sm text-muted">
            กรุณากลับไปที่เว็บ Pacred → เมนู <b>ตั้งค่าการแจ้งเตือน LINE</b> แล้วกดปุ่ม
            &ldquo;เชื่อมต่อ LINE&rdquo; ใหม่อีกครั้ง (ลิงก์มีอายุ 30 นาที)
          </p>
        </div>
      </main>
    );
  }

  if (profile?.status === "suspended") {
    // Same posture as the rest of the protected layouts — never let a
    // suspended account take any action.
    redirect("/login");
  }

  // LIFF ID hardcoded as a default fallback per the owner directive
  // (tracking-and-integration IDs embedded in code; env override
  // supported for dev/staging). The Pacred LIFF app — see
  // developers.line.biz → channel 2010105778 → LIFF.
  const liffId =
    process.env.NEXT_PUBLIC_LIFF_ID ?? "2010105778-SaSkkGza";
  const t = await getTranslations("liff");

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-surface p-6 shadow-[0_8px_40px_rgba(0,0,0,0.10)] space-y-4">
        <header className="space-y-1">
          <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </header>

        <LinkLineClient
          liffId={liffId}
          linkToken={tokenProfileId ? (rawToken ?? null) : null}
          alreadyLinked={!!profile?.line_user_id}
          accountLabel={profile?.first_name ?? user?.email ?? profile?.id?.slice(0, 8) ?? ""}
        />
      </div>
    </main>
  );
}

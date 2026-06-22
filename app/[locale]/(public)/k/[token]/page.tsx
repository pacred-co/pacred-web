/**
 * Public customer "magic login" page — `/k/[token]` (owner 2026-06-22).
 *
 * The login-free surface a customer reaches via the unique link an admin hands
 * them after creating their account. NO auth: the `[token]` is an unguessable
 * HMAC capability link (lib/auth/customer-magic-link.ts). The link never
 * expires — clicking it does NOT log you in; the customer must request an OTP
 * (sent to their registered phone) and pass it, which is the real gate.
 *
 * This server component only RESOLVES the token → the customer's display name +
 * a masked phone hint (and 404s a forged token). All security-sensitive work
 * (OTP send + session mint) happens in the server actions, which independently
 * re-verify the token.
 */

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCustomerLoginToken } from "@/lib/auth/customer-magic-link";
import { MagicLoginClient } from "./magic-login-client";

export const dynamic = "force-dynamic";

// A direct-login surface must never be indexed.
export const metadata = {
  title: "เข้าสู่ระบบ — Pacred",
  robots: { index: false, follow: false },
};

export default async function MagicLoginPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Capability gate — a forged / malformed token never resolves.
  const code = verifyCustomerLoginToken(token);
  if (!code) notFound();

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("first_name, last_name, phone, status")
    .eq("member_code", code)
    .maybeSingle<{
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
      status: string | null;
    }>();
  if (error) {
    console.error("[/k magic-login] profile lookup failed", { code: error.code, message: error.message });
    notFound();
  }
  if (!profile) notFound();

  const suspended = profile.status === "suspended";
  const name = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  const digits = (profile.phone ?? "").replace(/\D/g, "");
  const phoneHint = digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "เบอร์ที่ลงทะเบียนไว้";

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-6 space-y-5">
        <div className="text-center space-y-1">
          <p className="text-xs font-semibold tracking-widest text-primary-600">PACRED</p>
          <h1 className="text-xl font-bold">เข้าสู่ระบบบัญชีของคุณ</h1>
          <p className="text-sm text-muted">
            {name ? <>สวัสดีคุณ <span className="font-semibold text-foreground">{name}</span></> : "ยินดีต้อนรับ"}
            {" "}({code})
          </p>
        </div>

        {suspended ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            บัญชีนี้ถูกระงับการใช้งานชั่วคราว — กรุณาติดต่อเจ้าหน้าที่
          </div>
        ) : (
          <MagicLoginClient token={token} phoneHint={phoneHint} />
        )}
      </div>
    </main>
  );
}

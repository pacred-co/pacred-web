"use client";

/**
 * Dedicated ADMIN back-office login (owner directive 2026-06-19 · พี่ป๊อป via ปอน).
 *
 * This is the ONLY entrance to /admin. It calls `signInAdmin` (admin_* accounts
 * only) which mints the `pacred_admin` ticket the (admin) layout + proxy require.
 * The normal /login never mints that ticket — so an admin who logs in there
 * lands on the customer front-office and /admin stays blocked.
 *
 * Lives in the `(admin-login)` route group (no layout) so it inherits NEITHER
 * the (auth) requireGuest gate NOR the (admin) requireAdmin gate. The proxy
 * exempts /admin/login from the /admin redirect.
 *
 * Visual (ปอน 2026-06-19): the Pacred model points down at a red card with the
 * PR-ADMIN wordmark + login form. On a SUCCESSFUL login a "เข้าสู่ระบบสำเร็จ" popup
 * pops up (thumbs-up "grab" model + "ยินดีต้อนรับ {ชื่อเล่น}"), then we enter /admin.
 * Assets: public/images/admin/login/{hero,grab,pradmin}.png.
 */

import { useState, useTransition } from "react";
import Image from "next/image";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { signInAdmin } from "@/actions/auth";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
  not_admin_account:
    "บัญชีนี้ไม่ใช่ผู้ดูแลระบบ — ใช้บัญชี admin_… เท่านั้น (ลูกค้า/รหัส PR ใช้หน้าเข้าสู่ระบบปกติ)",
  invalid_input: "ข้อมูลไม่ถูกต้อง",
  rate_limited: "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  connection_error: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
};

const INPUT_BASE =
  "w-full rounded-full border-0 bg-white px-5 py-3 text-[15px] text-gray-900 placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-4 focus:ring-white/40 disabled:opacity-80";

export default function AdminLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // On success we show a "เข้าสู่ระบบสำเร็จ" popup, then redirect.
  const [success, setSuccess] = useState(false);
  const [welcomeName, setWelcomeName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      let res;
      try {
        res = await signInAdmin({ identifier, password });
      } catch (err) {
        console.error("[admin-login] signInAdmin threw:", err);
        setError(ERROR_MESSAGES.connection_error);
        return;
      }
      if (res.ok) {
        setWelcomeName(res.data?.name ?? "ผู้ดูแล");
        setAvatarUrl(res.data?.avatarUrl ?? null);
        setSuccess(true);
        // Let the success popup show, then enter the back-office.
        setTimeout(() => {
          router.replace("/admin");
          router.refresh();
        }, 2100);
      } else {
        const key = "retryAfterSeconds" in res && res.retryAfterSeconds ? "rate_limited" : res.error;
        setError(ERROR_MESSAGES[key] ?? res.error);
      }
    });
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
      {/* Full-bleed background — the Pacred industrial-port scene as a FAINT
          watermark on white (ปอน 2026-06-19 · "พื้นหลังขาว · bg1 จางๆ · ภาพชัด").
          Low opacity so the model + the red card stay sharp + readable on top. */}
      <div className="fixed inset-0 z-0 bg-white">
        <Image
          src="/images/admin/login/bg1.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-[0.07]"
        />
      </div>

      <div className="relative z-10 w-full max-w-[380px]">
        {/* Hero — the Pacred model pointing down at the form. */}
        <div className="relative z-10 mx-auto aspect-square w-[80%]">
          <Image
            src="/images/admin/login/hero.png"
            alt="Pacred"
            fill
            priority
            sizes="320px"
            draggable={false}
            className="object-contain"
          />
        </div>

        {/* Red card */}
        <form
          onSubmit={handleSubmit}
          className="relative z-20 -mt-[30%] rounded-[36px] bg-[#E30613] px-7 pb-8 pt-5 shadow-[0_20px_45px_rgba(227,6,19,0.4)]"
        >
          {/* PR-ADMIN wordmark — square asset cropped to its center band. */}
          <div className="relative mx-auto mb-4 w-[78%] overflow-hidden" style={{ aspectRatio: "1080 / 360" }}>
            <Image
              src="/images/admin/login/pradmin.png"
              alt="PR ADMIN"
              width={460}
              height={460}
              priority
              className="absolute left-0 top-1/2 w-full -translate-y-1/2"
            />
          </div>

          {/* Username */}
          <div className="mb-3">
            <label htmlFor="identifier" className="mb-1.5 block text-[15px] font-semibold text-white">
              Username
            </label>
            <input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="admin_…"
              required
              autoComplete="username"
              maxLength={40}
              disabled={success}
              className={INPUT_BASE}
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="mb-1.5 block text-[15px] font-semibold text-white">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                minLength={6}
                maxLength={40}
                disabled={success}
                className={`${INPUT_BASE} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-700"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && !success && (
            <p className="mt-4 rounded-2xl bg-white/95 px-4 py-2.5 text-center text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={pending || success}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-3.5 text-[16px] font-bold text-[#E30613] shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-90"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            เข้าสู่ระบบ
          </button>
        </form>

        {/* Back to customer login */}
        <p className="mt-5 text-center text-[13px] text-muted">
          เป็นลูกค้า?{" "}
          <Link href="/login" className="font-semibold text-primary-600 hover:text-primary-700">
            เข้าสู่ระบบลูกค้า
          </Link>
        </p>
      </div>

      {/* ── Success popup — "เข้าสู่ระบบสำเร็จ" (ปอน 2026-06-19) ───────────── */}
      {success && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-5 backdrop-blur-sm"
        >
          <div className="w-full max-w-[320px] rounded-[28px] bg-white p-7 text-center shadow-2xl [animation:card-in_0.35s_ease-out]">
            {/* Employee profile picture — circular (profiles.avatar_url · falls
                back to the nickname initial when the staffer has no picture). */}
            <div className="mx-auto mb-3 h-24 w-24 overflow-hidden rounded-full shadow-md ring-4 ring-primary-100">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" draggable={false} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-primary-600 text-3xl font-bold text-white">
                  {welcomeName.trim().charAt(0).toUpperCase() || "P"}
                </div>
              )}
            </div>
            <p className="text-[22px] font-extrabold text-primary-600">เข้าสู่ระบบสำเร็จ</p>
            <p className="mt-1 text-[15px] font-semibold text-foreground">
              ยินดีต้อนรับ {welcomeName} 👋
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 text-[13px] text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              กำลังเข้าสู่ระบบ…
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

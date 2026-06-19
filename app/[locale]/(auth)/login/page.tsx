"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { NavBar } from "@/components/sections/navbar";
import { GoogleIcon, LineIcon, FacebookIcon } from "@/components/icons/social-icons";
import { signIn, signInWithOAuth } from "@/actions/auth";
import { trackLogin, type LoginMethod } from "@/lib/analytics";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "อีเมล/เบอร์/รหัสไม่ถูกต้อง",
  user_not_found: "ไม่พบผู้ใช้นี้ในระบบ",
  oauth_failed: "เข้าสู่ระบบผ่านโซเชียลล้มเหลว ลองใหม่อีกครั้ง",
  // The `signIn` server-action call can THROW (not return !ok) on a transient
  // server-action failure — most often deployment skew ("An unexpected response
  // was received from the server", thrown by Next's server-action-reducer when
  // a stale action id hits a fresh deploy) or a network blip. Without a catch
  // this surfaced as an uncaught error + a logged incident + a stuck form
  // (2026-06-08, incident IO-1). Catch it → friendly retry message; a retry
  // picks up the fresh action id.
  connection_error: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
};

const INPUT_BASE =
  "w-full rounded-2xl border-[1.5px] border-border bg-white dark:bg-surface px-5 py-[15px] text-[15px] text-foreground placeholder:text-muted transition focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10";

// Social login (Google / Facebook / LINE) is gated behind one build-time flag.
// Default off — legacy PCS had password-only login and the D1 faithful port
// keeps it that way until Phase C. Set NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED=true to
// re-enable; the signInWithOAuth server action enforces the same gate.
const SOCIAL_LOGIN_ENABLED = process.env.NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED === "true";

/**
 * Open-redirect guard for the `?next=` post-login destination. Only an
 * internal absolute path (e.g. `/service-import/add?from=booking`) is
 * honoured — anything protocol-relative (`//evil.com`) or absolute-URL is
 * rejected and falls back to the default landing.
 */
function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export default function LoginPage() {
  const t = useTranslations("login");
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = safeNext(searchParams.get("next"));
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Legacy parity for `login.php` `<input id="rememberMe" checked>` —
  // checked by default like the legacy. Supabase session length is
  // server-controlled, so toggling this is purely UI parity today
  // (kept for the legacy expectation and future use). Per
  // d1-fidelity-customer.md §2.2: "Re-add a 'จำฉันไว้ในระบบ' checkbox,
  // checked by default."
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      let res;
      try {
        res = await signIn({ identifier, password });
      } catch (err) {
        // Transient server-action failure (deploy skew / network) — show a
        // friendly retry instead of an uncaught error + a logged incident.
        console.error("[login] signIn threw:", err);
        setError(ERROR_MESSAGES.connection_error);
        return;
      }
      if (res.ok) {
        const method: LoginMethod = identifier.includes("@")
          ? "email"
          : identifier.trim().toUpperCase().startsWith("PR")
            ? "member_code"
            : "phone";
        trackLogin(method);
        // 2026-06-19 (owner directive · พี่ป๊อป via ปอน) — the normal login ALWAYS
        // lands on the customer front-office, even for an admin_* account. The
        // back-office is reachable ONLY via the dedicated /admin/login entrance
        // (which mints the `pacred_admin` ticket the /admin gate requires). So we
        // no longer route admins to /admin from here. A pending `?next=` (e.g.
        // from the booking calculator's "เปิดออเดอร์ราคานี้" CTA) still wins;
        // otherwise the customer portal `/dashboard` (the 9-icon launchpad).
        const dest = nextUrl ?? "/dashboard";
        router.replace(dest);
        router.refresh();
      } else {
        setError(ERROR_MESSAGES[res.error] ?? res.error);
      }
    });
  }

  function handleOAuth(provider: "google" | "facebook") {
    setError(null);
    startTransition(async () => {
      let res;
      try {
        res = await signInWithOAuth(provider);
      } catch (err) {
        console.error("[login] signInWithOAuth threw:", err);
        setError(ERROR_MESSAGES.connection_error);
        return;
      }
      if (res.ok && res.data) {
        // Fire telemetry before navigating away (GTM unload handlers flush on beforeunload best-effort)
        trackLogin(provider === "google" ? "oauth_google" : "oauth_facebook");
        window.location.href = res.data.url;
      } else {
        setError(ERROR_MESSAGES.oauth_failed);
      }
    });
  }

  function handleLineLogin() {
    setError("LINE Login กำลังจะมาเร็วๆ นี้");
  }

  return (
    <>
      <NavBar />
      <main className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-background px-5 py-10">
        <div className="w-full max-w-[520px] rounded-[30px] border border-white/80 bg-white dark:bg-surface dark:border-border p-10 shadow-[0_20px_50px_rgba(0,0,0,0.04)]">
          {/* Logo — enlarged to 76px (PNG is a 140x140 square). Wrapper height
              pinned at the old 52px with items-end, so the bigger logo
              overflows UPWARD into the card's top padding only — the title +
              form below keep their exact positions. */}
          <div className="-mb-1 flex h-[52px] items-end justify-center">
            <Image
              src="/images/pacred-logo-red.png"
              alt="Pacred"
              width={140}
              height={140}
              className="h-[76px] w-[76px]"
              priority
            />
          </div>

          {/* Title */}
          <h1 className="mb-2 text-center text-2xl font-bold text-foreground">
            {t("title")}
          </h1>

          {/* Sign up link — positioned ABOVE the form (2026-05-28 fidelity
              audit § Login/LAYOUT). Legacy login.php placed
              "ยังไม่มีบัญชีผู้ใช้งาน? สร้างบัญชี" under the title; returning
              PCS customers expect this position. Forwards `?next=` so a
              guest who registers instead of logging in still returns to
              their destination. */}
          <p className="mb-6 text-center text-sm text-muted">
            {t("noAccount")}{" "}
            <Link
              href={nextUrl ? { pathname: "/register", query: { next: nextUrl } } : "/register"}
              className="font-semibold text-primary-600 hover:text-primary-700"
            >
              {t("registerLink")}
            </Link>
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email/Phone/ID */}
            <div>
              <label
                htmlFor="identifier"
                className="mb-2 block text-sm font-semibold text-foreground"
              >
                {t("emailLabel")}
              </label>
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={t("emailPlaceholder")}
                required
                maxLength={20}
                className={INPUT_BASE}
              />
            </div>

            {/* Password */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-sm font-semibold text-foreground"
                >
                  {t("passwordLabel")}
                </label>
                <Link
                  href="/forgot-password"
                  className="text-[12.5px] font-semibold text-primary-600 hover:text-primary-700"
                >
                  {t("forgotPassword")}
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("passwordPlaceholder")}
                  required
                  minLength={6}
                  maxLength={20}
                  className={`${INPUT_BASE} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-primary-600"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember-me — legacy login.php "จำฉันไว้ในระบบ" checkbox,
                checked by default. Supabase session length is set
                server-side so the value is currently UI-only; legacy
                parity per d1-fidelity-customer.md §2. */}
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-primary-600"
              />
              <span className="text-[13px] text-foreground">
                {t("rememberMe")}
              </span>
            </label>

            {/* Error */}
            {error && (
              <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-[18px] text-[17px] font-semibold text-white shadow-[0_8px_20px_rgba(179,0,0,0.25)] transition hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-[0_12px_25px_rgba(179,0,0,0.35)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("submit")}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white dark:bg-surface px-4 text-[13px] font-medium text-muted">
                {t("orContinueWith")}
              </span>
            </div>
          </div>

          {/* Social — gated behind NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED. Off by
              default: legacy PCS had password-only login and the D1 faithful
              port keeps it that way until Phase C. When off, the providers
              render greyed-out under a COMING SOON badge. */}
          {SOCIAL_LOGIN_ENABLED ? (
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => handleOAuth("google")}
                disabled={pending}
                className="flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-border bg-white dark:bg-surface px-3 py-3 text-[13px] font-semibold text-foreground transition hover:-translate-y-0.5 hover:border-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <GoogleIcon className="h-[18px] w-[18px] shrink-0" /> Google
              </button>
              <button
                type="button"
                onClick={handleLineLogin}
                disabled={pending}
                className="flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-border bg-white dark:bg-surface px-3 py-3 text-[13px] font-semibold transition hover:-translate-y-0.5 hover:border-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ color: "#00B900" }}
              >
                <LineIcon className="h-[18px] w-[18px] shrink-0" /> LINE
              </button>
              <button
                type="button"
                onClick={() => handleOAuth("facebook")}
                disabled={pending}
                className="flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-border bg-white dark:bg-surface px-3 py-3 text-[13px] font-semibold transition hover:-translate-y-0.5 hover:border-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ color: "#1877F2" }}
              >
                <FacebookIcon className="h-[18px] w-[18px] shrink-0" /> Facebook
              </button>
            </div>
          ) : (
            <div className="relative">
              <div
                aria-hidden
                className="grid grid-cols-3 gap-2.5 select-none opacity-55"
              >
                <div className="flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-border bg-white dark:bg-surface px-3 py-3 text-[13px] font-semibold text-muted">
                  <GoogleIcon className="h-[18px] w-[18px] shrink-0 grayscale" /> Google
                </div>
                <div className="flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-border bg-white dark:bg-surface px-3 py-3 text-[13px] font-semibold text-muted">
                  <LineIcon className="h-[18px] w-[18px] shrink-0 grayscale" /> LINE
                </div>
                <div className="flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-border bg-white dark:bg-surface px-3 py-3 text-[13px] font-semibold text-muted">
                  <FacebookIcon className="h-[18px] w-[18px] shrink-0 grayscale" /> Facebook
                </div>
              </div>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-foreground/90 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow">
                  {t("comingSoon")}
                </span>
              </div>
            </div>
          )}

        </div>
      </main>
    </>
  );
}

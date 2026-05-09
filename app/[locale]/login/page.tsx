"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { NavBar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";

const INPUT_BASE =
  "w-full rounded-2xl border-[1.5px] border-border bg-white dark:bg-surface px-5 py-[15px] text-[15px] text-foreground placeholder:text-muted transition focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10";

export default function LoginPage() {
  const t = useTranslations("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: wire up to backend auth
    console.log({ identifier, password });
  }

  return (
    <>
      <NavBar />
      <main className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-background px-5 py-10">
        <div className="w-full max-w-[520px] rounded-[30px] border border-white/80 bg-white dark:bg-surface dark:border-border p-10 shadow-[0_20px_50px_rgba(0,0,0,0.04)]">
          {/* Logo */}
          <div className="-mb-1 flex justify-center">
            <Image
              src="/images/pacred-logo-red.png"
              alt="Pacred"
              width={160}
              height={52}
              className="h-auto w-auto"
              priority
            />
          </div>

          {/* Title */}
          <h1 className="mb-8 text-center text-2xl font-bold text-foreground">
            {t("title")}
          </h1>

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
                  href="#"
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

            {/* Submit */}
            <button
              type="submit"
              className="w-full rounded-2xl bg-primary-600 px-4 py-[18px] text-[17px] font-semibold text-white shadow-[0_8px_20px_rgba(179,0,0,0.25)] transition hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-[0_12px_25px_rgba(179,0,0,0.35)]"
            >
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

          {/* Social */}
          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-border bg-white dark:bg-surface px-3 py-3 text-[13px] font-semibold text-foreground transition hover:-translate-y-0.5 hover:border-primary-500"
            >
              <span className="text-base">G</span> Google
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-border bg-white dark:bg-surface px-3 py-3 text-[13px] font-semibold transition hover:-translate-y-0.5 hover:border-primary-500"
              style={{ color: "#00B900" }}
            >
              LINE
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-border bg-white dark:bg-surface px-3 py-3 text-[13px] font-semibold transition hover:-translate-y-0.5 hover:border-primary-500"
              style={{ color: "#1877F2" }}
            >
              Facebook
            </button>
          </div>

          {/* Sign up link */}
          <p className="mt-7 text-center text-sm text-muted">
            {t("noAccount")}{" "}
            <Link
              href="/register"
              className="font-semibold text-primary-600 hover:text-primary-700"
            >
              {t("registerLink")}
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}

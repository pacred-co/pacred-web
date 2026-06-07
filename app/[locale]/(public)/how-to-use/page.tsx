import type { Metadata } from "next";
import { StubPage } from "@/components/stub-page";
import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";
import { CONTACT, SOCIAL } from "@/components/seo/site";
import { getTranslations } from "next-intl/server";

const PATH = "/how-to-use";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.howToUse" });
}

/**
 * /how-to-use — non-technical step-by-step guide for the three
 * customer flows (fwd / shop / yuan) + contact channels.
 *
 * Content rules (per ภูม + agent brief Phase B-3):
 *   • Tone: simple, friendly, "ทำตามนี้ได้เลย" — not formal manual.
 *   • Reference real URLs (e.g. /service-import) + real button labels.
 *   • TH-only V1 — EN parity gap acknowledged per i18n audit rule for
 *     content-heavy pages.
 *   • 4 sections: นำเข้า · ฝากสั่ง · ฝากโอน · ติดต่อทีม.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const t = await getTranslations("howToUsePage");

  return (
    <>
      <JsonLd
        data={breadcrumbSchema(
          [
            { name: typedLocale === "th" ? "หน้าหลัก" : "Home", path: "/" },
            { name: typedLocale === "th" ? "วิธีการใช้บริการ" : "How to use", path: PATH },
          ],
          typedLocale,
        )}
      />
      <StubPage
        eyebrow="HOW TO USE"
        title={t("heroTitle")}
        highlight={t("heroHighlight")}
        description={t("heroDescription")}
        breadcrumb={[{ label: t("breadcrumbLabel") }]}
        banner="import-export"
      >
        <div className="mx-auto w-full max-w-[1100px] space-y-10">
          {/* TOC */}
          <nav className="rounded-2xl border border-border bg-surface-alt/40 p-5 grid sm:grid-cols-2 md:grid-cols-4 gap-3">
            <TocLink href="#fwd"     icon="📦" label={t("tocFwdLabel")}   sub={t("tocFwdSub")} />
            <TocLink href="#shop"    icon="🛒" label={t("tocShopLabel")}   sub={t("tocShopSub")} />
            <TocLink href="#yuan"    icon="💱" label={t("tocYuanLabel")}   sub={t("tocYuanSub")} />
            <TocLink href="#contact" icon="💬" label={t("tocContactLabel")}       sub={t("tocContactSub")} />
          </nav>

          {/* ─── 1. ลูกค้านำเข้า ───────────────────────────── */}
          <Section id="fwd" emoji="📦" title={t("fwdSectionTitle")}>
            <p className="text-sm text-foreground">
              {t.rich("fwdIntro", { strong: (c) => <strong>{c}</strong> })}
            </p>
            <Steps>
              <Step n={1} title={t("fwdStep1Title")}>
                {t.rich("fwdStep1Body", {
                  code: (c) => <Code href="/service-import">{c}</Code>,
                  pill: (c) => <Pill>{c}</Pill>,
                })}
              </Step>
              <Step n={2} title={t("fwdStep2Title")}>
                {t.rich("fwdStep2Body", { strong: (c) => <strong>{c}</strong> })}
              </Step>
              <Step n={3} title={t("fwdStep3Title")}>
                {t.rich("fwdStep3Body", { pill: (c) => <Pill>{c}</Pill> })}
              </Step>
              <Step n={4} title={t("fwdStep4Title")}>
                {t.rich("fwdStep4Body", {
                  pill: (c) => <Pill>{c}</Pill>,
                  code: (c) => <Code href="/wallet/deposit">{c}</Code>,
                })}
              </Step>
              <Step n={5} title={t("fwdStep5Title")}>
                {t.rich("fwdStep5Body", {
                  strong: (c) => <strong>{c}</strong>,
                  pill: (c) => <Pill>{c}</Pill>,
                })}
              </Step>
            </Steps>
            <Tip label={t("tipLabel")}>
              {t.rich("fwdTip", {
                strong: (c) => <strong>{c}</strong>,
                pill: (c) => <Pill>{c}</Pill>,
              })}
            </Tip>
          </Section>

          {/* ─── 2. ลูกค้าฝากสั่ง ──────────────────────────── */}
          <Section id="shop" emoji="🛒" title={t("shopSectionTitle")}>
            <p className="text-sm text-foreground">
              {t.rich("shopIntro", { strong: (c) => <strong>{c}</strong> })}
            </p>
            <Steps>
              <Step n={1} title={t("shopStep1Title")}>
                {t.rich("shopStep1Body", {
                  code: (c) => <Code href="/service-order/add">{c}</Code>,
                  strong: (c) => <strong>{c}</strong>,
                  pill: (c) => <Pill>{c}</Pill>,
                })}
              </Step>
              <Step n={2} title={t("shopStep2Title")}>
                {t.rich("shopStep2Body", {
                  code: (c) => <Code href="/service-order/cart">{c}</Code>,
                  pill: (c) => <Pill>{c}</Pill>,
                })}
              </Step>
              <Step n={3} title={t("shopStep3Title")}>
                {t.rich("shopStep3Body", { pill: (c) => <Pill>{c}</Pill> })}
              </Step>
              <Step n={4} title={t("shopStep4Title")}>
                {t.rich("shopStep4Body", {
                  code: (c) => <Code href="/service-order">{c}</Code>,
                })}
              </Step>
              <Step n={5} title={t("shopStep5Title")}>
                {t.rich("shopStep5Body", {
                  pill: (c) => <Pill>{c}</Pill>,
                })}
              </Step>
            </Steps>
            <Tip label={t("tipLabel")}>
              {t.rich("shopTip", {
                strong: (c) => <strong>{c}</strong>,
                code: (c) => <Code href="/refunds">{c}</Code>,
              })}
            </Tip>
          </Section>

          {/* ─── 3. ลูกค้าฝากโอน ──────────────────────────── */}
          <Section id="yuan" emoji="💱" title={t("yuanSectionTitle")}>
            <p className="text-sm text-foreground">
              {t.rich("yuanIntro", { strong: (c) => <strong>{c}</strong> })}
            </p>
            <Steps>
              <Step n={1} title={t("yuanStep1Title")}>
                {t.rich("yuanStep1Body", {
                  code: (c) => <Code href="/service-payment">{c}</Code>,
                  pill: (c) => <Pill>{c}</Pill>,
                })}
              </Step>
              <Step n={2} title={t("yuanStep2Title")}>
                {t.rich("yuanStep2Body", {
                  strong: (c) => <strong>{c}</strong>,
                })}
              </Step>
              <Step n={3} title={t("yuanStep3Title")}>
                {t.rich("yuanStep3Body", { pill: (c) => <Pill>{c}</Pill> })}
              </Step>
              <Step n={4} title={t("yuanStep4Title")}>
                {t.rich("yuanStep4Body", {
                  code: (c) => <Code href="/notifications">{c}</Code>,
                })}
              </Step>
              <Step n={5} title={t("yuanStep5Title")}>
                {t.rich("yuanStep5Body", {
                  strong: (c) => <strong>{c}</strong>,
                  pill: (c) => <Pill>{c}</Pill>,
                })}
              </Step>
            </Steps>
          </Section>

          {/* ─── 4. ติดต่อทีม ─────────────────────────────── */}
          <Section id="contact" emoji="💬" title={t("contactSectionTitle")}>
            <p className="text-sm text-foreground">
              {t("contactIntro")}
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <ContactCard
                icon="💬"
                title={t("contactLineTitle")}
                primary={SOCIAL.line}
                href={SOCIAL.line}
                hint={t("contactLineHint")}
              />
              <ContactCard
                icon="📞"
                title={t("contactPhoneCompanyTitle")}
                primary={CONTACT.phoneCompanyDisplay}
                href={`tel:${CONTACT.phoneCompany}`}
                hint={t("contactPhoneCompanyHint")}
              />
              <ContactCard
                icon="📱"
                title={t("contactSalesTitle")}
                primary={CONTACT.phoneDisplay}
                href={`tel:${CONTACT.phone}`}
                hint={t("contactSalesHint")}
              />
              <ContactCard
                icon="🛎"
                title="Customer Service"
                primary={CONTACT.phoneCsDisplay}
                href={`tel:${CONTACT.phoneCs}`}
                hint={t("contactCsHint")}
              />
              <ContactCard
                icon="✉️"
                title={t("contactEmailSalesTitle")}
                primary={CONTACT.emailSales}
                href={`mailto:${CONTACT.emailSales}`}
                hint={t("contactEmailSalesHint")}
              />
              <ContactCard
                icon="🧾"
                title={t("contactEmailAccTitle")}
                primary={CONTACT.emailAcc}
                href={`mailto:${CONTACT.emailAcc}`}
                hint={t("contactEmailAccHint")}
              />
            </div>

            <div className="rounded-xl bg-surface-alt/60 p-4 text-sm">
              <p className="font-bold mb-1">{t("quickLinksHeading")}</p>
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 list-disc list-inside text-foreground">
                <li><Link href="/dashboard" className="text-primary-600 hover:underline">{t("quickLinkDashboard")}</Link> {t("quickLinkDashboardDesc")}</li>
                <li><Link href="/profile" className="text-primary-600 hover:underline">{t("quickLinkProfile")}</Link> {t("quickLinkProfileDesc")}</li>
                <li><Link href="/wallet/history" className="text-primary-600 hover:underline">{t("quickLinkWalletHistory")}</Link> {t("quickLinkWalletHistoryDesc")}</li>
                <li><Link href="/notifications" className="text-primary-600 hover:underline">{t("quickLinkNotifications")}</Link> {t("quickLinkNotificationsDesc")}</li>
                <li><Link href="/addresses" className="text-primary-600 hover:underline">{t("quickLinkAddresses")}</Link> {t("quickLinkAddressesDesc")}</li>
                <li><Link href="/refunds" className="text-primary-600 hover:underline">{t("quickLinkRefunds")}</Link> {t("quickLinkRefundsDesc")}</li>
              </ul>
            </div>
          </Section>
        </div>
      </StubPage>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Local presentation components — kept inline to avoid bloating
// the global components/ directory with single-use UI.
// ────────────────────────────────────────────────────────────

function TocLink({ href, icon, label, sub }: { href: string; icon: string; label: string; sub: string }) {
  return (
    <a href={href} className="group flex items-start gap-3 rounded-xl bg-white dark:bg-surface border border-border p-3 hover:border-primary-300 hover:shadow-sm transition-all">
      <span className="text-2xl" aria-hidden>{icon}</span>
      <div className="min-w-0">
        <p className="font-bold text-sm text-foreground group-hover:text-primary-600">{label}</p>
        <p className="text-[11px] text-muted">{sub}</p>
      </div>
    </a>
  );
}

function Section({ id, emoji, title, children }: { id: string; emoji: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-3xl" aria-hidden>{emoji}</span>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="space-y-3 list-none pl-0">{children}</ol>;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-xl border border-border bg-white dark:bg-surface p-4 flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white font-bold text-sm">
        {n}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-foreground text-sm sm:text-base">{title}</h3>
        <div className="mt-1 text-sm text-muted leading-relaxed">{children}</div>
      </div>
    </li>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="inline-block mx-1 rounded-md bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:text-primary-300 align-middle">{children}</span>;
}

function Code({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-block mx-1 rounded-md bg-surface-alt px-1.5 py-0.5 font-mono text-xs text-foreground hover:text-primary-600 hover:bg-primary-50 align-middle">
      {children}
    </Link>
  );
}

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm">
      <p className="font-bold text-amber-900 dark:text-amber-200">💡 {label}</p>
      <p className="mt-1 text-amber-800 dark:text-amber-200">{children}</p>
    </div>
  );
}

function ContactCard({ icon, title, primary, href, hint }: { icon: string; title: string; primary: string; href: string; hint: string }) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      className="block rounded-xl border border-border bg-white dark:bg-surface p-4 hover:border-primary-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted">{title}</p>
          <p className="mt-0.5 font-mono text-sm text-primary-600 break-all">{primary}</p>
          <p className="mt-1 text-[11px] text-muted leading-snug">{hint}</p>
        </div>
      </div>
    </a>
  );
}

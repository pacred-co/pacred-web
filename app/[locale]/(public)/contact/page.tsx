import type { Metadata } from "next";
import { type ReactNode } from "react";
import { Phone, Mail, MessageCircle } from "lucide-react";
import { StubPage } from "@/components/stub-page";
import { ContactForm } from "@/components/contact-form";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";
import { CONTACT, LINE_OA } from "@/components/seo/site";

const PATH = "/contact";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.contact" });
}

/**
 * /contact — the lead-capture page. Previously a StubPage with no form;
 * `ContactForm` (P-6, fully built + wired to `submitContactMessage` +
 * `contact_messages` + admin notify) was rendered on no public page, so
 * the lead funnel was disconnected. This renders it as the StubPage
 * `children` slot — reusing the existing chrome — plus the direct
 * LINE/phone/email channels. Per the growth-acquisition analysis Tier-0.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const th = typedLocale === "th";
  return (
    <>
      <JsonLd
        data={breadcrumbSchema(
          [
            { name: th ? "หน้าหลัก" : "Home", path: "/" },
            { name: th ? "ฝ่ายบริการลูกค้า" : "Contact", path: PATH },
          ],
          typedLocale,
        )}
      />
      <StubPage
        eyebrow="CONTACT US"
        title={th ? "ฝ่ายบริการ" : "Contact"}
        highlight={th ? "ลูกค้า" : "us"}
        description={
          th
            ? "ทีมงาน Pacred Shipping พร้อมตอบทุกคำถามและให้คำปรึกษาทุกขั้นตอน — กรอกฟอร์มด้านล่าง หรือทักไลน์ / โทรหาเราได้เลย"
            : "The Pacred Shipping team replies fast — send the form below, or reach us on LINE / by phone."
        }
        breadcrumb={[{ label: th ? "ฝ่ายบริการลูกค้า" : "Contact" }]}
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Lead-capture form */}
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 md:p-7">
            <h2 className="mb-4 text-[18px] md:text-[20px] font-black tracking-tight text-[#111827] dark:text-white">
              {th ? "ส่งข้อความถึงเรา" : "Send us a message"}
            </h2>
            <ContactForm />
          </div>

          {/* Direct channels */}
          <aside className="space-y-3">
            <a
              href={LINE_OA.addFriendUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl bg-[#06C755] px-5 py-4 text-white shadow-sm transition-transform hover:scale-[1.01]"
            >
              <MessageCircle className="h-6 w-6 shrink-0" strokeWidth={2.5} />
              <span>
                <span className="block text-[13px] font-black">
                  {th ? "แชทไลน์ทันที" : "Chat on LINE now"}
                </span>
                <span className="block text-[12px] opacity-90">
                  {th ? "ตอบไวที่สุด" : "Fastest reply"}
                </span>
              </span>
            </a>
            <ContactRow
              icon={<Phone className="h-5 w-5" strokeWidth={2.25} />}
              label={th ? "ฝ่ายขาย" : "Sales"}
              value={CONTACT.phoneDisplay}
              href={`tel:${CONTACT.phone}`}
            />
            <ContactRow
              icon={<Phone className="h-5 w-5" strokeWidth={2.25} />}
              label={th ? "ฝ่ายบริการลูกค้า" : "Customer service"}
              value={CONTACT.phoneCsDisplay}
              href={`tel:${CONTACT.phoneCs}`}
            />
            <ContactRow
              icon={<Mail className="h-5 w-5" strokeWidth={2.25} />}
              label={th ? "อีเมล" : "Email"}
              value={CONTACT.email}
              href={`mailto:${CONTACT.email}`}
            />
          </aside>
        </div>
      </StubPage>
    </>
  );
}

function ContactRow({
  icon,
  label,
  value,
  href,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-border bg-white dark:bg-surface px-5 py-3.5 transition-colors hover:border-primary-600"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600">
        {icon}
      </span>
      <span>
        <span className="block text-[12px] font-semibold text-muted">{label}</span>
        <span className="block text-[14px] font-bold text-[#111827] dark:text-white">{value}</span>
      </span>
    </a>
  );
}

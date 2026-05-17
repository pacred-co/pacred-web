import type { Metadata } from "next";
import { StubPage } from "@/components/stub-page";
import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";
import { CONTACT, SOCIAL } from "@/components/seo/site";

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
        title={typedLocale === "th" ? "วิธีการ" : "How to"}
        highlight={typedLocale === "th" ? "ใช้บริการ" : "use Pacred"}
        description={
          typedLocale === "th"
            ? "เลือกบริการที่ตรงกับสิ่งที่คุณจะทำ แล้วทำตามขั้นตอนได้เลย — ไม่ต้องเป็นคนรู้ระบบนำเข้ามาก่อน"
            : "Pick the service you need below and follow the step-by-step guide — no prior shipping experience required."
        }
        breadcrumb={[{ label: typedLocale === "th" ? "วิธีการใช้บริการ" : "How to use" }]}
        banner="import-export"
      >
        <div className="mx-auto w-full max-w-[1100px] space-y-10">
          {/* TOC */}
          <nav className="rounded-2xl border border-border bg-surface-alt/40 p-5 grid sm:grid-cols-2 md:grid-cols-4 gap-3">
            <TocLink href="#fwd"     icon="📦" label="ลูกค้านำเข้า"   sub="ส่งของจากจีนมาไทย" />
            <TocLink href="#shop"    icon="🛒" label="ลูกค้าฝากสั่ง"   sub="ให้เราซื้อสินค้าจีนให้" />
            <TocLink href="#yuan"    icon="💱" label="ลูกค้าฝากโอน"   sub="โอนหยวนชำระร้านจีน" />
            <TocLink href="#contact" icon="💬" label="ติดต่อทีม"       sub="LINE / โทร / อีเมล" />
          </nav>

          {/* ─── 1. ลูกค้านำเข้า ───────────────────────────── */}
          <Section id="fwd" emoji="📦" title="สำหรับลูกค้านำเข้า (ฝากนำเข้าสินค้าจากจีน)">
            <p className="text-sm text-foreground">
              ใช้ตอน <strong>คุณซื้อสินค้าจากจีนเองแล้ว</strong> — ของอยู่ที่โกดังจีน
              ของเรา (กวางโจว / อี้อู) — แค่ต้องการให้ Pacred ขนกลับไทย + ออกของให้
            </p>
            <Steps>
              <Step n={1} title="เปิดบริการ /service-import">
                เข้าหน้า <Code href="/service-import">/service-import</Code> แล้วกดปุ่ม
                <Pill>+ เปิดรายการใหม่</Pill>
              </Step>
              <Step n={2} title="กรอกขนาด/น้ำหนัก + เลือกการขนส่ง">
                เลือก <strong>โกดังต้นทาง</strong> (กวางโจว/อี้อู) +
                <strong> ประเภทขนส่ง</strong> (รถ / เรือ / อากาศ) +
                <strong> ประเภทสินค้า</strong> (ทั่วไป / มอก. / FDA / พิเศษ) — ระบบจะ
                คำนวณราคาให้ทันที (ตามน้ำหนัก vs ปริมาตร — เลือก Auto = ใช้ค่าที่สูงกว่า)
              </Step>
              <Step n={3} title="เพิ่มที่อยู่จัดส่งในไทย + อัพโหลดรูปกล่อง">
                กรอกชื่อ-เบอร์-ที่อยู่ผู้รับในไทย + แนบรูปกล่อง/สลิป (เพื่อให้
                ทีมจีนระบุได้ว่ารอบนี้ของคุณ) แล้วกด <Pill>ส่งคำขอนำเข้า</Pill>
              </Step>
              <Step n={4} title="ชำระเงินจาก wallet หรือเติมเงินก่อน">
                หลังเปิดรายการ จะได้เลขที่ F-no — ในหน้านั้นกด
                <Pill>ชำระจาก wallet ทันที</Pill> ถ้ามียอดพอ — ถ้าไม่พอกด
                <Code href="/wallet/deposit">เติมเงิน</Code> ก่อน แล้วกลับมาชำระ
              </Step>
              <Step n={5} title="รอสถานะ + ยืนยันรับสินค้า">
                ติดตามสถานะที่หน้า F-no ของคุณ: ออกจากจีน → ขนส่งกลางทาง → เข้าโกดังไทย → กำลังจัดส่ง → ส่งสำเร็จ
                {" — "}เมื่อ <strong>ของถึงและตรวจครบ</strong> กดปุ่ม
                <Pill>📥 ยืนยันรับสินค้าครบถ้วน</Pill> เพื่อปิดออเดอร์
              </Step>
            </Steps>
            <Tip>
              ลูกค้านิติบุคคล: หลังออเดอร์ <strong>ชำระแล้ว</strong> ในหน้า F-no
              กด <Pill>🖨 ดูใบแจ้งหนี้</Pill> → เลื่อนล่างสุดจะเจอปุ่ม
              <Pill>📄 ขอใบกำกับภาษี</Pill>
            </Tip>
          </Section>

          {/* ─── 2. ลูกค้าฝากสั่ง ──────────────────────────── */}
          <Section id="shop" emoji="🛒" title="สำหรับลูกค้าฝากสั่ง (ให้เราซื้อสินค้าจีนให้)">
            <p className="text-sm text-foreground">
              ใช้ตอน <strong>คุณเจอสินค้าจีน (1688 / Taobao / Tmall ฯลฯ) แต่ซื้อเองไม่ได้</strong> — Pacred
              จะซื้อให้ + รวบรวมที่โกดังจีน + ขนกลับไทยให้ครบ
            </p>
            <Steps>
              <Step n={1} title="เพิ่มสินค้าเข้ารถเข็น">
                เข้า <Code href="/service-order/add">/service-order/add</Code> →
                วาง URL สินค้า (1688 / Taobao / Tmall) หรือเพิ่มเอง → ระบุ <strong>สี / ขนาด /
                จำนวน</strong> → กด <Pill>เพิ่มสินค้า</Pill>
              </Step>
              <Step n={2} title="เปิดรถเข็นแล้วเปิดออเดอร์">
                เมื่อมีของในรถเข็นครบ เข้า <Code href="/service-order/cart">/service-order/cart</Code> →
                เลือกที่อยู่จัดส่งในไทย + โกดังต้นทาง + ประเภทขนส่ง → กด
                <Pill>เปิดออเดอร์</Pill> ระบบจะให้เลข H-no + คำนวณยอด THB
              </Step>
              <Step n={3} title="ชำระภายใน 24 ชั่วโมง">
                ต้องชำระภายใน 24 ชม. มิฉะนั้นออเดอร์จะถูกยกเลิกอัตโนมัติ — กดปุ่ม
                <Pill>ชำระจาก wallet</Pill> หรือเติมเงินก่อน
              </Step>
              <Step n={4} title="ระบบทำตามขั้นตอน — ลูกค้าแค่ติดตาม">
                หลังชำระ → สั่งสินค้าแล้ว → รอจัดส่งจีน → เข้าโกดังจีน → ออกจากจีน → ส่งสำเร็จ
                {" — "}ดูสถานะที่ <Code href="/service-order">/service-order</Code>
              </Step>
              <Step n={5} title="ของถึง → ยืนยันรับ → ขอใบกำกับภาษี (ถ้านิติบุคคล)">
                เมื่อสถานะ &ldquo;สำเร็จ&rdquo; และของถึงครบแล้ว กดปุ่ม
                <Pill>📥 ยืนยันรับสินค้าครบถ้วน</Pill> ในหน้า H-no
                {" — "}สำหรับนิติบุคคล กด <Pill>📄 ดาวน์โหลดใบเสร็จ PDF</Pill> → ขอใบกำกับภาษีที่ท้ายหน้า
              </Step>
            </Steps>
            <Tip>
              ของหายระหว่างทาง? กดเข้า H-no → ดูใต้สถานะ —
              ถ้ามีรายการ <strong>คืนเงิน (refund)</strong> ระบบจะแสดงเอง
              หรือไปขอที่ <Code href="/refunds">/refunds</Code>
            </Tip>
          </Section>

          {/* ─── 3. ลูกค้าฝากโอน ──────────────────────────── */}
          <Section id="yuan" emoji="💱" title="สำหรับลูกค้าฝากโอน (โอนหยวนชำระร้านจีนเอง)">
            <p className="text-sm text-foreground">
              ใช้ตอน <strong>คุณดีลกับร้านจีนเองแล้ว</strong> ต้องการให้ Pacred โอนหยวนผ่าน
              Alipay / WeChat / ธนาคารจีน (ไม่ต้องผ่านระบบฝากสั่ง)
            </p>
            <Steps>
              <Step n={1} title="ดูเรท + เปิดรายการฝากชำระ">
                เข้า <Code href="/service-payment">/service-payment</Code> — เรท CNY→THB
                ปัจจุบันโชว์ด้านบน → กด <Pill>+ เพิ่มรายการฝากชำระ</Pill>
              </Step>
              <Step n={2} title="กรอกช่องทาง + ผู้รับ + จำนวน">
                เลือก <strong>Alipay / WeChat / Bank</strong> → ใส่บัญชีปลายทาง + ชื่อผู้รับ + ข้อความ
                {" — "}ใส่ <strong>ยอดหยวน</strong> ระบบจะคูณเรทเป็น THB ที่ต้องตัดให้
              </Step>
              <Step n={3} title="ชำระจาก wallet หรือแนบสลิปโอนเข้า Pacred">
                ถ้ามียอดใน wallet พอ → ติ๊ก <Pill>💳 ตัดจากกระเป๋า</Pill> เสร็จเลย —
                ถ้าไม่มี ก็โอนเข้าบัญชี Pacred แล้วแนบสลิป + แนบรูปบัตร ปชช.
                (ป้องกัน fraud) แล้วส่งให้ทีม
              </Step>
              <Step n={4} title="รอทีมโอน + ยืนยันสำเร็จ">
                ทีมจะตรวจ → กำลังโอน → สำเร็จ — สถานะอัปเดทอัตโนมัติในหน้ารายการ +
                แจ้งเตือนใน <Code href="/notifications">/notifications</Code>
              </Step>
              <Step n={5} title="ขอใบกำกับภาษี (นิติบุคคล)">
                หลังสถานะ <strong>&ldquo;สำเร็จ&rdquo;</strong> กดเข้ารายละเอียดรายการ →
                เลื่อนล่างเจอปุ่ม <Pill>📄 ขอใบกำกับภาษี</Pill> — เฉพาะนิติบุคคลที่มีเลข
                ผู้เสียภาษี 13 หลักในโปรไฟล์
              </Step>
            </Steps>
          </Section>

          {/* ─── 4. ติดต่อทีม ─────────────────────────────── */}
          <Section id="contact" emoji="💬" title="ติดต่อทีม Pacred">
            <p className="text-sm text-foreground">
              อะไรไม่แน่ใจ ไม่ต้องเดา — ทักทีมงานได้เลยทุกช่องทาง ตอบเร็วในเวลาทำการ
              (จันทร์–เสาร์ 9:00–18:00)
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <ContactCard
                icon="💬"
                title="LINE Official (ตอบเร็วที่สุด)"
                primary={SOCIAL.line}
                href={SOCIAL.line}
                hint="ทักผ่าน LINE @pacred เลย — ทีมตอบในนาที"
              />
              <ContactCard
                icon="📞"
                title="โทรเข้าบริษัท"
                primary={CONTACT.phoneCompanyDisplay}
                href={`tel:${CONTACT.phoneCompany}`}
                hint="สายตรงสำนักงาน — ใช้เมื่อเรื่องด่วน"
              />
              <ContactCard
                icon="📱"
                title="ฝ่ายขาย (Sales)"
                primary={CONTACT.phoneDisplay}
                href={`tel:${CONTACT.phone}`}
                hint="สอบถามบริการใหม่ / ขอใบเสนอราคา"
              />
              <ContactCard
                icon="🛎"
                title="Customer Service"
                primary={CONTACT.phoneCsDisplay}
                href={`tel:${CONTACT.phoneCs}`}
                hint="ติดตามออเดอร์ / สอบถามสถานะของ"
              />
              <ContactCard
                icon="✉️"
                title="อีเมลฝ่ายขาย"
                primary={CONTACT.emailSales}
                href={`mailto:${CONTACT.emailSales}`}
                hint="ส่งเอกสาร / ใบเสนอราคาทางการ"
              />
              <ContactCard
                icon="🧾"
                title="อีเมลฝ่ายบัญชี"
                primary={CONTACT.emailAcc}
                href={`mailto:${CONTACT.emailAcc}`}
                hint="ใบกำกับภาษี / หัก ณ ที่จ่าย / ใบเสร็จ"
              />
            </div>

            <div className="rounded-xl bg-surface-alt/60 p-4 text-sm">
              <p className="font-bold mb-1">ลิงก์ที่ใช้บ่อย</p>
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 list-disc list-inside text-foreground">
                <li><Link href="/dashboard" className="text-primary-600 hover:underline">หน้าแดชบอร์ด</Link> — ภาพรวมยอด/ออเดอร์ของคุณ</li>
                <li><Link href="/profile" className="text-primary-600 hover:underline">โปรไฟล์</Link> — ใส่เลขผู้เสียภาษีก่อนขอใบกำกับ</li>
                <li><Link href="/wallet/history" className="text-primary-600 hover:underline">รายการเดินบัญชี</Link> — ดูทุกการตัด/เติม</li>
                <li><Link href="/notifications" className="text-primary-600 hover:underline">การแจ้งเตือน</Link> — ทุกอัพเดทจากระบบ</li>
                <li><Link href="/addresses" className="text-primary-600 hover:underline">ที่อยู่จัดส่ง</Link> — บันทึกล่วงหน้าใช้ซ้ำได้</li>
                <li><Link href="/refunds" className="text-primary-600 hover:underline">ขอเงินคืน</Link> — สำหรับเคสคืนเงินเฉพาะ</li>
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

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm">
      <p className="font-bold text-amber-900 dark:text-amber-200">💡 เคล็ดลับ</p>
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

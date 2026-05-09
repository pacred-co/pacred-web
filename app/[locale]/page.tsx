import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { HeroSection } from "@/components/sections/hero-section";
import { Promotion } from "@/components/sections/promotion";
import { Service } from "@/components/sections/service";
import { Sales } from "@/components/sections/sales";
import { Blog } from "@/components/sections/blog";
import { Partner } from "@/components/sections/partner";
import { Footer } from "@/components/sections/footer";

export default function Home() {
  return (
    <>
      <NavBar />
      <SearchBar />
      <main>
        <HeroSection />
        <Promotion />
        <Service />
        <Sales />
        <Blog />
        <Partner />
      </main>
      <Footer />

      {/* Vertical floating tabs — right center */}
      <div className="fixed right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col">
        {[
          { label: "หน้าแรก" },
          { label: "บริการ" },
          { label: "โปรโมชั่น" },
          { label: "บทความ" },
          { label: "พาร์ทเนอร์" },
          { label: "ติดต่อ" },
        ].map((item, i) => (
          <button
            key={i}
            className="w-[90px] h-[90px] bg-white dark:bg-surface border border-border flex items-center justify-center text-[11px] font-medium text-muted hover:bg-primary-500 hover:text-white hover:border-primary-500 transition-colors first:rounded-t-xl last:rounded-b-xl"
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Floating action button */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
        <span className="rounded-full bg-white dark:bg-surface shadow-md px-4 py-2 text-sm font-medium text-foreground border border-border">
          สอบถามเพิ่มเติม
        </span>
        <button
          className="w-[70px] h-[70px] rounded-full bg-primary-500 shadow-lg flex items-center justify-center hover:bg-primary-600 transition-colors shrink-0"
          aria-label="Contact"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>
    </>
  );
}

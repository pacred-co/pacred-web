import { LineIcon } from "@/components/icons/social-icons";

export function FloatingTabs() {
  return (
    <>
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
          className="w-[70px] h-[70px] rounded-full bg-[#06C755] shadow-lg flex items-center justify-center hover:bg-[#05a548] transition-colors shrink-0 text-white"
          aria-label="Chat on LINE"
        >
          <LineIcon className="h-9 w-9" />
        </button>
      </div>
    </>
  );
}

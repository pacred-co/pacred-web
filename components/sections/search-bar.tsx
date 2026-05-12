import Image from "next/image";

const QUICK_KEYS = [
  "เสื้อผ้าแฟชั่น",
  "เสื้อผ้าเด็ก",
  "ของเล่นเด็ก",
  "เสื้อผ้าสัตว์เลี้ยง",
  "เสื้อยืดขายส่ง",
  "รองเท้า",
  "ไม้แขวนเสื้อ",
];

export function SearchBar() {
  return (
    <div className="sticky top-[56px] z-40 w-full bg-white dark:bg-surface border-b border-gray-100 dark:border-border shadow-[0_4px_15px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="mx-auto w-full max-w-[1440px] px-4 xl:px-6 py-[10px]">

        <div className="flex items-center gap-4">

          {/* Logo — ขยายชนขอบบน-ล่าง แล้วโดนขอบ clip */}
          <a href="/" className="hidden sm:block shrink-0 -my-[10px]">
            <Image
              src="/images/iconfloattabs/pacleft.png"
              alt="Pacred"
              width={200}
              height={64}
              className="h-[64px] w-auto object-contain"
              priority
            />
          </a>

          {/* Search input + camera + button */}
          <div className="relative flex-1">
            <input
              type="text"
              name="url"
              placeholder="วางลิ้งสินค้า 1688 / Taobao เพื่อสั่งซื้อ + คำนวณราคาทันที"
              className="w-full h-[44px] rounded-full border border-gray-200 dark:border-border bg-gray-50 dark:bg-background pl-5 pr-[92px] text-[13px] font-medium text-gray-900 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted outline-none transition-all duration-200 focus:bg-white dark:focus:bg-surface focus:border-red-300 focus:shadow-[0_0_0_3px_#fef2f2]"
            />
            <button
              type="button"
              aria-label="ค้นหาด้วยรูปภาพ"
              className="absolute right-[48px] top-1/2 -translate-y-1/2 w-[30px] h-[30px] flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
            </button>
            <button
              type="submit"
              aria-label="ค้นหาสินค้า"
              className="absolute right-[4px] top-1/2 -translate-y-1/2 w-[38px] h-[38px] rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center shadow-[0_4px_10px_rgba(220,38,38,0.20)] transition-colors duration-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </button>
          </div>

          {/* Cart */}
          <a
            href="/member/cart"
            aria-label="ตะกร้าสินค้า"
            className="shrink-0 flex items-center justify-center w-[44px] h-[44px] rounded-full border border-gray-200 dark:border-border bg-gray-50 dark:bg-background hover:border-red-300 hover:bg-red-50 transition-colors duration-200 text-gray-500 dark:text-muted hover:text-red-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="21" r="1" />
              <circle cx="19" cy="21" r="1" />
              <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
            </svg>
          </a>

        </div>

        {/* Quick keywords */}
        <div className="flex items-center justify-center flex-wrap gap-0 pt-2">
          {QUICK_KEYS.map((kw, i) => (
            <a
              key={kw}
              href={`/member/search/?url=${encodeURIComponent(kw)}`}
              className="relative px-[10px] text-[11.5px] font-medium text-gray-500 hover:text-red-600 transition-colors duration-200 whitespace-nowrap leading-none first:pl-0"
            >
              {i > 0 && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-px h-[10px] bg-gray-300 dark:bg-border" />
              )}
              {kw}
            </a>
          ))}
        </div>

      </div>
    </div>
  );
}

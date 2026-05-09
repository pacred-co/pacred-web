export function SearchBar() {
  return (
    <div className="sticky top-16 z-40 w-full bg-background">
      <div className="mx-auto flex h-[70px] w-full max-w-[1140px] items-center justify-center px-[10px]">
        <div className="flex items-center w-[1140px] h-[45px] rounded-xl border border-border bg-white dark:bg-surface overflow-hidden">
          <input
            type="text"
            placeholder="วางลิ้งสินค้า 1688 / Taobao เพื่อสั่งซื้อ + คำนวณราคาทันที"
            className="flex-1 h-full px-4 text-sm bg-transparent outline-none text-foreground placeholder:text-muted"
          />
          <button className="h-full px-5 bg-primary-500 hover:bg-primary-600 transition-colors flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

import { SalesCarousel } from "@/components/ui/sales-carousel";

export function Sales() {
  return (
    <section id="sales" className="py-8">
      <div className="mx-auto w-full max-w-[1140px] px-[10px]">
        <div className="mx-auto w-full max-w-[1120px]">
          <SalesCarousel />
        </div>
      </div>
    </section>
  );
}

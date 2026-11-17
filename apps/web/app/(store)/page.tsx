import { ProductWall } from "@/components/store/ProductWall";

export default function HomePage() {
  return (
    <>
      <section className="grid gap-6 pt-10 pb-10 lg:grid-cols-12 lg:items-end lg:pt-16">
        <h1 className="display text-[3.6rem] sm:text-[6rem] lg:col-span-9 lg:text-[8.5rem]">
          Useful things, delivered to your door.
        </h1>
        <p className="text-ink-soft max-w-[24rem] lg:col-span-3 lg:pb-3">
          Browse by aisle, add what you need and check out in a minute.
        </p>
      </section>

      <aside className="bg-ink text-paper mb-10 grid gap-4 p-6 lg:grid-cols-12 lg:items-end">
        <p className="display text-[2.6rem] sm:text-6xl lg:col-span-6">
          Free delivery from ₹2,000.
        </p>
        <div className="flex flex-col gap-2 lg:col-span-6">
          <p>Under that, delivery is ₹99.</p>
          <p className="text-paper/80 text-sm">
            If you leave checkout after ticking the call box, someone from ShopNest may phone to
            help you finish. Leave it unticked and we won&rsquo;t.
          </p>
        </div>
      </aside>

      <ProductWall />
    </>
  );
}

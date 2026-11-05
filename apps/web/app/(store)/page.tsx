import { ProductWall } from "@/components/store/ProductWall";

export default function HomePage() {
  return (
    <>
      <section className="grid gap-6 pt-10 pb-10 lg:grid-cols-12 lg:items-end lg:pt-16">
        <h1 className="display text-[3.6rem] sm:text-[6rem] lg:col-span-9 lg:text-[8.5rem]">
          Everyday things for desk, commute and gym.
        </h1>
        <p className="text-ink-soft max-w-[24rem] lg:col-span-3 lg:pb-3">
          Six things we would actually carry ourselves. Pick what you need and check out in a
          minute.
        </p>
      </section>
      <ProductWall />
    </>
  );
}

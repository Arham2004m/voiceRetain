import type { Metadata } from "next";
import { DemoControls } from "@/components/dashboard/DemoControls";

export const metadata: Metadata = { title: "Demo" };

export default function DemoPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="display text-6xl sm:text-8xl">Demo</h1>
      <p className="max-w-[34rem]">
        The controls for running the demo: pace it, trigger it, refill the shelves, start over.
      </p>
      <DemoControls />
    </div>
  );
}

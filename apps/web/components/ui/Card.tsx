import type { HTMLAttributes } from "react";

/** A flat, ruled panel. No shadow, no rounding: structure comes from the 2px ink border. */
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`border-2 border-ink bg-paper ${className}`} {...props} />;
}

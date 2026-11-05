import type { ReactNode } from "react";

type Tone = "marigold" | "ink" | "kumkum" | "leaf" | "plain";

const tones: Record<Tone, string> = {
  marigold: "bg-marigold text-ink",
  ink: "bg-ink text-paper",
  kumkum: "bg-kumkum text-paper",
  leaf: "bg-leaf text-paper",
  plain: "bg-paper text-ink border-2 border-ink",
};

export function Badge({
  tone = "marigold",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`display num inline-flex min-h-6 min-w-6 items-center justify-center rounded-full px-2 text-[0.95rem] ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

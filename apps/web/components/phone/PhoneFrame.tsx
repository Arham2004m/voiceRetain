"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/** The handset. While a call rings the whole phone buzzes, unless reduced motion is on. */
export function PhoneFrame({
  children,
  ringing = false,
}: {
  children: ReactNode;
  ringing?: boolean;
}) {
  const reduce = useReducedMotion();
  const buzz = ringing && !reduce;

  return (
    <motion.div
      animate={
        buzz
          ? { rotate: [0, -1.4, 1.4, -1.4, 1.4, 0], x: [0, -5, 5, -5, 5, 0] }
          : { rotate: 0, x: 0 }
      }
      transition={
        buzz
          ? { duration: 0.55, repeat: Infinity, repeatDelay: 0.9, ease: "easeInOut" }
          : { duration: 0.2 }
      }
      className="bg-ink mx-auto w-full max-w-[24rem] rounded-[2.9rem] p-3"
    >
      <div className="bg-ink text-paper ring-paper/15 relative flex min-h-[40rem] flex-col overflow-hidden rounded-[2.2rem] ring-1">
        <span
          aria-hidden
          className="bg-paper/25 absolute top-2.5 left-1/2 z-10 h-1.5 w-20 -translate-x-1/2 rounded-full"
        />
        {children}
      </div>
    </motion.div>
  );
}

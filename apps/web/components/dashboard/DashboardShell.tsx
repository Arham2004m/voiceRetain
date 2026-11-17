"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useConnection } from "@/lib/dashboard/useConnection";
import { GlobalSearch } from "./GlobalSearch";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/calls", label: "Calls" },
  { href: "/dashboard/vouchers", label: "Vouchers" },
  { href: "/dashboard/demo", label: "Demo" },
];

/** The merchant's desk: an ink sidebar, a search bar, and the page. */
export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const connected = useConnection();
  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <a
        href="#main"
        className="bg-marigold text-ink sr-only z-50 px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <aside className="bg-ink text-paper flex flex-col gap-6 p-5 lg:sticky lg:top-0 lg:h-dvh">
        <div>
          <p className="display text-[2.4rem] leading-none">ShopNest</p>
          <p className="text-paper/70 mt-1 text-sm">Merchant desk</p>
        </div>
        <nav aria-label="Dashboard" className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`display px-3 py-2 text-3xl transition-colors ${
                isActive(item.href) ? "bg-marigold text-ink" : "hover:bg-paper/10"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="text-paper/80 mt-auto flex flex-col gap-2 text-sm">
          <p className="flex items-center gap-2" role="status">
            <span
              aria-hidden
              className={`size-2.5 rounded-full ${connected ? "bg-leaf" : "bg-marigold"}`}
            />
            {connected ? "Live" : "Reconnecting…"}
          </p>
          <Link href="/" className="underline underline-offset-4">
            Open the store
          </Link>
          <Link href="/phone" className="underline underline-offset-4">
            Open the phone
          </Link>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="border-ink border-b-2 px-4 py-3 sm:px-8">
          <GlobalSearch />
        </header>
        <main id="main" className="px-4 py-8 sm:px-8 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

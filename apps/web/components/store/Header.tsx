"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { useCart } from "./CartProvider";

export function Header() {
  const { count, ready } = useCart();
  return (
    <header className="border-ink bg-chalk sticky top-0 z-40 border-b-2">
      <div className="mx-auto flex w-full max-w-[88rem] items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="display text-[2.4rem] leading-none" aria-label="ShopNest, home">
          ShopNest
        </Link>
        <nav aria-label="Main" className="flex items-center gap-6 font-semibold">
          <Link href="/" className="hover:text-peacock underline-offset-4 hover:underline">
            Shop
          </Link>
          <Link
            href="/cart"
            className="hover:text-peacock flex items-center gap-2 underline-offset-4 hover:underline"
          >
            Cart
            {ready && count > 0 ? (
              <Badge>
                <span aria-hidden>{count}</span>
                <span className="sr-only">{count} items</span>
              </Badge>
            ) : null}
          </Link>
        </nav>
      </div>
    </header>
  );
}

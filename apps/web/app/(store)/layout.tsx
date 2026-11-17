import { CartProvider } from "@/components/store/CartProvider";
import { Header } from "@/components/store/Header";
import { StoreCallOverlay } from "@/components/phone/StoreCallOverlay";
import { ToastProvider } from "@/components/ui/Toast";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <CartProvider>
        <a
          href="#main"
          className="bg-marigold text-ink sr-only z-50 px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <Header />
        <main id="main" className="mx-auto w-full max-w-[88rem] px-4 pb-20 sm:px-6 lg:px-8">
          {children}
        </main>
        <footer className="border-ink border-t-2">
          <p className="text-ink-soft mx-auto max-w-[88rem] px-4 py-6 text-sm sm:px-6 lg:px-8">
            ShopNest is a demo store. Orders are not charged and nothing is shipped.
          </p>
        </footer>
        <StoreCallOverlay />
      </CartProvider>
    </ToastProvider>
  );
}

import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { QuickAddButton } from "@/components/transactions/quick-add";
import { MobileNav, NavLinks } from "@/components/nav-links";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <aside className="chalkboard sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-white/10 px-3 py-5 text-chalk lg:flex">
        <Link href="/" className="flex items-center gap-2.5 px-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-brand-500 text-sm font-bold text-white" aria-hidden>
            G
          </span>
          <span>
            <span className="block text-sm leading-tight font-semibold">Grana na Vida</span>
            <span className="block text-[11px] text-chalk/55">Finanças pessoais</span>
          </span>
        </Link>
        <nav className="mt-7 flex flex-col gap-0.5" aria-label="Principal">
          <Suspense fallback={<NavLinks pathname={null} />}>
            <NavLinks />
          </Suspense>
        </nav>
        <div className="mt-auto">
          <QuickAddButton className="w-full bg-brand-500! hover:bg-brand-400!" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="chalkboard sticky top-0 z-20 px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 text-chalk lg:hidden">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-7 items-center justify-center rounded-md bg-brand-500 text-xs font-bold text-white" aria-hidden>
              G
            </span>
            Grana na Vida
          </Link>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 lg:px-10 lg:pt-10 lg:pb-12">{children}</main>
        <nav className="mobile-nav fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Principal (celular)">
          <Suspense fallback={<MobileNav pathname={null} />}>
            <MobileNav />
          </Suspense>
        </nav>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-border pb-4 sm:mb-6 sm:items-end sm:pb-5">
      <h1 className="text-xl font-semibold tracking-tight text-ink sm:col-start-1 sm:text-2xl">{title}</h1>
      {action && <div className="col-start-2 row-start-1 sm:row-span-2">{action}</div>}
      {subtitle && <p className="col-span-2 mt-0.5 text-sm text-muted sm:col-span-1 sm:col-start-1">{subtitle}</p>}
    </div>
  );
}

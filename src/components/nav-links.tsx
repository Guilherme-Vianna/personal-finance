"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTransactionModal } from "@/components/transactions/quick-add";
import { Modal } from "@/components/ui";

const PAINEL = { href: "/", label: "Painel", icon: "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z" };
const ANALISES = { href: "/analises", label: "Análises", hint: "Tendências, hábitos e insights", icon: "M3 3v18h18M7 15l4-4 3 3 5-6" };
const GASTOS = { href: "/gastos", label: "Gastos", icon: "M4 6h16M4 12h16M4 18h10" };
const ORCAMENTO = { href: "/orcamento", label: "Orçamento", icon: "M3 7h18v12H3zM3 7l2-3h14l2 3M16 13h2" };
const METAS = { href: "/metas", label: "Metas", hint: "Reserva, viagens, compras grandes", icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" };
const COMPROVANTE = { href: "/importar", label: "Importar com IA", hint: "Fotos, PDFs, planilhas e extratos", icon: "M4 8h3l2-3h6l2 3h3v11H4V8Zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" };
const EMPRESTIMOS = { href: "/emprestimos", label: "Empréstimos", hint: "O que emprestou e falta receber", icon: "M7 11l3-3 4 4 3-3M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0Z" };
const ASSISTENTE = { href: "/assistente", label: "Assistente", hint: "Pergunte para onde o dinheiro vai", icon: "M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3ZM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" };
const CATEGORIAS = { href: "/categorias", label: "Categorias", hint: "As tags dos seus gastos", icon: "M7 7h.01M3 3h8l10 10-8 8L3 11V3Z" };

const NAV = [PAINEL, ASSISTENTE, ANALISES, GASTOS, COMPROVANTE, ORCAMENTO, METAS, EMPRESTIMOS, CATEGORIAS];
const MORE = [ASSISTENTE, COMPROVANTE, ANALISES, METAS, EMPRESTIMOS, CATEGORIAS];

function isActive(href: string, pathname: string | null) {
  if (pathname === null) return false;
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavIcon({ d, strokeWidth = 2 }: { d: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function CurrentNavLinks() {
  return <StaticNavLinks pathname={usePathname()} />;
}

function StaticNavLinks({ pathname }: { pathname: string | null }) {
  return NAV.map((item) => {
    const active = isActive(item.href, pathname);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ${active ? "bg-white/10 text-white before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-brand-300" : "text-chalk/70 hover:bg-white/5 hover:text-chalk"}`}
      >
        <NavIcon d={item.icon} />
        {item.label}
      </Link>
    );
  });
}

export function NavLinks({ pathname }: { pathname?: string | null }) {
  return pathname === undefined ? <CurrentNavLinks /> : <StaticNavLinks pathname={pathname} />;
}

const TAB_CLASS = "flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold";

function MobileTab({ item, pathname }: { item: { href: string; label: string; icon: string }; pathname: string | null }) {
  const active = isActive(item.href, pathname);
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={`${TAB_CLASS} relative transition-colors ${active ? "text-brand-700" : "text-muted"}`}>
      <span className={`absolute top-0 h-0.5 rounded-full bg-brand-600 transition-all duration-300 ease-(--ease-out-soft) ${active ? "w-8 opacity-100" : "w-0 opacity-0"}`} aria-hidden />
      <span className={`rounded-full px-3 py-0.5 transition-colors duration-200 ${active ? "bg-brand-50" : ""}`}>
        <NavIcon d={item.icon} />
      </span>
      {item.label}
    </Link>
  );
}

function CurrentMobileNav() {
  return <StaticMobileNav pathname={usePathname()} />;
}

function StaticMobileNav({ pathname }: { pathname: string | null }) {
  const { open, modal } = useTransactionModal();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE.some((item) => isActive(item.href, pathname));
  return (
    <>
      <MobileTab item={PAINEL} pathname={pathname} />
      <MobileTab item={GASTOS} pathname={pathname} />
      <button type="button" onClick={() => open()} className={`${TAB_CLASS} text-ink`}>
        <span className="-mt-5 flex size-12 items-center justify-center rounded-lg bg-brand-600 text-white shadow-lg ring-4 ring-surface transition active:scale-95">
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-7" aria-hidden>
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
        </span>
        Registrar
      </button>
      <MobileTab item={ORCAMENTO} pathname={pathname} />
      <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen} className={`${TAB_CLASS} ${moreActive ? "text-brand-700" : "text-muted"}`}>
        <NavIcon d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />
        Mais
      </button>
      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Mais opções">
        <ul className="flex flex-col gap-1">
          {MORE.map((item) => {
            const active = isActive(item.href, pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 items-center gap-3 rounded-md px-3 py-2 ${active ? "bg-brand-50 text-brand-800" : "text-ink hover:bg-brand-50"}`}
                >
                  <NavIcon d={item.icon} />
                  <span className="min-w-0">
                    <span className="block font-semibold">{item.label}</span>
                    <span className="block text-xs text-muted">{item.hint}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Modal>
      {modal}
    </>
  );
}

export function MobileNav({ pathname }: { pathname?: string | null }) {
  return pathname === undefined ? <CurrentMobileNav /> : <StaticMobileNav pathname={pathname} />;
}

"use client";

import { Toggle, useQueryUpdater } from "@/components/filters";
import { addMonths, formatMonth } from "@/lib/dates";

export function MonthFilters({ month, currentMonth, includeOutside, showOutsideToggle = true }: { month: string; currentMonth: string; includeOutside: boolean; showOutsideToggle?: boolean }) {
  const { update, pending } = useQueryUpdater();
  const go = (target: string) => update({ mes: target === currentMonth ? null : target });
  const arrow = "inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-brand-50 hover:text-brand-800 sm:size-9";
  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-5 gap-y-3 transition-opacity sm:justify-start ${pending ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
        <button type="button" className={arrow} onClick={() => go(addMonths(month, -1))} aria-label="Mês anterior">
          ‹
        </button>
        <span className="min-w-36 text-center text-sm font-bold">{formatMonth(month).replace(/^./, (c) => c.toUpperCase())}</span>
        <button type="button" className={arrow} onClick={() => go(addMonths(month, 1))} aria-label="Próximo mês">
          ›
        </button>
        {month !== currentMonth && (
          <button type="button" className="rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50" onClick={() => go(currentMonth)}>
            Hoje
          </button>
        )}
      </div>
      {showOutsideToggle && <Toggle checked={includeOutside} onChange={(checked) => update({ fora: checked ? "1" : null })} label="Incluir gastos fora do orçamento" />}
    </div>
  );
}

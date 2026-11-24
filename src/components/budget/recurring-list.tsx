"use client";

import { useRouter } from "next/navigation";
import type { RecurringKind } from "@/db/schema";
import { apiRequest } from "@/lib/api-client";
import { formatMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { amountFor, installmentOf, overrideFor, paymentFor, recurringStatus } from "@/lib/recurring";
import type { RecurringRow } from "@/lib/services/recurring";
import { ConfirmButton, dangerIconButtonClass, iconButtonClass, IconPencil, IconTrash } from "@/components/ui";
import { useToast } from "@/components/toast";
import { OverrideButton } from "./override-button";
import { RecurringFormButton, type CategoryOption, type GoalOption } from "./recurring-form";

const STATUS = { running: null, inactive: "inativo", scheduled: "agendado", ended: "encerrado" } as const;

function periodLabel(item: RecurringRow) {
  const fmt = (m: string) => formatMonth(m, "short");
  if (item.installments) return `${item.installments}x · ${fmt(item.startMonth)} a ${fmt(item.endMonth!)}`;
  return item.endMonth ? `${fmt(item.startMonth)} a ${fmt(item.endMonth)}` : `desde ${fmt(item.startMonth)} · sem fim`;
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
      <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" />
    </svg>
  );
}

export function RecurringList({
  items,
  kind,
  categories,
  goals,
  people,
  month,
}: {
  items: RecurringRow[];
  kind: RecurringKind;
  categories: CategoryOption[];
  goals: GoalOption[];
  people: string[];
  month: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const own = items.filter((item) => item.kind === kind).sort((a, b) => amountFor(b, month) - amountFor(a, month) || b.amount - a.amount);
  if (!own.length) return <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">Nada programado ainda.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {own.map((item) => {
        const status = STATUS[recurringStatus(item, month)];
        const installment = installmentOf(item, month);
        const override = overrideFor(item, month);
        const thisMonth = amountFor(item, month);
        const otherOverrides = item.overrides.filter((o) => o.month !== month && o.month >= month);
        return (
          <li key={item.id} className={`flex gap-3 rounded-lg border border-border bg-surface p-3 sm:items-center sm:p-4 ${status ? "opacity-60" : ""}`}>
            <span className="w-1.5 shrink-0 self-stretch rounded-full sm:h-10 sm:self-center" style={{ background: item.goalColor ?? item.categoryColor ?? "var(--color-brand-400)" }} />
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {item.name}
                  {status && <span className="ml-1.5 rounded bg-slate-100 px-1.5 align-middle text-[10px] font-bold text-slate-500 uppercase">{status}</span>}
                  {!item.categoryId && item.kind !== "investment" && <span className="ml-1.5 rounded bg-amber-100 px-1.5 align-middle text-[10px] font-bold text-amber-900">⚠️ sem categoria</span>}
                  {item.lentTo && <span className="ml-1.5 rounded bg-violet-50 px-1.5 align-middle text-[10px] font-bold text-violet-800">🤝 emprestado · {item.lentTo}</span>}
                  {paymentFor(item, month) && <span className="ml-1.5 rounded bg-brand-100 px-1.5 align-middle text-[10px] font-bold text-brand-800">✓ {item.kind === "income" ? "recebido" : "pago"}</span>}
                  {installment && <span className="ml-1.5 rounded bg-sky-50 px-1.5 align-middle text-[10px] font-bold text-sky-800">parcela {installment}/{item.installments}</span>}
                </p>
                <p className="text-xs text-muted">
                  {[item.categoryName, item.goalName ? `🎯 ${item.goalName}` : null, `dia ${item.dayOfMonth}`, periodLabel(item), item.notes].filter(Boolean).join(" · ")}
                </p>
                {(override || otherOverrides.length > 0) && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {[...(override ? [override] : []), ...otherOverrides].slice(0, 6).map((o) => (
                      <OverrideButton key={o.month} item={item} month={o.month} className="rounded-full bg-pencil-soft px-2 py-0.5 text-[11px] font-semibold text-amber-800 hover:brightness-95" title={o.notes ?? undefined}>
                        {formatMonth(o.month, "short")}: {o.amount === null ? "pulado" : formatMoney(o.amount, { round: true })}
                      </OverrideButton>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 sm:shrink-0">
                <div className="flex items-baseline gap-1.5 sm:block sm:text-right">
                  <p className={`text-lg font-semibold tabular-nums ${override ? "text-amber-700" : ""}`}>{formatMoney(status ? item.amount : thisMonth)}</p>
                  <p className="text-xs text-muted">{override ? (override.amount === null ? "pulado este mês" : `normal ${formatMoney(item.amount)}`) : "por mês"}</p>
                </div>
                <div className="-mr-2 flex gap-0.5 sm:mr-0">
                  <OverrideButton item={item} month={month} className={iconButtonClass}>
                    <IconCalendar />
                    <span className="sr-only">Ajustar um mês de {item.name}</span>
                  </OverrideButton>
                  <RecurringFormButton variant="ghost" categories={categories} goals={goals} people={people} initial={item} className="size-10 p-0! sm:size-9">
                    <IconPencil />
                    <span className="sr-only">Editar {item.name}</span>
                  </RecurringFormButton>
                  <ConfirmButton
                    title="Apagar do orçamento?"
                    message={`"${item.name}" sai de todos os meses, inclusive os passados. Para parar só daqui pra frente, edite e coloque um mês final.`}
                    className={dangerIconButtonClass}
                    onConfirm={async () => {
                      await apiRequest(`/api/recurring/${item.id}`, { method: "DELETE" });
                      toast("Apagado do orçamento");
                      router.refresh();
                    }}
                  >
                    <IconTrash />
                    <span className="sr-only">Apagar {item.name}</span>
                  </ConfirmButton>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

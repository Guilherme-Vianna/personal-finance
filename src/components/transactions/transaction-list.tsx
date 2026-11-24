"use client";

import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import { formatDayHeading, formatTimestamp } from "@/lib/dates";
import { formatMoney, PAYMENT_METHOD_LABELS } from "@/lib/format";
import type { TransactionRow } from "@/lib/services/transactions";
import { ConfirmButton, dangerIconButtonClass, iconButtonClass, IconPencil, IconTrash } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useTransactionModal } from "./quick-add";

function signed(row: TransactionRow) {
  return row.categoryKind === "income" ? row.amount : -row.amount;
}

export function TransactionList({ transactions, today }: { transactions: TransactionRow[]; today: string }) {
  const router = useRouter();
  const toast = useToast();
  const { open, modal } = useTransactionModal();

  const days = new Map<string, TransactionRow[]>();
  for (const row of transactions) days.set(row.date, [...(days.get(row.date) ?? []), row]);

  return (
    <div className="stagger flex flex-col gap-5">
      {[...days].map(([day, rows]) => {
        const spent = rows.filter((r) => r.categoryKind === "expense").reduce((t, r) => t + r.amount, 0);
        const received = rows.filter((r) => r.categoryKind === "income").reduce((t, r) => t + r.amount, 0);
        return (
          <section key={day}>
            <header className="mb-2 flex items-baseline justify-between gap-3 px-1">
              <h3 className="font-bold capitalize">{formatDayHeading(day, today)}</h3>
              <span className="text-sm font-semibold tabular-nums">
                {received > 0 && <span className="text-brand-700">+{formatMoney(received)}</span>}
                {received > 0 && spent > 0 && <span className="text-muted"> · </span>}
                {spent > 0 && <span className="text-danger">-{formatMoney(spent)}</span>}
              </span>
            </header>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {rows.map((row) => (
                <li key={row.id} className="group flex gap-3 px-4 py-3 sm:items-center">
                  <span className="w-1.5 shrink-0 self-stretch rounded-full sm:h-9 sm:self-center" style={{ background: row.categoryColor }} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="line-clamp-2 min-w-0 font-semibold sm:line-clamp-1">{row.description}</p>
                        <Amount row={row} className="sm:hidden" />
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted sm:mt-0">
                        <span>{row.categoryName}</span>
                        {row.method && (
                          <span className="rounded bg-brand-50 px-1.5 font-semibold text-brand-800">
                            {PAYMENT_METHOD_LABELS[row.method].icon} {PAYMENT_METHOD_LABELS[row.method].label}
                          </span>
                        )}
                        {row.lentTo && <span className="rounded bg-violet-50 px-1.5 font-semibold text-violet-800">🤝 emprestado · {row.lentTo}</span>}
                        {row.outsideBudget && <span className="rounded bg-slate-100 px-1.5 font-semibold text-slate-600">fora do orçamento</span>}
                        {row.notes && <span className="line-clamp-1 max-w-full">· {row.notes}</span>}
                      </p>
                      <div className="hidden sm:block">
                        <LoggedAt createdAt={row.createdAt} updatedAt={row.updatedAt} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:shrink-0 sm:gap-3">
                      <div className="min-w-0 sm:hidden">
                        <LoggedAt createdAt={row.createdAt} updatedAt={row.updatedAt} />
                      </div>
                      <Amount row={row} className="hidden sm:inline" />
                      <div className="-mr-2 flex shrink-0 gap-1 pointer-fine:opacity-0 pointer-fine:transition pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100 sm:mr-0">
                        <button type="button" onClick={() => open(row)} aria-label={`Editar ${row.description}`} className={iconButtonClass}>
                          <IconPencil />
                        </button>
                        <ConfirmButton
                          title="Apagar lançamento?"
                          message={`"${row.description}" (${formatMoney(row.amount)}) será removido.`}
                          className={dangerIconButtonClass}
                          onConfirm={async () => {
                            await apiRequest(`/api/transactions/${row.id}`, { method: "DELETE" });
                            toast("Lançamento apagado");
                            router.refresh();
                          }}
                        >
                          <IconTrash />
                          <span className="sr-only">Apagar {row.description}</span>
                        </ConfirmButton>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {modal}
    </div>
  );
}

function Amount({ row, className = "" }: { row: TransactionRow; className?: string }) {
  const value = signed(row);
  return (
    <span className={`shrink-0 font-bold whitespace-nowrap tabular-nums ${value > 0 ? "text-brand-700" : "text-ink"} ${className}`}>
      {value > 0 ? "+" : "-"}
      {formatMoney(Math.abs(value))}
    </span>
  );
}

function LoggedAt({ createdAt, updatedAt }: { createdAt: Date | string; updatedAt: Date | string | null }) {
  const edited = updatedAt && new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 60_000;
  return (
    <p className="text-[11px] text-muted tabular-nums" title="Momento em que o lançamento foi feito no app">
      🕒 lançado em {formatTimestamp(createdAt)}
      {edited && <> · editado em {formatTimestamp(updatedAt)}</>}
    </p>
  );
}

import Link from "next/link";
import { Card, CardTitle } from "@/components/ui";
import { formatDate, formatMonth } from "@/lib/dates";
import { formatMoney, RECURRING_KIND_LABELS } from "@/lib/format";
import { amountFor, checkStatus, paymentFor, plannedMonths, installmentOf } from "@/lib/recurring";
import type { RecurringRow } from "@/lib/services/recurring";
import { UndoPaymentButton } from "./undo-payment-button";

const STATUS = {
  overdue: { label: "Atrasado", icon: "⚠️", tone: "bg-amber-100 text-amber-900", order: 0 },
  pending: { label: "Pendente", icon: "⏳", tone: "bg-slate-100 text-slate-700", order: 1 },
  paid: { label: "Relacionado", icon: "✓", tone: "bg-brand-100 text-brand-800", order: 2 },
  skipped: { label: "Pulado", icon: "⏭️", tone: "bg-slate-100 text-slate-500", order: 3 },
} as const;

// Planned items of the month next to what was actually linked to them (usually from the AI import).
export function BudgetCheck({ items, month, today }: { items: RecurringRow[]; month: string; today: string }) {
  const rows = items
    .filter((item) => !item.lentTo && plannedMonths(item, month, month).length > 0)
    .map((item) => ({ item, status: checkStatus(item, month, today), payment: paymentFor(item, month), planned: amountFor(item, month) || item.amount, installment: installmentOf(item, month) }))
    .sort((a, b) => STATUS[a.status].order - STATUS[b.status].order || a.item.dayOfMonth - b.item.dayOfMonth);
  const sum = (status: keyof typeof STATUS) => rows.filter((r) => r.status === status);
  const counters = (["paid", "pending", "overdue", "skipped"] as const).map((status) => ({ status, rows: sum(status) }));

  return (
    <Card>
      <CardTitle action={<Link href="/importar" className="text-sm font-semibold text-brand-700 hover:underline">Importar →</Link>}>Conferência de {formatMonth(month)}</CardTitle>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nada programado neste mês.</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {counters.map(({ status, rows: own }) => (
              <div key={status} className={`rounded-md px-3 py-2 ${STATUS[status].tone}`}>
                <p className="text-[11px] font-bold tracking-wider uppercase">
                  {STATUS[status].icon} {STATUS[status].label}
                </p>
                <p className="text-lg font-semibold tabular-nums">{own.length}</p>
                <p className="text-xs tabular-nums">{formatMoney(own.reduce((t, r) => t + (r.payment?.amount ?? r.planned), 0), { round: true })}</p>
              </div>
            ))}
          </div>
          <details open={rows.length <= 6}>
            <summary className="cursor-pointer text-sm font-semibold text-brand-700 select-none">Ver itens ({rows.length})</summary>
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {rows.map(({ item, status, payment, planned, installment }) => (
              <li key={item.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                <span className={`w-fit shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[status].tone}`}>
                  {STATUS[status].icon} {STATUS[status].label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {item.name}
                    {installment && <span className="ml-1 text-xs font-normal text-muted">parcela {installment}/{item.installments}</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {RECURRING_KIND_LABELS[item.kind].label} · planejado {formatMoney(planned)} · dia {item.dayOfMonth}
                    {payment && (
                      <>
                        {" "}
                        · {item.kind === "income" ? "recebido" : "pago"} em {formatDate(payment.date)}: <strong className="text-ink">{formatMoney(payment.amount)}</strong>
                        {payment.description && <span className="block truncate sm:inline"> · {payment.description}</span>}
                      </>
                    )}
                  </p>
                </div>
                {payment && <UndoPaymentButton recurringId={item.id} name={item.name} month={month} />}
              </li>
            ))}
          </ul>
          </details>
        </>
      )}
    </Card>
  );
}

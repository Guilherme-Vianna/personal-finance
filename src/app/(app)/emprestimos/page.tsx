import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/app-shell";
import { CountUp } from "@/components/count-up";
import { StatCard } from "@/components/dashboard/charts";
import { MovementList } from "@/components/loans/movement-list";
import { RepaymentButton } from "@/components/loans/repayment-button";
import { PageSuspense } from "@/components/page-suspense";
import { QuickAddButton } from "@/components/transactions/quick-add";
import { Card, CardTitle, EmptyState, ProgressBar } from "@/components/ui";
import { formatMonth, monthOf, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { listLoans } from "@/lib/services/loans";

export const metadata: Metadata = { title: "Empréstimos" };

export default function LoansPage() {
  return (
    <>
      <PageHeader title="Empréstimos" subtitle="Dinheiro e parcelas que você passou pra família e falta receber" />
      <PageSuspense>
        <Loans />
      </PageSuspense>
    </>
  );
}

async function Loans() {
  await connection();
  const today = todayISO();
  const loans = await listLoans(today);
  const month = monthOf(today);
  const people = loans.map((l) => l.name);

  if (!loans.length) {
    return (
      <EmptyState
        icon="🤝"
        title="Nenhum empréstimo"
        description='Ao registrar um gasto, ou uma conta parcelada no Orçamento, ligue "Emprestado" e diga para quem. O valor sai do seu orçamento e aparece aqui como a receber.'
        action={<QuickAddButton />}
      />
    );
  }

  const balance = loans.reduce((t, l) => t + Math.max(0, l.balance), 0);
  const upcoming = loans.reduce((t, l) => t + l.upcoming, 0);
  const lentThisMonth = loans.flatMap((l) => l.movements).filter((m) => m.kind === "lent" && !m.future && monthOf(m.date) === month).reduce((t, m) => t + m.amount, 0);
  const repaidThisMonth = loans.flatMap((l) => l.movements).filter((m) => m.kind === "repaid" && monthOf(m.date) === month).reduce((t, m) => t + m.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <RepaymentButton people={people} variant="primary" className="w-full sm:w-auto" />
      </div>
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard highlight label="A receber" value={formatMoney(balance, { round: balance >= 1000 })} detail={`de ${loans.length} pessoa(s)`} />
        <StatCard label="Parcelas que vão cair" value={formatMoney(upcoming, { round: true })} detail="ainda não pagas no cartão" />
        <StatCard label="Emprestado no mês" value={formatMoney(lentThisMonth, { round: true })} detail={formatMonth(month)} />
        <StatCard label="Recebido no mês" value={formatMoney(repaidThisMonth, { round: true })} tone={repaidThisMonth > 0 ? "good" : undefined} detail={formatMonth(month)} />
      </div>

      <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loans.map((loan) => (
          <article key={loan.name} className="lift relative flex min-w-0 flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-surface p-4 pt-5 shadow-card sm:p-5 sm:pt-6">
            <span className="absolute inset-x-0 top-0 h-1 bg-violet-500" aria-hidden />
            <div className="flex items-start justify-between gap-3">
              <p className="flex items-center gap-2 text-lg font-bold">
                <span className="flex size-9 items-center justify-center rounded-full bg-violet-100 text-base font-extrabold text-violet-800">{loan.name.charAt(0).toUpperCase()}</span>
                {loan.name}
              </p>
              {loan.balance <= 0 && loan.lent > 0 && <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-800">Quitado</span>}
            </div>
            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="font-hand text-3xl leading-none font-bold text-violet-800">
                  <CountUp value={loan.percent} suffix="%" />
                </span>
                <span className="text-sm text-muted tabular-nums">
                  <strong className="text-ink">{formatMoney(loan.repaid, { round: true })}</strong> de {formatMoney(loan.lent, { round: true })} devolvidos
                </span>
              </div>
              <ProgressBar value={loan.percent} color="#7c3aed" size="lg" label={`Quanto ${loan.name} já devolveu`} />
              <p className="mt-1.5 text-xs text-muted">
                {loan.balance > 0 ? `Falta receber ${formatMoney(loan.balance)}` : loan.balance < 0 ? `Pagou ${formatMoney(-loan.balance)} a mais` : "Tudo certo por enquanto"}
                {loan.upcoming > 0 && ` · + ${formatMoney(loan.upcoming)} em parcelas futuras`}
              </p>
            </div>
            {loan.plans.length > 0 && (
              <ul className="flex flex-col gap-1 rounded-xl bg-violet-50/60 px-3 py-2 text-xs text-violet-900">
                {loan.plans.map((plan) => (
                  <li key={plan.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      🔁 {plan.name}
                      {plan.installment && ` · ${plan.installment}/${plan.installments}`}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatMoney(plan.amount)}/mês</span>
                  </li>
                ))}
              </ul>
            )}
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-brand-700 select-none">Movimentações ({loan.movements.length})</summary>
              <div className="mt-2 max-h-72 overflow-y-auto">
                <MovementList movements={loan.movements} />
              </div>
            </details>
            {loan.balance > 0 && <RepaymentButton person={loan.name} balance={loan.balance} className="mt-auto" />}
          </article>
        ))}
      </div>

      <Card className="notebook">
        <CardTitle>Como funciona</CardTitle>
        <ul className="flex flex-col gap-2 text-sm text-muted">
          <li>🤝 Marque um gasto (ou uma conta parcelada no Orçamento) como emprestado e diga para quem.</li>
          <li>📊 Ele continua aparecendo nos Gastos e no balanço do mês, mas não consome o seu orçamento pessoal.</li>
          <li>💸 Parcelas emprestadas contam como dívida da pessoa a cada mês que caem no cartão.</li>
          <li>✅ Quando a pessoa devolver, registre o pagamento: a barra enche e o saldo diminui.</li>
        </ul>
      </Card>
    </div>
  );
}

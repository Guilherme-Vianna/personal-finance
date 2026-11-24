import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/app-shell";
import { OverrideButton } from "@/components/budget/override-button";
import { CategoryDonut, CategoryTable, MethodList, RankingList, SeriesChart, StatCard, WeekdayChart } from "@/components/dashboard/charts";
import { MonthFilters } from "@/components/dashboard/month-filters";
import { GoalCard } from "@/components/goals/goal-card";
import { PageSuspense } from "@/components/page-suspense";
import { QuickAddButton } from "@/components/transactions/quick-add";
import { Card, CardTitle, EmptyState, ProgressBar } from "@/components/ui";
import type { MonthSummary } from "@/lib/budget";
import { formatDate, formatMonth, isMonth, monthOf, todayISO } from "@/lib/dates";
import { formatMoney, formatPercent, RECURRING_KIND_LABELS } from "@/lib/format";
import { listGoals } from "@/lib/services/goals";
import { dashboardStats, type DashboardStats } from "@/lib/services/stats";

export default function DashboardPage(props: PageProps<"/">) {
  return (
    <>
      <PageHeader title="Painel" subtitle="Quanto ainda dá pra gastar e pra onde o dinheiro foi" action={<div className="hidden lg:block"><QuickAddButton /></div>} />
      <PageSuspense>
        <Dashboard searchParams={props.searchParams} />
      </PageSuspense>
    </>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const params = await searchParams;
  await connection();
  const today = todayISO();
  const currentMonth = monthOf(today);
  const month = isMonth(params.mes) ? params.mes : currentMonth;
  const includeOutside = params.fora === "1";
  const [stats, goals] = await Promise.all([dashboardStats({ month, includeOutside, today }), listGoals(today)]);
  const { summary } = stats;
  const activeGoals = goals.filter((goal) => goal.status === "active");
  const isCurrent = month === currentMonth;
  const isPast = month < currentMonth;

  return (
    <div className="flex flex-col gap-6">
      <MonthFilters month={month} currentMonth={currentMonth} includeOutside={includeOutside} />

      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          highlight
          label={isPast ? "Sobrou do orçamento" : "Ainda dá pra gastar"}
          value={formatMoney(summary.remaining, { round: Math.abs(summary.remaining) >= 1000 })}
          tone={summary.remaining < 0 ? "bad" : undefined}
          detail={`de ${formatMoney(summary.personalBudget, { round: true })} do orçamento pessoal`}
        />
        <StatCard
          label="Por dia"
          value={isPast ? formatMoney(summary.dailyAverage) : formatMoney(summary.dailyAllowance)}
          tone={!isPast && summary.remaining <= 0 ? "bad" : undefined}
          detail={isPast ? "média gasta por dia" : `nos ${summary.daysLeft} dia(s) que faltam`}
        />
        <StatCard label="Gasto no mês" value={formatMoney(stats.total)} detail={`${stats.count} gasto(s) · média ${formatMoney(summary.dailyAverage, { round: true })}/dia`} />
        <StatCard label="Maior categoria" value={stats.topCategory?.name ?? "—"} detail={stats.topCategory ? `${formatMoney(stats.topCategory.amount, { round: true })} · ${formatPercent(stats.topCategory.percent)}` : "sem gastos"} />
      </div>

      <BudgetCard summary={summary} isCurrent={isCurrent} isPast={isPast} month={month} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <MonthOverview summary={summary} />
        <BillsCard stats={stats} month={month} today={today} />
      </div>

      {stats.count === 0 ? (
        <EmptyState icon="🧾" title="Nenhum gasto nesse mês" description="Registre seus gastos do dia a dia e acompanhe aqui quanto ainda dá pra gastar." action={<QuickAddButton />} />
      ) : (
        <>
          <Card>
            <CardTitle>Por categoria</CardTitle>
            <div className="flex flex-col items-center gap-8 md:flex-row">
              <CategoryDonut data={stats.byCategory} total={stats.total} />
              <CategoryTable data={stats.byCategory} />
            </div>
          </Card>

          <Card>
            <CardTitle>Gastos por dia</CardTitle>
            <SeriesChart series={stats.series} reference={summary.personalBudget / summary.days} referenceLabel="ideal/dia" />
          </Card>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <CardTitle>Onde mais foi dinheiro</CardTitle>
              <RankingList data={stats.topDescriptions} />
            </Card>
            <div className="flex min-w-0 flex-col gap-6">
              <Card>
                <CardTitle>Forma de pagamento</CardTitle>
                <MethodList data={stats.byMethod} />
              </Card>
              <Card>
                <CardTitle>Por dia da semana</CardTitle>
                <WeekdayChart data={stats.byWeekday} />
              </Card>
            </div>
          </div>
        </>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Metas</h2>
          <Link href="/metas" className="-my-2 py-2 text-sm font-semibold text-brand-700 hover:underline">
            Ver todas →
          </Link>
        </div>
        {activeGoals.length ? (
          <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activeGoals.slice(0, 3).map((goal) => (
              <GoalCard key={goal.id} goal={goal} today={today} compact />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="🎯"
            title="Nenhuma meta ainda"
            description="Crie uma meta (reserva de emergência, viagem, notebook…) e acompanhe com uma barra de progresso."
            action={
              <Link href="/metas" className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                Criar meta
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}

function BudgetCard({ summary, isCurrent, isPast, month }: { summary: MonthSummary; isCurrent: boolean; isPast: boolean; month: string }) {
  const over = summary.remaining < 0;
  let message: string;
  if (isPast) message = over ? `${formatMonth(month)} estourou ${formatMoney(-summary.remaining)} do orçamento.` : `${formatMonth(month)} fechou com ${formatMoney(summary.remaining)} de sobra no orçamento.`;
  else if (!isCurrent) message = "Mês futuro: o orçamento ainda está intacto.";
  else if (over) message = `Você passou ${formatMoney(-summary.remaining)} do orçamento deste mês.`;
  else if (summary.paceDiff > 1) message = `Você está ${formatMoney(summary.paceDiff)} acima do ritmo ideal até ontem. Segure um pouco!`;
  else if (summary.paceDiff < -1) message = `Você está ${formatMoney(-summary.paceDiff)} abaixo do ritmo ideal. Boa!`;
  else message = "Você está exatamente no ritmo ideal.";

  return (
    <Card>
      <CardTitle>Orçamento pessoal</CardTitle>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className={`font-hand text-3xl leading-none font-bold ${over ? "text-danger" : "text-brand-800"}`}>{formatPercent(summary.usedPercent / 100)}</span>
        <span className="text-sm text-muted tabular-nums">
          <strong className="text-ink">{formatMoney(summary.spent)}</strong> de {formatMoney(summary.personalBudget)}
        </span>
      </div>
      <ProgressBar
        value={summary.usedPercent}
        size="lg"
        color={over ? "var(--color-danger)" : summary.paceDiff > 1 && isCurrent ? "var(--color-pencil)" : "var(--color-brand-500)"}
        label="Orçamento pessoal usado"
        marker={isCurrent ? summary.idealPercent : undefined}
        markerLabel="Ritmo ideal até ontem"
      />
      <p className="mt-2 text-sm text-muted">{message}</p>
      {(summary.budgetExtra > 0 || summary.spentOutside > 0) && (
        <p className="mt-1 text-xs text-muted">
          {summary.budgetExtra > 0 && `Inclui ${formatMoney(summary.budgetExtra)} de entradas extras. `}
          {summary.spentOutside > 0 && `${formatMoney(summary.spentOutside)} gastos fora do orçamento não entram aqui.`}
        </p>
      )}
    </Card>
  );
}

function MonthOverview({ summary }: { summary: MonthSummary }) {
  const lines = [
    { label: "Renda", value: summary.income, sign: "+" },
    { label: "Contas fixas", value: -summary.fixedExpenses, sign: "−" },
    { label: "Investimentos", value: -summary.investments, sign: "−" },
    { label: "Gastos pessoais", value: -(summary.spent + summary.spentOutside), sign: "−" },
    ...(summary.lent ? [{ label: "🤝 Emprestado", value: -summary.lent, sign: "−" }] : []),
    ...(summary.repaid ? [{ label: "🤝 Recebido de volta", value: summary.repaid, sign: "+" }] : []),
  ];
  return (
    <Card>
      <CardTitle action={<Link href="/orcamento" className="text-sm font-semibold text-brand-700 hover:underline">Orçamento →</Link>}>Balanço do mês</CardTitle>
      <dl className="flex flex-col gap-2 text-sm">
        {lines.map((line) => (
          <div key={line.label} className="flex justify-between gap-3">
            <dt className="text-muted">{line.label}</dt>
            <dd className={`font-semibold tabular-nums ${line.value > 0 ? "text-brand-700" : ""}`}>
              {line.value === 0 ? formatMoney(0) : `${line.sign} ${formatMoney(Math.abs(line.value))}`}
            </dd>
          </div>
        ))}
        <div className="mt-1 flex justify-between gap-3 border-t border-dashed border-border pt-2">
          <dt className="font-bold">Sobra real</dt>
          <dd className={`text-lg font-extrabold tabular-nums ${summary.actualLeftover < 0 ? "text-danger" : "text-brand-700"}`}>{formatMoney(summary.actualLeftover)}</dd>
        </div>
        <div className="flex justify-between gap-3 text-xs text-muted">
          <dt>Sobra planejada (com orçamento cheio)</dt>
          <dd className="tabular-nums">{formatMoney(summary.plannedLeftover)}</dd>
        </div>
      </dl>
    </Card>
  );
}

function BillsCard({ stats, month, today }: { stats: DashboardStats; month: string; today: string }) {
  const bills = stats.bills.filter((bill) => bill.kind !== "income");
  const incomes = stats.bills.filter((bill) => bill.kind === "income");
  const rows = [...incomes, ...bills];
  return (
    <Card>
      <CardTitle>Programado no mês</CardTitle>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          Nada programado. Cadastre salário e contas fixas em{" "}
          <Link href="/orcamento" className="font-semibold text-brand-700 hover:underline">
            Orçamento
          </Link>
          .
        </p>
      ) : (
        <ul className="-my-1 flex max-h-80 flex-col divide-y divide-border overflow-y-auto">
          {rows.map((bill) => {
            const done = bill.date <= today;
            const skipped = bill.override?.amount === null;
            return (
              <li key={bill.id} className={`flex items-center gap-3 py-2 ${skipped ? "opacity-50" : ""}`}>
                <span className={`flex size-9 shrink-0 flex-col items-center justify-center rounded-lg text-[10px] leading-none font-bold ${done ? "bg-brand-50 text-brand-800" : "bg-pencil-soft text-amber-800"}`}>
                  <span className="text-sm">{bill.date.slice(8, 10)}</span>
                  {formatDate(bill.date, { month: "short" }).replace(".", "")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-semibold ${skipped ? "line-through" : ""}`}>{bill.name}</p>
                  <p className="text-xs text-muted">
                    {RECURRING_KIND_LABELS[bill.kind].label}
                    {bill.installment && ` · parcela ${bill.installment}/${bill.installments}`}
                    {bill.lentTo && ` · 🤝 ${bill.lentTo}`}
                    {bill.override && (skipped ? " · pulado" : " · valor ajustado")}
                  </p>
                </div>
                <OverrideButton item={bill} month={month} className="rounded-lg px-1.5 py-1 text-right hover:bg-brand-50">
                  <span className={`block text-sm font-bold tabular-nums ${bill.kind === "income" ? "text-brand-700" : ""}`}>
                    {bill.kind === "income" ? "+" : "−"}
                    {formatMoney(skipped ? bill.amount : bill.monthAmount)}
                  </span>
                </OverrideButton>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

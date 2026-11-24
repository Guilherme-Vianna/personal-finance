import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/app-shell";
import { RecurringFormButton } from "@/components/budget/recurring-form";
import { RecurringList } from "@/components/budget/recurring-list";
import { SettingsButton } from "@/components/budget/settings-form";
import { StatCard } from "@/components/dashboard/charts";
import { MonthFilters } from "@/components/dashboard/month-filters";
import { PageSuspense } from "@/components/page-suspense";
import { Card, CardTitle, ProgressBar } from "@/components/ui";
import type { RecurringKind } from "@/db/schema";
import { monthSummary } from "@/lib/budget";
import { formatMonth, isMonth, lastDayOfMonth, monthOf, todayISO } from "@/lib/dates";
import { formatMoney, formatPercent, RECURRING_KIND_LABELS } from "@/lib/format";
import { remainingAmount } from "@/lib/recurring";
import { OrphanAlert } from "@/components/orphan-alert";
import { listCategories } from "@/lib/services/categories";
import { listGoals } from "@/lib/services/goals";
import { loanPeople } from "@/lib/services/loans";
import { listRecurring } from "@/lib/services/recurring";
import { getSettings } from "@/lib/services/settings";
import { listTransactions } from "@/lib/services/transactions";

export const metadata: Metadata = { title: "Orçamento" };

export default function BudgetPage(props: PageProps<"/orcamento">) {
  return (
    <>
      <PageHeader title="Orçamento" subtitle="Rendas, contas fixas e investimentos programados mês a mês" />
      <PageSuspense>
        <Budget searchParams={props.searchParams} />
      </PageSuspense>
    </>
  );
}

const SECTIONS: { kind: RecurringKind; hint: string }[] = [
  { kind: "income", hint: "Salário, benefícios, auxílios: o que entra todo mês" },
  { kind: "expense", hint: "Contas, assinaturas e parcelas: o que sai todo mês" },
  { kind: "investment", hint: "O que você separa todo mês para guardar" },
];

async function Budget({ searchParams }: { searchParams: PageProps<"/orcamento">["searchParams"] }) {
  const params = await searchParams;
  await connection();
  const today = todayISO();
  const currentMonth = monthOf(today);
  const month = isMonth(params.mes) ? params.mes : currentMonth;
  const [items, settings, categories, goals, monthRows, people] = await Promise.all([
    listRecurring(),
    getSettings(),
    listCategories(),
    listGoals(today),
    listTransactions({ from: `${month}-01`, to: lastDayOfMonth(month), limit: 100_000 }),
    loanPeople(),
  ]);
  const summary = monthSummary({ month, today, settings, recurring: items, transactions: monthRows });
  const categoryOptions = categories.map(({ id, name, kind }) => ({ id, name, kind }));
  const goalOptions = goals.filter((g) => g.status === "active").map(({ id, name }) => ({ id, name }));
  const installmentsLeft = items.filter((item) => item.kind === "expense" && item.installments && !item.lentTo).reduce((total, item) => total + (remainingAmount(item, month) ?? 0), 0);
  const orphanItems = items.filter((item) => !item.categoryId && item.kind !== "investment").length;
  const totals = { income: summary.fixedIncome, expense: summary.fixedExpenses, investment: summary.investments };

  return (
    <div className="flex flex-col gap-6">
      {orphanItems > 0 && <OrphanAlert transactions={0} recurring={orphanItems} />}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <MonthFilters month={month} currentMonth={currentMonth} includeOutside={false} showOutsideToggle={false} />
        <RecurringFormButton categories={categoryOptions} goals={goalOptions} people={people} className="w-full sm:w-auto">
          + Programar
        </RecurringFormButton>
      </div>

      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard highlight label="Sobra planejada" value={formatMoney(summary.plannedLeftover, { round: true })} tone={summary.plannedLeftover < 0 ? "bad" : undefined} detail="renda − fixas − pessoal − investir" />
        <StatCard label="Renda do mês" value={formatMoney(summary.income, { round: true })} detail={summary.extraIncome ? `inclui ${formatMoney(summary.extraIncome, { round: true })} extra` : "fixa"} />
        <StatCard label="Contas fixas" value={formatMoney(summary.fixedExpenses, { round: true })} detail={summary.income ? `${formatPercent(summary.fixedExpenses / summary.income)} da renda` : "—"} />
        <StatCard label="Parcelas a pagar" value={formatMoney(installmentsLeft, { round: true })} detail={`a partir de ${formatMonth(month, "short")}`} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          {SECTIONS.map(({ kind, hint }) => (
            <section key={kind}>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">
                    {RECURRING_KIND_LABELS[kind].icon} {RECURRING_KIND_LABELS[kind].plural}
                    <span className="ml-2 text-base font-semibold text-muted tabular-nums">{formatMoney(totals[kind])}</span>
                  </h2>
                  <p className="text-xs text-muted">{hint}</p>
                </div>
                <RecurringFormButton variant="secondary" kind={kind} categories={categoryOptions} goals={goalOptions} people={people} className="shrink-0">
                  + Adicionar
                </RecurringFormButton>
              </div>
              <RecurringList items={items} kind={kind} categories={categoryOptions} goals={goalOptions} people={people} month={month} />
            </section>
          ))}
        </div>

        <div className="flex flex-col gap-6 xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardTitle action={<SettingsButton settings={settings} />}>Divisão da renda</CardTitle>
            <p className="-mt-2 mb-4 text-sm text-muted">
              Orçamento pessoal: <strong className="text-ink">{formatMoney(settings.personalBudget)}</strong>/mês
            </p>
            <ul className="flex flex-col gap-4">
              {summary.split.map((slice) => (
                <li key={slice.key}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-semibold">
                      {slice.label} <span className="text-xs text-muted">ideal {slice.percent}%</span>
                    </span>
                    <span className="text-muted tabular-nums">
                      <strong className="text-ink">{formatPercent(slice.share)}</strong>
                    </span>
                  </div>
                  <ProgressBar value={slice.ideal ? (slice.actual / slice.ideal) * 100 : 0} color={slice.free < 0 ? "var(--color-danger)" : "var(--color-brand-500)"} label={slice.label} />
                  <p className="mt-1 text-xs text-muted tabular-nums">
                    {formatMoney(slice.actual, { round: true })} de {formatMoney(slice.ideal, { round: true })} ·{" "}
                    <span className={slice.free < 0 ? "font-semibold text-danger" : "font-semibold text-brand-700"}>
                      {slice.free < 0 ? `passou ${formatMoney(-slice.free, { round: true })}` : `livre ${formatMoney(slice.free, { round: true })}`}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="notebook">
            <CardTitle>Como funciona</CardTitle>
            <ul className="flex flex-col gap-2 text-sm text-muted">
              <li>📅 Cada item vale do mês de início até o fim (ou para sempre). Parcelados terminam sozinhos.</li>
              <li>✏️ Um mês diferente? Use o 📆 para trocar o valor ou pular só aquele mês.</li>
              <li>📊 Tudo entra automaticamente no painel do mês. Nada precisa ser lançado à mão.</li>
              <li>🐷 Investimentos ligados a uma meta contam como depósito a cada mês que passa.</li>
              <li>🤝 Parcela de outra pessoa no seu cartão? Marque como emprestada: fica só registrada em Empréstimos e não entra nas suas contas nem na sobra.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

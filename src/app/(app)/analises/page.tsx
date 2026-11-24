import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/app-shell";
import { MethodList, RankingList, SeriesChart, StatCard, WeekdayChart } from "@/components/dashboard/charts";
import { InsightsFilters } from "@/components/insights/insights-filters";
import { PageSuspense } from "@/components/page-suspense";
import { Card, CardTitle, EmptyState } from "@/components/ui";
import { INSIGHT_WINDOWS, todayISO } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/format";
import type { Insights } from "@/lib/insights";
import { getSettings } from "@/lib/services/settings";
import { insightsStats } from "@/lib/services/stats";

export const metadata: Metadata = { title: "Análises" };

export default function InsightsPage(props: PageProps<"/analises">) {
  return (
    <>
      <PageHeader title="Análises" subtitle="Tendências, hábitos e para onde o dinheiro escapa" />
      <PageSuspense>
        <InsightsView searchParams={props.searchParams} />
      </PageSuspense>
    </>
  );
}

async function InsightsView({ searchParams }: { searchParams: PageProps<"/analises">["searchParams"] }) {
  const params = await searchParams;
  await connection();
  const window = INSIGHT_WINDOWS.some((w) => w.value === params.janela) ? (params.janela as string) : "3";
  const includeOutside = params.fora === "1";
  const today = todayISO();
  const [data, settings] = await Promise.all([insightsStats({ windowMonths: Number(window), includeOutside, today }), getSettings()]);

  return (
    <div className="flex flex-col gap-6">
      <InsightsFilters window={window} includeOutside={includeOutside} />
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard highlight label="Gasto no período" value={formatMoney(data.total, { round: true })} detail={`${data.count} compra(s) em ${window} meses`} />
        <StatCard label="Média por mês" value={formatMoney(data.averageMonthly, { round: true })} detail="meses fechados" />
        <StatCard
          label="Vs. período anterior"
          value={data.change === null ? "—" : `${data.change > 0 ? "+" : ""}${formatPercent(data.change)}`}
          tone={data.change === null ? undefined : data.change > 0.05 ? "bad" : data.change < -0.05 ? "good" : undefined}
          detail={`antes: ${formatMoney(data.previousTotal, { round: true })}`}
        />
        <StatCard label="Ticket médio" value={formatMoney(data.averageTicket)} detail="por compra" />
      </div>

      {data.count === 0 ? (
        <EmptyState icon="📊" title="Sem gastos nessa janela" description="Assim que houver lançamentos, as tendências aparecem aqui." />
      ) : (
        <>
          {data.insights.length > 0 && (
            <Card className="notebook">
              <CardTitle>O que os números dizem</CardTitle>
              <ul className="stagger flex flex-col gap-2.5">
                {data.insights.map((insight) => (
                  <li key={insight.text} className="flex gap-3 text-sm">
                    <span className="text-lg leading-tight" aria-hidden>
                      {insight.icon}
                    </span>
                    <span>{insight.text}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardTitle>Gastos por mês</CardTitle>
            <SeriesChart series={data.months} reference={settings.personalBudget || undefined} referenceLabel="orçamento" short={(point) => point.label.slice(0, 3)} />
            {data.current.projected > data.current.amount && (
              <p className="mt-2 text-xs text-muted">
                Mês atual: {formatMoney(data.current.amount, { round: true })} até agora · projeção {formatMoney(data.current.projected, { round: true })}
              </p>
            )}
          </Card>

          <Card>
            <CardTitle>Categorias</CardTitle>
            <CategoryTrend data={data.categories} />
          </Card>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <CardTitle>Onde mais foi dinheiro</CardTitle>
              <RankingList data={data.descriptions} />
            </Card>
            <div className="flex min-w-0 flex-col gap-6">
              <Card>
                <CardTitle>Forma de pagamento</CardTitle>
                <MethodList data={data.methods} />
              </Card>
              <Card>
                <CardTitle>Por dia da semana</CardTitle>
                <WeekdayChart data={data.weekdays} />
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 0.01);
  const points = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${28 - (v / max) * 26}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-7 w-20 shrink-0" aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function CategoryTrend({ data }: { data: Insights["categories"] }) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {data.map((category) => (
        <li key={category.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: category.color }} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{category.name}</p>
            <p className="text-xs text-muted tabular-nums">
              {formatMoney(category.perMonth, { round: true })}/mês · {formatPercent(category.share)}
            </p>
          </div>
          <Sparkline values={category.spark} color={category.color} />
          <div className="w-24 text-right">
            <p className="font-bold tabular-nums">{formatMoney(category.amount, { round: true })}</p>
            <p className={`text-xs font-semibold tabular-nums ${category.change === null ? "text-muted" : category.change > 0.05 ? "text-danger" : category.change < -0.05 ? "text-brand-700" : "text-muted"}`}>
              {category.change === null ? "novo" : `${category.change > 0 ? "▲" : category.change < 0 ? "▼" : "="} ${formatPercent(Math.abs(category.change))}`}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

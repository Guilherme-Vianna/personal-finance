import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/app-shell";
import { StatCard } from "@/components/dashboard/charts";
import { GoalCard } from "@/components/goals/goal-card";
import { GoalFormButton } from "@/components/goals/goal-form";
import { PageSuspense } from "@/components/page-suspense";
import { EmptyState } from "@/components/ui";
import { todayISO } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/format";
import { listGoals } from "@/lib/services/goals";

export const metadata: Metadata = { title: "Metas" };

export default function GoalsPage() {
  return (
    <>
      <PageHeader title="Metas" subtitle="Dinheiro guardado com destino: reserva, viagem, compras grandes" action={<GoalFormButton>+ Nova meta</GoalFormButton>} />
      <PageSuspense>
        <Goals />
      </PageSuspense>
    </>
  );
}

async function Goals() {
  await connection();
  const today = todayISO();
  const goals = await listGoals(today);
  if (!goals.length) {
    return (
      <EmptyState
        icon="🎯"
        title="Nenhuma meta ainda"
        description="Crie uma meta com o valor que quer juntar. Depósitos manuais e investimentos programados no Orçamento enchem a barra."
        action={<GoalFormButton>+ Nova meta</GoalFormButton>}
      />
    );
  }
  const active = goals.filter((g) => g.status === "active");
  const saved = goals.reduce((t, g) => t + g.progress.saved, 0);
  const target = active.reduce((t, g) => t + g.targetAmount, 0);
  const activeSaved = active.reduce((t, g) => t + g.progress.saved, 0);
  const perMonth = active.reduce((t, g) => t + g.progress.monthlyAverage, 0);
  const thisMonth = goals.reduce((t, g) => t + g.progress.thisMonth, 0);
  return (
    <div className="flex flex-col gap-6">
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard highlight label="Guardado" value={formatMoney(saved, { round: true })} detail={`em ${goals.length} meta(s)`} />
        <StatCard label="Das metas ativas" value={target ? formatPercent(activeSaved / target) : "—"} detail={`${formatMoney(activeSaved, { round: true })} de ${formatMoney(target, { round: true })}`} />
        <StatCard label="Este mês" value={formatMoney(thisMonth, { round: true })} detail="guardado no mês" />
        <StatCard label="Ritmo" value={formatMoney(perMonth, { round: true })} detail="média por mês (3 meses)" />
      </div>
      <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} today={today} />
        ))}
      </div>
    </div>
  );
}

import { CountUp } from "@/components/count-up";
import { ProgressBar } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { PACE_LABELS } from "@/lib/goals";
import type { GoalWithProgress } from "@/lib/services/goals";
import { DepositButton } from "./deposit-button";
import { DepositList, GoalActions } from "./goal-actions";

export function PaceBadge({ pace }: { pace: GoalWithProgress["progress"]["pace"] }) {
  const { label, tone } = PACE_LABELS[pace];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${tone}`}>{label}</span>;
}

export function GoalCard({ goal, today, compact = false }: { goal: GoalWithProgress; today: string; compact?: boolean }) {
  const { progress } = goal;
  const short = (iso: string) => formatDate(iso, { month: "short", year: "2-digit" });
  return (
    <article className={`lift relative flex min-w-0 flex-col gap-4 overflow-hidden rounded-lg border border-border bg-surface p-4 pt-5 shadow-card sm:p-5 sm:pt-6 ${goal.status === "completed" ? "opacity-80" : ""}`}>
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: goal.color }} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-lg leading-snug font-bold">
            <span className="size-3 shrink-0 rounded-full ring-4 ring-current/10" style={{ background: goal.color, color: goal.color }} />
            <span className="line-clamp-2 min-w-0">{goal.name}</span>
          </p>
          {!compact && goal.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{goal.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <PaceBadge pace={progress.pace} />
          {!compact && <GoalActions goal={goal} />}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums text-brand-800">
            <CountUp value={progress.percent} suffix="%" />
          </span>
          <span className="text-sm text-muted tabular-nums">
            <strong className="text-ink">{formatMoney(progress.saved, { round: true })}</strong> de {formatMoney(goal.targetAmount, { round: true })}
          </span>
        </div>
        <ProgressBar value={progress.percent} color={goal.color} size="lg" label={`Progresso de ${goal.name}`} />
        <p className="mt-1.5 text-xs text-muted">
          {progress.remaining > 0 ? `Faltam ${formatMoney(progress.remaining, { round: true })}` : "Meta batida! 🎉"}
          {progress.estimatedFinish && ` · previsão ${short(progress.estimatedFinish)}`}
          {goal.deadline && ` · prazo ${short(goal.deadline)}`}
        </p>
        {progress.requiredMonthly !== null && (
          <p className="mt-1 text-xs font-semibold text-ink">Para bater o prazo: {formatMoney(progress.requiredMonthly, { round: true })}/mês</p>
        )}
      </div>

      {!compact && (
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-brand-50 px-2 py-2">
            <dt className="text-[10px] font-bold text-muted uppercase">Este mês</dt>
            <dd className="text-sm font-bold tabular-nums">{formatMoney(progress.thisMonth, { round: true })}</dd>
          </div>
          <div className="rounded-md bg-brand-50 px-2 py-2">
            <dt className="text-[10px] font-bold text-muted uppercase">Média/mês</dt>
            <dd className="text-sm font-bold tabular-nums">{formatMoney(progress.monthlyAverage, { round: true })}</dd>
          </div>
          <div className="rounded-md bg-brand-50 px-2 py-2">
            <dt className="text-[10px] font-bold text-muted uppercase">Último</dt>
            <dd className="text-sm font-bold">{progress.lastDepositDate ? (progress.lastDepositDate === today ? "Hoje" : formatDate(progress.lastDepositDate)) : "—"}</dd>
          </div>
        </dl>
      )}

      {!compact && goal.linkedRecurring.length > 0 && (
        <p className="rounded-md border border-dashed border-brand-200 bg-brand-50/50 px-3 py-2 text-xs text-brand-800">
          🔁 Entra sozinho todo mês: {goal.linkedRecurring.map((item) => `${item.name} (${formatMoney(item.amount, { round: true })})`).join(", ")}
        </p>
      )}

      {!compact && goal.deposits.length > 0 && (
        <details className="group/details">
          <summary className="cursor-pointer text-sm font-semibold text-brand-700 select-none">Movimentações ({goal.deposits.length})</summary>
          <div className="mt-2 max-h-64 overflow-y-auto">
            <DepositList deposits={goal.deposits} />
          </div>
        </details>
      )}

      {goal.status !== "completed" && <DepositButton goalId={goal.id} goalName={goal.name} className="mt-auto" />}
    </article>
  );
}

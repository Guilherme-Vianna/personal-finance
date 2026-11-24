"use client";

import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import type { DepositRow, GoalWithProgress } from "@/lib/services/goals";
import { ConfirmButton, dangerIconButtonClass, IconPencil, IconTrash } from "@/components/ui";
import { useToast } from "@/components/toast";
import { GoalFormButton } from "./goal-form";

export function GoalActions({ goal }: { goal: Pick<GoalWithProgress, "id" | "name" | "description" | "targetAmount" | "deadline" | "status" | "color"> }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="-mr-2 flex shrink-0">
      <GoalFormButton variant="ghost" initial={goal} className="size-10 p-0! sm:size-9">
        <IconPencil />
        <span className="sr-only">Editar {goal.name}</span>
      </GoalFormButton>
      <ConfirmButton
        title="Apagar meta?"
        message={`A meta "${goal.name}" e todos os depósitos dela serão apagados. Investimentos recorrentes ligados a ela continuam no orçamento, só sem meta.`}
        className={dangerIconButtonClass}
        onConfirm={async () => {
          await apiRequest(`/api/goals/${goal.id}`, { method: "DELETE" });
          toast("Meta apagada");
          router.refresh();
        }}
      >
        <IconTrash />
        <span className="sr-only">Apagar {goal.name}</span>
      </ConfirmButton>
    </div>
  );
}

export function DepositList({ deposits }: { deposits: DepositRow[] }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <ul className="flex flex-col divide-y divide-border text-sm">
      {deposits.map((deposit) => (
        <li key={deposit.id} className="flex items-center gap-2 py-1.5">
          <span className="w-14 shrink-0 text-xs text-muted tabular-nums">{formatDate(deposit.date, { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted">{deposit.recurringName ? `🔁 ${deposit.recurringName}` : (deposit.notes ?? "")}</span>
          <span className={`font-bold tabular-nums ${deposit.amount < 0 ? "text-danger" : "text-brand-700"}`}>
            {deposit.amount < 0 ? "-" : "+"}
            {formatMoney(Math.abs(deposit.amount))}
          </span>
          {deposit.recurringId ? (
            <span className="size-10 shrink-0 sm:size-9" />
          ) : (
            <ConfirmButton
              title="Apagar depósito?"
              message={`O movimento de ${formatMoney(deposit.amount)} será removido.`}
              className={dangerIconButtonClass}
              onConfirm={async () => {
                await apiRequest(`/api/deposits/${deposit.id}`, { method: "DELETE" });
                toast("Movimento apagado");
                router.refresh();
              }}
            >
              <IconTrash />
              <span className="sr-only">Apagar depósito</span>
            </ConfirmButton>
          )}
        </li>
      ))}
    </ul>
  );
}

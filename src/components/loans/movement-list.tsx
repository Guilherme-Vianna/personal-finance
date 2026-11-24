"use client";

import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import type { LoanMovement } from "@/lib/services/loans";
import { ConfirmButton, dangerIconButtonClass, IconTrash } from "@/components/ui";
import { useToast } from "@/components/toast";

export function MovementList({ movements }: { movements: LoanMovement[] }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <ul className="flex flex-col divide-y divide-border text-sm">
      {movements.map((m) => (
        <li key={m.id} className={`flex items-center gap-2 py-1.5 ${m.future ? "opacity-50" : ""}`}>
          <span className="w-14 shrink-0 text-xs text-muted tabular-nums">{formatDate(m.date, { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>
          <span className="min-w-0 flex-1 truncate">
            {m.label}
            {m.detail && <span className="text-xs text-muted"> · {m.detail}</span>}
            {m.future && <span className="text-xs text-muted"> · vai cair</span>}
          </span>
          <span className={`font-bold tabular-nums ${m.kind === "repaid" ? "text-brand-700" : ""}`}>
            {m.kind === "repaid" ? "+" : "−"}
            {formatMoney(m.amount)}
          </span>
          {m.kind === "repaid" ? (
            <ConfirmButton
              title="Apagar pagamento?"
              message={`O pagamento de ${formatMoney(m.amount)} será removido.`}
              className={dangerIconButtonClass}
              onConfirm={async () => {
                await apiRequest(`/api/loans/repayments/${m.id}`, { method: "DELETE" });
                toast("Pagamento apagado");
                router.refresh();
              }}
            >
              <IconTrash />
              <span className="sr-only">Apagar pagamento</span>
            </ConfirmButton>
          ) : (
            <span className="size-10 shrink-0 sm:size-9" />
          )}
        </li>
      ))}
    </ul>
  );
}

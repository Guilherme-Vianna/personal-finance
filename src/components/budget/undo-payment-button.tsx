"use client";

import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import { formatMonth } from "@/lib/dates";
import { ConfirmButton } from "@/components/ui";
import { useToast } from "@/components/toast";

export function UndoPaymentButton({ recurringId, name, month }: { recurringId: string; name: string; month: string }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <ConfirmButton
      title="Desfazer relação?"
      message={`"${name}" volta a ficar pendente em ${formatMonth(month)}. Se o valor foi ajustado pela importação, o ajuste continua (remova em 📆 se quiser).`}
      confirmLabel="Desfazer"
      className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-danger-soft hover:text-danger"
      onConfirm={async () => {
        await apiRequest(`/api/recurring/${recurringId}/payments?month=${month}`, { method: "DELETE" });
        toast(`${name}: relação desfeita`);
        router.refresh();
      }}
    >
      Desfazer
    </ConfirmButton>
  );
}

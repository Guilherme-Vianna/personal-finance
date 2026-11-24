"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { apiRequest } from "@/lib/api-client";
import { todayISO } from "@/lib/dates";
import { Button, IconPlus, Modal } from "@/components/ui";
import { useToast } from "@/components/toast";
import { TransactionForm, type CategoryOption, type SuggestionOption, type TransactionDraft } from "./transaction-form";

type Options = { categories: CategoryOption[]; suggestions: SuggestionOption[]; people: string[] };

export function useTransactionModal() {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<{ initial?: Partial<TransactionDraft>; options: Options | null } | null>(null);

  async function open(initial?: Partial<TransactionDraft>) {
    setState({ initial, options: null });
    const [categories, suggestions, people] = await Promise.all([
      apiRequest<CategoryOption[]>("/api/categories"),
      apiRequest<SuggestionOption[]>("/api/descriptions"),
      apiRequest<string[]>("/api/loans/people"),
    ]);
    setState({ initial, options: { categories, suggestions, people } });
  }

  function close() {
    setState(null);
    router.refresh();
  }

  const modal = (
    <Modal open={state !== null} onClose={close} title={state?.initial?.id ? "Editar lançamento" : "Registrar gasto"} wide>
      {state?.options ? (
        state.options.categories.length === 0 ? (
          <p className="text-sm text-muted">Crie uma categoria primeiro na página Categorias.</p>
        ) : (
          <TransactionForm
            {...state.options}
            today={todayISO()}
            initial={state.initial}
            onDone={(message) => {
              toast(message);
              close();
            }}
          />
        )
      ) : (
        <div className="flex flex-col gap-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-xl bg-brand-50" />
          ))}
        </div>
      )}
    </Modal>
  );

  return { open, modal };
}

export function QuickAddButton({ children, preset, className, variant = "primary" }: { children?: ReactNode; preset?: Partial<TransactionDraft>; className?: string; variant?: "primary" | "secondary" }) {
  const { open, modal } = useTransactionModal();
  return (
    <>
      <Button variant={variant} className={className} onClick={() => open(preset)}>
        {children ?? (
          <>
            <IconPlus /> Registrar gasto
          </>
        )}
      </Button>
      {modal}
    </>
  );
}

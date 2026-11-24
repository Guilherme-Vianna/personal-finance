"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { formatMonth } from "@/lib/dates";
import { formatMoney, moneyToInput, parseMoney } from "@/lib/format";
import { Button, Field, FormActions, inputClass, Modal } from "@/components/ui";
import { chipClass } from "@/components/transactions/transaction-form";
import { useToast } from "@/components/toast";

export type OverrideTarget = {
  id: string;
  name: string;
  amount: number;
  overrides: { month: string; amount: number | null; notes: string | null }[];
};

export function OverrideButton({ item, month, children, className, title }: { item: OverrideTarget; month: string; children: ReactNode; className?: string; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} title={title ?? "Ajustar um mês específico"}>
        {children}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Ajustar mês · ${item.name}`}>
        {open && <OverrideForm item={item} initialMonth={month} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

function OverrideForm({ item, initialMonth, onDone }: { item: OverrideTarget; initialMonth: string; onDone: () => void }) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const [month, setMonth] = useState(initialMonth);
  const existing = item.overrides.find((o) => o.month === month);
  const [skip, setSkip] = useState(existing ? existing.amount === null : false);
  const [amount, setAmount] = useState(moneyToInput(existing?.amount ?? item.amount));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function changeMonth(value: string) {
    setMonth(value);
    const found = item.overrides.find((o) => o.month === value);
    setSkip(found ? found.amount === null : false);
    setAmount(moneyToInput(found?.amount ?? item.amount));
    setNotes(found?.notes ?? "");
  }

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      toast(message);
      onDone();
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) setErrors({ ...error.fieldErrors, _: error.message });
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseMoney(amount);
    if (!/^\d{4}-\d{2}$/.test(month)) return setErrors({ month: "Escolha o mês" });
    if (!skip && !(parsed > 0)) return setErrors({ amount: "Informe um valor maior que zero" });
    run(
      () => apiRequest(`/api/recurring/${item.id}/overrides`, { method: "PUT", body: { month, skip, amount: skip ? null : parsed, notes } }),
      skip ? `${item.name}: ${formatMonth(month)} pulado` : `${item.name}: ${formatMoney(parsed)} em ${formatMonth(month)}`,
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-muted">
        Muda só um mês, sem mexer no resto. O valor normal é <strong className="text-ink">{formatMoney(item.amount)}</strong>.
      </p>
      <Field label="Mês" htmlFor={`${id}-month`} error={errors.month}>
        <input id={`${id}-month`} type="month" className={inputClass} value={month} onChange={(e) => changeMonth(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="O que muda">
        <button type="button" role="radio" aria-checked={!skip} onClick={() => setSkip(false)} className={`${chipClass(!skip)} min-h-11 text-sm`}>
          ✏️ Outro valor
        </button>
        <button type="button" role="radio" aria-checked={skip} onClick={() => setSkip(true)} className={`${chipClass(skip)} min-h-11 text-sm`}>
          ⏭️ Pular este mês
        </button>
      </div>
      {!skip && (
        <Field label="Valor neste mês (R$)" htmlFor={`${id}-amount`} error={errors.amount}>
          <input id={`${id}-amount`} className={`${inputClass} tabular-nums`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      )}
      <Field label="Motivo (opcional)" htmlFor={`${id}-notes`}>
        <input id={`${id}-notes`} className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: 13º salário, desconto, férias" />
      </Field>
      {errors._ && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{errors._}</p>}
      <FormActions>
        {existing ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => run(() => apiRequest(`/api/recurring/${item.id}/overrides?month=${month}`, { method: "DELETE" }), `Ajuste de ${formatMonth(month)} removido`)}
          >
            Voltar ao normal
          </Button>
        ) : (
          <Button variant="secondary" onClick={onDone}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Salvando…" : "Salvar ajuste"}
        </Button>
      </FormActions>
    </form>
  );
}

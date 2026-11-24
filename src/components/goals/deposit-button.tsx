"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { todayISO } from "@/lib/dates";
import { formatMoney, parseMoney } from "@/lib/format";
import { Button, Field, FormActions, hasFinePointer, inputClass, Modal } from "@/components/ui";
import { chipClass } from "@/components/transactions/transaction-form";
import { useToast } from "@/components/toast";

export function DepositButton({ goalId, goalName, className = "" }: { goalId: string; goalName: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" className={className} onClick={() => setOpen(true)}>
        + Guardar dinheiro
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Movimentar · ${goalName}`}>
        {open && <DepositForm goalId={goalId} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

function DepositForm({ goalId, onDone }: { goalId: string; onDone: () => void }) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const [withdraw, setWithdraw] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseMoney(amount);
    if (!(parsed > 0)) return setErrors({ amount: "Informe um valor maior que zero" });
    setBusy(true);
    try {
      await apiRequest(`/api/goals/${goalId}/deposits`, { method: "POST", body: { amount: withdraw ? -parsed : parsed, date, notes } });
      toast(withdraw ? `Retirada de ${formatMoney(parsed)} registrada` : `${formatMoney(parsed)} guardados 🐷`);
      onDone();
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) setErrors({ ...error.fieldErrors, _: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo">
        {[false, true].map((option) => (
          <button key={String(option)} type="button" role="radio" aria-checked={withdraw === option} onClick={() => setWithdraw(option)} className={`${chipClass(withdraw === option)} min-h-11 text-sm`}>
            {option ? "↩️ Retirar" : "🐷 Guardar"}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor (R$)" htmlFor={`${id}-amount`} error={errors.amount}>
          <input id={`${id}-amount`} className={`${inputClass} tabular-nums`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" autoFocus={hasFinePointer()} />
        </Field>
        <Field label="Data" htmlFor={`${id}-date`} error={errors.date}>
          <input id={`${id}-date`} type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Observação (opcional)" htmlFor={`${id}-notes`}>
        <input id={`${id}-notes`} className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {errors._ && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{errors._}</p>}
      <FormActions>
        <Button variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </Button>
      </FormActions>
    </form>
  );
}

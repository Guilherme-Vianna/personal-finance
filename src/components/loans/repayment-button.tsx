"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { todayISO } from "@/lib/dates";
import { formatMoney, moneyToInput, parseMoney } from "@/lib/format";
import { Button, Field, FormActions, hasFinePointer, inputClass, Modal } from "@/components/ui";
import { chipClass } from "@/components/transactions/transaction-form";
import { useToast } from "@/components/toast";

export function RepaymentButton({ person, balance, people = [], variant = "secondary", className = "", label = "+ Recebi um pagamento" }: { person?: string; balance?: number; people?: string[]; variant?: "primary" | "secondary"; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} className={className} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={person ? `Pagamento de ${person}` : "Pagamento recebido"}>
        {open && <RepaymentForm person={person} balance={balance} people={people} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

function RepaymentForm({ person: initialPerson, balance, people, onDone }: { person?: string; balance?: number; people: string[]; onDone: () => void }) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const [person, setPerson] = useState(initialPerson ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseMoney(amount);
    const local: Record<string, string> = {};
    if (!person.trim()) local.person = "Informe quem pagou";
    if (!(parsed > 0)) local.amount = "Informe um valor maior que zero";
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await apiRequest("/api/loans/repayments", { method: "POST", body: { person, amount: parsed, date, notes } });
      toast(`${person} pagou ${formatMoney(parsed)} 🤝`);
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
      {!initialPerson && (
        <Field label="Quem pagou?" htmlFor={`${id}-person`} error={errors.person}>
          <input id={`${id}-person`} list={`${id}-people`} className={inputClass} value={person} onChange={(e) => setPerson(e.target.value)} autoFocus={hasFinePointer()} autoComplete="off" />
          <datalist id={`${id}-people`}>
            {people.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor (R$)" htmlFor={`${id}-amount`} error={errors.amount}>
          <input id={`${id}-amount`} className={`${inputClass} tabular-nums`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" autoFocus={Boolean(initialPerson) && hasFinePointer()} />
          {balance !== undefined && balance > 0 && (
            <button type="button" className={chipClass(parseMoney(amount) === Math.round(balance * 100) / 100)} onClick={() => setAmount(moneyToInput(Math.round(balance * 100) / 100))}>
              Tudo: {formatMoney(balance)}
            </button>
          )}
        </Field>
        <Field label="Data" htmlFor={`${id}-date`}>
          <input id={`${id}-date`} type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Observação (opcional)" htmlFor={`${id}-notes`}>
        <input id={`${id}-notes`} className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: Pix, parcela de março" />
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

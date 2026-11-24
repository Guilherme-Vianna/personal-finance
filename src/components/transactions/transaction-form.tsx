"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import type { CategoryKind, PaymentMethod } from "@/db/schema";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { addDays } from "@/lib/dates";
import { formatMoney, moneyToInput, parseMoney, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { Toggle } from "@/components/filters";
import { Button, Field, FormActions, hasFinePointer, inputClass } from "@/components/ui";

export type CategoryOption = { id: string; name: string; color: string; kind: CategoryKind; outsideBudget: boolean };
export type SuggestionOption = { description: string; categoryId: string; method: PaymentMethod | null; lastAmount: number };

export type TransactionDraft = {
  id?: string;
  date: string;
  description: string;
  amount: number | null;
  categoryId: string | null;
  method: PaymentMethod | null;
  lentTo: string | null;
  notes: string | null;
};

const AMOUNT_CHIPS = [5, 10, 20, 50, 100];
const METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];
const LAST_METHOD_KEY = "grana:last-method";

function lastMethod(): PaymentMethod {
  try {
    const stored = localStorage.getItem(LAST_METHOD_KEY);
    return METHODS.includes(stored as PaymentMethod) ? (stored as PaymentMethod) : "debit";
  } catch {
    return "debit";
  }
}

export function chipClass(selected: boolean) {
  return `min-h-10 rounded-lg py-1 text-xs font-semibold transition sm:min-h-0 ${selected ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-800 hover:bg-brand-100"}`;
}

export function TransactionForm({
  categories,
  suggestions,
  people = [],
  today,
  initial,
  onDone,
}: {
  categories: CategoryOption[];
  suggestions: SuggestionOption[];
  people?: string[];
  today: string;
  initial?: Partial<TransactionDraft>;
  onDone: (message: string) => void;
}) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const editing = Boolean(initial?.id);
  const initialKind = categories.find((c) => c.id === initial?.categoryId)?.kind ?? "expense";
  const [kind, setKind] = useState<CategoryKind>(initialKind);
  const [date, setDate] = useState(initial?.date ?? today);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [amount, setAmount] = useState(moneyToInput(initial?.amount));
  const [method, setMethod] = useState<PaymentMethod | null>(initial?.id ? (initial.method ?? null) : (initial?.method ?? lastMethod()));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lent, setLent] = useState(Boolean(initial?.lentTo));
  const [lentTo, setLentTo] = useState(initial?.lentTo ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const visibleCategories = categories.filter((c) => c.kind === kind);
  const kindSuggestions = suggestions.filter((s) => categories.find((c) => c.id === s.categoryId)?.kind === kind);

  function pickDescription(value: string) {
    setDescription(value);
    const match = kindSuggestions.find((s) => s.description.toLowerCase() === value.trim().toLowerCase());
    if (match) {
      setCategoryId(match.categoryId);
      if (match.method) setMethod(match.method);
      if (!amount) setAmount(moneyToInput(match.lastAmount));
    }
  }

  function switchKind(next: CategoryKind) {
    setKind(next);
    if (categories.find((c) => c.id === categoryId)?.kind !== next) setCategoryId("");
  }

  async function submit(event: FormEvent<HTMLFormElement>, keepOpen = false) {
    event.preventDefault();
    const parsed = parseMoney(amount);
    const local: Record<string, string> = {};
    if (!description.trim()) local.description = "Informe a descrição";
    if (!categoryId) local.categoryId = "Escolha uma categoria";
    if (!(parsed > 0)) local.amount = "Informe um valor maior que zero";
    if (kind === "expense" && lent && !lentTo.trim()) local.lentTo = "Para quem você emprestou?";
    setErrors(local);
    if (Object.keys(local).length) return;

    setBusy(true);
    try {
      const body = { date, description, categoryId, amount: parsed, method: kind === "expense" ? method : null, lentTo: kind === "expense" && lent ? lentTo.trim() : null, notes: notes || null };
      await apiRequest(editing ? `/api/transactions/${initial!.id}` : "/api/transactions", { method: editing ? "PUT" : "POST", body });
      try {
        if (method) localStorage.setItem(LAST_METHOD_KEY, method);
      } catch {}
      const message = `${editing ? "Atualizado" : kind === "expense" ? "Gasto registrado" : "Entrada registrada"}: ${description} · ${formatMoney(parsed)}`;
      if (keepOpen) {
        setDescription("");
        setAmount("");
        setNotes("");
        setSaved(message);
        formRef.current?.closest("dialog")?.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        onDone(message);
      }
    } catch (error) {
      if (error instanceof ApiClientError) setErrors({ ...error.fieldErrors, _: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={(event) => submit(event)} className="flex flex-col gap-4" noValidate>
      {saved && <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800">✓ {saved}</p>}

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo">
        {(["expense", "income"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={kind === option}
            onClick={() => switchKind(option)}
            className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition sm:min-h-0 ${
              kind === option ? "border-transparent bg-brand-600 text-white shadow-sm" : "border-border bg-surface text-ink hover:border-brand-300"
            }`}
          >
            {option === "expense" ? "💸 Gasto" : "💰 Entrada extra"}
          </button>
        ))}
      </div>

      <Field label={kind === "expense" ? "Com o que você gastou?" : "De onde veio?"} htmlFor={`${id}-description`} error={errors.description}>
        <input
          id={`${id}-description`}
          list={`${id}-suggestions`}
          className={inputClass}
          value={description}
          onChange={(event) => pickDescription(event.target.value)}
          placeholder={kind === "expense" ? "Ex.: Marmita, Coca Cola, Uber…" : "Ex.: Freela, Venda, Presente…"}
          aria-invalid={Boolean(errors.description)}
          autoComplete="off"
          autoFocus={!editing && hasFinePointer()}
        />
        <datalist id={`${id}-suggestions`}>
          {kindSuggestions.map((s) => (
            <option key={s.description} value={s.description} />
          ))}
        </datalist>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor (R$)" htmlFor={`${id}-amount`} error={errors.amount}>
          <input
            id={`${id}-amount`}
            className={`${inputClass} font-semibold tabular-nums`}
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0,00"
            aria-invalid={Boolean(errors.amount)}
          />
          <div className="grid grid-cols-5 gap-1.5">
            {AMOUNT_CHIPS.map((chip) => (
              <button key={chip} type="button" onClick={() => setAmount(moneyToInput(chip))} className={chipClass(parseMoney(amount) === chip)}>
                {chip}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Data" htmlFor={`${id}-date`} error={errors.date}>
          <input id={`${id}-date`} type="date" className={inputClass} value={date} max={addDays(today, 366)} onChange={(event) => setDate(event.target.value)} />
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { label: "Hoje", value: today },
              { label: "Ontem", value: addDays(today, -1) },
            ].map((chip) => (
              <button key={chip.label} type="button" onClick={() => setDate(chip.value)} className={chipClass(date === chip.value)}>
                {chip.label}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <Field label="Categoria" error={errors.categoryId}>
        {visibleCategories.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma categoria de {kind === "expense" ? "gasto" : "entrada"}. Crie uma na página Categorias.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visibleCategories.map((category) => {
              const selected = category.id === categoryId;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setCategoryId(category.id)}
                  aria-pressed={selected}
                  className={`flex min-h-10 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition sm:min-h-0 ${
                    selected ? "border-transparent text-white shadow-sm" : "border-border bg-surface text-ink hover:border-brand-300"
                  }`}
                  style={selected ? { background: category.color } : undefined}
                >
                  <span className="size-2.5 rounded-full" style={{ background: selected ? "white" : category.color }} />
                  {category.name}
                </button>
              );
            })}
          </div>
        )}
      </Field>

      {kind === "expense" && (
        <Field label="Forma de pagamento">
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5" role="radiogroup" aria-label="Forma de pagamento">
            {METHODS.map((option) => (
              <button key={option} type="button" role="radio" aria-checked={method === option} onClick={() => setMethod(method === option ? null : option)} className={`${chipClass(method === option)} px-1 sm:py-1.5`}>
                {PAYMENT_METHOD_LABELS[option].icon} {PAYMENT_METHOD_LABELS[option].label}
              </button>
            ))}
          </div>
        </Field>
      )}

      {kind === "expense" && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3">
          <Toggle checked={lent} onChange={setLent} label="🤝 Emprestado (foi pra outra pessoa)" />
          {lent ? (
            <Field label="Para quem?" htmlFor={`${id}-lent`} error={errors.lentTo}>
              <input id={`${id}-lent`} list={`${id}-people`} className={inputClass} value={lentTo} onChange={(event) => setLentTo(event.target.value)} placeholder="Ex.: Vó, Mãe, Irmão" autoComplete="off" />
              <datalist id={`${id}-people`}>
                {people.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </Field>
          ) : (
            <p className="text-xs text-muted">Fica só registrado em Empréstimos: não conta no orçamento nem na sobra, porque o dinheiro volta.</p>
          )}
        </div>
      )}

      <Field label="Observações (opcional)" htmlFor={`${id}-notes`}>
        <textarea id={`${id}-notes`} rows={2} className={inputClass} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>

      {errors._ && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{errors._}</p>}

      <FormActions>
        {!editing && (
          <Button variant="secondary" disabled={busy} onClick={(event) => submit(event as unknown as FormEvent<HTMLFormElement>, true)}>
            Salvar e registrar outro
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Salvando…" : editing ? "Salvar alterações" : kind === "expense" ? "Registrar gasto" : "Registrar entrada"}
        </Button>
      </FormActions>
    </form>
  );
}

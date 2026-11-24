"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import type { RecurringKind } from "@/db/schema";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { addMonths, formatMonth, monthOf, todayISO } from "@/lib/dates";
import { formatMoney, moneyToInput, parseMoney, RECURRING_KIND_LABELS } from "@/lib/format";
import { Button, Field, FormActions, hasFinePointer, inputClass, Modal } from "@/components/ui";
import { Toggle } from "@/components/filters";
import { chipClass } from "@/components/transactions/transaction-form";
import { useToast } from "@/components/toast";

export type RecurringDraft = {
  id?: string;
  name: string;
  kind: RecurringKind;
  categoryId: string | null;
  goalId: string | null;
  amount: number;
  dayOfMonth: number;
  startMonth: string;
  endMonth: string | null;
  installments: number | null;
  lentTo: string | null;
  notes: string | null;
  active: boolean;
};

export type CategoryOption = { id: string; name: string; kind: "expense" | "income" };
export type GoalOption = { id: string; name: string };

type EndMode = "forever" | "until" | "installments";

export function RecurringFormButton({
  categories,
  goals,
  people = [],
  initial,
  kind = "expense",
  children,
  variant = "primary",
  className,
}: {
  categories: CategoryOption[];
  goals: GoalOption[];
  people?: string[];
  initial?: RecurringDraft;
  kind?: RecurringKind;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={variant === "ghost" ? "sm" : "md"} className={className} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={initial ? `Editar ${RECURRING_KIND_LABELS[initial.kind].label.toLowerCase()}` : "Programar no orçamento"} wide>
        {open && <RecurringForm categories={categories} goals={goals} people={people} initial={initial} defaultKind={kind} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

function RecurringForm({
  categories,
  goals,
  people,
  initial,
  defaultKind,
  onDone,
}: {
  categories: CategoryOption[];
  goals: GoalOption[];
  people: string[];
  initial?: RecurringDraft;
  defaultKind: RecurringKind;
  onDone: () => void;
}) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const currentMonth = monthOf(todayISO());
  const [kind, setKind] = useState<RecurringKind>(initial?.kind ?? defaultKind);
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [goalId, setGoalId] = useState(initial?.goalId ?? "");
  const [amount, setAmount] = useState(moneyToInput(initial?.amount));
  const [day, setDay] = useState(String(initial?.dayOfMonth ?? 1));
  const [startMonth, setStartMonth] = useState(initial?.startMonth ?? currentMonth);
  const [endMode, setEndMode] = useState<EndMode>(initial?.installments ? "installments" : initial?.endMonth ? "until" : "forever");
  const [endMonth, setEndMonth] = useState(initial?.endMonth ?? "");
  const [installments, setInstallments] = useState(initial?.installments ? String(initial.installments) : "");
  const [paid, setPaid] = useState("");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lent, setLent] = useState(Boolean(initial?.lentTo));
  const [lentTo, setLentTo] = useState(initial?.lentTo ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const categoryKind = kind === "income" ? "income" : "expense";
  const options = categories.filter((c) => c.kind === categoryKind);
  const total = Number(installments);
  const parsedAmount = parseMoney(amount);

  function applyPaid(value: string) {
    setPaid(value);
    const count = Number(value);
    if (Number.isInteger(count) && count >= 0) setStartMonth(addMonths(currentMonth, -count));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const local: Record<string, string> = {};
    if (!name.trim()) local.name = "Informe o nome";
    if (!(parsedAmount > 0)) local.amount = "Informe um valor maior que zero";
    if (kind !== "investment" && !categoryId) local.categoryId = "Escolha uma categoria";
    if (!/^\d{4}-\d{2}$/.test(startMonth)) local.startMonth = "Informe o mês de início";
    if (endMode === "until" && (!/^\d{4}-\d{2}$/.test(endMonth) || endMonth < startMonth)) local.endMonth = "Precisa ser igual ou depois do início";
    if (endMode === "installments" && !(Number.isInteger(total) && total >= 2)) local.installments = "Ao menos 2 parcelas";
    if (kind === "expense" && lent && !lentTo.trim()) local.lentTo = "Para quem você emprestou?";
    setErrors(local);
    if (Object.keys(local).length) return;

    setBusy(true);
    try {
      const body = {
        name,
        kind,
        categoryId: categoryId || null,
        goalId: kind === "investment" ? goalId || null : null,
        amount: parsedAmount,
        dayOfMonth: Number(day) || 1,
        startMonth,
        endMonth: endMode === "until" ? endMonth : null,
        installments: endMode === "installments" ? total : null,
        lentTo: kind === "expense" && lent ? lentTo.trim() : null,
        notes,
        active,
      };
      await apiRequest(initial?.id ? `/api/recurring/${initial.id}` : "/api/recurring", { method: initial?.id ? "PUT" : "POST", body });
      toast(initial ? "Atualizado" : `${RECURRING_KIND_LABELS[kind].label} programada: ${name}`);
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
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo">
        {(Object.keys(RECURRING_KIND_LABELS) as RecurringKind[]).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={kind === option}
            onClick={() => {
              setKind(option);
              if (categories.find((c) => c.id === categoryId)?.kind !== (option === "income" ? "income" : "expense")) setCategoryId("");
            }}
            className={`min-h-11 rounded-xl border px-2 py-2 text-sm font-semibold transition sm:min-h-0 ${kind === option ? "border-transparent bg-brand-600 text-white shadow-sm" : "border-border bg-surface text-ink hover:border-brand-300"}`}
          >
            {RECURRING_KIND_LABELS[option].icon} {RECURRING_KIND_LABELS[option].label}
          </button>
        ))}
      </div>

      <Field label="Nome" htmlFor={`${id}-name`} error={errors.name}>
        <input
          id={`${id}-name`}
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === "income" ? "Ex.: Salário, Vale-refeição" : kind === "expense" ? "Ex.: Internet, Faculdade, Celular novo" : "Ex.: Reserva de emergência"}
          autoFocus={hasFinePointer()}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Valor por mês (R$)" htmlFor={`${id}-amount`} error={errors.amount}>
          <input id={`${id}-amount`} className={`${inputClass} tabular-nums`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
        </Field>
        <Field label={kind === "income" ? "Cai no dia" : "Vence no dia"} htmlFor={`${id}-day`} error={errors.dayOfMonth}>
          <input id={`${id}-day`} className={inputClass} inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="1" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={kind === "investment" ? "Categoria (opcional)" : "Categoria"} htmlFor={`${id}-category`} error={errors.categoryId}>
          <select id={`${id}-category`} className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{kind === "investment" ? "Nenhuma" : "Escolha…"}</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        {kind === "investment" && (
          <Field label="Conta para a meta (opcional)" htmlFor={`${id}-goal`} hint="Cada mês que passar entra como depósito na meta.">
            <select id={`${id}-goal`} className={inputClass} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">Nenhuma</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <Field label="Até quando?">
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Até quando">
          {(
            [
              ["forever", "♾️ Sem fim"],
              ["until", "📅 Até um mês"],
              ["installments", "🔢 Parcelado"],
            ] as [EndMode, string][]
          ).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={endMode === value} onClick={() => setEndMode(value)} className={`${chipClass(endMode === value)} px-1 sm:py-2`}>
              {label}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={endMode === "installments" ? "Mês da 1ª parcela" : "Começa em"} htmlFor={`${id}-start`} error={errors.startMonth}>
          <input id={`${id}-start`} type="month" className={inputClass} value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
        </Field>
        {endMode === "until" && (
          <Field label="Termina em (inclusive)" htmlFor={`${id}-end`} error={errors.endMonth}>
            <input id={`${id}-end`} type="month" className={inputClass} value={endMonth} min={startMonth} onChange={(e) => setEndMonth(e.target.value)} />
          </Field>
        )}
        {endMode === "installments" && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Parcelas" htmlFor={`${id}-installments`} error={errors.installments}>
              <input id={`${id}-installments`} className={inputClass} inputMode="numeric" value={installments} onChange={(e) => setInstallments(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="12" />
            </Field>
            <Field label="Já pagas" htmlFor={`${id}-paid`}>
              <input id={`${id}-paid`} className={inputClass} inputMode="numeric" value={paid} onChange={(e) => applyPaid(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="0" />
            </Field>
          </div>
        )}
      </div>
      {endMode === "installments" && total >= 2 && /^\d{4}-\d{2}$/.test(startMonth) && (
        <p className="-mt-2 text-xs text-muted">
          {total}x de {parsedAmount > 0 ? formatMoney(parsedAmount) : "…"}
          {parsedAmount > 0 && ` = ${formatMoney(parsedAmount * total)}`} · última parcela em {formatMonth(addMonths(startMonth, total - 1))}
        </p>
      )}

      {kind === "expense" && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3">
          <Toggle checked={lent} onChange={setLent} label="🤝 Emprestado (parcela de outra pessoa no seu cartão)" />
          {lent ? (
            <Field label="Para quem?" htmlFor={`${id}-lent`} error={errors.lentTo}>
              <input id={`${id}-lent`} list={`${id}-people`} className={inputClass} value={lentTo} onChange={(e) => setLentTo(e.target.value)} placeholder="Ex.: Vó, Mãe, Irmão" autoComplete="off" />
              <datalist id={`${id}-people`}>
                {people.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </Field>
          ) : (
            <p className="text-xs text-muted">Fica só registrado em Empréstimos: não entra nas suas contas fixas nem na sobra, porque a pessoa te paga.</p>
          )}
        </div>
      )}

      <Field label="Observações (opcional)" htmlFor={`${id}-notes`}>
        <input id={`${id}-notes`} className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Toggle checked={active} onChange={setActive} label="Ativo (conta no orçamento)" />
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

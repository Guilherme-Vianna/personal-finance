"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { CATEGORY_COLORS, moneyToInput, parseMoney } from "@/lib/format";
import { Button, ColorPicker, Field, FormActions, hasFinePointer, inputClass, Modal } from "@/components/ui";
import { Toggle } from "@/components/filters";
import { useToast } from "@/components/toast";

export type GoalDraft = {
  id?: string;
  name: string;
  description: string | null;
  targetAmount: number;
  deadline: string | null;
  status: "active" | "completed";
  color: string;
};

export function GoalFormButton({ initial, children, variant = "primary", className }: { initial?: GoalDraft; children: ReactNode; variant?: "primary" | "secondary" | "ghost"; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={variant === "ghost" ? "sm" : "md"} className={className} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={initial ? "Editar meta" : "Nova meta"}>
        {open && <GoalForm initial={initial} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

function GoalForm({ initial, onDone }: { initial?: GoalDraft; onDone: () => void }) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [target, setTarget] = useState(moneyToInput(initial?.targetAmount));
  const [deadline, setDeadline] = useState(initial?.deadline ?? "");
  const [color, setColor] = useState(initial?.color ?? CATEGORY_COLORS[0]);
  const [completed, setCompleted] = useState(initial?.status === "completed");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const targetAmount = parseMoney(target);
    const local: Record<string, string> = {};
    if (!name.trim()) local.name = "Informe o nome";
    if (!(targetAmount > 0)) local.targetAmount = "Informe um valor maior que zero";
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      const body = { name, description, targetAmount, deadline: deadline || null, color, status: completed ? "completed" : "active" };
      await apiRequest(initial?.id ? `/api/goals/${initial.id}` : "/api/goals", { method: initial?.id ? "PUT" : "POST", body });
      toast(initial ? "Meta atualizada" : `Meta "${name}" criada`);
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
      <Field label="Nome" htmlFor={`${id}-name`} error={errors.name}>
        <input id={`${id}-name`} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Reserva de emergência, Viagem, Notebook" autoFocus={hasFinePointer()} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quanto quer juntar (R$)" htmlFor={`${id}-target`} error={errors.targetAmount}>
          <input id={`${id}-target`} className={`${inputClass} tabular-nums`} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="10.000" />
        </Field>
        <Field label="Prazo (opcional)" htmlFor={`${id}-deadline`} error={errors.deadline}>
          <input id={`${id}-deadline`} type="date" className={inputClass} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
      </div>
      <Field label="Descrição (opcional)" htmlFor={`${id}-description`}>
        <textarea id={`${id}-description`} rows={2} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Cor">
        <ColorPicker value={color} onChange={setColor} colors={CATEGORY_COLORS} />
      </Field>
      {initial && <Toggle checked={completed} onChange={setCompleted} label="Meta concluída" />}
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

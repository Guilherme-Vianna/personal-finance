"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { moneyToInput, parseMoney } from "@/lib/format";
import { Button, Field, FormActions, inputClass, Modal } from "@/components/ui";
import { useToast } from "@/components/toast";

type Settings = { personalBudget: number; splitEssentials: number; splitPersonal: number; splitInvestments: number };

export function SettingsButton({ settings, label = "Ajustar" }: { settings: Settings; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Orçamento pessoal e divisão">
        {open && <SettingsForm settings={settings} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

function SettingsForm({ settings, onDone }: { settings: Settings; onDone: () => void }) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const [budget, setBudget] = useState(moneyToInput(settings.personalBudget));
  const [essentials, setEssentials] = useState(String(settings.splitEssentials));
  const [personal, setPersonal] = useState(String(settings.splitPersonal));
  const [investments, setInvestments] = useState(String(settings.splitInvestments));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const total = Number(essentials) + Number(personal) + Number(investments);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const personalBudget = parseMoney(budget || "0");
    if (!(personalBudget >= 0)) return setErrors({ personalBudget: "Valor inválido" });
    if (total !== 100) return setErrors({ splitInvestments: "As três fatias precisam somar 100%" });
    setBusy(true);
    try {
      await apiRequest("/api/settings", { method: "PUT", body: { personalBudget, splitEssentials: Number(essentials), splitPersonal: Number(personal), splitInvestments: Number(investments) } });
      toast("Orçamento atualizado");
      onDone();
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) setErrors({ ...error.fieldErrors, _: error.message });
    } finally {
      setBusy(false);
    }
  }

  const pct = (value: string, set: (v: string) => void, label: string, key: string) => (
    <Field label={label} htmlFor={`${id}-${key}`} error={errors[key]}>
      <div className="relative">
        <input id={`${id}-${key}`} className={`${inputClass} pr-8`} inputMode="numeric" value={value} onChange={(e) => set(e.target.value.replace(/\D/g, "").slice(0, 3))} />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">%</span>
      </div>
    </Field>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Orçamento pessoal por mês (R$)" htmlFor={`${id}-budget`} error={errors.personalBudget} hint="Quanto você se permite gastar no dia a dia (comida, lanches, rolês…). Entradas extras somam a ele no mês.">
        <input id={`${id}-budget`} className={`${inputClass} tabular-nums`} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
      </Field>
      <div>
        <p className="mb-2 text-sm font-semibold">Divisão ideal da renda</p>
        <div className="grid grid-cols-3 gap-2">
          {pct(essentials, setEssentials, "Contas fixas", "splitEssentials")}
          {pct(personal, setPersonal, "Pessoal", "splitPersonal")}
          {pct(investments, setInvestments, "Investir", "splitInvestments")}
        </div>
        <p className={`mt-1 text-xs ${total === 100 ? "text-muted" : "font-semibold text-danger"}`}>Total: {total}%</p>
      </div>
      {errors._ && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{errors._}</p>}
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

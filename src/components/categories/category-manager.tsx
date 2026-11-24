"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { CATEGORY_COLORS, formatMoney } from "@/lib/format";
import type { CategoryWithStats } from "@/lib/services/categories";
import { Button, ColorPicker, ConfirmButton, dangerIconButtonClass, EmptyState, Field, FormActions, hasFinePointer, iconButtonClass, IconPencil, IconTrash, inputClass, Modal } from "@/components/ui";
import { Toggle } from "@/components/filters";
import { useToast } from "@/components/toast";

type Draft = Pick<CategoryWithStats, "name" | "description" | "color" | "kind" | "outsideBudget"> & { id?: string };

export function CategoryManager({ categories }: { categories: CategoryWithStats[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Draft | null>(null);
  const newDraft = (): Draft => ({ name: "", description: "", color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length], kind: "expense", outsideBudget: false });

  return (
    <>
      <div className="mb-5 flex justify-end sm:mb-6">
        <Button className="w-full sm:w-auto" onClick={() => setEditing(newDraft())}>+ Nova categoria</Button>
      </div>
      {categories.length === 0 ? (
        <EmptyState icon="🏷️" title="Nenhuma categoria" description="Categorias agrupam seus gastos: Comida, Lanches, Games, Contas…" />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {categories.map((category) => (
            <li key={category.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 sm:gap-4 sm:p-4">
              <span className="flex size-10 shrink-0 sm:size-11 items-center justify-center rounded-md text-lg font-semibold text-white" style={{ background: category.color }}>
                {category.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-bold">
                  <span className="truncate">{category.name}</span>
                  {category.kind === "income" && <span className="rounded bg-brand-50 px-1.5 text-[10px] font-bold text-brand-800 uppercase">entrada</span>}
                  {category.outsideBudget && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500 uppercase">fora do orçamento</span>}
                </p>
                {category.description && <p className="line-clamp-2 text-xs text-muted sm:line-clamp-1">{category.description}</p>}
                <p className="mt-0.5 text-xs text-muted">
                  {formatMoney(category.totalAmount)} · {category.transactionsCount} lançamento(s)
                </p>
              </div>
              <div className="flex shrink-0">
                <button type="button" onClick={() => setEditing(category)} className={iconButtonClass} aria-label={`Editar ${category.name}`}>
                  <IconPencil />
                </button>
                <ConfirmButton
                  title="Apagar categoria?"
                  message={
                    category.transactionsCount + category.recurringCount > 0
                      ? `"${category.name}" será apagada. ${[category.transactionsCount ? `${category.transactionsCount} lançamento(s)` : null, category.recurringCount ? `${category.recurringCount} item(ns) do orçamento` : null].filter(Boolean).join(" e ")} vão ficar sem categoria (órfãos) até você escolher outra.`
                      : `"${category.name}" será apagada.`
                  }
                  className={dangerIconButtonClass}
                  onConfirm={async () => {
                    const result = await apiRequest<{ orphanedTransactions: number; orphanedRecurring: number }>(`/api/categories/${category.id}`, { method: "DELETE" });
                    const orphans = result.orphanedTransactions + result.orphanedRecurring;
                    toast(orphans ? `Categoria apagada · ${orphans} item(ns) ficaram sem categoria` : "Categoria apagada");
                    router.refresh();
                  }}
                >
                  <IconTrash />
                  <span className="sr-only">Apagar {category.name}</span>
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? "Editar categoria" : "Nova categoria"}>
        {editing && (
          <CategoryForm
            initial={editing}
            onDone={(message) => {
              setEditing(null);
              toast(message);
              router.refresh();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}

function CategoryForm({ initial, onDone, onCancel }: { initial: Draft; onDone: (message: string) => void; onCancel: () => void }) {
  const id = useId();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [color, setColor] = useState(initial.color);
  const [kind, setKind] = useState(initial.kind);
  const [outsideBudget, setOutsideBudget] = useState(initial.outsideBudget);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setErrors({ name: "Informe o nome" });
    setBusy(true);
    try {
      const body = { name, description, color, kind, outsideBudget };
      await apiRequest(initial.id ? `/api/categories/${initial.id}` : "/api/categories", { method: initial.id ? "PUT" : "POST", body });
      onDone(initial.id ? "Categoria atualizada" : `Categoria "${name}" criada`);
    } catch (error) {
      if (error instanceof ApiClientError) setErrors({ ...error.fieldErrors, _: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Nome" htmlFor={`${id}-name`} error={errors.name}>
        <input id={`${id}-name`} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus={hasFinePointer()} aria-invalid={Boolean(errors.name)} />
      </Field>
      <Field label="Descrição (opcional)" htmlFor={`${id}-desc`}>
        <input id={`${id}-desc`} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Cor">
        <ColorPicker value={color} onChange={setColor} colors={CATEGORY_COLORS} />
      </Field>
      <Field label="Tipo">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo">
          {(["expense", "income"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={kind === option}
              onClick={() => setKind(option)}
              className={`min-h-11 rounded-md border px-3 py-2 text-sm font-semibold transition sm:min-h-0 ${kind === option ? "border-transparent bg-brand-600 text-white shadow-sm" : "border-border bg-surface text-ink hover:border-brand-300"}`}
            >
              {option === "expense" ? "💸 Gasto" : "💰 Entrada"}
            </button>
          ))}
        </div>
      </Field>
      <div>
        <Toggle checked={outsideBudget} onChange={setOutsideBudget} label="Fora do orçamento pessoal" />
        <p className="mt-1 text-xs text-muted">
          {kind === "expense"
            ? "Ex.: Livros, compras de longo prazo pagas com outro dinheiro. Aparece nos gastos, mas não consome o orçamento do mês."
            : "Ex.: 13º, bônus que vai direto pra reserva. Sem isso marcado, entradas extras aumentam o orçamento do mês."}
        </p>
      </div>
      {errors._ && !errors.name && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{errors._}</p>}
      <FormActions>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </Button>
      </FormActions>
    </form>
  );
}

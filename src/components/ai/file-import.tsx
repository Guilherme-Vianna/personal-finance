"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import type { CategoryKind, PaymentMethod } from "@/db/schema";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { formatMoney, moneyToInput, parseMoney, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { Button, Card, CardTitle, Field, inputClass } from "@/components/ui";
import { useToast } from "@/components/toast";

type CategoryOption = { id: string; name: string; color: string; kind: CategoryKind };
type Extracted = { date: string | null; description: string; amount: number | null; categoryId: string | null; method: PaymentMethod | null; kind: CategoryKind; doubt: string | null; duplicateOf: string | null };
type Row = {
  key: number;
  include: boolean;
  date: string;
  description: string;
  amount: string;
  categoryId: string;
  method: PaymentMethod | "";
  kind: CategoryKind;
  doubt: string | null;
  duplicateOf: string | null;
  source: string;
};
type FileState = { id: number; file: File; status: "pending" | "reading" | "done" | "error"; message?: string };

const ACCEPT = "image/*,.pdf,.csv,.txt,.ofx,.qfx,.xlsx,.xlsm,.json,.tsv";
const MAX_SIDE = 2000;
let nextKey = 1;

// Phone photos are often 10+ MB; shrinking them keeps the upload under the serverless body limit.
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 3_000_000) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.85));
}

function fileIcon(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (file.type.startsWith("image/")) return "🖼️";
  if (ext === "pdf") return "📄";
  if (ext === "xlsx" || ext === "xlsm" || ext === "csv" || ext === "tsv") return "📊";
  if (ext === "ofx" || ext === "qfx") return "🏦";
  return "📝";
}

function missingFields(row: Row) {
  const missing: string[] = [];
  if (!row.description.trim()) missing.push("descrição");
  if (!(parseMoney(row.amount) > 0)) missing.push("valor");
  if (!row.date) missing.push("data");
  if (!row.categoryId) missing.push("categoria");
  return missing;
}

const missingClass = "border-amber-400 bg-amber-50/60";

export function FileImport({ categories, configured, today }: { categories: CategoryOption[]; configured: boolean; today: string }) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileState[]>([]);
  const [hint, setHint] = useState("");
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [summaries, setSummaries] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const [bulk, setBulk] = useState({ categoryId: "", method: "", date: "" });

  function addFiles(list: FileList | File[]) {
    const added = [...list].map((file) => ({ id: nextKey++, file, status: "pending" as const }));
    setFiles((current) => [...current.filter((f) => f.status !== "done"), ...added]);
    setSaved(null);
    setError(null);
  }

  async function read() {
    const pending = files.filter((f) => f.status === "pending" || f.status === "error");
    if (!pending.length) return;
    setReading(true);
    setError(null);
    for (const item of pending) {
      setFiles((current) => current.map((f) => (f.id === item.id ? { ...f, status: "reading", message: undefined } : f)));
      try {
        const form = new FormData();
        const blob = await shrink(item.file);
        form.append("file", blob, blob === item.file ? item.file.name : `${item.file.name.replace(/\.[^.]+$/, "")}.jpg`);
        if (hint.trim()) form.append("hint", hint.trim());
        const response = await fetch("/api/ai/extract", { method: "POST", body: form });
        const data = (await response.json().catch(() => ({}))) as { entries?: Extracted[]; summary?: string; error?: string };
        if (!response.ok || !data.entries) throw new Error(data.error ?? "Não foi possível ler o arquivo.");
        const newRows: Row[] = data.entries.map((entry) => ({
          key: nextKey++,
          include: !entry.duplicateOf,
          date: entry.date ?? "",
          description: entry.description,
          amount: entry.amount === null ? "" : moneyToInput(entry.amount),
          categoryId: entry.categoryId ?? "",
          method: entry.method ?? "",
          kind: entry.kind,
          doubt: entry.doubt,
          duplicateOf: entry.duplicateOf,
          source: item.file.name,
        }));
        setRows((current) => [...current, ...newRows]);
        if (data.summary) setSummaries((current) => [...current, `${item.file.name}: ${data.summary}`]);
        setFiles((current) => current.map((f) => (f.id === item.id ? { ...f, status: "done", message: `${newRows.length} lançamento(s)` } : f)));
      } catch (err) {
        setFiles((current) => current.map((f) => (f.id === item.id ? { ...f, status: "error", message: err instanceof Error ? err.message : "Falhou" } : f)));
      }
    }
    setReading(false);
  }

  function update(key: number, changes: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  }

  function addRow() {
    setRows((current) => [...current, { key: nextKey++, include: true, date: today, description: "", amount: "", categoryId: "", method: "", kind: "expense", doubt: null, duplicateOf: null, source: "manual" }]);
  }

  function applyBulk(field: "categoryId" | "method" | "date") {
    const value = bulk[field];
    if (!value) return;
    setRows((current) =>
      current.map((row) => {
        if (!row.include) return row;
        if (field === "categoryId") {
          const category = categories.find((c) => c.id === value);
          return category && category.kind === row.kind ? { ...row, categoryId: value } : row;
        }
        if (field === "method") return row.kind === "expense" ? { ...row, method: value as PaymentMethod } : row;
        return { ...row, date: value };
      }),
    );
  }

  async function save() {
    const chosen = rows.filter((row) => row.include);
    setShowErrors(true);
    if (!chosen.length || chosen.some((row) => missingFields(row).length)) return;
    setSaving(true);
    setError(null);
    try {
      const body = chosen.map((row) => ({
        date: row.date,
        description: row.description.trim(),
        amount: parseMoney(row.amount),
        categoryId: row.categoryId,
        method: row.kind === "expense" ? row.method || null : null,
        notes: row.source === "manual" ? null : `Importado com IA · ${row.source}`,
      }));
      const result = await apiRequest<{ created: number }>("/api/transactions/bulk", { method: "POST", body });
      toast(`${result.created} lançamento(s) salvos`);
      setSaved(result.created);
      setRows([]);
      setFiles([]);
      setSummaries([]);
      setShowErrors(false);
      setHint("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (!configured) {
    return (
      <Card className="notebook">
        <CardTitle>Falta configurar a IA</CardTitle>
        <p className="text-sm text-muted">
          Defina a variável de ambiente <code className="rounded bg-brand-50 px-1 font-semibold text-brand-800">GEMINI_API_KEY</code> (no <code>.env.local</code> e na Vercel) para importar arquivos com IA.
        </p>
      </Card>
    );
  }

  const selected = rows.filter((row) => row.include);
  const incomplete = selected.filter((row) => missingFields(row).length).length;
  const total = selected.reduce((t, row) => t + (parseMoney(row.amount) || 0) * (row.kind === "income" ? -1 : 1), 0);
  const pendingFiles = files.filter((f) => f.status === "pending" || f.status === "error").length;
  const expenseCategories = categories.filter((c) => c.kind === "expense");

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <Card className="xl:sticky xl:top-6 xl:self-start">
        <CardTitle>1. Escolha os arquivos</CardTitle>
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
            }}
            className="notebook flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-200 bg-surface p-4 text-center transition hover:border-brand-400"
          >
            <span className="animate-[float_3s_ease-in-out_infinite] text-4xl" aria-hidden>
              📂
            </span>
            <span className="font-hand text-2xl font-bold text-brand-800">Foto, PDF, planilha ou extrato</span>
            <span className="max-w-xs text-xs text-muted">Fatura do cartão, extrato (PDF, OFX, CSV), planilha .xlsx, nota fiscal ou print do banco. Pode mandar vários.</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            onChange={(event) => {
              if (event.target.files?.length) addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          {files.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {files.map((item) => (
                <li key={item.id} className="flex items-start gap-2 rounded-xl bg-brand-50/60 px-3 py-2 text-sm">
                  <span aria-hidden>{fileIcon(item.file)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{item.file.name}</p>
                    <p className={`text-xs ${item.status === "error" ? "text-danger" : "text-muted"}`}>
                      {item.status === "pending" && "Na fila"}
                      {item.status === "reading" && "Lendo…"}
                      {item.status === "done" && `✓ ${item.message}`}
                      {item.status === "error" && item.message}
                    </p>
                  </div>
                  {item.status !== "reading" && (
                    <button type="button" className="text-xs font-semibold text-muted hover:text-danger" onClick={() => setFiles((current) => current.filter((f) => f.id !== item.id))} aria-label={`Remover ${item.file.name}`}>
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Field label="Alguma dica pra IA? (opcional)" htmlFor={`${id}-hint`} hint='Ex.: "foi tudo no crédito", "só outubro", "separe item por item"'>
            <input id={`${id}-hint`} className={inputClass} value={hint} onChange={(event) => setHint(event.target.value)} />
          </Field>
          <Button onClick={read} disabled={!pendingFiles || reading}>
            {reading ? "Lendo arquivos…" : pendingFiles > 1 ? `✨ Ler ${pendingFiles} arquivos com IA` : "✨ Ler com IA"}
          </Button>
          {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        </div>
      </Card>

      <div className="flex min-w-0 flex-col gap-4">
        {saved !== null && rows.length === 0 && (
          <Card className="notebook">
            <p className="font-hand text-3xl font-bold text-brand-800">Pronto! {saved} lançamento(s) salvos ✓</p>
            <p className="mt-1 text-sm text-muted">
              Eles já contam no painel e no orçamento.{" "}
              <Link href="/gastos" className="font-semibold text-brand-700 hover:underline">
                Ver em Gastos →
              </Link>
            </p>
          </Card>
        )}

        {rows.length === 0 && !reading && saved === null && (
          <Card className="notebook">
            <CardTitle>Como funciona</CardTitle>
            <ul className="flex flex-col gap-2 text-sm text-muted">
              <li>📂 Envie fotos, PDFs, planilhas ou extratos exportados do banco (OFX/CSV).</li>
              <li>✨ A IA pré-preenche cada lançamento: data, valor, forma de pagamento e categoria (das suas).</li>
              <li>🤔 Quando fica em dúvida, ela deixa o campo em branco (em amarelo) para você completar.</li>
              <li>🔁 O que parece já estar lançado vem desmarcado, para não duplicar.</li>
              <li>✅ Nada é salvo sozinho: você revisa, ajusta e salva tudo de uma vez.</li>
            </ul>
          </Card>
        )}

        {reading && rows.length === 0 && (
          <div className="flex flex-col gap-3" aria-busy aria-label="Lendo">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-24 rounded-2xl" />
            ))}
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div>
              <h2 className="text-lg font-bold">2. Revise e ajuste</h2>
              {summaries.map((summary) => (
                <p key={summary} className="text-sm text-muted">
                  {summary}
                </p>
              ))}
            </div>

            <Card className="p-3! sm:p-4!">
              <p className="mb-2 text-xs font-bold tracking-wider text-muted uppercase">Aplicar aos selecionados</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="flex gap-1.5">
                  <select aria-label="Categoria para todos" className={inputClass} value={bulk.categoryId} onChange={(e) => setBulk({ ...bulk, categoryId: e.target.value })}>
                    <option value="">Categoria…</option>
                    {expenseCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <Button variant="secondary" size="sm" onClick={() => applyBulk("categoryId")} disabled={!bulk.categoryId}>
                    Aplicar
                  </Button>
                </div>
                <div className="flex gap-1.5">
                  <select aria-label="Forma de pagamento para todos" className={inputClass} value={bulk.method} onChange={(e) => setBulk({ ...bulk, method: e.target.value })}>
                    <option value="">Forma…</option>
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([value, { label }]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <Button variant="secondary" size="sm" onClick={() => applyBulk("method")} disabled={!bulk.method}>
                    Aplicar
                  </Button>
                </div>
                <div className="flex gap-1.5">
                  <input aria-label="Data para todos" type="date" className={inputClass} value={bulk.date} onChange={(e) => setBulk({ ...bulk, date: e.target.value })} />
                  <Button variant="secondary" size="sm" onClick={() => applyBulk("date")} disabled={!bulk.date}>
                    Aplicar
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-brand-700">
                <button type="button" className="min-h-10 hover:underline sm:min-h-0" onClick={() => setRows((current) => current.map((row) => ({ ...row, include: true })))}>
                  Marcar todos
                </button>
                <button type="button" className="min-h-10 hover:underline sm:min-h-0" onClick={() => setRows((current) => current.map((row) => ({ ...row, include: false })))}>
                  Desmarcar todos
                </button>
                <button type="button" className="min-h-10 hover:underline sm:min-h-0" onClick={() => setRows((current) => current.filter((row) => row.include))}>
                  Remover desmarcados
                </button>
              </div>
            </Card>

            <ul className="flex flex-col gap-3">
              {rows.map((row) => {
                const options = categories.filter((c) => c.kind === row.kind);
                const color = categories.find((c) => c.id === row.categoryId)?.color ?? "var(--color-border)";
                const missing = missingFields(row);
                const flag = (field: string) => (missing.includes(field) ? missingClass : "");
                return (
                  <li key={row.key} className={`rounded-2xl border bg-surface p-3 shadow-card transition sm:p-4 ${row.include ? (showErrors && missing.length ? "border-danger" : "border-border") : "border-dashed border-border opacity-50"}`}>
                    <div className="flex gap-3">
                      <span className="w-1.5 shrink-0 self-stretch rounded-full" style={{ background: color }} />
                      <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                        <input aria-label="Descrição" placeholder="Descrição" className={`${inputClass} col-span-2 font-semibold sm:col-span-1 ${flag("descrição")}`} value={row.description} onChange={(e) => update(row.key, { description: e.target.value })} />
                        <input aria-label="Valor" placeholder="Valor" inputMode="decimal" className={`${inputClass} tabular-nums ${flag("valor")}`} value={row.amount} onChange={(e) => update(row.key, { amount: e.target.value })} />
                        <input aria-label="Data" type="date" className={`${inputClass} ${flag("data")}`} value={row.date} onChange={(e) => update(row.key, { date: e.target.value })} />
                        <select aria-label="Categoria" className={`${inputClass} ${flag("categoria")}`} value={row.categoryId} onChange={(e) => update(row.key, { categoryId: e.target.value })}>
                          <option value="">Categoria…</option>
                          {options.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        {row.kind === "expense" ? (
                          <select aria-label="Forma de pagamento" className={inputClass} value={row.method} onChange={(e) => update(row.key, { method: e.target.value as PaymentMethod | "" })}>
                            <option value="">Forma…</option>
                            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, { label }]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="flex items-center rounded-xl bg-brand-50 px-3 text-sm font-semibold text-brand-800">💰 Entrada</span>
                        )}
                        <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1">
                          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold sm:min-h-0">
                            <input type="checkbox" className="size-5 accent-brand-600" checked={row.include} onChange={(e) => update(row.key, { include: e.target.checked })} />
                            Incluir
                          </label>
                          <button
                            type="button"
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-brand-50 hover:text-ink"
                            onClick={() => update(row.key, { kind: row.kind === "expense" ? "income" : "expense", categoryId: "", method: "" })}
                            title="Trocar entre gasto e entrada"
                          >
                            {row.kind === "expense" ? "💸 gasto" : "💰 entrada"} ⇄
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 ml-4.5 flex flex-col gap-0.5 text-xs">
                      {row.duplicateOf && <p className="font-semibold text-sky-800">🔁 Parece já lançado: &quot;{row.duplicateOf}&quot;. Marque se for outro gasto.</p>}
                      {row.doubt && <p className="text-amber-800">🤔 {row.doubt}</p>}
                      {row.include && showErrors && missing.length > 0 && <p className="font-semibold text-danger">Falta: {missing.join(", ")}</p>}
                      <p className="text-muted">{row.source === "manual" ? "✍️ adicionado à mão" : `📎 ${row.source}`}</p>
                    </div>
                  </li>
                );
              })}
            </ul>

            <Button variant="secondary" onClick={addRow} className="self-start">
              + Adicionar linha
            </Button>

            <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface/95 p-3 shadow-lift backdrop-blur lg:bottom-4">
              <p className="text-sm text-muted">
                <strong className="text-ink">{selected.length}</strong> selecionado(s) · <strong className="text-ink tabular-nums">{formatMoney(Math.abs(total))}</strong>
                {incomplete > 0 && <span className="block text-xs font-semibold text-amber-800 sm:inline sm:pl-2">{incomplete} para completar</span>}
              </p>
              <Button onClick={save} disabled={saving || !selected.length}>
                {saving ? "Salvando…" : `Salvar ${selected.length}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

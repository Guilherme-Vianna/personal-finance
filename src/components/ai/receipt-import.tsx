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
type Extracted = { date: string; description: string; amount: number; categoryId: string | null; method: PaymentMethod | null; kind: CategoryKind; doubt: string | null };
type Row = { key: number; include: boolean; date: string; description: string; amount: string; categoryId: string; method: PaymentMethod | ""; kind: CategoryKind; doubt: string | null };

const MAX_SIDE = 2000;

// Phone photos are often 10+ MB; shrinking them keeps the upload under the serverless body limit.
async function shrink(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
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

export function ReceiptImport({ categories, configured }: { categories: CategoryOption[]; configured: boolean }) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState<number | null>(null);

  function pick(next: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
    setRows(null);
    setSummary(null);
    setError(null);
    setSaved(null);
  }

  async function read() {
    if (!file) return;
    setReading(true);
    setError(null);
    try {
      const form = new FormData();
      const blob = await shrink(file);
      form.append("image", blob, blob === file ? file.name : "comprovante.jpg");
      if (hint.trim()) form.append("hint", hint.trim());
      const response = await fetch("/api/ai/extract", { method: "POST", body: form });
      const data = (await response.json().catch(() => ({}))) as { entries?: Extracted[]; summary?: string; error?: string };
      if (!response.ok || !data.entries) throw new Error(data.error ?? "Não foi possível ler a imagem.");
      setSummary(data.summary ?? null);
      setRows(
        data.entries.map((entry, index) => ({
          key: index,
          include: true,
          date: entry.date,
          description: entry.description,
          amount: moneyToInput(entry.amount),
          categoryId: entry.categoryId ?? "",
          method: entry.method ?? "",
          kind: entry.kind,
          doubt: entry.doubt,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível ler a imagem.");
    } finally {
      setReading(false);
    }
  }

  function update(key: number, changes: Partial<Row>) {
    setRows((current) => current?.map((row) => (row.key === key ? { ...row, ...changes } : row)) ?? null);
  }

  async function save() {
    if (!rows) return;
    const chosen = rows.filter((row) => row.include);
    const problems: Record<number, string> = {};
    for (const row of chosen) {
      if (!row.description.trim()) problems[row.key] = "Informe a descrição";
      else if (!(parseMoney(row.amount) > 0)) problems[row.key] = "Valor inválido";
      else if (!row.categoryId) problems[row.key] = "Escolha a categoria";
    }
    setRowErrors(problems);
    if (Object.keys(problems).length || !chosen.length) return;
    setSaving(true);
    try {
      const body = chosen.map((row) => ({ date: row.date, description: row.description, amount: parseMoney(row.amount), categoryId: row.categoryId, method: row.kind === "expense" ? row.method || null : null, notes: "Lido por IA" }));
      const result = await apiRequest<{ created: number }>("/api/transactions/bulk", { method: "POST", body });
      toast(`${result.created} lançamento(s) salvos`);
      setSaved(result.created);
      setRows(null);
      setFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      setHint("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  const selected = rows?.filter((row) => row.include) ?? [];
  const selectedTotal = selected.reduce((t, row) => t + (parseMoney(row.amount) || 0) * (row.kind === "income" ? -1 : 1), 0);

  if (!configured) {
    return (
      <Card className="notebook">
        <CardTitle>Falta configurar a IA</CardTitle>
        <p className="text-sm text-muted">
          Defina a variável de ambiente <code className="rounded bg-brand-50 px-1 font-semibold text-brand-800">GEMINI_API_KEY</code> (no <code>.env.local</code> e na Vercel) para ler comprovantes com IA.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <Card className="xl:sticky xl:top-6 xl:self-start">
        <CardTitle>1. Envie a imagem</CardTitle>
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const dropped = event.dataTransfer.files[0];
              if (dropped?.type.startsWith("image/")) pick(dropped);
            }}
            className="notebook flex min-h-48 flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-brand-200 bg-surface p-3 text-center transition hover:border-brand-400"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Imagem escolhida" className="max-h-80 w-auto rounded-lg object-contain shadow-card" />
            ) : (
              <>
                <span className="animate-[float_3s_ease-in-out_infinite] text-4xl" aria-hidden>
                  📸
                </span>
                <span className="font-hand text-2xl font-bold text-brand-800">Tirar foto ou escolher imagem</span>
                <span className="max-w-xs text-xs text-muted">Nota fiscal, comprovante de Pix, fatura do cartão, extrato ou print do app do banco</span>
              </>
            )}
          </button>
          <input ref={inputRef} type="file" accept="image/*" className="sr-only" onChange={(event) => pick(event.target.files?.[0] ?? null)} />
          {file && (
            <p className="-mt-2 flex items-center justify-between gap-2 text-xs text-muted">
              <span className="truncate">{file.name}</span>
              <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => pick(null)}>
                Trocar
              </button>
            </p>
          )}
          <Field label="Alguma dica pra IA? (opcional)" htmlFor={`${id}-hint`} hint='Ex.: "foi tudo no crédito", "só os gastos de outubro", "separe item por item"'>
            <input id={`${id}-hint`} className={inputClass} value={hint} onChange={(event) => setHint(event.target.value)} />
          </Field>
          <Button onClick={read} disabled={!file || reading}>
            {reading ? "Lendo imagem…" : "✨ Ler com IA"}
          </Button>
          {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        </div>
      </Card>

      <div className="flex min-w-0 flex-col gap-4">
        {reading && (
          <div className="flex flex-col gap-3" aria-busy aria-label="Lendo">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-24 rounded-2xl" />
            ))}
          </div>
        )}

        {!reading && saved !== null && (
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

        {!reading && !rows && saved === null && (
          <Card className="notebook">
            <CardTitle>Como funciona</CardTitle>
            <ul className="flex flex-col gap-2 text-sm text-muted">
              <li>📸 Envie a foto de uma nota, comprovante, fatura ou print do extrato.</li>
              <li>✨ A IA identifica cada gasto com data, valor, forma de pagamento e sugere a categoria (usando as suas).</li>
              <li>✏️ Você revisa, corrige o que precisar e desmarca o que não quiser.</li>
              <li>✅ Só depois de salvar é que vira lançamento. Nada entra sozinho.</li>
            </ul>
          </Card>
        )}

        {!reading && rows && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold">2. Revise os lançamentos</h2>
              {summary && <p className="text-sm text-muted">{summary}</p>}
            </div>
            {rows.length === 0 ? (
              <Card className="notebook">
                <p className="text-sm text-muted">A IA não encontrou lançamentos nessa imagem. Tente uma foto mais nítida ou dê uma dica.</p>
              </Card>
            ) : (
              <ul className="stagger flex flex-col gap-3">
                {rows.map((row) => {
                  const options = categories.filter((c) => c.kind === row.kind);
                  const color = categories.find((c) => c.id === row.categoryId)?.color ?? "var(--color-border)";
                  return (
                    <li key={row.key} className={`rounded-2xl border bg-surface p-3 shadow-card transition sm:p-4 ${row.include ? "border-border" : "border-dashed border-border opacity-50"}`}>
                      <div className="flex gap-3">
                        <span className="w-1.5 shrink-0 self-stretch rounded-full" style={{ background: color }} />
                        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                          <input aria-label="Descrição" className={`${inputClass} col-span-2 font-semibold sm:col-span-1`} value={row.description} onChange={(e) => update(row.key, { description: e.target.value })} />
                          <input aria-label="Valor" inputMode="decimal" className={`${inputClass} tabular-nums`} value={row.amount} onChange={(e) => update(row.key, { amount: e.target.value })} />
                          <input aria-label="Data" type="date" className={inputClass} value={row.date} onChange={(e) => update(row.key, { date: e.target.value })} />
                          <select aria-label="Categoria" className={`${inputClass} ${!row.categoryId ? "border-amber-400" : ""}`} value={row.categoryId} onChange={(e) => update(row.key, { categoryId: e.target.value })}>
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
                          <label className="col-span-2 flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold sm:col-span-1 sm:min-h-0">
                            <input type="checkbox" className="size-5 accent-brand-600" checked={row.include} onChange={(e) => update(row.key, { include: e.target.checked })} />
                            Incluir
                          </label>
                        </div>
                      </div>
                      {(row.doubt || rowErrors[row.key]) && (
                        <p className={`mt-2 ml-4.5 text-xs ${rowErrors[row.key] ? "font-semibold text-danger" : "text-amber-800"}`}>{rowErrors[row.key] ?? `🤔 ${row.doubt}`}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {rows.length > 0 && (
              <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface/95 p-3 shadow-lift backdrop-blur lg:bottom-4">
                <p className="text-sm text-muted">
                  <strong className="text-ink">{selected.length}</strong> selecionado(s) · <strong className="text-ink tabular-nums">{formatMoney(Math.abs(selectedTotal))}</strong>
                </p>
                <Button onClick={save} disabled={saving || !selected.length}>
                  {saving ? "Salvando…" : `Salvar ${selected.length}`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { Button, Card, hasFinePointer, inputClass } from "@/components/ui";

type Turn = { role: "user" | "assistant"; content: string; tools?: string[]; error?: boolean };

const SUGGESTIONS = [
  "Para onde está indo meu dinheiro este mês?",
  "Onde eu posso economizar?",
  "Compare meus gastos dos últimos 3 meses",
  "Quais pequenos gastos estão pesando mais?",
  "Como estão minhas contas do mês? Falta pagar alguma?",
  "Vou conseguir fechar o mês dentro do orçamento?",
];

const STORAGE_KEY = "grana:assistant-chat";

export function AssistantChat({ configured }: { configured: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) setTurns(JSON.parse(stored) as Turn[]);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns));
    } catch {}
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  async function send(question: string) {
    const content = question.trim();
    if (!content || busy) return;
    const history: Turn[] = [...turns.filter((t) => !t.error), { role: "user", content }];
    setTurns((current) => [...current, { role: "user", content }]);
    setText("");
    setBusy(true);
    try {
      const result = await apiRequest<{ reply: string; tools: string[] }>("/api/agent", { method: "POST", body: { messages: history.map(({ role, content }) => ({ role, content })) } });
      setTurns((current) => [...current, { role: "assistant", content: result.reply, tools: result.tools }]);
    } catch (error) {
      setTurns((current) => [...current, { role: "assistant", content: error instanceof ApiClientError ? error.message : "Não foi possível responder agora.", error: true }]);
    } finally {
      setBusy(false);
      if (hasFinePointer()) inputRef.current?.focus();
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    send(text);
  }

  if (!configured) {
    return (
      <Card className="notebook">
        <p className="text-sm text-muted">
          Defina <code className="rounded bg-brand-50 px-1 font-semibold text-brand-800">GEMINI_API_KEY</code> para usar o assistente.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex min-h-[60dvh] flex-col gap-4">
      {turns.length === 0 ? (
        <Card className="notebook">
          <p className="font-hand text-3xl font-bold text-brand-800">O que você quer saber?</p>
          <p className="mt-1 text-sm text-muted">O assistente consulta seus gastos, orçamento, metas e empréstimos para responder com números reais.</p>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => send(suggestion)}
                className="lift min-h-11 rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm font-semibold text-ink hover:border-brand-300"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {turns.map((turn, index) =>
            turn.role === "user" ? (
              <div key={index} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm text-white shadow-sm">
                {turn.content}
              </div>
            ) : (
              <div key={index} className={`max-w-full rounded-2xl rounded-bl-md border px-4 py-3 shadow-card sm:max-w-[92%] ${turn.error ? "border-danger/30 bg-danger-soft text-danger" : "border-border bg-surface"}`}>
                {turn.tools && turn.tools.length > 0 && (
                  <p className="mb-2 flex flex-wrap gap-1 text-[11px] text-muted">
                    <span className="font-semibold">Consultou:</span>
                    {turn.tools.map((name) => (
                      <span key={name} className="rounded bg-brand-50 px-1.5 font-semibold text-brand-800">
                        {name}
                      </span>
                    ))}
                  </p>
                )}
                <div className="prose-chat text-sm leading-relaxed">
                  <ReactMarkdown>{turn.content}</ReactMarkdown>
                </div>
              </div>
            ),
          )}
          {busy && (
            <div className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 text-sm text-muted shadow-card" aria-live="polite">
              <span className="flex gap-1" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1.5 animate-bounce rounded-full bg-brand-500" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </span>
              Analisando seus dados…
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      <form onSubmit={submit} className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-auto flex items-end gap-2 rounded-2xl border border-border bg-surface/95 p-2 shadow-lift backdrop-blur lg:bottom-4">
        <textarea
          ref={inputRef}
          rows={1}
          aria-label="Pergunta"
          className={`${inputClass} max-h-40 resize-none border-0 focus:ring-0`}
          placeholder="Pergunte sobre seus gastos…"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send(text);
            }
          }}
        />
        <div className="flex shrink-0 gap-1">
          {turns.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setTurns([])} disabled={busy}>
              Limpar
            </Button>
          )}
          <Button type="submit" disabled={busy || !text.trim()}>
            Enviar
          </Button>
        </div>
      </form>
    </div>
  );
}

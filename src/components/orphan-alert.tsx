import Link from "next/link";

export function OrphanAlert({ transactions, recurring }: { transactions: number; recurring: number }) {
  if (!transactions && !recurring) return null;
  return (
    <div role="status" className="flex flex-col gap-1 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <p>
        <strong>⚠️ Itens sem categoria:</strong>{" "}
        {[transactions ? `${transactions} lançamento(s)` : null, recurring ? `${recurring} item(ns) do orçamento` : null].filter(Boolean).join(" e ")} ficaram órfãos quando uma categoria foi apagada.
      </p>
      <span className="flex shrink-0 gap-3 font-semibold">
        {transactions > 0 && (
          <Link href="/gastos?periodo=all&categoria=sem" className="underline">
            Corrigir lançamentos
          </Link>
        )}
        {recurring > 0 && (
          <Link href="/orcamento" className="underline">
            Corrigir orçamento
          </Link>
        )}
      </span>
    </div>
  );
}

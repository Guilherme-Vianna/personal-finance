import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/app-shell";
import { PageSuspense } from "@/components/page-suspense";
import { QuickAddButton } from "@/components/transactions/quick-add";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { TransactionList } from "@/components/transactions/transaction-list";
import { EmptyState } from "@/components/ui";
import { PAYMENT_METHODS, type PaymentMethod } from "@/db/schema";
import { isPeriod, periodRange, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { OrphanAlert } from "@/components/orphan-alert";
import { listCategories, orphanCounts } from "@/lib/services/categories";
import { listTransactions } from "@/lib/services/transactions";

export const metadata: Metadata = { title: "Gastos" };

export default function TransactionsPage(props: PageProps<"/gastos">) {
  return (
    <>
      <PageHeader title="Gastos" subtitle="Tudo o que você lançou, dia a dia" action={<div className="hidden lg:block"><QuickAddButton /></div>} />
      <PageSuspense>
        <Transactions searchParams={props.searchParams} />
      </PageSuspense>
    </>
  );
}

async function Transactions({ searchParams }: { searchParams: PageProps<"/gastos">["searchParams"] }) {
  const params = await searchParams;
  await connection();
  const period = isPeriod(params.periodo) ? params.periodo : "month";
  const categoryId = typeof params.categoria === "string" ? params.categoria : "";
  const method = PAYMENT_METHODS.includes(params.forma as PaymentMethod) ? (params.forma as PaymentMethod) : null;
  const q = typeof params.q === "string" ? params.q : "";
  const today = todayISO();
  const { from, to } = periodRange(period, today);
  const [transactions, categories, orphans] = await Promise.all([listTransactions({ from, to, categoryId: categoryId && categoryId !== "sem" ? categoryId : null, orphansOnly: categoryId === "sem", method, q: q || null }), listCategories(), orphanCounts()]);
  const spent = transactions.filter((row) => row.categoryKind === "expense").reduce((sum, row) => sum + row.amount, 0);
  const received = transactions.filter((row) => row.categoryKind === "income").reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="flex flex-col gap-5">
      {categoryId !== "sem" && <OrphanAlert transactions={orphans.transactions} recurring={0} />}
      <TransactionFilters period={period} categoryId={categoryId} method={method ?? ""} q={q} categories={categories} />
      <p className="text-sm text-muted">
        <strong className="text-ink">{transactions.length}</strong> lançamento(s) · <strong className="text-ink">{formatMoney(spent)}</strong> gastos
        {received > 0 && (
          <>
            {" "}
            · <strong className="text-brand-700">+{formatMoney(received)}</strong> de entradas
          </>
        )}
      </p>
      {transactions.length ? (
        <TransactionList transactions={transactions} today={today} />
      ) : (
        <EmptyState icon="🧾" title="Nenhum gasto encontrado" description="Mude os filtros ou registre um novo gasto." action={<QuickAddButton />} />
      )}
    </div>
  );
}

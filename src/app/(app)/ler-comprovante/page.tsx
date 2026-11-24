import type { Metadata } from "next";
import { connection } from "next/server";
import { ReceiptImport } from "@/components/ai/receipt-import";
import { PageHeader } from "@/components/app-shell";
import { PageSuspense } from "@/components/page-suspense";
import { aiConfigured } from "@/lib/services/ai-import";
import { listCategories } from "@/lib/services/categories";

export const metadata: Metadata = { title: "Ler comprovante" };

export default function ReceiptPage() {
  return (
    <>
      <PageHeader title="Ler comprovante" subtitle="Mande uma foto e a IA monta os lançamentos pra você revisar" />
      <PageSuspense>
        <Receipt />
      </PageSuspense>
    </>
  );
}

async function Receipt() {
  await connection();
  const categories = await listCategories();
  return <ReceiptImport configured={aiConfigured()} categories={categories.map(({ id, name, color, kind }) => ({ id, name, color, kind }))} />;
}

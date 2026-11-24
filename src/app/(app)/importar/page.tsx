import type { Metadata } from "next";
import { connection } from "next/server";
import { FileImport } from "@/components/ai/file-import";
import { PageHeader } from "@/components/app-shell";
import { PageSuspense } from "@/components/page-suspense";
import { todayISO } from "@/lib/dates";
import { aiConfigured } from "@/lib/services/ai-import";
import { listCategories } from "@/lib/services/categories";

export const metadata: Metadata = { title: "Importar com IA" };

export default function ImportPage() {
  return (
    <>
      <PageHeader title="Importar com IA" subtitle="Fotos, PDFs, planilhas e extratos viram lançamentos pra você revisar" />
      <PageSuspense>
        <Import />
      </PageSuspense>
    </>
  );
}

async function Import() {
  await connection();
  const categories = await listCategories();
  return <FileImport configured={aiConfigured()} today={todayISO()} categories={categories.map(({ id, name, color, kind }) => ({ id, name, color, kind }))} />;
}

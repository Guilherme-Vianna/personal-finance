import type { Metadata } from "next";
import { connection } from "next/server";
import { AssistantChat } from "@/components/agent/assistant-chat";
import { PageHeader } from "@/components/app-shell";
import { PageSuspense } from "@/components/page-suspense";

export const metadata: Metadata = { title: "Assistente" };

export default function AssistantPage() {
  return (
    <>
      <PageHeader title="Assistente" subtitle="Pergunte para onde seu dinheiro está indo" />
      <PageSuspense>
        <Assistant />
      </PageSuspense>
    </>
  );
}

async function Assistant() {
  await connection();
  return <AssistantChat configured={Boolean(process.env.GEMINI_API_KEY)} />;
}

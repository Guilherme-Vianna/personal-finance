"use client";

import { Segmented, Toggle, useQueryUpdater } from "@/components/filters";
import { INSIGHT_WINDOWS } from "@/lib/dates";

export function InsightsFilters({ window, includeOutside }: { window: string; includeOutside: boolean }) {
  const { update, pending } = useQueryUpdater();
  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-3 transition-opacity ${pending ? "opacity-60" : ""}`}>
      <Segmented label="Janela" options={INSIGHT_WINDOWS} value={window} onChange={(value) => update({ janela: value === "3" ? null : value })} />
      <Toggle checked={includeOutside} onChange={(checked) => update({ fora: checked ? "1" : null })} label="Incluir gastos fora do orçamento" />
    </div>
  );
}

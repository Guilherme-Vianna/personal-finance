"use client";

import { useEffect, useState } from "react";
import { Segmented, useQueryUpdater } from "@/components/filters";
import { inputClass } from "@/components/ui";
import { PERIODS, type Period } from "@/lib/dates";
import { PAYMENT_METHOD_LABELS } from "@/lib/format";

export function TransactionFilters({
  period,
  categoryId,
  method,
  q,
  categories,
}: {
  period: Period;
  categoryId: string;
  method: string;
  q: string;
  categories: { id: string; name: string }[];
}) {
  const { update, pending } = useQueryUpdater();
  const [search, setSearch] = useState(q);

  useEffect(() => {
    if (search === q) return;
    const timer = setTimeout(() => update({ q: search }), 350);
    return () => clearTimeout(timer);
  }, [search, q, update]);

  return (
    <div className={`flex flex-col gap-3 transition-opacity ${pending ? "opacity-60" : ""}`}>
      <Segmented label="Período" options={PERIODS} value={period} onChange={(value) => update({ periodo: value === "month" ? null : value })} />
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <select aria-label="Categoria" className={`${inputClass} sm:max-w-52`} value={categoryId} onChange={(event) => update({ categoria: event.target.value })}>
          <option value="">Todas as categorias</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select aria-label="Forma de pagamento" className={`${inputClass} sm:max-w-44`} value={method} onChange={(event) => update({ forma: event.target.value })}>
          <option value="">Todas as formas</option>
          {Object.entries(PAYMENT_METHOD_LABELS).map(([value, { label }]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input type="search" aria-label="Buscar" placeholder="Buscar descrição ou observação…" className={`${inputClass} col-span-2`} value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
    </div>
  );
}

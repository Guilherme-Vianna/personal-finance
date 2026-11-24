import { formatMoney, formatMoneyShort, formatPercent } from "@/lib/format";

// Keeps a bar's tooltip inside the chart: the outer bars would otherwise be clipped on narrow screens.
export function barTooltipPosition(index: number, length: number) {
  if (index < length / 3) return "left-0";
  if (index >= (length * 2) / 3) return "right-0";
  return "left-1/2 -translate-x-1/2";
}

export function StatCard({ label, value, detail, highlight = false, tone }: { label: string; value: string; detail: string; highlight?: boolean; tone?: "good" | "bad" }) {
  return (
    <div className={`lift min-w-0 rounded-lg border p-4 shadow-card sm:p-5 ${highlight ? "chalkboard border-transparent text-chalk" : "border-border bg-surface"}`}>
      <p className={`text-[11px] font-bold tracking-wider uppercase ${highlight ? "text-chalk/70" : "text-muted"}`}>{label}</p>
      <p
        className={`mt-1.5 line-clamp-2 leading-tight font-semibold tracking-tight tabular-nums break-words ${
          highlight ? `text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl ${tone === "bad" ? "text-orange-300" : ""}` : `${value.length > 12 ? "text-base sm:text-lg" : "text-2xl sm:text-3xl"} ${tone === "bad" ? "text-danger" : tone === "good" ? "text-brand-700" : "text-ink"}`
        }`}
      >
        {value}
      </p>
      <p className={`mt-0.5 text-xs ${highlight ? "text-chalk/70" : "text-muted"}`}>{detail}</p>
    </div>
  );
}

type Slice = { id: string; name: string; color: string; amount: number; count: number; percent: number; outsideBudget?: boolean };

export function CategoryDonut({ data, total, caption = "no mês" }: { data: Slice[]; total: number; caption?: string }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const lengths = data.map((category) => (total ? (category.amount / total) * circumference : 0));
  const offsets = lengths.map((_, index) => lengths.slice(0, index).reduce((sum, length) => sum + length, 0));
  return (
    <div className="relative mx-auto size-44 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label="Distribuição de gastos por categoria">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--color-brand-50)" strokeWidth="14" />
        {data.map((category, index) => (
          <circle key={category.id} cx="50" cy="50" r={radius} fill="none" stroke={category.color} strokeWidth="14" strokeDasharray={`${lengths[index]} ${circumference - lengths[index]}`} strokeDashoffset={-offsets[index]}>
            <title>{`${category.name}: ${formatMoney(category.amount)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold tabular-nums">{formatMoney(total, { round: true })}</span>
        <span className="text-xs text-muted">{caption}</span>
      </div>
    </div>
  );
}

export function CategoryTable({ data }: { data: Slice[] }) {
  const max = Math.max(...data.map((category) => category.amount), 0.01);
  return (
    <ul className="flex w-full flex-col gap-3">
      {data.map((category) => (
        <li key={category.id}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 font-semibold">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: category.color }} />
              <span className="truncate">{category.name}</span>
              {category.outsideBudget && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500 uppercase">fora</span>}
            </span>
            <span className="shrink-0 text-muted tabular-nums">
              <strong className="text-ink">{formatMoney(category.amount)}</strong> · {formatPercent(category.percent)}
              <span className="hidden sm:inline"> · {category.count}x</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-brand-50">
            <div className="bar-grow h-2 rounded-full" style={{ width: `${(category.amount / max) * 100}%`, background: category.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

type SeriesPoint = { key: string; label: string; amount: number; segments: { color: string; amount: number; label?: string }[]; future?: boolean };

function niceStep(max: number) {
  const raw = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const steps = [1, 2, 2.5, 5, 10].map((s) => s * magnitude);
  return steps.find((s) => s >= raw) ?? raw;
}

export function SeriesChart({ series, reference, referenceLabel, short = (p) => p.label.slice(0, 2) }: { series: SeriesPoint[]; reference?: number; referenceLabel?: string; short?: (point: SeriesPoint) => string }) {
  const max = Math.max(...series.map((point) => point.amount), reference ?? 0, 1);
  const step = niceStep(max);
  const top = step * 4;
  const labelEvery = series.length > 31 ? 7 : series.length > 14 ? 3 : 1;
  return (
    <div className="flex gap-2">
      <div className="flex h-48 flex-col justify-between pb-5 text-right text-[10px] text-muted tabular-nums">
        {[4, 3, 2, 1, 0].map((i) => (
          <span key={i}>{formatMoneyShort(step * i).replace("R$ ", "")}</span>
        ))}
      </div>
      {/* rtl makes the scroller start at the end: the most recent days are what matters on a phone. */}
      <div className="min-w-0 flex-1 overflow-x-auto [direction:rtl]">
        <div className="relative flex h-48 items-end gap-[3px] [direction:ltr]" style={{ minWidth: series.length * 10 }}>
          <div className="pointer-events-none absolute inset-x-0 top-0 bottom-5 flex flex-col justify-between">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="border-t border-dashed border-brand-100" />
            ))}
          </div>
          {reference !== undefined && reference > 0 && (
            <div className="pointer-events-none absolute inset-x-0 z-[1] border-t-2 border-dashed border-pencil" style={{ bottom: `calc(1.25rem + (100% - 1.25rem) * ${reference / top})` }}>
              <span className="absolute -top-4 right-0 rounded bg-pencil-soft px-1 text-[10px] font-bold text-amber-800">{referenceLabel}</span>
            </div>
          )}
          {series.map((point, index) => (
            <div key={point.key} tabIndex={0} className={`group relative flex h-full min-w-0 flex-1 flex-col justify-end outline-none ${point.future ? "opacity-40" : ""}`}>
              <div className="bar-rise flex flex-col-reverse overflow-hidden rounded-t-md" style={{ height: `calc((100% - 1.25rem) * ${point.amount / top})` }}>
                {point.segments.map((segment) => (
                  <div key={segment.color + segment.label} style={{ height: `${(segment.amount / point.amount) * 100}%`, background: segment.color }} />
                ))}
              </div>
              <span className="h-5 pt-1 text-center text-[10px] text-muted">{index % labelEvery === 0 ? short(point) : ""}</span>
              <span className={`pointer-events-none absolute top-0 z-10 hidden rounded-lg bg-ink px-2 py-1 text-xs whitespace-nowrap text-white group-hover:block group-focus:block ${barTooltipPosition(index, series.length)}`}>
                {point.label}: {formatMoney(point.amount)}
                {point.segments.slice(0, 3).map((segment) => (
                  <span key={segment.color + segment.label} className="block text-[11px] text-white/70">
                    {segment.label}: {formatMoney(segment.amount)}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function WeekdayChart({ data }: { data: { key: string; label: string; amount: number }[] }) {
  const max = Math.max(...data.map((day) => day.amount), 0.01);
  return (
    <div className="flex h-40 items-end gap-1 sm:gap-2">
      {data.map((day) => (
        <div key={day.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[10px] font-semibold whitespace-nowrap text-muted tabular-nums sm:text-[11px]">{day.amount ? formatMoneyShort(day.amount).replace("R$ ", "") : ""}</span>
          <div
            className={`bar-rise w-full rounded-t-lg ${day.key === "0" || day.key === "6" ? "bg-brand-300" : "bg-brand-600"}`}
            style={{ height: `calc((100% - 2.5rem) * ${day.amount / max})`, minHeight: day.amount ? 4 : 0 }}
          />
          <span className="text-xs font-semibold text-muted">{day.label}</span>
        </div>
      ))}
    </div>
  );
}

export function MethodList({ data }: { data: { key: string; label: string; icon: string; amount: number; count: number; share: number }[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {data.map((method) => (
        <li key={method.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="font-semibold">
              {method.icon} {method.label}
            </span>
            <span className="text-muted tabular-nums">
              <strong className="text-ink">{formatMoney(method.amount)}</strong> · {formatPercent(method.share)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-brand-50">
            <div className="bar-grow h-2 rounded-full bg-brand-500" style={{ width: `${method.share * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function RankingList({ data }: { data: { key: string; label: string; amount: number; count: number; average: number; color: string; share: number }[] }) {
  return (
    <ol className="flex flex-col divide-y divide-border">
      {data.map((item, index) => (
        <li key={item.key} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{item.label}</p>
            <p className="text-xs text-muted">
              {item.count}x · média {formatMoney(item.average)}
            </p>
          </div>
          <div className="text-right">
            <p className="font-bold tabular-nums">{formatMoney(item.amount)}</p>
            <p className="text-xs text-muted">{formatPercent(item.share)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

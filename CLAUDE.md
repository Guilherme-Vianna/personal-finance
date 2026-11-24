@AGENTS.md

# CLAUDE.md

## Rules for the AI

- Keep this file accurate: update it in the same change that alters structure, stack, commands or conventions.
- Code, identifiers and docs for developers are in English. User-facing copy is in Brazilian Portuguese (pt-BR).
- No comments in code unless the reason is not obvious from the code itself.
- Every new environment variable goes into `.env.example`.
- pnpm is the package manager.

## Project

Personal finance tracker (monthly personal budget, fixed bills/incomes, goals), ported from the "Livro Folha" spreadsheet.
Sibling of personal-life-hours-tracker: same stack, UX and conventions.

- Next.js 16 App Router with Cache Components + Partial Prefetching. Pages live in the `(app)` route group (shell layout).
- Anything that reads the DB, `searchParams`/`params` or "today" must be inside `<Suspense>` and call `await connection()`
  first. `usePathname`/`useSearchParams` also need a `<Suspense>` boundary.
- Don't export constants from `"use client"` modules for server code to use (they become client references); put them in `src/lib`.
- Data: Drizzle ORM (`src/db/schema.ts`, migrations in `drizzle/`). `src/db/index.ts` uses Neon HTTP for `*.neon.tech`
  and node-postgres otherwise (local docker compose on port 5434). No interactive transactions (Neon HTTP).
- Money is `numeric(12,2)` read as JS numbers; format with `formatMoney`, parse user input with `parseMoney` (accepts `12,50`).
- Business logic lives in `src/lib/services/*` (server-only). Route handlers in `src/app/api/*` are thin wrappers using
  `handle()` from `src/lib/api-errors.ts` (Zod → 422 with `fieldErrors`, `ApiError` → its status).
- Server pages read services directly; client components mutate through `/api/*` with `apiRequest` and then `router.refresh()`.
- Dates are `YYYY-MM-DD` strings, months `YYYY-MM`; "today" is `todayISO()` in `NEXT_PUBLIC_TIME_ZONE` (default America/Sao_Paulo).
- Categories have `kind` (`expense` | `income`) and `outsideBudget`. Expenses outside the budget don't consume the personal budget;
  income transactions not outside the budget raise that month's personal budget ("Extra").
- Recurring items (`recurring`: income | expense | investment) are never materialized: `src/lib/recurring.ts` expands them per
  month between `startMonth` and `endMonth` (installments set `endMonth = start + n - 1`). `recurring_overrides` changes one
  month's amount or skips it (`amount` null). Investments linked to a goal count as deposits on each past due date.
- Budget math is pure in `src/lib/budget.ts` (`monthSummary`, mirrors the spreadsheet's "Restante Total" and "Gasto Diário
  Esperado"); goal progress in `src/lib/goals.ts`; `/analises` math in `src/lib/insights.ts`.
- AI receipt import (`src/lib/services/ai-import.ts`) uses Gemini via `@google/genai` with a JSON schema generated from Zod
  (`z.toJSONSchema`) and validates the reply with the same schema. Nothing is saved until the user confirms the review.
- No authentication by design (single-user app); don't introduce it unless asked.
- Theme, motion and mobile rules are the same as the sibling app: tokens in `src/app/globals.css`, `PageSuspense`, `stagger`,
  `lift`, `Modal` as bottom sheet below `sm`, `FormActions`, 16px inputs on phones, 40px touch targets, `pointer-fine:` for
  hover-only UI, explicit grid columns with `minmax(0,…)`, rtl scrollers for charts.

## Commands

- `pnpm dev` / `pnpm build` / `pnpm lint` / `pnpm typecheck`
- `pnpm db:generate` (after schema changes) / `pnpm db:migrate` / `pnpm db:studio`
- `pnpm db:import <file.xlsx> [--parcelas-ref=YYYY-MM]` imports the spreadsheet idempotently

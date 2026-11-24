// Imports the "Livro Folha" spreadsheet: pnpm db:import <file.xlsx> [--parcelas-ref=YYYY-MM]
import { config } from "dotenv";
import { and, count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import ExcelJS from "exceljs";
import { categories, recurring, settings, transactions, type CategoryKind, type PaymentMethod, type RecurringKind } from "../src/db/schema";
import { addMonths } from "../src/lib/dates";
import { CATEGORY_COLORS } from "../src/lib/format";

config({ path: [".env.local", ".env"] });

type Cell = ExcelJS.CellValue;

const PRETTY: Record<string, string> = {
  basico: "Básico",
  servicos: "Serviços",
  educacao: "Educação",
  salario: "Salário",
  beneficios: "Benefícios",
  roles: "Rolês",
  temporario: "Temporário",
  energetico: "Energético",
};
const INCOME_CATEGORIES = ["salario", "beneficios", "extra"];
const OUTSIDE_BUDGET = ["livros"];
const METHODS: Record<string, PaymentMethod> = { credito: "credit", debito: "debit", ticket: "voucher", pix: "pix", dinheiro: "cash" };

function key(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function text(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "result" in value) return text(value.result as Cell);
  if (typeof value === "object" && "richText" in value) return value.richText.map((part) => part.text).join("");
  return String(value).trim();
}

function num(value: Cell): number {
  if (typeof value === "object" && value && "result" in value) return num(value.result as Cell);
  return typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
}

function isoDate(value: Cell): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && value && "result" in value) return isoDate(value.result as Cell);
  return null;
}

function cell(sheet: ExcelJS.Worksheet, row: number, col: number) {
  return sheet.getRow(row).getCell(col).value;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Uso: pnpm db:import <arquivo.xlsx> [--parcelas-ref=YYYY-MM]");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada");

  const db = drizzle(process.env.DATABASE_URL);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);

  const monthSheets = workbook.worksheets
    .map((sheet) => {
      const match = sheet.name.match(/(\d{2})-(\d{4})/);
      return match ? { sheet, month: `${match[2]}-${match[1]}` } : null;
    })
    .filter((item): item is { sheet: ExcelJS.Worksheet; month: string } => item !== null)
    .sort((a, b) => (a.month < b.month ? -1 : 1));
  const firstMonth = monthSheets[0]?.month ?? new Date().toISOString().slice(0, 7);
  const refArg = process.argv.find((arg) => arg.startsWith("--parcelas-ref="))?.split("=")[1];
  const installmentsRef = refArg && /^\d{4}-\d{2}$/.test(refArg) ? refArg : (monthSheets.at(-1)?.month ?? firstMonth);

  const categoryIds = new Map<string, string>();
  async function ensureCategory(raw: string) {
    const k = key(raw);
    if (categoryIds.has(k)) return categoryIds.get(k)!;
    const name = PRETTY[k] ?? raw.trim().replace(/^\w/, (c) => c.toUpperCase());
    const kind: CategoryKind = INCOME_CATEGORIES.includes(k) ? "income" : "expense";
    const [existing] = await db.select().from(categories).where(eq(categories.name, name));
    const id =
      existing?.id ??
      (await db.insert(categories).values({ name, kind, outsideBudget: OUTSIDE_BUDGET.includes(k), color: CATEGORY_COLORS[categoryIds.size % CATEGORY_COLORS.length] }).returning())[0].id;
    categoryIds.set(k, id);
    return id;
  }

  // ---------- Orçamento: fixed bills, incomes, personal budget, investments ----------
  const budget = workbook.getWorksheet("Orcamento");
  let recurringCreated = 0;
  async function ensureRecurring(rawName: string, amount: number, kind: RecurringKind, categoryName: string | null) {
    const installment = rawName.match(/\((\d+)\s*\/\s*(\d+)\)/);
    const name = rawName.replace(/\((\d+)\s*\/\s*(\d+)\)/, "").trim();
    const [existing] = await db.select({ id: recurring.id }).from(recurring).where(eq(recurring.name, name));
    if (existing) return;
    const categoryId = categoryName ? await ensureCategory(categoryName) : null;
    const total = installment ? Number(installment[2]) : null;
    const startMonth = installment ? addMonths(installmentsRef, -(Number(installment[1]) - 1)) : firstMonth;
    await db.insert(recurring).values({
      name,
      kind,
      categoryId,
      amount,
      dayOfMonth: kind === "income" ? 5 : 10,
      startMonth,
      installments: total,
      endMonth: total ? addMonths(startMonth, total - 1) : null,
      notes: installment ? `Importado da planilha (parcela ${installment[1]}/${installment[2]} em ${installmentsRef})` : "Importado da planilha",
    });
    recurringCreated += 1;
  }

  if (budget) {
    const headerRows: number[] = [];
    budget.eachRow((row, number) => {
      if (text(row.getCell(1).value) === "Nome") headerRows.push(number);
    });
    const block = (start: number, col: number) => {
      const rows: { name: string; amount: number; category: string }[] = [];
      for (let r = start + 1; r < start + 200; r++) {
        const name = text(cell(budget, r, col));
        const amount = num(cell(budget, r, col + 1));
        if (!name) break;
        if (amount > 0) rows.push({ name, amount, category: text(cell(budget, r, col + 2)) });
      }
      return rows;
    };
    const [fixedHeader, personalHeader, investmentHeader] = headerRows;
    if (fixedHeader) {
      for (const row of block(fixedHeader, 1)) await ensureRecurring(row.name, row.amount, "expense", row.category || "Básico");
      for (const row of block(fixedHeader, 5)) await ensureRecurring(row.name, row.amount, "income", row.category || "Salário");
    }
    if (investmentHeader) for (const row of block(investmentHeader, 1)) await ensureRecurring(row.name, row.amount, "investment", null);
    const personalBudget = personalHeader ? block(personalHeader, 1).reduce((t, row) => t + row.amount, 0) : 0;
    const percents = [num(cell(budget, 10, 5)), num(cell(budget, 10, 6)), num(cell(budget, 10, 7))];
    const split = percents.every((p) => Number.isFinite(p)) && percents.reduce((a, b) => a + b, 0) === 100 ? percents : [50, 20, 30];
    const values = { personalBudget, splitEssentials: split[0], splitPersonal: split[1], splitInvestments: split[2] };
    await db.insert(settings).values({ id: 1, ...values }).onConflictDoUpdate({ target: settings.id, set: values });
    console.log(`Orçamento: ${recurringCreated} item(ns) programados · pessoal ${personalBudget} · divisão ${split.join("/")} · parcelas contadas a partir de ${installmentsRef}`);
  }

  // ---------- Monthly sheets: variable spending ----------
  let created = 0;
  let skipped = 0;
  const seenInFile = new Map<string, number>();
  async function addTransaction(values: { date: string; description: string; amount: number; categoryId: string; method: PaymentMethod | null; notes: string | null }) {
    const k = `${values.date}|${values.description}|${values.categoryId}|${values.amount}`;
    seenInFile.set(k, (seenInFile.get(k) ?? 0) + 1);
    const [{ value: inDb }] = await db
      .select({ value: count() })
      .from(transactions)
      .where(and(eq(transactions.date, values.date), eq(transactions.description, values.description), eq(transactions.categoryId, values.categoryId), eq(transactions.amount, values.amount)));
    if (inDb >= seenInFile.get(k)!) {
      skipped += 1;
      return;
    }
    await db.insert(transactions).values(values);
    created += 1;
  }

  for (const { sheet, month } of monthSheets) {
    let headerRow = 0;
    sheet.eachRow((row, number) => {
      if (!headerRow && text(row.getCell(1).value) === "Nome") headerRow = number;
    });
    if (!headerRow) continue;
    const header = (sheet.getRow(headerRow).values as Cell[]).map(text);
    const nameCols = header.map((value, index) => (value === "Nome" ? index : -1)).filter((index) => index > 0);
    const groups = nameCols.map((start, i) => {
      const end = nameCols[i + 1] ?? header.length;
      const col = (label: string) => {
        for (let c = start; c < end; c++) if (header[c] === label) return c;
        return -1;
      };
      return { main: i === 0, name: start, amount: col("Valor"), method: col("Origem"), date: col("Data"), category: col("Categoria") };
    });

    // "Extra" next to "Restante Total" raises that month's personal budget.
    sheet.eachRow((row) => {
      (row.values as Cell[]).forEach((value, index) => {
        if (text(value) === "Extra") {
          const amount = num((row.values as Cell[])[index + 1]);
          if (amount > 0) pendingExtras.push({ month, amount });
        }
      });
    });

    for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
      for (const group of groups) {
        const description = text(cell(sheet, r, group.name));
        const amount = num(cell(sheet, r, group.amount));
        if (!description || !(amount > 0)) continue;
        const date = group.date > 0 ? isoDate(cell(sheet, r, group.date)) : null;
        const categoryName = group.main ? text(cell(sheet, r, group.category)) || "Outros" : "Livros";
        const methodKey = group.method > 0 ? key(text(cell(sheet, r, group.method))) : "";
        await addTransaction({
          date: date ?? `${month}-01`,
          description: description.replace(/\s+/g, " "),
          amount: Math.round(amount * 100) / 100,
          categoryId: await ensureCategory(categoryName),
          method: METHODS[methodKey] ?? null,
          notes: date ? null : "Sem data na planilha",
        });
      }
    }
  }
  for (const extra of pendingExtras) {
    await addTransaction({ date: `${extra.month}-01`, description: "Extra", amount: extra.amount, categoryId: await ensureCategory("Extra"), method: null, notes: "Extra do mês na planilha" });
  }
  console.log(`Gastos: ${created} importados, ${skipped} já existiam · ${categoryIds.size} categorias`);

  await db.$client.end();
}

const pendingExtras: { month: string; amount: number }[] = [];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { relations } from "drizzle-orm";
import { boolean, date, index, integer, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: "number" });

export const CATEGORY_KINDS = ["expense", "income"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const PAYMENT_METHODS = ["credit", "debit", "pix", "cash", "voucher"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const RECURRING_KINDS = ["income", "expense", "investment"] as const;
export type RecurringKind = (typeof RECURRING_KINDS)[number];

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  color: text("color").notNull().default("#2563eb"),
  kind: text("kind", { enum: CATEGORY_KINDS }).notNull().default("expense"),
  outsideBudget: boolean("outside_budget").notNull().default(false),
  ...timestamps,
});

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  targetAmount: money("target_amount").notNull(),
  deadline: date("deadline", { mode: "string" }),
  status: text("status", { enum: ["active", "completed"] }).notNull().default("active"),
  color: text("color").notNull().default("#2563eb"),
  ...timestamps,
});

export const goalDeposits = pgTable(
  "goal_deposits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    amount: money("amount").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [index("goal_deposits_goal_idx").on(table.goalId)],
);

export const recurring = pgTable("recurring", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: text("kind", { enum: RECURRING_KINDS }).notNull(),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
  amount: money("amount").notNull(),
  dayOfMonth: integer("day_of_month").notNull().default(1),
  startMonth: text("start_month").notNull(),
  endMonth: text("end_month"),
  installments: integer("installments"),
  lentTo: text("lent_to"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

// A single month of a recurring item that differs from the plan: another amount, or skipped (amount null).
export const recurringOverrides = pgTable(
  "recurring_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recurringId: uuid("recurring_id")
      .notNull()
      .references(() => recurring.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    amount: money("amount"),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [unique("recurring_overrides_month_unique").on(table.recurringId, table.month)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date", { mode: "string" }).notNull(),
    description: text("description").notNull(),
    amount: money("amount").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    method: text("method", { enum: PAYMENT_METHODS }),
    lentTo: text("lent_to"),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [index("transactions_date_idx").on(table.date), index("transactions_category_idx").on(table.categoryId)],
);

// Money someone paid back for what was lent to them (transactions or installments with lentTo).
export const loanRepayments = pgTable("loan_repayments", {
  id: uuid("id").primaryKey().defaultRandom(),
  person: text("person").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  amount: money("amount").notNull(),
  notes: text("notes"),
  ...timestamps,
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  personalBudget: money("personal_budget").notNull().default(0),
  splitEssentials: integer("split_essentials").notNull().default(50),
  splitPersonal: integer("split_personal").notNull().default(20),
  splitInvestments: integer("split_investments").notNull().default(30),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const transactionsRelations = relations(transactions, ({ one }) => ({
  category: one(categories, { fields: [transactions.categoryId], references: [categories.id] }),
}));

export type Category = typeof categories.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type GoalDeposit = typeof goalDeposits.$inferSelect;
export type Recurring = typeof recurring.$inferSelect;
export type RecurringOverride = typeof recurringOverrides.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type LoanRepayment = typeof loanRepayments.$inferSelect;
export type Settings = typeof settings.$inferSelect;

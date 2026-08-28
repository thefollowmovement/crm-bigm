import "server-only";

import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { dpsPurchases, storeExpenses, stores } from "@/db/schema";
import { auditedDelete, auditedInsert } from "@/lib/db/audited";
import { assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { fromCents, toCents } from "@/lib/money";
import { sumStoreRevenueByMonth } from "@/services/acct-analytics.service";

// Rentabilité des boutiques en propre (cdc §16) : le P&L mensuel se dérive
// CA − achats DPS − dépenses par catégorie. Tout en centimes entiers.
// Depuis l'étape 52, le CA vient du journal comptable (classe 7 HT des
// structures rattachées à la succursale via acctStructures.storeId).

type ExpenseRow = typeof storeExpenses.$inferSelect;
type ExpenseCategory = ExpenseRow["category"];

// ── Décisions pures (testées en unit) ────────────────────────────

// Ratio en % (une décimale) sur des CENTIMES entiers ; null si dénominateur nul.
export function ratioPct(numeratorCents: number, denominatorCents: number): number | null {
  if (denominatorCents === 0) return null;
  return Math.round((numeratorCents * 1000) / denominatorCents) / 10;
}

export function computeResult(
  revenue: string,
  purchases: string,
  expenses: string
): string {
  return fromCents(toCents(revenue) - toCents(purchases) - toCents(expenses));
}

// ── Helpers ──────────────────────────────────────────────────────

async function requireBranch(storeId: string) {
  const store = await db.query.stores.findFirst({ where: eq(stores.id, storeId) });
  if (!store) throw new Error("Boutique introuvable.");
  if (store.type !== "SUCCURSALE") {
    throw new Error("Les dépenses ne se saisissent que pour une succursale.");
  }
  return store;
}

// ── Lectures ─────────────────────────────────────────────────────

export async function listBranches(actor: SessionUser) {
  assertCan(actor, "branch:read");
  return db.query.stores.findMany({
    where: eq(stores.type, "SUCCURSALE"),
    columns: { id: true, code: true, name: true, city: true, status: true },
  });
}

export async function listExpenses(
  actor: SessionUser,
  storeId: string,
  year: number
) {
  assertCan(actor, "branch:read");
  return db.query.storeExpenses.findMany({
    where: and(
      eq(storeExpenses.storeId, storeId),
      gte(storeExpenses.expenseDate, `${year}-01-01`),
      lte(storeExpenses.expenseDate, `${year}-12-31`)
    ),
    with: { enteredBy: { columns: { firstName: true, lastName: true } } },
    orderBy: [desc(storeExpenses.expenseDate)],
  });
}

export type BranchMonth = {
  month: string; // "YYYY-MM"
  revenue: string;
  purchases: string;
  expenses: string;
  expensesByCategory: Partial<Record<ExpenseCategory, string>>;
  result: string;
  marginPct: number | null;
};

// P&L mensuel d'une succursale sur une année civile — sommes en SQL,
// combinaisons en centimes entiers.
export async function getBranchPnL(
  actor: SessionUser,
  storeId: string,
  year: number
): Promise<BranchMonth[]> {
  assertCan(actor, "branch:read");
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const monthExpr = (col: unknown) => sql<string>`to_char(${col}, 'YYYY-MM')`;

  const [revenueRows, purchaseRows, expenseRows] = await Promise.all([
    sumStoreRevenueByMonth({ from, to, storeId }).then((rows) =>
      rows.map((r) => ({ month: r.month, total: r.revenueHT }))
    ),
    db
      .select({
        month: monthExpr(dpsPurchases.date).as("month"),
        total: sql<string>`COALESCE(SUM(${dpsPurchases.amount}), 0)::numeric(12,2)::text`,
      })
      .from(dpsPurchases)
      .where(
        and(
          eq(dpsPurchases.storeId, storeId),
          gte(dpsPurchases.date, from),
          lte(dpsPurchases.date, to)
        )
      )
      .groupBy(sql`1`),
    db
      .select({
        month: monthExpr(storeExpenses.expenseDate).as("month"),
        category: storeExpenses.category,
        total: sql<string>`COALESCE(SUM(${storeExpenses.amount}), 0)::numeric(12,2)::text`,
      })
      .from(storeExpenses)
      .where(
        and(
          eq(storeExpenses.storeId, storeId),
          gte(storeExpenses.expenseDate, from),
          lte(storeExpenses.expenseDate, to)
        )
      )
      .groupBy(sql`1`, storeExpenses.category),
  ]);

  const months = new Map<string, BranchMonth>();
  const getMonth = (month: string): BranchMonth => {
    const existing = months.get(month);
    if (existing) return existing;
    const created: BranchMonth = {
      month,
      revenue: "0.00",
      purchases: "0.00",
      expenses: "0.00",
      expensesByCategory: {},
      result: "0.00",
      marginPct: null,
    };
    months.set(month, created);
    return created;
  };

  for (const row of revenueRows) getMonth(row.month).revenue = row.total;
  for (const row of purchaseRows) getMonth(row.month).purchases = row.total;
  for (const row of expenseRows) {
    const entry = getMonth(row.month);
    entry.expensesByCategory[row.category] = row.total;
    entry.expenses = fromCents(toCents(entry.expenses) + toCents(row.total));
  }

  for (const entry of months.values()) {
    entry.result = computeResult(entry.revenue, entry.purchases, entry.expenses);
    entry.marginPct = ratioPct(toCents(entry.result), toCents(entry.revenue));
  }

  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

// Vue d'ensemble : totaux annuels par succursale.
export async function getBranchesOverview(actor: SessionUser, year: number) {
  assertCan(actor, "branch:read");
  const branches = await listBranches(actor);
  const result = [];
  for (const branch of branches) {
    const months = await getBranchPnL(actor, branch.id, year);
    let revenueCents = 0;
    let purchasesCents = 0;
    let expensesCents = 0;
    for (const m of months) {
      revenueCents += toCents(m.revenue);
      purchasesCents += toCents(m.purchases);
      expensesCents += toCents(m.expenses);
    }
    const resultCents = revenueCents - purchasesCents - expensesCents;
    result.push({
      ...branch,
      revenue: fromCents(revenueCents),
      purchases: fromCents(purchasesCents),
      expenses: fromCents(expensesCents),
      result: fromCents(resultCents),
      marginPct: ratioPct(resultCents, revenueCents),
    });
  }
  return result;
}

// ── Écritures ────────────────────────────────────────────────────

export type ExpenseInput = {
  storeId: string;
  expenseDate: string;
  category: ExpenseCategory;
  amount: string;
  label: string | null;
};

export async function addExpense(actor: SessionUser, input: ExpenseInput) {
  assertCan(actor, "branch:write");
  await requireBranch(input.storeId);
  return auditedInsert({ id: actor.id }, storeExpenses, {
    ...input,
    enteredById: actor.id,
  });
}

export async function deleteExpense(actor: SessionUser, id: string) {
  assertCan(actor, "branch:write");
  const existing = await db.query.storeExpenses.findFirst({
    where: eq(storeExpenses.id, id),
  });
  if (!existing) throw new Error("Dépense introuvable.");
  await auditedDelete({ id: actor.id }, storeExpenses, id);
}

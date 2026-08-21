import "server-only";

import { and, desc, eq, gte, lt, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { companyBudgets, companyFlows, invoices, partners } from "@/db/schema";
import { auditedDelete, auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { fromCents, toCents } from "@/lib/money";

// Tableau financier de la tête de réseau (cdc §5) : flux réels + budgets,
// résultat/écarts dérivés en centimes entiers.

type FlowRow = typeof companyFlows.$inferSelect;
export type FlowCategory = FlowRow["category"];
export type FlowDirection = "ENTREE" | "SORTIE";

// ── Décisions pures (testées en unit) ────────────────────────────

// Le sens d'un flux se dérive de sa catégorie — map exhaustive.
export const CATEGORY_DIRECTION: Record<FlowCategory, FlowDirection> = {
  DROIT_ENTREE: "ENTREE",
  REDEVANCE: "ENTREE",
  REDEVANCE_COMMUNICATION: "ENTREE",
  PRESTATION: "ENTREE",
  AUTRE_ENTREE: "ENTREE",
  PARTENAIRES: "SORTIE",
  COMMUNICATION: "SORTIE",
  SALAIRES: "SORTIE",
  LOGICIELS: "SORTIE",
  PRESTATAIRES: "SORTIE",
  FRAIS_GENERAUX: "SORTIE",
  AUTRE_SORTIE: "SORTIE",
};

export const FLOW_CATEGORIES = Object.keys(CATEGORY_DIRECTION) as FlowCategory[];

// Écart réel − budget, en strings exactes.
export function computeVariance(actual: string, budget: string): string {
  return fromCents(toCents(actual) - toCents(budget));
}

// ── Lectures ─────────────────────────────────────────────────────

function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export async function listFlows(
  actor: SessionUser,
  filters: { year: number; month?: number }
) {
  assertCan(actor, "company-finance:read");
  const from = filters.month
    ? monthStart(filters.year, filters.month)
    : `${filters.year}-01-01`;
  // borne EXCLUSIVE : premier jour du mois/de l'année suivant(e)
  const toExclusive = filters.month
    ? filters.month === 12
      ? monthStart(filters.year + 1, 1)
      : monthStart(filters.year, filters.month + 1)
    : monthStart(filters.year + 1, 1);

  return db.query.companyFlows.findMany({
    where: and(
      gte(companyFlows.flowDate, from),
      lt(companyFlows.flowDate, toExclusive)
    ),
    with: {
      invoice: { columns: { id: true, number: true } },
      partner: { columns: { id: true, companyName: true } },
      enteredBy: { columns: { firstName: true, lastName: true } },
    },
    orderBy: [desc(companyFlows.flowDate), desc(companyFlows.createdAt)],
  });
}

export type StatementLine = {
  category: FlowCategory;
  direction: FlowDirection;
  actual: string;
  budget: string;
  variance: string;
};

// Réel vs budget d'un mois, par catégorie + totaux entrées/sorties/résultat.
export async function getMonthlyStatement(
  actor: SessionUser,
  year: number,
  month: number
) {
  assertCan(actor, "company-finance:read");
  const from = monthStart(year, month);
  const toExclusive = month === 12 ? monthStart(year + 1, 1) : monthStart(year, month + 1);

  const [actualRows, budgetRows] = await Promise.all([
    db
      .select({
        category: companyFlows.category,
        total: sql<string>`COALESCE(SUM(${companyFlows.amount}), 0)::numeric(12,2)::text`,
      })
      .from(companyFlows)
      .where(
        and(
          gte(companyFlows.flowDate, from),
          lt(companyFlows.flowDate, toExclusive)
        )
      )
      .groupBy(companyFlows.category),
    db.query.companyBudgets.findMany({
      where: and(eq(companyBudgets.year, year), eq(companyBudgets.month, month)),
    }),
  ]);

  const actualByCategory = new Map(actualRows.map((r) => [r.category, r.total]));
  const budgetByCategory = new Map(budgetRows.map((r) => [r.category, r.amount]));

  const lines: StatementLine[] = FLOW_CATEGORIES.map((category) => {
    const actual = actualByCategory.get(category) ?? "0.00";
    const budget = budgetByCategory.get(category) ?? "0.00";
    return {
      category,
      direction: CATEGORY_DIRECTION[category],
      actual,
      budget,
      variance: computeVariance(actual, budget),
    };
  });

  let inCents = 0;
  let outCents = 0;
  let inBudgetCents = 0;
  let outBudgetCents = 0;
  for (const line of lines) {
    if (line.direction === "ENTREE") {
      inCents += toCents(line.actual);
      inBudgetCents += toCents(line.budget);
    } else {
      outCents += toCents(line.actual);
      outBudgetCents += toCents(line.budget);
    }
  }

  return {
    lines,
    totals: {
      entries: fromCents(inCents),
      exits: fromCents(outCents),
      result: fromCents(inCents - outCents),
      budgetEntries: fromCents(inBudgetCents),
      budgetExits: fromCents(outBudgetCents),
      budgetResult: fromCents(inBudgetCents - outBudgetCents),
    },
  };
}

// Entrées / sorties / résultat par mois d'une année.
export async function getYearSummary(actor: SessionUser, year: number) {
  assertCan(actor, "company-finance:read");
  const rows = await db
    .select({
      month: sql<string>`to_char(${companyFlows.flowDate}, 'YYYY-MM')`.as("month"),
      category: companyFlows.category,
      total: sql<string>`COALESCE(SUM(${companyFlows.amount}), 0)::numeric(12,2)::text`,
    })
    .from(companyFlows)
    .where(
      and(
        gte(companyFlows.flowDate, `${year}-01-01`),
        lte(companyFlows.flowDate, `${year}-12-31`)
      )
    )
    .groupBy(sql`1`, companyFlows.category);

  const months = new Map<string, { entries: number; exits: number }>();
  for (const row of rows) {
    const entry = months.get(row.month) ?? { entries: 0, exits: 0 };
    if (CATEGORY_DIRECTION[row.category] === "ENTREE") {
      entry.entries += toCents(row.total);
    } else {
      entry.exits += toCents(row.total);
    }
    months.set(row.month, entry);
  }

  return [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, totals]) => ({
      month,
      entries: fromCents(totals.entries),
      exits: fromCents(totals.exits),
      result: fromCents(totals.entries - totals.exits),
    }));
}

// Ventilation annuelle des sorties par catégorie.
export async function getExpenseBreakdown(actor: SessionUser, year: number) {
  assertCan(actor, "company-finance:read");
  const rows = await db
    .select({
      category: companyFlows.category,
      total: sql<string>`COALESCE(SUM(${companyFlows.amount}), 0)::numeric(12,2)::text`,
    })
    .from(companyFlows)
    .where(
      and(
        gte(companyFlows.flowDate, `${year}-01-01`),
        lte(companyFlows.flowDate, `${year}-12-31`)
      )
    )
    .groupBy(companyFlows.category);

  return rows
    .filter((r) => CATEGORY_DIRECTION[r.category] === "SORTIE")
    .sort((a, b) => toCents(b.total) - toCents(a.total));
}

export async function listBudgets(actor: SessionUser, year: number) {
  assertCan(actor, "company-finance:read");
  return db.query.companyBudgets.findMany({
    where: eq(companyBudgets.year, year),
    orderBy: [companyBudgets.month, companyBudgets.category],
  });
}

// ── Écritures ────────────────────────────────────────────────────

export type FlowInput = {
  flowDate: string;
  category: FlowCategory;
  amount: string;
  label: string | null;
  invoiceId: string | null;
  partnerId: string | null;
};

export async function addFlow(actor: SessionUser, input: FlowInput) {
  assertCan(actor, "company-finance:write");
  if (input.invoiceId) {
    const invoice = await db.query.invoices.findFirst({
      where: eq(invoices.id, input.invoiceId),
    });
    if (!invoice) throw new Error("Facture introuvable.");
  }
  if (input.partnerId) {
    const partner = await db.query.partners.findFirst({
      where: eq(partners.id, input.partnerId),
    });
    if (!partner) throw new Error("Partenaire introuvable.");
  }
  return auditedInsert({ id: actor.id }, companyFlows, {
    ...input,
    enteredById: actor.id,
  });
}

export async function deleteFlow(actor: SessionUser, id: string) {
  assertCan(actor, "company-finance:write");
  const existing = await db.query.companyFlows.findFirst({
    where: eq(companyFlows.id, id),
  });
  if (!existing) throw new Error("Flux introuvable.");
  await auditedDelete({ id: actor.id }, companyFlows, id);
}

export async function setBudget(
  actor: SessionUser,
  input: { year: number; month: number; category: FlowCategory; amount: string }
) {
  assertCan(actor, "company-finance:write");
  if (input.month < 1 || input.month > 12) throw new Error("Mois invalide.");
  const existing = await db.query.companyBudgets.findFirst({
    where: and(
      eq(companyBudgets.year, input.year),
      eq(companyBudgets.month, input.month),
      eq(companyBudgets.category, input.category)
    ),
  });
  if (existing) {
    return auditedUpdate({ id: actor.id }, companyBudgets, existing.id, {
      amount: input.amount,
    });
  }
  return auditedInsert({ id: actor.id }, companyBudgets, { ...input });
}

import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { monthsOfYear } from "@/lib/analytics";
import { fromCents, toCents } from "@/lib/money";

// Analytics du journal comptable (étape 52) : depuis la suppression du module
// « Finances », le CA, les charges et le résultat se lisent dans acctInvoices
// (classe 7 = produits, classe 6 = charges), montants HT, pièces annulées
// exclues, avoirs négatifs inclus. Le rattachement à une boutique passe par
// acctStructures.storeId (une structure « Boutique » liée à sa fiche réseau).
// Tout est sommé en SQL puis combiné en CENTIMES ENTIERS, jamais en float.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertPeriod(period: { from: string; to: string }) {
  if (!ISO_DATE_RE.test(period.from) || !ISO_DATE_RE.test(period.to)) {
    throw new Error("Période invalide.");
  }
}

function storeClause(storeId?: string | null) {
  return storeId
    ? sql` AND i.structure_id IN (
        SELECT id FROM acct_structures WHERE store_id = ${storeId}
      )`
    : sql``;
}

export type AcctMonthPoint = {
  month: string; // "YYYY-MM"
  revenueHT: string;
  expensesHT: string;
  result: string;
};

// Série mensuelle CA / charges / résultat sur une période.
export async function getMonthlyResults(
  actor: SessionUser,
  input: { from: string; to: string; storeId?: string | null }
): Promise<AcctMonthPoint[]> {
  assertCan(actor, "accounting:read");
  assertPeriod(input);

  const rows = await db.execute(sql`
    SELECT
      to_char(date_trunc('month', i.piece_date), 'YYYY-MM') AS month,
      COALESCE(SUM(i.amount_ht) FILTER (WHERE i.account_class = 'PRODUIT'), 0)::text AS revenue,
      COALESCE(SUM(i.amount_ht) FILTER (WHERE i.account_class = 'CHARGE'), 0)::text AS expenses
    FROM acct_invoices i
    WHERE i.status <> 'ANNULEE'
      AND i.piece_date BETWEEN ${input.from} AND ${input.to}
      ${storeClause(input.storeId)}
    GROUP BY 1
    ORDER BY 1
  `);

  return (rows.rows as { month: string; revenue: string; expenses: string }[]).map(
    (row) => {
      const revenue = fromCents(toCents(row.revenue));
      const expenses = fromCents(toCents(row.expenses));
      return {
        month: row.month,
        revenueHT: revenue,
        expensesHT: expenses,
        result: fromCents(toCents(revenue) - toCents(expenses)),
      };
    }
  );
}

export type AcctMonthComparison = {
  month: string; // "YYYY-MM" de l'année N
  current: string; // CA HT classe 7
  previous: string; // même mois N-1
};

// CA mensuel (classe 7 HT) de l'année N face à N-1 — 12 lignes, mois vides à 0.
export async function getYearComparison(
  actor: SessionUser,
  input: { year: number; storeId?: string | null }
): Promise<AcctMonthComparison[]> {
  assertCan(actor, "accounting:read");
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) {
    throw new Error("Année invalide.");
  }
  const from = `${input.year - 1}-01-01`;
  const to = `${input.year}-12-31`;
  const rows = await db.execute(sql`
    SELECT
      to_char(date_trunc('month', i.piece_date), 'YYYY-MM') AS month,
      COALESCE(SUM(i.amount_ht) FILTER (WHERE i.account_class = 'PRODUIT'), 0)::text AS revenue
    FROM acct_invoices i
    WHERE i.status <> 'ANNULEE'
      AND i.piece_date BETWEEN ${from} AND ${to}
      ${storeClause(input.storeId)}
    GROUP BY 1
  `);
  const byMonth = new Map(
    (rows.rows as { month: string; revenue: string }[]).map((r) => [
      r.month,
      fromCents(toCents(r.revenue)),
    ])
  );
  return monthsOfYear(input.year).map((month) => ({
    month,
    current: byMonth.get(month) ?? "0",
    previous: byMonth.get(`${input.year - 1}${month.slice(4)}`) ?? "0",
  }));
}

export type StoreRevenueRow = {
  storeId: string;
  code: string;
  name: string;
  revenueHT: string;
};

// CA HT (classe 7) par boutique du réseau sur une période, décroissant —
// via le rattachement acctStructures.storeId (les structures non liées à une
// boutique n'apparaissent pas ici).
export async function getStoreRevenues(
  actor: SessionUser,
  period: { from: string; to: string }
): Promise<StoreRevenueRow[]> {
  assertCan(actor, "accounting:read");
  assertPeriod(period);
  const rows = await db.execute(sql`
    SELECT
      st.id AS "storeId", st.code, st.name,
      COALESCE(SUM(i.amount_ht) FILTER (WHERE i.account_class = 'PRODUIT'), 0)::text AS revenue
    FROM stores st
    JOIN acct_structures s ON s.store_id = st.id
    JOIN acct_invoices i ON i.structure_id = s.id
    WHERE i.status <> 'ANNULEE'
      AND i.piece_date BETWEEN ${period.from} AND ${period.to}
    GROUP BY st.id, st.code, st.name
    ORDER BY SUM(i.amount_ht) FILTER (WHERE i.account_class = 'PRODUIT') DESC NULLS LAST
  `);
  return (rows.rows as { storeId: string; code: string; name: string; revenue: string }[]).map(
    (r) => ({
      storeId: r.storeId,
      code: r.code,
      name: r.name,
      revenueHT: fromCents(toCents(r.revenue)),
    })
  );
}

export type AmountDueSummary = { count: number; totalTTC: string };

// Restant dû global : TTC des pièces En attente / En retard / Impayée.
export async function getAmountDue(
  actor: SessionUser
): Promise<AmountDueSummary> {
  assertCan(actor, "accounting:read");
  const rows = await db.execute(sql`
    SELECT COUNT(*)::int AS count, COALESCE(SUM(amount_ttc), 0)::text AS total
    FROM acct_invoices
    WHERE status IN ('EN_ATTENTE', 'EN_RETARD', 'IMPAYEE')
  `);
  const row = rows.rows[0] as { count: number; total: string };
  return { count: row.count, totalTTC: fromCents(toCents(row.total)) };
}

// ── Lecture interne (SANS acteur) pour les modules qui croisent le journal
// avec leurs propres permissions (achats DPS, P&L succursales, job
// purchase-anomaly). Ne renvoie que des agrégats par boutique.

export async function sumStoreRevenueByMonth(filter: {
  from: string;
  to: string;
  storeId?: string | null;
  storeIds?: string[] | null;
  region?: string | null;
}): Promise<{ storeId: string; month: string; revenueHT: string }[]> {
  assertPeriod(filter);
  const clauses = [
    sql`i.status <> 'ANNULEE'`,
    sql`i.account_class = 'PRODUIT'`,
    sql`i.piece_date BETWEEN ${filter.from} AND ${filter.to}`,
    sql`s.store_id IS NOT NULL`,
  ];
  if (filter.storeId) clauses.push(sql`s.store_id = ${filter.storeId}`);
  if (filter.storeIds) {
    if (filter.storeIds.length === 0) return [];
    clauses.push(
      sql`s.store_id IN (${sql.join(
        filter.storeIds.map((id) => sql`${id}`),
        sql`, `
      )})`
    );
  }
  if (filter.region) clauses.push(sql`st.region = ${filter.region}`);

  const rows = await db.execute(sql`
    SELECT
      s.store_id AS "storeId",
      to_char(date_trunc('month', i.piece_date), 'YYYY-MM') AS month,
      COALESCE(SUM(i.amount_ht), 0)::text AS revenue
    FROM acct_invoices i
    JOIN acct_structures s ON s.id = i.structure_id
    JOIN stores st ON st.id = s.store_id
    WHERE ${sql.join(clauses, sql` AND `)}
    GROUP BY 1, 2
  `);
  return (rows.rows as { storeId: string; month: string; revenue: string }[]).map(
    (r) => ({
      storeId: r.storeId,
      month: r.month,
      revenueHT: fromCents(toCents(r.revenue)),
    })
  );
}

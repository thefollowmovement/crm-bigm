import "server-only";

import { and, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { revenueEntries, stores, users } from "@/db/schema";
import {
  accessibleStoreIds,
  assertCan,
  assertStoreAccess,
} from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { monthsOfYear } from "@/lib/analytics";

// Agrégations temporelles et géographiques du CA (cdc §4 : comparaisons par
// jour/semaine/mois, N vs N-1, boutique/région/réseau). Lectures pures : toutes
// les sommes sont faites en SQL et restituées en strings numeric.

export type SeriesGranularity = "day" | "week" | "month";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// date_trunc exige un littéral : table blanche par granularité, jamais
// d'interpolation directe d'une valeur venue de l'extérieur.
const BUCKET_EXPR: Record<SeriesGranularity, SQL<string>> = {
  day: sql<string>`to_char(${revenueEntries.date}, 'YYYY-MM-DD')`,
  week: sql<string>`to_char(date_trunc('week', ${revenueEntries.date}), 'YYYY-MM-DD')`,
  month: sql<string>`to_char(date_trunc('month', ${revenueEntries.date}), 'YYYY-MM')`,
};

type ScopeFilter = {
  storeId?: string;
  region?: string;
  animateurId?: string;
};

// Conditions communes : période + périmètre demandé + scoping FRANCHISE.
// Retourne null si le scoping rend le résultat vide d'office.
async function buildConditions(
  actor: SessionUser,
  period: { from: string; to: string },
  filter: ScopeFilter
): Promise<SQL[] | null> {
  if (!ISO_DATE_RE.test(period.from) || !ISO_DATE_RE.test(period.to)) {
    throw new Error("Période invalide.");
  }
  const conditions: SQL[] = [
    gte(revenueEntries.date, period.from),
    lte(revenueEntries.date, period.to),
  ];
  if (filter.storeId) {
    await assertStoreAccess(actor, filter.storeId);
    conditions.push(eq(revenueEntries.storeId, filter.storeId));
  }
  if (filter.region) conditions.push(eq(stores.region, filter.region));
  if (filter.animateurId) conditions.push(eq(stores.animateurId, filter.animateurId));

  const scoped = await accessibleStoreIds(actor);
  if (scoped !== null) {
    if (scoped.length === 0) return null;
    conditions.push(inArray(revenueEntries.storeId, scoped));
  }
  return conditions;
}

export type SeriesPoint = { period: string; gross: string };

// Série temporelle du CA brut (jour / semaine / mois) sur un périmètre.
export async function getSeries(
  actor: SessionUser,
  input: { granularity: SeriesGranularity; from: string; to: string } & ScopeFilter
): Promise<SeriesPoint[]> {
  assertCan(actor, "revenue:read");
  const conditions = await buildConditions(actor, input, input);
  if (conditions === null) return [];

  const bucket = BUCKET_EXPR[input.granularity];
  return db
    .select({
      period: bucket,
      gross: sql<string>`COALESCE(SUM(${revenueEntries.grossAmount}), 0)::text`,
    })
    .from(revenueEntries)
    .innerJoin(stores, eq(revenueEntries.storeId, stores.id))
    .where(and(...conditions))
    .groupBy(bucket)
    .orderBy(bucket);
}

export type MonthComparison = {
  month: string; // "YYYY-MM" de l'année N
  current: string;
  previous: string;
};

// CA mensuel de l'année N face à N-1 (12 lignes, mois vides à "0").
export async function getYearComparison(
  actor: SessionUser,
  input: { year: number } & ScopeFilter
): Promise<MonthComparison[]> {
  assertCan(actor, "revenue:read");
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) {
    throw new Error("Année invalide.");
  }
  const conditions = await buildConditions(
    actor,
    { from: `${input.year - 1}-01-01`, to: `${input.year}-12-31` },
    input
  );
  const empty = monthsOfYear(input.year).map((month) => ({
    month,
    current: "0",
    previous: "0",
  }));
  if (conditions === null) return empty;

  const bucket = BUCKET_EXPR.month;
  const rows = await db
    .select({
      period: bucket,
      gross: sql<string>`COALESCE(SUM(${revenueEntries.grossAmount}), 0)::text`,
    })
    .from(revenueEntries)
    .innerJoin(stores, eq(revenueEntries.storeId, stores.id))
    .where(and(...conditions))
    .groupBy(bucket);

  const byMonth = new Map(rows.map((r) => [r.period, r.gross]));
  return empty.map(({ month }) => {
    const previousMonth = `${input.year - 1}${month.slice(4)}`;
    return {
      month,
      current: byMonth.get(month) ?? "0",
      previous: byMonth.get(previousMonth) ?? "0",
    };
  });
}

export type RegionSummaryRow = {
  region: string | null;
  gross: string;
  storeCount: number;
};

// CA par région (stores.region texte libre ; null = non renseignée).
export async function getRegionSummary(
  actor: SessionUser,
  period: { from: string; to: string }
): Promise<RegionSummaryRow[]> {
  assertCan(actor, "revenue:read");
  const conditions = await buildConditions(actor, period, {});
  if (conditions === null) return [];

  return db
    .select({
      region: stores.region,
      gross: sql<string>`COALESCE(SUM(${revenueEntries.grossAmount}), 0)::text`,
      storeCount: sql<number>`COUNT(DISTINCT ${stores.id})::int`,
    })
    .from(revenueEntries)
    .innerJoin(stores, eq(revenueEntries.storeId, stores.id))
    .where(and(...conditions))
    .groupBy(stores.region)
    .orderBy(sql`SUM(${revenueEntries.grossAmount}) DESC`);
}

export type AnimateurSummaryRow = {
  animateurId: string | null;
  firstName: string | null;
  lastName: string | null;
  gross: string;
  storeCount: number;
};

// CA par animateur réseau (boutiques sans animateur regroupées sous null).
export async function getAnimateurSummary(
  actor: SessionUser,
  period: { from: string; to: string }
): Promise<AnimateurSummaryRow[]> {
  assertCan(actor, "revenue:read");
  const conditions = await buildConditions(actor, period, {});
  if (conditions === null) return [];

  return db
    .select({
      animateurId: stores.animateurId,
      firstName: users.firstName,
      lastName: users.lastName,
      gross: sql<string>`COALESCE(SUM(${revenueEntries.grossAmount}), 0)::text`,
      storeCount: sql<number>`COUNT(DISTINCT ${stores.id})::int`,
    })
    .from(revenueEntries)
    .innerJoin(stores, eq(revenueEntries.storeId, stores.id))
    .leftJoin(users, eq(stores.animateurId, users.id))
    .where(and(...conditions))
    .groupBy(stores.animateurId, users.firstName, users.lastName)
    .orderBy(sql`SUM(${revenueEntries.grossAmount}) DESC`);
}

// Régions distinctes accessibles (pour les filtres UI).
export async function listRegions(actor: SessionUser): Promise<string[]> {
  assertCan(actor, "revenue:read");
  const conditions: SQL[] = [sql`${stores.region} IS NOT NULL`];
  const scoped = await accessibleStoreIds(actor);
  if (scoped !== null) {
    if (scoped.length === 0) return [];
    conditions.push(inArray(stores.id, scoped));
  }
  const rows = await db
    .selectDistinct({ region: stores.region })
    .from(stores)
    .where(and(...conditions))
    .orderBy(stores.region);
  return rows.map((r) => r.region).filter((r): r is string => r !== null);
}

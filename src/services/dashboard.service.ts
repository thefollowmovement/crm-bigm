import "server-only";

import { and, desc, eq, gte, inArray, isNotNull, lt, lte, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  actionPlans,
  animatorPlanEntries,
  auditCriteria,
  auditItems,
  invoices,
  revenueEntries,
  storeVisits,
  stores,
  tickets,
} from "@/db/schema";
import {
  accessibleStoreIds,
  assertCan,
  assertStoreAccess,
} from "@/lib/authz/guards";
import { can } from "@/lib/authz/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { percentChange } from "@/lib/analytics";
import { addDaysIso, addMonthsIso, startOfWeekIso, todayParis } from "@/lib/dates";
import { auditMaxDays, isAuditOverdue } from "@/lib/jobs/audit-overdue";

// Tableaux de bord multi-niveaux (cdc §18) : chaque bloc n'existe dans le
// payload QUE si le rôle y a droit (jamais « masqué en CSS »).

function monthBounds(month: string) {
  return { from: `${month}-01`, to: `${month}-31` };
}

async function sumRevenue(conditions: SQL[]): Promise<string> {
  const [row] = await db
    .select({
      gross: sql<string>`COALESCE(SUM(${revenueEntries.grossAmount}), 0)::text`,
    })
    .from(revenueEntries)
    .innerJoin(stores, eq(revenueEntries.storeId, stores.id))
    .where(and(...conditions));
  return row.gross;
}

// ── Vue boutique (franchisé, ou fiche d'une boutique) ────────────

export async function getStoreDashboard(actor: SessionUser, storeId: string) {
  assertCan(actor, "revenue:read");
  await assertStoreAccess(actor, storeId);
  const today = todayParis();
  const month = today.slice(0, 7);
  const { from, to } = monthBounds(month);
  const prev = monthBounds(addMonthsIso(from, -12).slice(0, 7));

  const [currentRow, previousRow, orders, plans] = await Promise.all([
    db
      .select({
        gross: sql<string>`COALESCE(SUM(${revenueEntries.grossAmount}), 0)::text`,
      })
      .from(revenueEntries)
      .where(
        and(
          eq(revenueEntries.storeId, storeId),
          gte(revenueEntries.date, from),
          lte(revenueEntries.date, to)
        )
      ),
    db
      .select({
        gross: sql<string>`COALESCE(SUM(${revenueEntries.grossAmount}), 0)::text`,
      })
      .from(revenueEntries)
      .where(
        and(
          eq(revenueEntries.storeId, storeId),
          gte(revenueEntries.date, prev.from),
          lte(revenueEntries.date, prev.to)
        )
      ),
    db
      .select({
        orders: sql<number>`COALESCE(SUM(${revenueEntries.orderCount}), 0)::int`,
        basket: sql<string | null>`
          CASE WHEN COALESCE(SUM(${revenueEntries.orderCount}), 0) > 0 THEN
            (COALESCE(SUM(${revenueEntries.grossAmount})
               FILTER (WHERE ${revenueEntries.orderCount} IS NOT NULL), 0)
             / SUM(${revenueEntries.orderCount}))::numeric(12,2)::text
          ELSE NULL END`,
      })
      .from(revenueEntries)
      .where(
        and(
          eq(revenueEntries.storeId, storeId),
          gte(revenueEntries.date, from),
          lte(revenueEntries.date, to)
        )
      ),
    can(actor, "actionplan:read")
      ? db
          .select({
            open: sql<number>`COUNT(*) FILTER (WHERE ${actionPlans.status} IN ('A_FAIRE','EN_COURS'))::int`,
            late: sql<number>`COUNT(*) FILTER (WHERE ${actionPlans.status} IN ('A_FAIRE','EN_COURS') AND ${actionPlans.dueDate} < ${today})::int`,
          })
          .from(actionPlans)
          .where(eq(actionPlans.storeId, storeId))
      : Promise.resolve(null),
  ]);

  const lastAudit = can(actor, "visit:read")
    ? await db
        .select({
          visitDate: storeVisits.visitDate,
          scorePct: sql<string | null>`
            CASE WHEN SUM(${auditCriteria.maxScore}) > 0 THEN
              ROUND(SUM(${auditItems.score})::numeric * 100 / SUM(${auditCriteria.maxScore}), 1)::text
            ELSE NULL END`,
        })
        .from(storeVisits)
        .leftJoin(auditItems, eq(auditItems.visitId, storeVisits.id))
        .leftJoin(auditCriteria, eq(auditItems.criterionId, auditCriteria.id))
        .where(
          and(
            eq(storeVisits.storeId, storeId),
            eq(storeVisits.type, "AUDIT"),
            eq(storeVisits.status, "FINALISEE")
          )
        )
        .groupBy(storeVisits.id, storeVisits.visitDate)
        .orderBy(desc(storeVisits.visitDate))
        .limit(1)
    : null;

  const unpaid = can(actor, "finance:read")
    ? await db
        .select({
          count: sql<number>`COUNT(*)::int`,
          totalTTC: sql<string>`COALESCE(SUM(${invoices.amountTTC}), 0)::text`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.storeId, storeId),
            inArray(invoices.status, ["EMISE", "PARTIELLEMENT_PAYEE"]),
            lt(invoices.dueDate, today)
          )
        )
    : null;

  const current = currentRow[0].gross;
  const previous = previousRow[0].gross;
  return {
    month,
    revenue: { current, previous, deltaPct: percentChange(current, previous) },
    orderTotal: orders[0].orders,
    averageBasket: orders[0].basket,
    plans: plans ? plans[0] : null,
    lastAudit: lastAudit ? (lastAudit[0] ?? null) : null,
    unpaid: unpaid ? unpaid[0] : null,
  };
}

// ── Vue animateur ────────────────────────────────────────────────

export async function getAnimateurDashboard(actor: SessionUser) {
  assertCan(actor, "revenue:read");
  const today = todayParis();
  const month = today.slice(0, 7);
  const { from, to } = monthBounds(month);

  const myStores = await db.query.stores.findMany({
    where: and(eq(stores.animateurId, actor.id), eq(stores.status, "OUVERTE")),
    columns: { id: true, code: true, name: true, city: true },
    orderBy: [stores.code],
  });
  const storeIds = myStores.map((s) => s.id);

  const [revenues, latePlans, weekCount] = await Promise.all([
    storeIds.length
      ? db
          .select({
            storeId: revenueEntries.storeId,
            gross: sql<string>`COALESCE(SUM(${revenueEntries.grossAmount}), 0)::text`,
          })
          .from(revenueEntries)
          .where(
            and(
              inArray(revenueEntries.storeId, storeIds),
              gte(revenueEntries.date, from),
              lte(revenueEntries.date, to)
            )
          )
          .groupBy(revenueEntries.storeId)
      : Promise.resolve([]),
    storeIds.length && can(actor, "actionplan:read")
      ? db
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(actionPlans)
          .where(
            and(
              inArray(actionPlans.storeId, storeIds),
              inArray(actionPlans.status, ["A_FAIRE", "EN_COURS"]),
              isNotNull(actionPlans.dueDate),
              lt(actionPlans.dueDate, today)
            )
          )
      : Promise.resolve([{ count: 0 }]),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(animatorPlanEntries)
      .where(
        and(
          eq(animatorPlanEntries.animateurId, actor.id),
          gte(animatorPlanEntries.date, startOfWeekIso(today)),
          lte(animatorPlanEntries.date, addDaysIso(startOfWeekIso(today), 6))
        )
      ),
  ]);
  const grossByStore = new Map(revenues.map((r) => [r.storeId, r.gross]));

  return {
    month,
    stores: myStores.map((s) => ({
      ...s,
      monthGross: grossByStore.get(s.id) ?? "0",
    })),
    latePlans: latePlans[0].count,
    weekEntries: weekCount[0].count,
  };
}

// ── Vue réseau / région (direction et rôles siège) ───────────────

export async function getNetworkDashboard(
  actor: SessionUser,
  filter: { region?: string } = {}
) {
  // Aucun prérequis global : chaque bloc n'est calculé (et présent dans le
  // payload) que si le rôle a la permission correspondante.
  const today = todayParis();
  const month = today.slice(0, 7);
  const { from, to } = monthBounds(month);
  const prev = monthBounds(addMonthsIso(from, -12).slice(0, 7));

  const baseConditions: SQL[] = [];
  if (filter.region) baseConditions.push(eq(stores.region, filter.region));
  const scoped = await accessibleStoreIds(actor);
  if (scoped !== null) {
    if (scoped.length === 0) {
      return null;
    }
    baseConditions.push(inArray(stores.id, scoped));
  }

  const canRevenue = can(actor, "revenue:read");
  const [current, previous, ranking] = canRevenue
    ? await Promise.all([
        sumRevenue([
          ...baseConditions,
          gte(revenueEntries.date, from),
          lte(revenueEntries.date, to),
        ]),
        sumRevenue([
          ...baseConditions,
          gte(revenueEntries.date, prev.from),
          lte(revenueEntries.date, prev.to),
        ]),
        db
          .select({
            storeId: stores.id,
            code: stores.code,
            name: stores.name,
            gross: sql<string>`COALESCE(SUM(${revenueEntries.grossAmount}), 0)::text`,
          })
          .from(revenueEntries)
          .innerJoin(stores, eq(revenueEntries.storeId, stores.id))
          .where(
            and(
              ...baseConditions,
              gte(revenueEntries.date, from),
              lte(revenueEntries.date, to)
            )
          )
          .groupBy(stores.id, stores.code, stores.name)
          .orderBy(desc(sql`SUM(${revenueEntries.grossAmount})`)),
      ])
    : [null, null, [] as { storeId: string; code: string; name: string; gross: string }[]];

  const storeFilter: SQL[] = [];
  if (filter.region) storeFilter.push(eq(stores.region, filter.region));

  const [unpaid, lateTickets, latePlans, auditsLate] = await Promise.all([
    can(actor, "finance:read")
      ? db
          .select({
            count: sql<number>`COUNT(*)::int`,
            totalTTC: sql<string>`COALESCE(SUM(${invoices.amountTTC}), 0)::text`,
          })
          .from(invoices)
          .innerJoin(stores, eq(invoices.storeId, stores.id))
          .where(
            and(
              ...storeFilter,
              inArray(invoices.status, ["EMISE", "PARTIELLEMENT_PAYEE"]),
              lt(invoices.dueDate, today)
            )
          )
      : Promise.resolve(null),
    can(actor, "ticket:read")
      ? db
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(tickets)
          .where(
            and(
              isNotNull(tickets.dueDate),
              lt(tickets.dueDate, today),
              inArray(tickets.status, ["NOUVEAU", "AFFECTE", "EN_COURS", "EN_ATTENTE"])
            )
          )
      : Promise.resolve(null),
    can(actor, "actionplan:read")
      ? db
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(actionPlans)
          .innerJoin(stores, eq(actionPlans.storeId, stores.id))
          .where(
            and(
              ...storeFilter,
              inArray(actionPlans.status, ["A_FAIRE", "EN_COURS"]),
              isNotNull(actionPlans.dueDate),
              lt(actionPlans.dueDate, today)
            )
          )
      : Promise.resolve(null),
    can(actor, "visit:read") ? countAuditsOverdue(today, filter.region) : Promise.resolve(null),
  ]);

  return {
    month,
    revenue:
      current !== null && previous !== null
        ? { current, previous, deltaPct: percentChange(current, previous) }
        : null,
    topStores: ranking.slice(0, 5),
    flopStores: [...ranking].reverse().slice(0, 5),
    unpaid: unpaid ? unpaid[0] : null,
    lateTickets: lateTickets ? lateTickets[0].count : null,
    latePlans: latePlans ? latePlans[0].count : null,
    auditsOverdue: auditsLate,
  };
}

async function countAuditsOverdue(today: string, region?: string): Promise<number> {
  const conditions: SQL[] = [eq(stores.status, "OUVERTE")];
  if (region) conditions.push(eq(stores.region, region));
  const [openStores, lastAudits] = await Promise.all([
    db.query.stores.findMany({
      where: and(...conditions),
      columns: { id: true },
    }),
    db
      .select({
        storeId: storeVisits.storeId,
        lastDate: sql<string>`MAX(${storeVisits.visitDate})::text`,
      })
      .from(storeVisits)
      .where(and(eq(storeVisits.type, "AUDIT"), eq(storeVisits.status, "FINALISEE")))
      .groupBy(storeVisits.storeId),
  ]);
  const lastByStore = new Map(lastAudits.map((r) => [r.storeId, r.lastDate]));
  const maxDays = auditMaxDays();
  return openStores.filter((s) =>
    isAuditOverdue(lastByStore.get(s.id) ?? null, today, maxDays)
  ).length;
}

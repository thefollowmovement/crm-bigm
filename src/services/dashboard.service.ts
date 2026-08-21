import "server-only";

import { and, desc, eq, gte, inArray, isNotNull, lt, lte, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  actionPlans,
  animatorPlanEntries,
  auditCriteria,
  auditItems,
  contracts,
  dpsPurchases,
  invoices,
  openingProjects,
  openingSteps,
  payments,
  prospects,
  resaleListings,
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
import { getMaterialVariance } from "@/services/material-variance.service";

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

// ── Cockpit Direction (cdc §18/§19) ──────────────────────────────
// Tous les indicateurs réseau sur une page — réservé à la direction
// (permission direction:cockpit), tout en Promise.all.

export async function getDirectionCockpit(actor: SessionUser) {
  assertCan(actor, "direction:cockpit");
  const today = todayParis();
  const month = today.slice(0, 7);
  const monthN1 = addMonthsIso(today, -12).slice(0, 7);
  const year = today.slice(0, 4);
  const prevMonthIso = addMonthsIso(`${month}-01`, -1);
  const prevMonth = prevMonthIso.slice(0, 7);
  const in180Days = addDaysIso(today, 180);

  const royaltyTypes = ["REDEVANCE", "REDEVANCE_COMMUNICATION"] as const;

  const [
    revenueMonth,
    revenueMonthN1,
    purchasesMonth,
    royaltiesInvoiced,
    royaltiesCollected,
    overdueInvoices,
    storeRevenues,
    latePlans,
    openTickets,
    openings,
    lateOpeningSteps,
    expiringContracts,
    activeResales,
    activeProspects,
    variance,
    auditsOverdue,
  ] = await Promise.all([
    sumRevenue([
      gte(revenueEntries.date, monthBounds(month).from),
      lte(revenueEntries.date, monthBounds(month).to),
    ]),
    sumRevenue([
      gte(revenueEntries.date, monthBounds(monthN1).from),
      lte(revenueEntries.date, monthBounds(monthN1).to),
    ]),
    db
      .select({
        total: sql<string>`COALESCE(SUM(${dpsPurchases.amount}), 0)::numeric(12,2)::text`,
      })
      .from(dpsPurchases)
      .where(
        and(
          gte(dpsPurchases.date, monthBounds(month).from),
          lte(dpsPurchases.date, monthBounds(month).to)
        )
      ),
    db
      .select({
        total: sql<string>`COALESCE(SUM(${invoices.amountTTC}), 0)::numeric(12,2)::text`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(invoices)
      .where(
        and(
          inArray(invoices.type, [...royaltyTypes]),
          sql`${invoices.status} <> 'ANNULEE'`,
          gte(invoices.issuedAt, `${year}-01-01`)
        )
      ),
    db
      .select({
        total: sql<string>`COALESCE(SUM(${payments.amount}), 0)::numeric(12,2)::text`,
      })
      .from(payments)
      .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
      .where(
        and(
          inArray(invoices.type, [...royaltyTypes]),
          gte(invoices.issuedAt, `${year}-01-01`)
        )
      ),
    db
      .select({
        count: sql<number>`COUNT(*)::int`,
        total: sql<string>`COALESCE(SUM(${invoices.amountTTC}), 0)::numeric(12,2)::text`,
      })
      .from(invoices)
      .where(
        and(
          inArray(invoices.status, ["EMISE", "PARTIELLEMENT_PAYEE"]),
          lt(invoices.dueDate, today)
        )
      ),
    db
      .select({
        storeId: revenueEntries.storeId,
        code: stores.code,
        name: stores.name,
        total: sql<string>`COALESCE(SUM(${revenueEntries.grossAmount}), 0)::numeric(12,2)::text`,
      })
      .from(revenueEntries)
      .innerJoin(stores, eq(revenueEntries.storeId, stores.id))
      .where(
        and(
          gte(revenueEntries.date, monthBounds(month).from),
          lte(revenueEntries.date, monthBounds(month).to)
        )
      )
      .groupBy(revenueEntries.storeId, stores.code, stores.name)
      .orderBy(desc(sql`SUM(${revenueEntries.grossAmount})`)),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(actionPlans)
      .where(
        and(
          inArray(actionPlans.status, ["A_FAIRE", "EN_COURS"]),
          lt(actionPlans.dueDate, today)
        )
      ),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(tickets)
      .where(inArray(tickets.status, ["NOUVEAU", "AFFECTE", "EN_COURS", "EN_ATTENTE"])),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(openingProjects)
      .where(eq(openingProjects.status, "EN_COURS")),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(openingSteps)
      .innerJoin(openingProjects, eq(openingSteps.projectId, openingProjects.id))
      .where(
        and(
          eq(openingProjects.status, "EN_COURS"),
          sql`${openingSteps.status} <> 'TERMINEE'`,
          lt(openingSteps.plannedDate, today)
        )
      ),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(contracts)
      .where(
        and(
          eq(contracts.status, "ACTIF"),
          isNotNull(contracts.endDate),
          gte(contracts.endDate, today),
          lte(contracts.endDate, in180Days)
        )
      ),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(resaleListings)
      .where(eq(resaleListings.status, "ACTIVE")),
    db
      .select({
        count: sql<number>`COUNT(*)::int`,
        due: sql<number>`COUNT(*) FILTER (WHERE ${prospects.nextFollowUpDate} <= ${today})::int`,
      })
      .from(prospects)
      .where(sql`${prospects.status} <> 'ABANDONNE'`),
    getMaterialVariance(
      actor,
      Number(prevMonthIso.slice(0, 4)),
      Number(prevMonthIso.slice(5, 7))
    ),
    countAuditsOverdue(today),
  ]);

  return {
    month,
    revenue: {
      current: revenueMonth,
      previousYear: revenueMonthN1,
      deltaPct: percentChange(revenueMonth, revenueMonthN1),
    },
    purchasesMonth: purchasesMonth[0].total,
    royalties: {
      invoiced: royaltiesInvoiced[0].total,
      invoicedCount: royaltiesInvoiced[0].count,
      collected: royaltiesCollected[0].total,
    },
    overdueInvoices: overdueInvoices[0],
    topStores: storeRevenues.slice(0, 3),
    flopStores: [...storeRevenues].reverse().slice(0, 3),
    latePlans: latePlans[0].count,
    openTickets: openTickets[0].count,
    openings: {
      active: openings[0].count,
      lateSteps: lateOpeningSteps[0].count,
    },
    expiringContracts: expiringContracts[0].count,
    activeResales: activeResales[0].count,
    prospects: activeProspects[0],
    materialVariance: { month: prevMonth, rows: variance.slice(0, 5) },
    auditsOverdue,
  };
}

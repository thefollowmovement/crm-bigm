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
  openingProjects,
  openingSteps,
  prospects,
  resaleListings,
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
import {
  addDaysIso,
  addMonthsIso,
  monthEndIso,
  startOfWeekIso,
  todayParis,
} from "@/lib/dates";
import { auditMaxDays, isAuditOverdue } from "@/lib/jobs/audit-overdue";
import {
  getAmountDue,
  getMonthlyResults,
  getStoreRevenues,
} from "@/services/acct-analytics.service";
import { computeResult } from "@/services/acct-invoices.service";
import { getMaterialVariance } from "@/services/material-variance.service";

// Tableaux de bord multi-niveaux (cdc §18) : chaque bloc n'existe dans le
// payload QUE si le rôle y a droit (jamais « masqué en CSS »). Depuis
// l'étape 52, le CA et les impayés se lisent dans le journal comptable
// (classes 6/7) — les blocs correspondants exigent accounting:read.

function monthBounds(month: string) {
  return { from: `${month}-01`, to: monthEndIso(month) };
}

// ── Vue boutique (franchisé, ou fiche d'une boutique) ────────────

export async function getStoreDashboard(actor: SessionUser, storeId: string) {
  assertCan(actor, "store:read");
  await assertStoreAccess(actor, storeId);
  const today = todayParis();
  const month = today.slice(0, 7);

  const plans = can(actor, "actionplan:read")
    ? await db
        .select({
          open: sql<number>`COUNT(*) FILTER (WHERE ${actionPlans.status} IN ('A_FAIRE','EN_COURS'))::int`,
          late: sql<number>`COUNT(*) FILTER (WHERE ${actionPlans.status} IN ('A_FAIRE','EN_COURS') AND ${actionPlans.dueDate} < ${today})::int`,
        })
        .from(actionPlans)
        .where(eq(actionPlans.storeId, storeId))
    : null;

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

  return {
    month,
    plans: plans ? plans[0] : null,
    lastAudit: lastAudit ? (lastAudit[0] ?? null) : null,
  };
}

// ── Vue animateur ────────────────────────────────────────────────

export async function getAnimateurDashboard(actor: SessionUser) {
  assertCan(actor, "store:read");
  const today = todayParis();
  const month = today.slice(0, 7);

  const myStores = await db.query.stores.findMany({
    where: and(eq(stores.animateurId, actor.id), eq(stores.status, "OUVERTE")),
    columns: { id: true, code: true, name: true, city: true },
    orderBy: [stores.code],
  });
  const storeIds = myStores.map((s) => s.id);

  const [latePlans, weekCount] = await Promise.all([
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

  return {
    month,
    stores: myStores,
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

  const scoped = await accessibleStoreIds(actor);
  if (scoped !== null && scoped.length === 0) return null;

  // CA / impayés / classements : journal comptable (compta + direction).
  const canAccounting = scoped === null && can(actor, "accounting:read");
  const [currentMonths, previousMonths, storeRevenues, amountDue] = canAccounting
    ? await Promise.all([
        getMonthlyResults(actor, { from, to }),
        getMonthlyResults(actor, { from: prev.from, to: prev.to }),
        getStoreRevenues(actor, { from, to }),
        getAmountDue(actor),
      ])
    : [null, null, [], null];

  const current = currentMonths?.[0]?.revenueHT ?? "0";
  const previous = previousMonths?.[0]?.revenueHT ?? "0";
  const ranking = filter.region
    ? [] // le journal n'est pas régionalisé : classement réseau uniquement
    : storeRevenues.map((r) => ({
        storeId: r.storeId,
        code: r.code,
        name: r.name,
        gross: r.revenueHT,
      }));

  const storeFilter: SQL[] = [];
  if (filter.region) storeFilter.push(eq(stores.region, filter.region));

  const [lateTickets, latePlans, auditsLate] = await Promise.all([
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
    revenue: canAccounting
      ? { current, previous, deltaPct: percentChange(current, previous) }
      : null,
    topStores: ranking.slice(0, 5),
    flopStores: [...ranking].reverse().slice(0, 5),
    unpaid: amountDue,
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

// ── Cockpit Direction (cdc §18/§19, refondu à l'étape 52) ────────
// Tous les indicateurs sur une page — permission direction:cockpit. Le CA,
// les charges et le résultat viennent du journal comptable (classes 6/7).

export async function getDirectionCockpit(actor: SessionUser) {
  assertCan(actor, "direction:cockpit");
  const today = todayParis();
  const month = today.slice(0, 7);
  const monthN1 = addMonthsIso(today, -12).slice(0, 7);
  const year = today.slice(0, 4);
  const prevMonthIso = addMonthsIso(`${month}-01`, -1);
  const prevMonth = prevMonthIso.slice(0, 7);
  const in180Days = addDaysIso(today, 180);

  const [
    resultMonth,
    resultMonthN1,
    resultYear,
    amountDue,
    purchasesMonth,
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
    computeResult(actor, monthBounds(month)),
    computeResult(actor, monthBounds(monthN1)),
    computeResult(actor, { from: `${year}-01-01`, to: `${year}-12-31` }),
    getAmountDue(actor),
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
    getStoreRevenues(actor, monthBounds(month)),
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

  const ranking = storeRevenues.map((r) => ({
    storeId: r.storeId,
    code: r.code,
    name: r.name,
    total: r.revenueHT,
  }));

  return {
    month,
    revenue: {
      current: resultMonth.revenueHT,
      previousYear: resultMonthN1.revenueHT,
      deltaPct: percentChange(resultMonth.revenueHT, resultMonthN1.revenueHT),
    },
    expensesMonth: resultMonth.expensesHT,
    resultMonth: resultMonth.result,
    resultYear,
    amountDue,
    purchasesMonth: purchasesMonth[0].total,
    topStores: ranking.slice(0, 3),
    flopStores: [...ranking].reverse().slice(0, 3),
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

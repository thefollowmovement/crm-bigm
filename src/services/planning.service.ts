import "server-only";

import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  animatorPlanEntries,
  animatorProfiles,
  storeVisits,
  stores,
  users,
} from "@/db/schema";
import {
  auditedDelete,
  auditedInsert,
  auditedUpdate,
} from "@/lib/db/audited";
import { ForbiddenError, assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { addDaysIso, startOfWeekIso } from "@/lib/dates";
import { notify } from "@/services/notifications.service";

type EntryRow = typeof animatorPlanEntries.$inferSelect;
type Period = EntryRow["period"];

// ── Décisions pures (testées en unit) ────────────────────────────

// Un animateur ne modifie que SON planning ; la direction modifie tout.
export function canEditPlanning(
  actor: Pick<SessionUser, "id" | "role">,
  animateurId: string
): boolean {
  if (actor.role === "ADMIN" || actor.role === "DIRECTION") return true;
  if (actor.role === "ANIMATION") return actor.id === animateurId;
  return false;
}

// JOURNEE est exclusive des demi-journées (le doublon exact est bloqué par
// la contrainte unique). `existing` = créneaux déjà posés le même jour.
export function hasPeriodConflict(existing: Period[], next: Period): boolean {
  if (existing.length === 0) return false;
  if (next === "JOURNEE") return true;
  return existing.includes("JOURNEE");
}

// ── Fiches animateurs ────────────────────────────────────────────

export async function listAnimateurs(actor: SessionUser) {
  assertCan(actor, "planning:read");
  const animateurs = await db.query.users.findMany({
    where: and(eq(users.role, "ANIMATION"), eq(users.isActive, true)),
    columns: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [asc(users.lastName)],
  });
  if (animateurs.length === 0) return [];

  const ids = animateurs.map((a) => a.id);
  const [profiles, storeCounts] = await Promise.all([
    db.query.animatorProfiles.findMany({
      where: inArray(animatorProfiles.userId, ids),
    }),
    db
      .select({
        animateurId: stores.animateurId,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(stores)
      .where(inArray(stores.animateurId, ids))
      .groupBy(stores.animateurId),
  ]);
  const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
  const countByUser = new Map(storeCounts.map((c) => [c.animateurId, c.count]));

  return animateurs.map((a) => ({
    ...a,
    profile: profileByUser.get(a.id) ?? null,
    storeCount: countByUser.get(a.id) ?? 0,
  }));
}

export async function getAnimateur(actor: SessionUser, userId: string) {
  assertCan(actor, "planning:read");
  const animateur = await db.query.users.findFirst({
    where: and(eq(users.id, userId), eq(users.role, "ANIMATION")),
    columns: { id: true, firstName: true, lastName: true, email: true, isActive: true },
  });
  if (!animateur) return null;
  const [profile, managedStores] = await Promise.all([
    db.query.animatorProfiles.findFirst({
      where: eq(animatorProfiles.userId, userId),
    }),
    db.query.stores.findMany({
      where: eq(stores.animateurId, userId),
      columns: { id: true, code: true, name: true, city: true, region: true },
      orderBy: [asc(stores.code)],
    }),
  ]);
  return { ...animateur, profile: profile ?? null, stores: managedStores };
}

export async function upsertProfile(
  actor: SessionUser,
  userId: string,
  patch: {
    zone: string | null;
    theoreticalRoute: string | null;
    costPerKm: string | null;
    notes: string | null;
  }
) {
  assertCan(actor, "planning:write");
  if (!canEditPlanning(actor, userId)) {
    throw new ForbiddenError("Vous ne pouvez modifier que votre propre fiche.");
  }
  const existing = await db.query.animatorProfiles.findFirst({
    where: eq(animatorProfiles.userId, userId),
  });
  if (existing) {
    return auditedUpdate({ id: actor.id }, animatorProfiles, existing.id, patch);
  }
  return auditedInsert({ id: actor.id }, animatorProfiles, { userId, ...patch });
}

// ── Planning hebdomadaire ────────────────────────────────────────

// Entrées de la semaine (lundi → dimanche) pour tous les animateurs actifs,
// ou un seul si `animateurId` est fourni.
export async function getWeek(
  actor: SessionUser,
  input: { weekStart: string; animateurId?: string }
) {
  assertCan(actor, "planning:read");
  const monday = startOfWeekIso(input.weekStart);
  const sunday = addDaysIso(monday, 6);
  const conditions = [
    gte(animatorPlanEntries.date, monday),
    lte(animatorPlanEntries.date, sunday),
  ];
  if (input.animateurId) {
    conditions.push(eq(animatorPlanEntries.animateurId, input.animateurId));
  }
  const entries = await db.query.animatorPlanEntries.findMany({
    where: and(...conditions),
    orderBy: [asc(animatorPlanEntries.date), asc(animatorPlanEntries.period)],
    with: {
      store: { columns: { id: true, code: true, name: true } },
      animateur: { columns: { id: true, firstName: true, lastName: true } },
    },
  });
  return { monday, sunday, entries };
}

export type PlanEntryInput = {
  animateurId: string;
  date: string;
  period: Period;
  activity: EntryRow["activity"];
  storeId: string | null;
  label: string | null;
  kmEstimated: string | null;
  notes: string | null;
};

// Crée ou remplace le créneau (animateur, jour, période). L'animateur est
// notifié quand un tiers modifie son planning (cdc §7).
export async function upsertEntry(actor: SessionUser, input: PlanEntryInput) {
  assertCan(actor, "planning:write");
  if (!canEditPlanning(actor, input.animateurId)) {
    throw new ForbiddenError(
      "Vous ne pouvez modifier que votre propre planning."
    );
  }
  const animateur = await db.query.users.findFirst({
    where: and(eq(users.id, input.animateurId), eq(users.role, "ANIMATION")),
    columns: { id: true, isActive: true },
  });
  if (!animateur || !animateur.isActive) throw new Error("Animateur invalide.");
  if (input.storeId) {
    const store = await db.query.stores.findFirst({
      where: eq(stores.id, input.storeId),
      columns: { id: true },
    });
    if (!store) throw new Error("Boutique introuvable.");
  }

  const sameDay = await db.query.animatorPlanEntries.findMany({
    where: and(
      eq(animatorPlanEntries.animateurId, input.animateurId),
      eq(animatorPlanEntries.date, input.date)
    ),
  });
  const existing = sameDay.find((e) => e.period === input.period);
  const others = sameDay.filter((e) => e.period !== input.period);
  if (hasPeriodConflict(others.map((e) => e.period), input.period)) {
    throw new Error(
      "Conflit de créneau : « Journée » est exclusive des demi-journées."
    );
  }

  const values = {
    activity: input.activity,
    storeId: input.storeId,
    label: input.label,
    kmEstimated: input.kmEstimated,
    notes: input.notes,
  };
  const result = existing
    ? await auditedUpdate({ id: actor.id }, animatorPlanEntries, existing.id, values)
    : await auditedInsert({ id: actor.id }, animatorPlanEntries, {
        animateurId: input.animateurId,
        date: input.date,
        period: input.period,
        ...values,
      });

  if (actor.id !== input.animateurId) {
    await notify([input.animateurId], {
      type: "PLANNING",
      title: `Votre planning du ${input.date} a été modifié`,
      body: `Par ${actor.firstName} ${actor.lastName}.`,
      link: `/animation/planning?semaine=${startOfWeekIso(input.date)}`,
    });
  }
  return result;
}

export async function deleteEntry(actor: SessionUser, entryId: string) {
  assertCan(actor, "planning:write");
  const entry = await db.query.animatorPlanEntries.findFirst({
    where: eq(animatorPlanEntries.id, entryId),
  });
  if (!entry) throw new Error("Créneau introuvable.");
  if (!canEditPlanning(actor, entry.animateurId)) {
    throw new ForbiddenError(
      "Vous ne pouvez modifier que votre propre planning."
    );
  }
  await auditedDelete({ id: actor.id }, animatorPlanEntries, entryId);
  if (actor.id !== entry.animateurId) {
    await notify([entry.animateurId], {
      type: "PLANNING",
      title: `Un créneau du ${entry.date} a été supprimé de votre planning`,
      body: `Par ${actor.firstName} ${actor.lastName}.`,
      link: `/animation/planning?semaine=${startOfWeekIso(entry.date)}`,
    });
  }
}

// ── Statistiques (fiche animateur) ───────────────────────────────

// Km planifiés et coût estimé (km × coût/km du profil) + visites réalisées
// sur une période. Sommes en SQL, restituées en strings.
export async function getAnimateurStats(
  actor: SessionUser,
  userId: string,
  period: { from: string; to: string }
) {
  assertCan(actor, "planning:read");
  const [kmRow, profile, visitRow] = await Promise.all([
    db
      .select({
        km: sql<string>`COALESCE(SUM(${animatorPlanEntries.kmEstimated}), 0)::text`,
        plannedCount: sql<number>`COUNT(*)::int`,
      })
      .from(animatorPlanEntries)
      .where(
        and(
          eq(animatorPlanEntries.animateurId, userId),
          gte(animatorPlanEntries.date, period.from),
          lte(animatorPlanEntries.date, period.to)
        )
      ),
    db.query.animatorProfiles.findFirst({
      where: eq(animatorProfiles.userId, userId),
    }),
    db
      .select({
        done: sql<number>`COUNT(*) FILTER (WHERE ${storeVisits.status} = 'FINALISEE')::int`,
        total: sql<number>`COUNT(*)::int`,
      })
      .from(storeVisits)
      .where(
        and(
          eq(storeVisits.visitedById, userId),
          gte(storeVisits.visitDate, period.from),
          lte(storeVisits.visitDate, period.to)
        )
      ),
  ]);

  const km = kmRow[0].km;
  const costPerKm = profile?.costPerKm ?? null;
  let estimatedCost: string | null = null;
  if (costPerKm) {
    // multiplication exacte en SQL (numeric), résultat en string 2 décimales
    const result = await db.execute<{ cost: string }>(
      sql`SELECT (${km}::numeric * ${costPerKm}::numeric)::numeric(12,2)::text AS cost`
    );
    estimatedCost = result.rows[0].cost;
  }

  return {
    kmPlanned: km,
    plannedCount: kmRow[0].plannedCount,
    estimatedCost,
    visitsDone: visitRow[0].done,
    visitsTotal: visitRow[0].total,
  };
}

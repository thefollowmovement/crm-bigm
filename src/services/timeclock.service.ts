import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { clockEntries, employees } from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { ForbiddenError, assertCan } from "@/lib/authz/guards";
import { can } from "@/lib/authz/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { todayParis } from "@/lib/dates";

// Pointeuse (cdc §12) : intervalles TRAVAIL / PAUSE explicites — la simple
// connexion à l'outil ne vaut pas temps de travail. Un seul badge ouvert par
// salarié (index unique partiel en base + garde service).

type ClockRow = typeof clockEntries.$inferSelect;
type ClockType = ClockRow["type"];

export type ClockAction = "DEBUT" | "PAUSE" | "REPRISE" | "FIN";

// ── Décisions pures (testées en unit) ────────────────────────────

// Actions possibles selon le badge ouvert (null = journée non commencée).
export function nextClockActions(openType: ClockType | null): ClockAction[] {
  if (openType === null) return ["DEBUT"];
  if (openType === "TRAVAIL") return ["PAUSE", "FIN"];
  return ["REPRISE", "FIN"];
}

// Totaux par type en minutes entières ; un badge encore ouvert compte
// jusqu'à `now`.
export function computeWorkedMinutes(
  entries: { type: ClockType; startedAt: Date; endedAt: Date | null }[],
  now: Date
): { workedMinutes: number; pauseMinutes: number } {
  let workedMs = 0;
  let pauseMs = 0;
  for (const entry of entries) {
    const end = entry.endedAt ?? now;
    const duration = Math.max(0, end.getTime() - entry.startedAt.getTime());
    if (entry.type === "TRAVAIL") workedMs += duration;
    else pauseMs += duration;
  }
  return {
    workedMinutes: Math.floor(workedMs / 60_000),
    pauseMinutes: Math.floor(pauseMs / 60_000),
  };
}

// « 7 h 05 » — affichage des durées.
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

// ── Lectures ─────────────────────────────────────────────────────

async function requireOwnEmployee(actor: SessionUser) {
  const own = await db.query.employees.findFirst({
    where: eq(employees.userId, actor.id),
  });
  if (!own) throw new Error("Aucune fiche salarié liée à votre compte.");
  return own;
}

// Journée en cours (heure de Paris) du salarié connecté.
export async function getMyClockDay(actor: SessionUser) {
  assertCan(actor, "self:clock");
  const own = await requireOwnEmployee(actor);
  const today = todayParis();

  const entries = await db
    .select()
    .from(clockEntries)
    .where(
      and(
        eq(clockEntries.employeeId, own.id),
        sql`(${clockEntries.startedAt} AT TIME ZONE 'Europe/Paris')::date = ${today}`
      )
    )
    .orderBy(asc(clockEntries.startedAt));

  const open = entries.find((e) => e.endedAt === null) ?? null;
  return {
    employeeId: own.id,
    entries,
    open,
    actions: nextClockActions(open?.type ?? null),
    ...computeWorkedMinutes(entries, new Date()),
  };
}

// Feuille de temps par jour civil (Paris) — RH ou le salarié lui-même.
export async function getTimesheet(
  actor: SessionUser,
  input: { employeeId: string; from: string; to: string }
) {
  if (!can(actor, "hr:read")) {
    assertCan(actor, "self:clock");
    const own = await requireOwnEmployee(actor);
    if (own.id !== input.employeeId) {
      throw new ForbiddenError("Feuille de temps réservée à la RH.");
    }
  }

  const result = await db.execute<{
    day: string;
    type: ClockType;
    minutes: number;
  }>(sql`
    SELECT (started_at AT TIME ZONE 'Europe/Paris')::date::text AS day,
           type,
           FLOOR(SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at))) / 60)::int AS minutes
    FROM clock_entries
    WHERE employee_id = ${input.employeeId}
      AND (started_at AT TIME ZONE 'Europe/Paris')::date BETWEEN ${input.from} AND ${input.to}
    GROUP BY 1, 2
    ORDER BY 1
  `);

  const byDay = new Map<string, { day: string; workedMinutes: number; pauseMinutes: number }>();
  for (const row of result.rows) {
    const entry = byDay.get(row.day) ?? {
      day: row.day,
      workedMinutes: 0,
      pauseMinutes: 0,
    };
    if (row.type === "TRAVAIL") entry.workedMinutes += Number(row.minutes);
    else entry.pauseMinutes += Number(row.minutes);
    byDay.set(row.day, entry);
  }
  return [...byDay.values()];
}

// ── Écritures ────────────────────────────────────────────────────

export async function clock(actor: SessionUser, action: ClockAction) {
  assertCan(actor, "self:clock");
  const own = await requireOwnEmployee(actor);

  const open = await db.query.clockEntries.findFirst({
    where: and(eq(clockEntries.employeeId, own.id), isNull(clockEntries.endedAt)),
  });
  if (!nextClockActions(open?.type ?? null).includes(action)) {
    throw new Error("Action impossible dans l'état actuel de la pointeuse.");
  }

  const now = new Date();
  if (open) {
    await auditedUpdate({ id: actor.id }, clockEntries, open.id, { endedAt: now });
  }
  if (action === "DEBUT" || action === "REPRISE") {
    await auditedInsert({ id: actor.id }, clockEntries, {
      employeeId: own.id,
      type: "TRAVAIL",
      startedAt: now,
    });
  } else if (action === "PAUSE") {
    await auditedInsert({ id: actor.id }, clockEntries, {
      employeeId: own.id,
      type: "PAUSE",
      startedAt: now,
    });
  }
  return { action, at: now };
}

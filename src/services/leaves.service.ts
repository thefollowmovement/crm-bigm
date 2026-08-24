import "server-only";

import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { employees, leaveRequests, users } from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { ForbiddenError, assertCan, isFranchisorMember } from "@/lib/authz/guards";
import { can } from "@/lib/authz/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { notify } from "@/services/notifications.service";

type LeaveRow = typeof leaveRequests.$inferSelect;
type LeaveStatus = LeaveRow["status"];

// ── Décisions pures (testées en unit) ────────────────────────────

// Chevauchement de deux périodes civiles incluses (strings ISO comparables).
export function datesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

// Qui peut annuler : le salarié tant que la demande n'est pas tranchée,
// la RH aussi sur une demande validée (changement de planning).
export function canCancelLeave(context: {
  isOwn: boolean;
  hasWrite: boolean;
  status: LeaveStatus;
}): boolean {
  if (context.hasWrite) {
    return context.status === "DEMANDEE" || context.status === "VALIDEE";
  }
  return context.isOwn && context.status === "DEMANDEE";
}

// ── Lectures ─────────────────────────────────────────────────────

export async function listLeaves(
  actor: SessionUser,
  filters: {
    status?: LeaveStatus;
    employeeId?: string;
    // Demandes chevauchant la période [from, to] incluse (vue calendrier).
    overlapping?: { from: string; to: string };
  } = {}
) {
  if (!can(actor, "hr:read")) assertCan(actor, "self:leave");

  const conditions = [
    filters.status ? eq(leaveRequests.status, filters.status) : undefined,
    filters.employeeId ? eq(leaveRequests.employeeId, filters.employeeId) : undefined,
    filters.overlapping ? lte(leaveRequests.startDate, filters.overlapping.to) : undefined,
    filters.overlapping ? gte(leaveRequests.endDate, filters.overlapping.from) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  if (!can(actor, "hr:read")) {
    // Salarié : uniquement ses propres demandes.
    const own = await db.query.employees.findFirst({
      where: eq(employees.userId, actor.id),
      columns: { id: true },
    });
    if (!own) return [];
    conditions.push(eq(leaveRequests.employeeId, own.id));
  }

  const rows = await db.query.leaveRequests.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: {
      employee: {
        columns: { id: true, firstName: true, lastName: true, storeId: true },
        with: { store: { columns: { code: true, name: true } } },
      },
      decidedBy: { columns: { firstName: true, lastName: true } },
    },
    orderBy: [desc(leaveRequests.createdAt)],
  });
  // Congés du siège Big M CIE : réservés aux membres de l'entité (sauf les
  // siens, déjà scopés plus haut pour un salarié).
  if (can(actor, "hr:read") && !isFranchisorMember(actor)) {
    return rows.filter((r) => r.employee.storeId !== null);
  }
  return rows;
}

// ── Écritures ────────────────────────────────────────────────────

async function notifyHrPole(payload: { title: string; body?: string; link: string }) {
  const members = await db.query.users.findMany({
    where: and(eq(users.pole, "RH"), eq(users.isActive, true)),
    columns: { id: true },
  });
  await notify(
    members.map((m) => m.id),
    { type: "RH", ...payload }
  );
}

export type LeaveInput = {
  employeeId?: string | null;
  type: LeaveRow["type"];
  startDate: string;
  endDate: string;
  comment: string | null;
};

export async function requestLeave(actor: SessionUser, input: LeaveInput) {
  // La RH saisit pour n'importe qui ; un salarié pour lui-même seulement.
  let employeeId = input.employeeId ?? null;
  const own = await db.query.employees.findFirst({
    where: eq(employees.userId, actor.id),
    columns: { id: true, firstName: true, lastName: true },
  });
  const forOther = employeeId !== null && employeeId !== own?.id;
  if (!can(actor, "hr:write") || !employeeId) {
    assertCan(actor, "self:leave");
    if (forOther) {
      throw new ForbiddenError("Vous ne pouvez demander que pour vous-même.");
    }
    if (!own) throw new Error("Aucune fiche salarié liée à votre compte.");
    employeeId = own.id;
  }

  if (input.endDate < input.startDate) {
    throw new Error("La date de fin doit être postérieure à la date de début.");
  }

  const existing = await db.query.leaveRequests.findMany({
    where: and(
      eq(leaveRequests.employeeId, employeeId),
      inArray(leaveRequests.status, ["DEMANDEE", "VALIDEE"])
    ),
    columns: { startDate: true, endDate: true },
  });
  if (
    existing.some((l) =>
      datesOverlap(l.startDate, l.endDate, input.startDate, input.endDate)
    )
  ) {
    throw new Error("Cette période chevauche une demande déjà déposée.");
  }

  const employee = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
    columns: { id: true, firstName: true, lastName: true, storeId: true, userId: true },
  });
  if (!employee) throw new Error("Fiche salarié introuvable.");
  // Saisie POUR un salarié du siège Big M CIE : membres de l'entité seulement
  // (le salarié du siège reste libre de demander pour lui-même).
  if (
    employee.storeId === null &&
    employee.userId !== actor.id &&
    !isFranchisorMember(actor)
  ) {
    throw new ForbiddenError(
      "Dossier du siège Big M CIE : réservé aux membres de l'entité FRANCHISEUR."
    );
  }

  const leave = await auditedInsert({ id: actor.id }, leaveRequests, {
    employeeId,
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    comment: input.comment,
  });

  await notifyHrPole({
    title: `Demande de congés de ${employee.firstName} ${employee.lastName}`,
    body: `Du ${input.startDate} au ${input.endDate}`,
    link: "/rh/conges",
  });
  return leave;
}

export async function decideLeave(
  actor: SessionUser,
  leaveId: string,
  decision: "VALIDEE" | "REFUSEE",
  comment?: string | null
) {
  assertCan(actor, "hr:write");
  const leave = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, leaveId),
    with: {
      employee: {
        columns: { userId: true, firstName: true, lastName: true, storeId: true },
      },
    },
  });
  if (!leave) throw new Error("Demande introuvable.");
  if (leave.employee.storeId === null && !isFranchisorMember(actor)) {
    throw new ForbiddenError(
      "Dossier du siège Big M CIE : réservé aux membres de l'entité FRANCHISEUR."
    );
  }
  if (leave.status !== "DEMANDEE") {
    throw new Error("Cette demande a déjà été tranchée.");
  }

  const updated = await auditedUpdate({ id: actor.id }, leaveRequests, leaveId, {
    status: decision,
    decidedById: actor.id,
    decidedAt: new Date(),
    decisionComment: comment ?? null,
  });

  if (leave.employee.userId) {
    await notify([leave.employee.userId], {
      type: "RH",
      title:
        decision === "VALIDEE"
          ? "Votre demande de congés est validée"
          : "Votre demande de congés est refusée",
      body: `Du ${leave.startDate} au ${leave.endDate}`,
      link: "/mon-espace",
    });
  }
  return updated;
}

export async function cancelLeave(actor: SessionUser, leaveId: string) {
  const leave = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, leaveId),
    with: { employee: { columns: { userId: true } } },
  });
  if (!leave) throw new Error("Demande introuvable.");

  const allowed = canCancelLeave({
    isOwn: leave.employee.userId === actor.id && can(actor, "self:leave"),
    hasWrite: can(actor, "hr:write"),
    status: leave.status,
  });
  if (!allowed) {
    throw new ForbiddenError("Cette demande ne peut plus être annulée.");
  }
  return auditedUpdate({ id: actor.id }, leaveRequests, leaveId, {
    status: "ANNULEE",
  });
}

import "server-only";

import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  fileAttachments,
  ticketAssignees,
  ticketComments,
  tickets,
  users,
} from "@/db/schema";
import { auditedDelete, auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { can } from "@/lib/authz/permissions";
import { ForbiddenError, assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { saveUpload } from "@/lib/files/storage";
import { notify } from "@/services/notifications.service";

type TicketRow = typeof tickets.$inferSelect;
type TicketStatus = TicketRow["status"];
type Pole = TicketRow["toPole"];

// ── Machine à états du ticket ────────────────────────────────────
// NOUVEAU → AFFECTE → EN_COURS ⇄ EN_ATTENTE → (EN_COURS) → TERMINE → VALIDE
// Réouverture : TERMINE → EN_COURS.
const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NOUVEAU: ["AFFECTE"],
  AFFECTE: ["EN_COURS"],
  EN_COURS: ["EN_ATTENTE", "TERMINE"],
  EN_ATTENTE: ["EN_COURS"],
  TERMINE: ["VALIDE", "EN_COURS"],
  VALIDE: [],
};

// Décision pure (testée en unit).
export function canTransition(
  current: TicketStatus,
  next: TicketStatus,
  context: { isRequester: boolean; role: SessionUser["role"] }
): { allowed: boolean; reason?: string } {
  if (!TRANSITIONS[current].includes(next)) {
    return {
      allowed: false,
      reason: `Transition ${current} → ${next} impossible.`,
    };
  }
  if (next === "VALIDE") {
    const canValidate =
      context.isRequester || context.role === "ADMIN" || context.role === "DIRECTION";
    if (!canValidate) {
      return {
        allowed: false,
        reason: "Seul le demandeur (ou la direction) peut valider un ticket terminé.",
      };
    }
  }
  return { allowed: true };
}

export function isTicketLate(
  ticket: Pick<TicketRow, "dueDate" | "status">,
  today: string
): boolean {
  if (!ticket.dueDate) return false;
  if (ticket.status === "TERMINE" || ticket.status === "VALIDE") return false;
  return ticket.dueDate < today;
}

// ── Requêtes ─────────────────────────────────────────────────────

export type TicketFilters = {
  view?: "mine" | "pole" | "all";
  status?: TicketStatus;
  priority?: TicketRow["priority"];
};

// Condition « je suis concerné » : demandeur, responsable principal ou
// co-responsable (table ticketAssignees).
function mineCondition(actorId: string): SQL {
  return or(
    eq(tickets.requesterId, actorId),
    eq(tickets.assigneeId, actorId),
    inArray(
      tickets.id,
      db
        .select({ id: ticketAssignees.ticketId })
        .from(ticketAssignees)
        .where(eq(ticketAssignees.userId, actorId))
    )
  )!;
}

// Sans ticket:read (salarié, franchisé…), un utilisateur voit tout de même
// LES tickets qui le concernent : la vue est forcée sur « les miens ».
export async function listTickets(actor: SessionUser, filters: TicketFilters = {}) {
  const conditions: SQL[] = [];
  if (!can(actor, "ticket:read") || filters.view === "mine") {
    conditions.push(mineCondition(actor.id));
  } else if (filters.view === "pole" && actor.pole) {
    const cond = or(
      eq(tickets.toPole, actor.pole),
      eq(tickets.fromPole, actor.pole),
      sql`${tickets.extraPoles} @> ARRAY[${actor.pole}]::pole[]`
    );
    if (cond) conditions.push(cond);
  }
  if (filters.status) conditions.push(eq(tickets.status, filters.status));
  if (filters.priority) conditions.push(eq(tickets.priority, filters.priority));

  return db.query.tickets.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [desc(tickets.createdAt)],
    with: {
      store: { columns: { id: true, code: true, name: true } },
      requester: { columns: { id: true, firstName: true, lastName: true } },
      assignee: { columns: { id: true, firstName: true, lastName: true } },
      assignees: {
        with: { user: { columns: { id: true, firstName: true, lastName: true } } },
      },
    },
  });
}

export async function getTicket(actor: SessionUser, ticketId: string) {
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
    with: {
      store: { columns: { id: true, code: true, name: true } },
      requester: { columns: { id: true, firstName: true, lastName: true, pole: true } },
      assignee: { columns: { id: true, firstName: true, lastName: true } },
      assignees: {
        with: { user: { columns: { id: true, firstName: true, lastName: true } } },
      },
      comments: {
        orderBy: [ticketComments.createdAt],
        with: { author: { columns: { id: true, firstName: true, lastName: true } } },
      },
    },
  });
  if (!ticket) return null;

  // Sans ticket:read, seul un ticket qui me concerne est consultable.
  const concerned =
    ticket.requesterId === actor.id ||
    ticket.assigneeId === actor.id ||
    ticket.assignees.some((a) => a.userId === actor.id);
  if (!can(actor, "ticket:read") && !concerned) {
    throw new ForbiddenError("Ce ticket ne vous concerne pas.");
  }

  const attachments = await db.query.fileAttachments.findMany({
    where: and(
      eq(fileAttachments.entityType, "TICKET"),
      eq(fileAttachments.entityId, ticketId)
    ),
    columns: { id: true, originalName: true },
  });
  return { ...ticket, attachments };
}

// TOUT utilisateur actif peut être responsable d'un ticket : collaborateurs
// internes, mais aussi salariés de boutique ou franchisés (ils voient alors
// leurs tickets, même sans la permission ticket:read).
export async function listAssignableUsers(actor: SessionUser) {
  assertCan(actor, "ticket:read");
  return db.query.users.findMany({
    where: eq(users.isActive, true),
    columns: { id: true, firstName: true, lastName: true, pole: true, role: true },
    orderBy: [asc(users.lastName), asc(users.firstName)],
  });
}

async function notifyPole(pole: Pole, exceptUserId: string, payload: {
  title: string;
  body?: string;
  link: string;
}) {
  const members = await db.query.users.findMany({
    where: and(eq(users.pole, pole), eq(users.isActive, true)),
    columns: { id: true },
  });
  await notify(
    members.map((m) => m.id).filter((id) => id !== exceptUserId),
    { type: "TICKET", ...payload }
  );
}

// ── Écritures ────────────────────────────────────────────────────

// Vérifie que chaque id correspond à un utilisateur actif ; renvoie la liste
// dédupliquée dans l'ordre de saisie (le premier = responsable principal).
async function assertActiveUsers(ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await db.query.users.findMany({
    where: and(inArray(users.id, unique), eq(users.isActive, true)),
    columns: { id: true },
  });
  if (rows.length !== unique.length) throw new Error("Responsable invalide.");
  return unique;
}

export async function createTicket(
  actor: SessionUser,
  input: {
    title: string;
    description: string;
    toPole: Pole;
    // Pôles destinataires supplémentaires (étape 36).
    extraPoles?: Pole[];
    storeId: string | null;
    priority: TicketRow["priority"];
    dueDate: string | null;
    // Responsables désignés dès la création : le ticket naît AFFECTE.
    assigneeIds?: string[];
    files: File[];
  }
) {
  assertCan(actor, "ticket:write");
  const fromPole = actor.pole ?? "DIRECTION";
  const extraPoles = [
    ...new Set((input.extraPoles ?? []).filter((p) => p !== input.toPole)),
  ];
  const assigneeIds = await assertActiveUsers(input.assigneeIds ?? []);

  const ticket = await auditedInsert({ id: actor.id }, tickets, {
    title: input.title,
    description: input.description,
    fromPole,
    toPole: input.toPole,
    extraPoles,
    storeId: input.storeId,
    priority: input.priority,
    dueDate: input.dueDate,
    requesterId: actor.id,
    assigneeId: assigneeIds[0] ?? null,
    status: assigneeIds.length > 0 ? "AFFECTE" : "NOUVEAU",
  });
  for (const userId of assigneeIds) {
    await auditedInsert({ id: actor.id }, ticketAssignees, {
      ticketId: ticket.id,
      userId,
    });
  }
  for (const file of input.files) {
    await saveUpload(actor, file, { entityType: "TICKET", entityId: ticket.id });
  }
  const number = `T-${String(ticket.number).padStart(6, "0")}`;
  for (const pole of [input.toPole, ...extraPoles]) {
    await notifyPole(pole, actor.id, {
      title: `Nouveau ticket ${number} : ${input.title}`,
      body: `De ${actor.firstName} ${actor.lastName} (${fromPole})`,
      link: `/tickets/${ticket.id}`,
    });
  }
  await notify(
    assigneeIds.filter((id) => id !== actor.id),
    {
      type: "TICKET",
      title: `Ticket ${number} affecté à vous`,
      body: input.title,
      link: `/tickets/${ticket.id}`,
    }
  );
  return ticket;
}

// Remplace la liste des responsables (diff audité) : le premier devient le
// responsable principal ; seuls les nouveaux venus sont notifiés.
export async function setTicketAssignees(
  actor: SessionUser,
  ticketId: string,
  userIds: string[]
) {
  assertCan(actor, "ticket:write");
  const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
  if (!ticket) throw new Error("Ticket introuvable.");
  if (ticket.status === "VALIDE") throw new Error("Ticket déjà validé.");

  const wanted = await assertActiveUsers(userIds);
  const existing = await db.query.ticketAssignees.findMany({
    where: eq(ticketAssignees.ticketId, ticketId),
  });
  const existingIds = new Set(existing.map((a) => a.userId));
  const added = wanted.filter((id) => !existingIds.has(id));

  for (const row of existing) {
    if (!wanted.includes(row.userId)) {
      await auditedDelete({ id: actor.id }, ticketAssignees, row.id);
    }
  }
  for (const userId of added) {
    await auditedInsert({ id: actor.id }, ticketAssignees, { ticketId, userId });
  }

  const updated = await auditedUpdate({ id: actor.id }, tickets, ticketId, {
    assigneeId: wanted[0] ?? null,
    status:
      ticket.status === "NOUVEAU" && wanted.length > 0 ? "AFFECTE" : ticket.status,
  });
  await notify(
    added.filter((id) => id !== actor.id),
    {
      type: "TICKET",
      title: `Ticket T-${String(ticket.number).padStart(6, "0")} affecté à vous`,
      body: ticket.title,
      link: `/tickets/${ticketId}`,
    }
  );
  return updated;
}

// Compatibilité : affectation d'un responsable unique.
export async function assignTicket(
  actor: SessionUser,
  ticketId: string,
  assigneeId: string
) {
  return setTicketAssignees(actor, ticketId, [assigneeId]);
}

export async function transitionTicket(
  actor: SessionUser,
  ticketId: string,
  next: TicketStatus
) {
  assertCan(actor, "ticket:write");
  const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
  if (!ticket) throw new Error("Ticket introuvable.");

  const decision = canTransition(ticket.status, next, {
    isRequester: ticket.requesterId === actor.id,
    role: actor.role,
  });
  if (!decision.allowed) throw new ForbiddenError(decision.reason);

  const patch: Partial<typeof tickets.$inferInsert> = { status: next };
  if (next === "TERMINE") patch.completedAt = new Date();
  if (next === "VALIDE") patch.validatedAt = new Date();
  if (next === "EN_COURS" && ticket.status === "TERMINE") patch.completedAt = null;

  const updated = await auditedUpdate({ id: actor.id }, tickets, ticketId, patch);

  if (next === "TERMINE" && ticket.requesterId !== actor.id) {
    await notify([ticket.requesterId], {
      type: "TICKET",
      title: `Ticket T-${String(ticket.number).padStart(6, "0")} terminé — à valider`,
      body: ticket.title,
      link: `/tickets/${ticketId}`,
    });
  }
  return updated;
}

export async function addTicketComment(
  actor: SessionUser,
  ticketId: string,
  body: string
) {
  assertCan(actor, "ticket:write");
  const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
  if (!ticket) throw new Error("Ticket introuvable.");

  const comment = await auditedInsert({ id: actor.id }, ticketComments, {
    ticketId,
    authorId: actor.id,
    body,
  });
  const recipients = [ticket.requesterId, ticket.assigneeId].filter(
    (id): id is string => id !== null && id !== actor.id
  );
  await notify(recipients, {
    type: "TICKET",
    title: `Nouveau commentaire sur T-${String(ticket.number).padStart(6, "0")}`,
    body: body.slice(0, 120),
    link: `/tickets/${ticketId}`,
  });
  return comment;
}

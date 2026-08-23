import "server-only";

import { and, asc, desc, eq, notInArray, or, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { fileAttachments, ticketComments, tickets, users } from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
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

export async function listTickets(actor: SessionUser, filters: TicketFilters = {}) {
  assertCan(actor, "ticket:read");
  const conditions: SQL[] = [];
  if (filters.view === "mine") {
    const cond = or(
      eq(tickets.requesterId, actor.id),
      eq(tickets.assigneeId, actor.id)
    );
    if (cond) conditions.push(cond);
  } else if (filters.view === "pole" && actor.pole) {
    const cond = or(eq(tickets.toPole, actor.pole), eq(tickets.fromPole, actor.pole));
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
    },
  });
}

export async function getTicket(actor: SessionUser, ticketId: string) {
  assertCan(actor, "ticket:read");
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
    with: {
      store: { columns: { id: true, code: true, name: true } },
      requester: { columns: { id: true, firstName: true, lastName: true, pole: true } },
      assignee: { columns: { id: true, firstName: true, lastName: true } },
      comments: {
        orderBy: [ticketComments.createdAt],
        with: { author: { columns: { id: true, firstName: true, lastName: true } } },
      },
    },
  });
  if (!ticket) return null;

  const attachments = await db.query.fileAttachments.findMany({
    where: and(
      eq(fileAttachments.entityType, "TICKET"),
      eq(fileAttachments.entityId, ticketId)
    ),
    columns: { id: true, originalName: true },
  });
  return { ...ticket, attachments };
}

// Collaborateurs internes actifs (tous pôles confondus) : un ticket peut être
// confié à une personne précise, pas seulement au pôle destinataire.
export async function listAssignableUsers(actor: SessionUser) {
  assertCan(actor, "ticket:read");
  return db.query.users.findMany({
    where: and(
      eq(users.isActive, true),
      notInArray(users.role, ["FRANCHISE", "SALARIE"])
    ),
    columns: { id: true, firstName: true, lastName: true, pole: true },
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

export async function createTicket(
  actor: SessionUser,
  input: {
    title: string;
    description: string;
    toPole: Pole;
    storeId: string | null;
    priority: TicketRow["priority"];
    dueDate: string | null;
    // Responsable désigné dès la création (optionnel) : le ticket naît AFFECTE.
    assigneeId?: string | null;
    files: File[];
  }
) {
  assertCan(actor, "ticket:write");
  const fromPole = actor.pole ?? "DIRECTION";

  let assigneeId: string | null = null;
  if (input.assigneeId) {
    const assignee = await db.query.users.findFirst({
      where: eq(users.id, input.assigneeId),
    });
    if (!assignee || !assignee.isActive) throw new Error("Responsable invalide.");
    assigneeId = assignee.id;
  }

  const ticket = await auditedInsert({ id: actor.id }, tickets, {
    title: input.title,
    description: input.description,
    fromPole,
    toPole: input.toPole,
    storeId: input.storeId,
    priority: input.priority,
    dueDate: input.dueDate,
    requesterId: actor.id,
    assigneeId,
    status: assigneeId ? "AFFECTE" : "NOUVEAU",
  });
  for (const file of input.files) {
    await saveUpload(actor, file, { entityType: "TICKET", entityId: ticket.id });
  }
  const number = `T-${String(ticket.number).padStart(6, "0")}`;
  await notifyPole(input.toPole, actor.id, {
    title: `Nouveau ticket ${number} : ${input.title}`,
    body: `De ${actor.firstName} ${actor.lastName} (${fromPole})`,
    link: `/tickets/${ticket.id}`,
  });
  if (assigneeId && assigneeId !== actor.id) {
    await notify([assigneeId], {
      type: "TICKET",
      title: `Ticket ${number} affecté à vous`,
      body: input.title,
      link: `/tickets/${ticket.id}`,
    });
  }
  return ticket;
}

export async function assignTicket(
  actor: SessionUser,
  ticketId: string,
  assigneeId: string
) {
  assertCan(actor, "ticket:write");
  const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
  if (!ticket) throw new Error("Ticket introuvable.");
  if (ticket.status === "VALIDE") throw new Error("Ticket déjà validé.");

  const assignee = await db.query.users.findFirst({ where: eq(users.id, assigneeId) });
  if (!assignee || !assignee.isActive) throw new Error("Responsable invalide.");

  const updated = await auditedUpdate({ id: actor.id }, tickets, ticketId, {
    assigneeId,
    status: ticket.status === "NOUVEAU" ? "AFFECTE" : ticket.status,
  });
  if (assigneeId !== actor.id) {
    await notify([assigneeId], {
      type: "TICKET",
      title: `Ticket T-${String(ticket.number).padStart(6, "0")} affecté à vous`,
      body: ticket.title,
      link: `/tickets/${ticketId}`,
    });
  }
  return updated;
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

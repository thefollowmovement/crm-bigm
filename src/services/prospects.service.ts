import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { agents, fileAttachments, prospectEvents, prospects, users } from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { todayParis } from "@/lib/dates";
import { PROSPECT_STATUS_LABELS } from "@/lib/labels";
import { saveUpload } from "@/lib/files/storage";

type ProspectRow = typeof prospects.$inferSelect;
type ProspectStatus = ProspectRow["status"];

// ── Décision pure (job prospect-followup, testée en unit) ────────

export function isFollowUpDue(
  prospect: Pick<ProspectRow, "nextFollowUpDate" | "status">,
  today: string
): boolean {
  if (prospect.status === "ABANDONNE") return false;
  return prospect.nextFollowUpDate !== null && prospect.nextFollowUpDate <= today;
}

// ── Agents immobiliers ───────────────────────────────────────────

export async function listAgents(actor: SessionUser) {
  assertCan(actor, "development:read");
  return db.query.agents.findMany({ orderBy: [asc(agents.name)] });
}

export type AgentInput = {
  name: string;
  agency: string | null;
  email: string | null;
  phone: string | null;
  zone: string | null;
  notes: string | null;
};

export async function createAgent(actor: SessionUser, input: AgentInput) {
  assertCan(actor, "development:write");
  return auditedInsert({ id: actor.id }, agents, { ...input });
}

export async function updateAgent(
  actor: SessionUser,
  id: string,
  input: AgentInput & { isActive: boolean }
) {
  assertCan(actor, "development:write");
  const existing = await db.query.agents.findFirst({ where: eq(agents.id, id) });
  if (!existing) throw new Error("Agent introuvable.");
  return auditedUpdate({ id: actor.id }, agents, id, { ...input });
}

// ── Prospects ────────────────────────────────────────────────────

export async function listProspects(
  actor: SessionUser,
  filters: { status?: ProspectStatus } = {}
) {
  assertCan(actor, "development:read");
  return db.query.prospects.findMany({
    where: filters.status ? eq(prospects.status, filters.status) : undefined,
    with: {
      agent: { columns: { id: true, name: true } },
      assignee: { columns: { firstName: true, lastName: true } },
    },
    orderBy: [desc(prospects.createdAt)],
  });
}

export async function getProspect(actor: SessionUser, id: string) {
  assertCan(actor, "development:read");
  const prospect = await db.query.prospects.findFirst({
    where: eq(prospects.id, id),
    with: {
      agent: { columns: { id: true, name: true } },
      assignee: { columns: { id: true, firstName: true, lastName: true } },
      events: {
        with: { createdBy: { columns: { firstName: true, lastName: true } } },
        orderBy: [desc(prospectEvents.eventDate), desc(prospectEvents.createdAt)],
      },
    },
  });
  if (!prospect) return null;
  const attachments = await db.query.fileAttachments.findMany({
    where: and(
      eq(fileAttachments.entityType, "PROSPECT"),
      eq(fileAttachments.entityId, id)
    ),
    columns: { id: true, originalName: true },
  });
  return { ...prospect, attachments };
}

export type ProspectInput = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  targetZone: string | null;
  budget: string | null;
  personalContribution: string | null;
  leadSource: string | null;
  interestLevel: ProspectRow["interestLevel"];
  agentId: string | null;
  assigneeId: string | null;
  nextFollowUpDate: string | null;
  notes: string | null;
};

export async function createProspect(actor: SessionUser, input: ProspectInput) {
  assertCan(actor, "development:write");
  return auditedInsert({ id: actor.id }, prospects, { ...input });
}

export async function updateProspect(
  actor: SessionUser,
  id: string,
  input: ProspectInput
) {
  assertCan(actor, "development:write");
  const existing = await db.query.prospects.findFirst({ where: eq(prospects.id, id) });
  if (!existing) throw new Error("Prospect introuvable.");
  return auditedUpdate({ id: actor.id }, prospects, id, { ...input });
}

// Transitions libres, mais chaque changement journalise un événement STATUT.
export async function changeProspectStatus(
  actor: SessionUser,
  id: string,
  status: ProspectStatus,
  note?: string | null
) {
  assertCan(actor, "development:write");
  const existing = await db.query.prospects.findFirst({ where: eq(prospects.id, id) });
  if (!existing) throw new Error("Prospect introuvable.");
  if (existing.status === status) return existing;

  const updated = await auditedUpdate({ id: actor.id }, prospects, id, { status });
  await auditedInsert({ id: actor.id }, prospectEvents, {
    prospectId: id,
    type: "STATUT",
    eventDate: todayParis(),
    notes: [
      `${PROSPECT_STATUS_LABELS[existing.status]} → ${PROSPECT_STATUS_LABELS[status]}`,
      note ?? null,
    ]
      .filter(Boolean)
      .join(" — "),
    createdById: actor.id,
  });
  return updated;
}

export async function addProspectEvent(
  actor: SessionUser,
  prospectId: string,
  input: {
    type: Exclude<(typeof prospectEvents.$inferSelect)["type"], "STATUT">;
    eventDate: string;
    notes: string | null;
  }
) {
  assertCan(actor, "development:write");
  const existing = await db.query.prospects.findFirst({
    where: eq(prospects.id, prospectId),
  });
  if (!existing) throw new Error("Prospect introuvable.");
  return auditedInsert({ id: actor.id }, prospectEvents, {
    prospectId,
    ...input,
    createdById: actor.id,
  });
}

export async function attachProspectFiles(
  actor: SessionUser,
  prospectId: string,
  files: File[]
) {
  assertCan(actor, "development:write");
  const existing = await db.query.prospects.findFirst({
    where: eq(prospects.id, prospectId),
  });
  if (!existing) throw new Error("Prospect introuvable.");
  for (const file of files) {
    await saveUpload(actor, file, { entityType: "PROSPECT", entityId: prospectId });
  }
}

// Responsables possibles du suivi : pôle développement + direction.
export async function listDevMembers(actor: SessionUser) {
  assertCan(actor, "development:read");
  return db.query.users.findMany({
    where: and(eq(users.pole, "DEVELOPPEMENT"), eq(users.isActive, true)),
    columns: { id: true, firstName: true, lastName: true },
    orderBy: [asc(users.lastName)],
  });
}

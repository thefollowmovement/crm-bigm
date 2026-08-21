import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { fileAttachments, premises } from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { saveUpload } from "@/lib/files/storage";

type PremisesRow = typeof premises.$inferSelect;

export async function listPremises(
  actor: SessionUser,
  filters: { status?: PremisesRow["status"] } = {}
) {
  assertCan(actor, "development:read");
  return db.query.premises.findMany({
    where: filters.status ? eq(premises.status, filters.status) : undefined,
    with: { agent: { columns: { id: true, name: true } } },
    orderBy: [desc(premises.createdAt)],
  });
}

export async function getPremises(actor: SessionUser, id: string) {
  assertCan(actor, "development:read");
  const row = await db.query.premises.findFirst({
    where: eq(premises.id, id),
    with: { agent: { columns: { id: true, name: true } } },
  });
  if (!row) return null;
  const attachments = await db.query.fileAttachments.findMany({
    where: and(
      eq(fileAttachments.entityType, "PREMISES"),
      eq(fileAttachments.entityId, id)
    ),
    columns: { id: true, originalName: true, mimeType: true },
  });
  return { ...row, attachments };
}

export type PremisesInput = {
  address: string;
  city: string;
  postalCode: string | null;
  surfaceM2: string | null;
  monthlyRent: string | null;
  leaseRights: string | null;
  status: PremisesRow["status"];
  agentId: string | null;
  notes: string | null;
};

export async function createPremises(actor: SessionUser, input: PremisesInput) {
  assertCan(actor, "development:write");
  return auditedInsert({ id: actor.id }, premises, { ...input });
}

export async function updatePremises(
  actor: SessionUser,
  id: string,
  input: PremisesInput
) {
  assertCan(actor, "development:write");
  const existing = await db.query.premises.findFirst({ where: eq(premises.id, id) });
  if (!existing) throw new Error("Local introuvable.");
  return auditedUpdate({ id: actor.id }, premises, id, { ...input });
}

export async function attachPremisesFiles(
  actor: SessionUser,
  premisesId: string,
  files: File[]
) {
  assertCan(actor, "development:write");
  const existing = await db.query.premises.findFirst({
    where: eq(premises.id, premisesId),
  });
  if (!existing) throw new Error("Local introuvable.");
  for (const file of files) {
    await saveUpload(actor, file, { entityType: "PREMISES", entityId: premisesId });
  }
}

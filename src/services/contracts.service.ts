import "server-only";

import { and, asc, eq, inArray, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { contracts, fileAttachments, stores } from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
import {
  ForbiddenError,
  accessibleStoreIds,
  assertCan,
  assertStoreAccess,
} from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { saveUpload } from "@/lib/files/storage";

type ContractInsert = typeof contracts.$inferInsert;

export type ContractInput = {
  storeId: string;
  type: ContractInsert["type"];
  status: NonNullable<ContractInsert["status"]>;
  reference: string | null;
  signedAt: string | null;
  startDate: string | null;
  endDate: string | null;
  alertMonthsBefore: number;
  parentContractId: string | null;
  notes: string | null;
};

// Vue transverse triée par échéance (page /contrats).
export async function listContracts(
  actor: SessionUser,
  filters: { status?: NonNullable<ContractInsert["status"]> } = {}
) {
  assertCan(actor, "contract:read");
  const conditions: SQL[] = [];
  const scoped = await accessibleStoreIds(actor);
  if (scoped !== null) {
    if (scoped.length === 0) return [];
    conditions.push(inArray(contracts.storeId, scoped));
  }
  if (filters.status) conditions.push(eq(contracts.status, filters.status));

  return db.query.contracts.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [asc(contracts.endDate)],
    with: {
      store: { columns: { id: true, code: true, name: true } },
      franchisee: { columns: { id: true, companyName: true } },
    },
  });
}

export async function listStoreContracts(actor: SessionUser, storeId: string) {
  assertCan(actor, "contract:read");
  await assertStoreAccess(actor, storeId);
  return db.query.contracts.findMany({
    where: eq(contracts.storeId, storeId),
    orderBy: [asc(contracts.endDate)],
    with: { parentContract: { columns: { id: true, reference: true, type: true } } },
  });
}

export async function getContract(actor: SessionUser, contractId: string) {
  assertCan(actor, "contract:read");
  const contract = await db.query.contracts.findFirst({
    where: eq(contracts.id, contractId),
    with: {
      store: { columns: { id: true, code: true, name: true } },
      franchisee: { columns: { id: true, companyName: true } },
      parentContract: { columns: { id: true, reference: true, type: true } },
      amendments: { columns: { id: true, reference: true, type: true, status: true } },
    },
  });
  if (!contract) return null;
  await assertStoreAccess(actor, contract.storeId);

  const attachments = await db.query.fileAttachments.findMany({
    where: and(
      eq(fileAttachments.entityType, "CONTRACT"),
      eq(fileAttachments.entityId, contractId)
    ),
    columns: { id: true, originalName: true, sizeBytes: true, createdAt: true },
  });
  return { ...contract, attachments };
}

export async function createContract(actor: SessionUser, input: ContractInput) {
  assertCan(actor, "contract:write");
  const store = await db.query.stores.findFirst({
    where: eq(stores.id, input.storeId),
  });
  if (!store) throw new Error("Boutique introuvable.");
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new Error("La date de fin doit être postérieure à la date de début.");
  }
  return auditedInsert({ id: actor.id }, contracts, {
    ...input,
    // le franchisé signataire est celui de la boutique au moment de la signature
    franchiseeId: store.franchiseeId,
  });
}

export async function updateContract(
  actor: SessionUser,
  contractId: string,
  input: Partial<ContractInput>
) {
  assertCan(actor, "contract:write");
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new Error("La date de fin doit être postérieure à la date de début.");
  }
  const current = await db.query.contracts.findFirst({
    where: eq(contracts.id, contractId),
  });
  if (!current) throw new ForbiddenError("Contrat introuvable.");
  // Si l'échéance change, l'alerte doit pouvoir repartir.
  const resetAlert =
    input.endDate !== undefined && input.endDate !== current.endDate
      ? { expiryAlertSentAt: null }
      : {};
  return auditedUpdate({ id: actor.id }, contracts, contractId, {
    ...input,
    ...resetAlert,
  });
}

export async function addContractAttachment(
  actor: SessionUser,
  contractId: string,
  file: File
) {
  assertCan(actor, "contract:write");
  const contract = await db.query.contracts.findFirst({
    where: eq(contracts.id, contractId),
  });
  if (!contract) throw new Error("Contrat introuvable.");
  return saveUpload(actor, file, { entityType: "CONTRACT", entityId: contractId });
}

import "server-only";

import { asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { commTasks, partnerStores, partners, stores } from "@/db/schema";
import { auditedDelete, auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { assertCan } from "@/lib/authz/guards";
import { can } from "@/lib/authz/permissions";
import type { SessionUser } from "@/lib/auth/session";

// Fiches partenaires / prestataires (cdc §11). Les notes internes sont
// SENSIBLES : absentes du DTO pour qui n'a pas partner:write.

type PartnerRow = typeof partners.$inferSelect;

export type PartnerDTO = Omit<PartnerRow, "internalNotes"> & {
  internalNotes?: string | null;
};

export function toPartnerDTO(partner: PartnerRow, actor: SessionUser): PartnerDTO {
  if (can(actor, "partner:write")) return partner;
  const rest: PartnerDTO = { ...partner };
  delete rest.internalNotes;
  return rest;
}

export async function listPartners(
  actor: SessionUser,
  options: { includeInactive?: boolean } = {}
): Promise<PartnerDTO[]> {
  assertCan(actor, "partner:read");
  const rows = await db.query.partners.findMany({
    where: options.includeInactive ? undefined : eq(partners.isActive, true),
    orderBy: [asc(partners.companyName)],
  });
  return rows.map((p) => toPartnerDTO(p, actor));
}

export async function getPartner(actor: SessionUser, partnerId: string) {
  assertCan(actor, "partner:read");
  const partner = await db.query.partners.findFirst({
    where: eq(partners.id, partnerId),
    with: {
      stores: { with: { store: { columns: { id: true, code: true, name: true } } } },
    },
  });
  if (!partner) return null;

  const tasks = await db.query.commTasks.findMany({
    where: eq(commTasks.partnerId, partnerId),
    orderBy: [desc(commTasks.createdAt)],
    columns: { id: true, number: true, title: true, status: true },
  });
  const { stores: links, ...row } = partner;
  return {
    ...toPartnerDTO(row, actor),
    stores: links.map((l) => l.store),
    tasks,
  };
}

export async function createPartner(
  actor: SessionUser,
  input: {
    companyName: string;
    contactName: string | null;
    phone: string | null;
    email: string | null;
    domain: string | null;
    tariffNotes: string | null;
    scopeNotes: string | null;
    internalNotes: string | null;
  }
) {
  assertCan(actor, "partner:write");
  const companyName = input.companyName.trim();
  if (!companyName) throw new Error("La raison sociale est obligatoire.");
  return auditedInsert({ id: actor.id }, partners, { ...input, companyName });
}

export async function updatePartner(
  actor: SessionUser,
  partnerId: string,
  patch: Partial<{
    companyName: string;
    contactName: string | null;
    phone: string | null;
    email: string | null;
    domain: string | null;
    tariffNotes: string | null;
    scopeNotes: string | null;
    internalNotes: string | null;
    isActive: boolean;
  }>
) {
  assertCan(actor, "partner:write");
  if (patch.companyName !== undefined && !patch.companyName.trim()) {
    throw new Error("La raison sociale est obligatoire.");
  }
  return auditedUpdate({ id: actor.id }, partners, partnerId, patch);
}

// Boutiques concernées par le partenaire : remplacement complet, audité
// ligne à ligne (règle CLAUDE.md n°3 — boucle sur les ids).
export async function setPartnerStores(
  actor: SessionUser,
  partnerId: string,
  storeIds: string[]
) {
  assertCan(actor, "partner:write");
  const partner = await db.query.partners.findFirst({
    where: eq(partners.id, partnerId),
  });
  if (!partner) throw new Error("Partenaire introuvable.");
  if (storeIds.length > 0) {
    const known = await db.query.stores.findMany({
      where: inArray(stores.id, storeIds),
      columns: { id: true },
    });
    if (known.length !== storeIds.length) throw new Error("Boutique introuvable.");
  }

  const existing = await db.query.partnerStores.findMany({
    where: eq(partnerStores.partnerId, partnerId),
  });
  const wanted = new Set(storeIds);
  for (const link of existing) {
    if (!wanted.has(link.storeId)) {
      await auditedDelete({ id: actor.id }, partnerStores, link.id);
    }
  }
  const current = new Set(existing.map((l) => l.storeId));
  for (const storeId of storeIds) {
    if (!current.has(storeId)) {
      await auditedInsert({ id: actor.id }, partnerStores, { partnerId, storeId });
    }
  }
}

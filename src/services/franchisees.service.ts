import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { franchisees } from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { ForbiddenError, assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";

export async function listFranchisees(actor: SessionUser) {
  assertCan(actor, "franchisee:read");
  return db.query.franchisees.findMany({
    orderBy: [asc(franchisees.companyName)],
    with: { stores: { columns: { id: true, code: true, name: true, status: true } } },
  });
}

export async function getFranchisee(actor: SessionUser, franchiseeId: string) {
  // Un utilisateur FRANCHISE peut voir SA fiche société uniquement.
  if (actor.role === "FRANCHISE") {
    if (actor.franchiseeId !== franchiseeId) {
      throw new ForbiddenError("Fiche hors de votre périmètre.");
    }
  } else {
    assertCan(actor, "franchisee:read");
  }
  const franchisee = await db.query.franchisees.findFirst({
    where: eq(franchisees.id, franchiseeId),
    with: {
      stores: {
        columns: { id: true, code: true, name: true, status: true, city: true },
      },
      users: { columns: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  return franchisee ?? null;
}

export type FranchiseeInput = {
  companyName: string;
  legalForm: string | null;
  siren: string | null;
  contactFirstName: string;
  contactLastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  notes?: string | null;
};

export async function createFranchisee(actor: SessionUser, input: FranchiseeInput) {
  assertCan(actor, "franchisee:write");
  if (input.siren) {
    const existing = await db.query.franchisees.findFirst({
      where: eq(franchisees.siren, input.siren),
    });
    if (existing) throw new Error(`Le SIREN ${input.siren} existe déjà.`);
  }
  return auditedInsert({ id: actor.id }, franchisees, input);
}

export async function updateFranchisee(
  actor: SessionUser,
  franchiseeId: string,
  input: Partial<FranchiseeInput>
) {
  assertCan(actor, "franchisee:write");
  if (input.siren) {
    const existing = await db.query.franchisees.findFirst({
      where: eq(franchisees.siren, input.siren),
    });
    if (existing && existing.id !== franchiseeId) {
      throw new Error(`Le SIREN ${input.siren} existe déjà.`);
    }
  }
  return auditedUpdate({ id: actor.id }, franchisees, franchiseeId, input);
}

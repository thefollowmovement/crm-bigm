import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { resaleListings, stores } from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";

type ResaleRow = typeof resaleListings.$inferSelect;

export async function listResales(actor: SessionUser) {
  assertCan(actor, "resale:read");
  return db.query.resaleListings.findMany({
    with: {
      store: {
        columns: { id: true, code: true, name: true, city: true },
        with: { franchisee: { columns: { companyName: true } } },
      },
    },
    orderBy: [desc(resaleListings.createdAt)],
  });
}

export async function getResale(actor: SessionUser, id: string) {
  assertCan(actor, "resale:read");
  return db.query.resaleListings.findFirst({
    where: eq(resaleListings.id, id),
    with: {
      store: {
        columns: { id: true, code: true, name: true, city: true },
        with: { franchisee: { columns: { id: true, companyName: true } } },
      },
    },
  });
}

export type ResaleInput = {
  storeId: string;
  wish: ResaleRow["wish"];
  askingPrice: string | null;
  urgency: ResaleRow["urgency"];
  status: ResaleRow["status"];
  notes: string | null;
};

export async function createResale(actor: SessionUser, input: ResaleInput) {
  assertCan(actor, "resale:write");
  const store = await db.query.stores.findFirst({
    where: eq(stores.id, input.storeId),
  });
  if (!store) throw new Error("Boutique introuvable.");
  if (store.type !== "FRANCHISE") {
    throw new Error("Une cession ne concerne qu'une boutique franchisée.");
  }
  return auditedInsert({ id: actor.id }, resaleListings, { ...input });
}

export async function updateResale(
  actor: SessionUser,
  id: string,
  input: Omit<ResaleInput, "storeId">
) {
  assertCan(actor, "resale:write");
  const existing = await db.query.resaleListings.findFirst({
    where: eq(resaleListings.id, id),
  });
  if (!existing) throw new Error("Cession introuvable.");
  return auditedUpdate({ id: actor.id }, resaleListings, id, { ...input });
}

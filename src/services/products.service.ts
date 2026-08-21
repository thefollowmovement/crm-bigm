import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { productFamilies, products } from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";

// Référentiel produits & familles (cdc §17) — géré par la compta/direction,
// consommé par les imports de ventes et, en phase 3+, par le Food Cost.

export async function listFamilies(actor: SessionUser) {
  assertCan(actor, "revenue:read");
  return db.query.productFamilies.findMany({
    orderBy: [asc(productFamilies.displayOrder), asc(productFamilies.name)],
  });
}

export async function createFamily(
  actor: SessionUser,
  input: { name: string; displayOrder?: number }
) {
  assertCan(actor, "product:manage");
  const name = input.name.trim();
  if (!name) throw new Error("Le nom de la famille est obligatoire.");
  const existing = await db.query.productFamilies.findFirst({
    where: eq(productFamilies.name, name),
  });
  if (existing) throw new Error(`La famille « ${name} » existe déjà.`);
  return auditedInsert({ id: actor.id }, productFamilies, {
    name,
    displayOrder: input.displayOrder ?? 0,
  });
}

export async function updateFamily(
  actor: SessionUser,
  id: string,
  patch: { name?: string; displayOrder?: number; isActive?: boolean }
) {
  assertCan(actor, "product:manage");
  if (patch.name !== undefined && !patch.name.trim()) {
    throw new Error("Le nom de la famille est obligatoire.");
  }
  return auditedUpdate({ id: actor.id }, productFamilies, id, {
    ...patch,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
  });
}

export async function listProducts(
  actor: SessionUser,
  options: { includeInactive?: boolean } = {}
) {
  assertCan(actor, "revenue:read");
  return db.query.products.findMany({
    where: options.includeInactive ? undefined : eq(products.isActive, true),
    orderBy: [asc(products.code)],
    with: { family: true },
  });
}

export async function createProduct(
  actor: SessionUser,
  input: { code: string; name: string; familyId: string }
) {
  assertCan(actor, "product:manage");
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!code) throw new Error("Le code produit est obligatoire.");
  if (!name) throw new Error("Le nom du produit est obligatoire.");
  const family = await db.query.productFamilies.findFirst({
    where: eq(productFamilies.id, input.familyId),
  });
  if (!family) throw new Error("Famille de produits introuvable.");
  const existing = await db.query.products.findFirst({
    where: eq(products.code, code),
  });
  if (existing) throw new Error(`Le code produit « ${code} » existe déjà.`);
  return auditedInsert({ id: actor.id }, products, {
    code,
    name,
    familyId: input.familyId,
  });
}

export async function updateProduct(
  actor: SessionUser,
  id: string,
  patch: { name?: string; familyId?: string; isActive?: boolean }
) {
  assertCan(actor, "product:manage");
  if (patch.name !== undefined && !patch.name.trim()) {
    throw new Error("Le nom du produit est obligatoire.");
  }
  if (patch.familyId !== undefined) {
    const family = await db.query.productFamilies.findFirst({
      where: eq(productFamilies.id, patch.familyId),
    });
    if (!family) throw new Error("Famille de produits introuvable.");
  }
  return auditedUpdate({ id: actor.id }, products, id, {
    ...patch,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
  });
}

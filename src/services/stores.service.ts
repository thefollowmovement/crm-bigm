import "server-only";

import { and, asc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { fileAttachments, storePlatforms, stores } from "@/db/schema";
import { auditedDelete, auditedInsert, auditedUpdate } from "@/lib/db/audited";
import {
  ForbiddenError,
  accessibleStoreIds,
  assertCan,
  assertStoreAccess,
} from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { saveUpload } from "@/lib/files/storage";

type StoreInsert = typeof stores.$inferInsert;

export type StoreFilters = {
  search?: string;
  type?: StoreInsert["type"];
  status?: NonNullable<StoreInsert["status"]>;
};

export async function listStores(actor: SessionUser, filters: StoreFilters = {}) {
  assertCan(actor, "store:read");
  const conditions: SQL[] = [];

  const scoped = await accessibleStoreIds(actor);
  if (scoped !== null) {
    if (scoped.length === 0) return [];
    conditions.push(inArray(stores.id, scoped));
  }
  if (filters.search) {
    const term = `%${filters.search}%`;
    const searchCond = or(
      ilike(stores.name, term),
      ilike(stores.code, term),
      ilike(stores.city, term)
    );
    if (searchCond) conditions.push(searchCond);
  }
  if (filters.type) conditions.push(eq(stores.type, filters.type));
  if (filters.status) conditions.push(eq(stores.status, filters.status));

  const rows = await db.query.stores.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [asc(stores.code)],
    with: {
      franchisee: { columns: { id: true, companyName: true } },
      animateur: { columns: { id: true, firstName: true, lastName: true } },
    },
  });
  const photos = await storePhotoIds(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, photoFileId: photos.get(r.id) ?? null }));
}

// Photo courante de chaque boutique (au plus une pièce jointe STORE_PHOTO).
async function storePhotoIds(storeIds: string[]): Promise<Map<string, string>> {
  if (storeIds.length === 0) return new Map();
  const rows = await db.query.fileAttachments.findMany({
    where: and(
      eq(fileAttachments.entityType, "STORE_PHOTO"),
      inArray(fileAttachments.entityId, storeIds)
    ),
    columns: { id: true, entityId: true },
  });
  return new Map(rows.map((r) => [r.entityId as string, r.id]));
}

export async function getStore(actor: SessionUser, storeId: string) {
  assertCan(actor, "store:read");
  await assertStoreAccess(actor, storeId);
  const store = await db.query.stores.findFirst({
    where: eq(stores.id, storeId),
    with: {
      franchisee: true,
      animateur: { columns: { id: true, firstName: true, lastName: true } },
      platforms: true,
    },
  });
  if (!store) return null;
  const photos = await storePhotoIds([store.id]);
  return { ...store, photoFileId: photos.get(store.id) ?? null };
}

export type StoreInput = {
  code: string;
  name: string;
  type: StoreInsert["type"];
  status: NonNullable<StoreInsert["status"]>;
  franchiseeId: string | null;
  animateurId: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  region: string | null;
  latitude: string | null;
  longitude: string | null;
  phone: string | null;
  email: string | null;
  siret: string | null;
  openingDate: string | null;
  closingDate: string | null;
  internalNotes?: string | null;
};

function checkTypeCoherence(input: Pick<StoreInput, "type" | "franchiseeId">) {
  if (input.type === "SUCCURSALE" && input.franchiseeId) {
    throw new Error("Une succursale n'a pas de franchisé rattaché.");
  }
}

export async function createStore(actor: SessionUser, input: StoreInput) {
  assertCan(actor, "store:write");
  checkTypeCoherence(input);
  const existing = await db.query.stores.findFirst({
    where: eq(stores.code, input.code),
  });
  if (existing) throw new Error(`Le code boutique ${input.code} existe déjà.`);
  return auditedInsert({ id: actor.id }, stores, input);
}

export async function updateStore(
  actor: SessionUser,
  storeId: string,
  input: Partial<StoreInput>
) {
  assertCan(actor, "store:write");
  if (input.type !== undefined) {
    checkTypeCoherence({ type: input.type, franchiseeId: input.franchiseeId ?? null });
  }
  if (input.code) {
    const existing = await db.query.stores.findFirst({
      where: eq(stores.code, input.code),
    });
    if (existing && existing.id !== storeId) {
      throw new Error(`Le code boutique ${input.code} existe déjà.`);
    }
  }
  // Le rôle FRANCHISE n'a pas store:write ; si un jour il l'obtient, il ne
  // doit jamais pouvoir toucher les notes internes.
  if (!actor || actor.role === "FRANCHISE") {
    delete input.internalNotes;
  }
  return auditedUpdate({ id: actor.id }, stores, storeId, input);
}

// ── Photo de la boutique ─────────────────────────────────────────

const PHOTO_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

// Remplace la photo de la fiche (au plus une par boutique) : l'ancienne
// pièce jointe est supprimée (audité), la nouvelle enregistrée en STORE_PHOTO.
export async function setStorePhoto(
  actor: SessionUser,
  storeId: string,
  file: File
) {
  assertCan(actor, "store:write");
  const store = await db.query.stores.findFirst({ where: eq(stores.id, storeId) });
  if (!store) throw new Error("Boutique introuvable.");
  if (!PHOTO_MIME_TYPES.has(file.type)) {
    throw new Error("La photo doit être une image JPG, PNG ou WebP.");
  }
  await removeExistingPhoto(actor, storeId);
  return saveUpload(actor, file, { entityType: "STORE_PHOTO", entityId: storeId });
}

export async function removeStorePhoto(actor: SessionUser, storeId: string) {
  assertCan(actor, "store:write");
  await removeExistingPhoto(actor, storeId);
}

async function removeExistingPhoto(actor: SessionUser, storeId: string) {
  const existing = await db.query.fileAttachments.findMany({
    where: and(
      eq(fileAttachments.entityType, "STORE_PHOTO"),
      eq(fileAttachments.entityId, storeId)
    ),
    columns: { id: true },
  });
  for (const attachment of existing) {
    await auditedDelete({ id: actor.id }, fileAttachments, attachment.id);
  }
}

// ── Plateformes de livraison ─────────────────────────────────────

export type PlatformInput = {
  platform: (typeof storePlatforms.$inferInsert)["platform"];
  label: string | null;
  accountRef: string | null;
  isActive: boolean;
};

export async function setStorePlatforms(
  actor: SessionUser,
  storeId: string,
  platforms: PlatformInput[]
) {
  assertCan(actor, "store:write");
  const store = await db.query.stores.findFirst({ where: eq(stores.id, storeId) });
  if (!store) throw new ForbiddenError("Boutique introuvable.");

  const seen = new Set(platforms.map((p) => p.platform));
  if (seen.size !== platforms.length) {
    throw new Error("Chaque plateforme ne peut apparaître qu'une seule fois.");
  }

  const existing = await db.query.storePlatforms.findMany({
    where: eq(storePlatforms.storeId, storeId),
  });
  const byPlatform = new Map(existing.map((p) => [p.platform, p]));

  for (const input of platforms) {
    const current = byPlatform.get(input.platform);
    if (current) {
      await auditedUpdate({ id: actor.id }, storePlatforms, current.id, {
        label: input.label,
        accountRef: input.accountRef,
        isActive: input.isActive,
      });
      byPlatform.delete(input.platform);
    } else {
      await auditedInsert({ id: actor.id }, storePlatforms, {
        storeId,
        platform: input.platform,
        label: input.label,
        accountRef: input.accountRef,
        isActive: input.isActive,
      });
    }
  }
  // Plateformes retirées
  for (const leftover of byPlatform.values()) {
    await auditedDelete({ id: actor.id }, storePlatforms, leftover.id);
  }
}

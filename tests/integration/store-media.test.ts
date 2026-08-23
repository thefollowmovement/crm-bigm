import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { fileAttachments } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { canDownloadFile } from "@/lib/files/access";
import {
  getStore,
  listStores,
  removeStorePhoto,
  setStorePhoto,
  updateStore,
} from "@/services/stores.service";
import { resetDb } from "./setup/reset-db";
import {
  createTestFranchisee,
  createTestStore,
  createTestUser,
} from "../helpers/factories";

function asSession(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: SessionUser["role"];
  pole: SessionUser["pole"];
  franchiseeId: string | null;
}): SessionUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    pole: user.pole,
    franchiseeId: user.franchiseeId,
  };
}

function pngFile(name = "photo.png") {
  // En-tête PNG minimal : suffisant pour le service (validation par extension
  // + type MIME, jamais par décodage de l'image).
  const bytes = Buffer.from("89504e470d0a1a0a", "hex");
  return new File([bytes], name, { type: "image/png" });
}

describe("fiche boutique — photo et coordonnées GPS", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("photo : une seule par boutique, remplacement audité, images uniquement", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const store = await createTestStore();

    await expect(
      setStorePhoto(admin, store.id, new File(["x"], "doc.txt", { type: "text/plain" }))
    ).rejects.toThrow(/JPG, PNG ou WebP/);

    await setStorePhoto(admin, store.id, pngFile("avant.png"));
    await setStorePhoto(admin, store.id, pngFile("apres.png"));

    const photos = await db.query.fileAttachments.findMany({
      where: and(
        eq(fileAttachments.entityType, "STORE_PHOTO"),
        eq(fileAttachments.entityId, store.id)
      ),
    });
    expect(photos).toHaveLength(1);
    expect(photos[0].originalName).toBe("apres.png");

    // La photo remonte dans la liste et sur la fiche.
    const rows = await listStores(admin);
    expect(rows.find((r) => r.id === store.id)?.photoFileId).toBe(photos[0].id);
    const fiche = await getStore(admin, store.id);
    expect(fiche?.photoFileId).toBe(photos[0].id);

    await removeStorePhoto(admin, store.id);
    expect((await getStore(admin, store.id))?.photoFileId).toBeNull();
  });

  it("accès au fichier photo : périmètre boutique du franchisé, sans audit", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const proprietaire = await createTestFranchisee();
    const autre = await createTestFranchisee();
    const store = await createTestStore({ franchiseeId: proprietaire.id });
    const bonFranchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: proprietaire.id })
    );
    const mauvaisFranchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: autre.id })
    );

    const photo = await setStorePhoto(admin, store.id, pngFile());

    expect(await canDownloadFile(bonFranchise, photo)).toEqual({
      allowed: true,
      audit: false,
    });
    expect((await canDownloadFile(mauvaisFranchise, photo)).allowed).toBe(false);
  });

  it("les coordonnées GPS s'enregistrent et restent des chaînes décimales", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const store = await createTestStore();

    await updateStore(admin, store.id, {
      latitude: "45.760500",
      longitude: "4.857800",
    });
    const fiche = await getStore(admin, store.id);
    expect(fiche?.latitude).toBe("45.760500");
    expect(fiche?.longitude).toBe("4.857800");
  });
});

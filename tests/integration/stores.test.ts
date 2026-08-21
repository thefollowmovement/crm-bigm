import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { auditLogs, storePlatforms } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  createStore,
  getStore,
  listStores,
  setStorePlatforms,
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

describe("service boutiques", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("un utilisateur FRANCHISE ne voit que les boutiques de sa société", async () => {
    const franchisee = await createTestFranchisee();
    const other = await createTestFranchisee();
    const mine = await createTestStore({ franchiseeId: franchisee.id, code: "BM-F1" });
    await createTestStore({ franchiseeId: other.id, code: "BM-F2" });
    await createTestStore({ code: "BM-F3", type: "SUCCURSALE", franchiseeId: null });

    const franchiseUser = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );

    const visible = await listStores(franchiseUser);
    expect(visible.map((s) => s.code)).toEqual(["BM-F1"]);

    // Fiche accessible pour sa boutique…
    expect((await getStore(franchiseUser, mine.id))?.code).toBe("BM-F1");
  });

  it("refuse la fiche d'une boutique hors périmètre franchisé", async () => {
    const franchisee = await createTestFranchisee();
    const other = await createTestStore({ code: "BM-AUTRE" });
    const franchiseUser = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );

    await expect(getStore(franchiseUser, other.id)).rejects.toThrow(ForbiddenError);
  });

  it("un FRANCHISE sans société rattachée ne voit rien", async () => {
    await createTestStore({ code: "BM-X1" });
    const orphan = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: null })
    );
    expect(await listStores(orphan)).toEqual([]);
  });

  it("refuse un code boutique dupliqué et une succursale avec franchisé", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const franchisee = await createTestFranchisee();

    await createStore(admin, baseInput({ code: "BM-DUP" }));
    await expect(createStore(admin, baseInput({ code: "BM-DUP" }))).rejects.toThrow(
      /existe déjà/
    );

    await expect(
      createStore(
        admin,
        baseInput({ code: "BM-SUC", type: "SUCCURSALE", franchiseeId: franchisee.id })
      )
    ).rejects.toThrow(/succursale/i);
  });

  it("création et modification sont auditées", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const store = await createStore(admin, baseInput({ code: "BM-LOG" }));
    await updateStore(admin, store.id, { city: "Marseille" });

    const logs = await db.query.auditLogs.findMany({
      where: and(eq(auditLogs.tableName, "stores"), eq(auditLogs.recordId, store.id)),
    });
    expect(logs.map((l) => l.action).sort()).toEqual(["CREATE", "UPDATE"]);
    const update = logs.find((l) => l.action === "UPDATE");
    expect(update?.changes).toMatchObject({ city: { new: "Marseille" } });
  });

  it("setStorePlatforms ajoute, met à jour et retire", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const store = await createStore(admin, baseInput({ code: "BM-PLT" }));

    await setStorePlatforms(admin, store.id, [
      { platform: "UBER_EATS", label: null, accountRef: "UE-1", isActive: true },
      { platform: "DELIVEROO", label: null, accountRef: null, isActive: false },
    ]);
    let rows = await db.query.storePlatforms.findMany({
      where: eq(storePlatforms.storeId, store.id),
    });
    expect(rows).toHaveLength(2);

    // mise à jour d'une, suppression de l'autre
    await setStorePlatforms(admin, store.id, [
      { platform: "UBER_EATS", label: null, accountRef: "UE-2", isActive: true },
    ]);
    rows = await db.query.storePlatforms.findMany({
      where: eq(storePlatforms.storeId, store.id),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].accountRef).toBe("UE-2");
  });

  it("refuse la création sans permission store:write", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    await expect(createStore(compta, baseInput({ code: "BM-NO" }))).rejects.toThrow(
      ForbiddenError
    );
  });
});

function baseInput(
  overrides: Partial<Parameters<typeof createStore>[1]> = {}
): Parameters<typeof createStore>[1] {
  return {
    code: "BM-000",
    name: "Boutique Service",
    type: "FRANCHISE",
    status: "OUVERTE",
    franchiseeId: null,
    animateurId: null,
    address: null,
    postalCode: null,
    city: null,
    region: null,
    phone: null,
    email: null,
    siret: null,
    openingDate: null,
    closingDate: null,
    internalNotes: null,
    ...overrides,
  };
}

import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { notifications, revenueEntries, sessions, stores, users } from "@/db/schema";
import { resetDb } from "./setup/reset-db";
import {
  createTestFranchisee,
  createTestStore,
  createTestUser,
} from "../helpers/factories";

describe("contraintes du schéma", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("refuse deux boutiques avec le même code", async () => {
    await createTestStore({ code: "BM-100" });
    await expect(createTestStore({ code: "BM-100" })).rejects.toThrow();
  });

  it("refuse deux utilisateurs avec le même email", async () => {
    await createTestUser({ email: "double@test.fr" });
    await expect(createTestUser({ email: "double@test.fr" })).rejects.toThrow();
  });

  it("refuse deux lignes de CA pour la même boutique/date/canal", async () => {
    const user = await createTestUser();
    const store = await createTestStore();
    const entry = {
      storeId: store.id,
      date: "2026-08-01",
      channel: "SUR_PLACE" as const,
      grossAmount: "1500.00",
      enteredById: user.id,
    };
    await db.insert(revenueEntries).values(entry);
    await expect(db.insert(revenueEntries).values(entry)).rejects.toThrow();
    // même boutique/date mais autre canal : accepté
    await db
      .insert(revenueEntries)
      .values({ ...entry, channel: "EMPORTE" as const });
  });

  it("supprime les sessions en cascade avec l'utilisateur", async () => {
    const user = await createTestUser();
    await db.insert(sessions).values({
      id: "hash-de-test",
      userId: user.id,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    await db.delete(users).where(eq(users.id, user.id));
    const remaining = await db.query.sessions.findMany();
    expect(remaining).toHaveLength(0);
  });

  it("refuse deux notifications avec la même clé de déduplication par utilisateur", async () => {
    const user = await createTestUser();
    const notif = {
      userId: user.id,
      type: "CONTRAT_ECHEANCE" as const,
      title: "Alerte contrat",
      dedupeKey: "contract-expiry:abc",
    };
    await db.insert(notifications).values(notif);
    await expect(db.insert(notifications).values(notif)).rejects.toThrow();
    // sans dedupeKey, pas de contrainte (NULL ≠ NULL en SQL)
    await db.insert(notifications).values({ ...notif, dedupeKey: null });
    await db.insert(notifications).values({ ...notif, dedupeKey: null });
  });

  it("rattache boutiques et franchisés (relation chargée)", async () => {
    const franchisee = await createTestFranchisee({ companyName: "SARL Relation" });
    const store = await createTestStore({ franchiseeId: franchisee.id });
    const found = await db.query.stores.findFirst({
      where: eq(stores.id, store.id),
      with: { franchisee: true },
    });
    expect(found?.franchisee?.companyName).toBe("SARL Relation");
  });
});

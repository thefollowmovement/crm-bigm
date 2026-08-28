import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { acctInvoices, notifications, sessions, stores, users } from "@/db/schema";
import { resetDb } from "./setup/reset-db";
import {
  createTestAcctStructure,
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

  it("refuse deux pièces comptables portant le même numéro", async () => {
    const structure = await createTestAcctStructure();
    const piece = {
      pieceNumber: "FA-UNIQUE-1",
      pieceType: "FACTURE" as const,
      accountClass: "PRODUIT" as const,
      pieceDate: "2026-08-01",
      structureId: structure.id,
      amountHT: "100.00",
      amountTTC: "120.00",
    };
    await db.insert(acctInvoices).values(piece);
    await expect(db.insert(acctInvoices).values(piece)).rejects.toThrow();
    // autre numéro : accepté
    await db.insert(acctInvoices).values({ ...piece, pieceNumber: "FA-UNIQUE-2" });
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

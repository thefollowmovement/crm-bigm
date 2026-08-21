import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { auditLogs, stores, users } from "@/db/schema";
import { auditedDelete, auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { resetDb } from "./setup/reset-db";
import { TEST_PASSWORD_HASH, createTestUser } from "../helpers/factories";

async function logsFor(tableName: string, recordId: string) {
  return db.query.auditLogs.findMany({
    where: and(eq(auditLogs.tableName, tableName), eq(auditLogs.recordId, recordId)),
  });
}

describe("helpers d'écriture audités", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("auditedInsert écrit la ligne ET le log CREATE avec snapshot", async () => {
    const actor = await createTestUser();
    const store = await auditedInsert({ id: actor.id, ip: "10.0.0.9" }, stores, {
      code: "BM-AUD1",
      name: "Boutique Audit",
      type: "FRANCHISE",
    });

    const logs = await logsFor("stores", store.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("CREATE");
    expect(logs[0].userId).toBe(actor.id);
    expect(logs[0].ip).toBe("10.0.0.9");
    const snapshot = logs[0].snapshot as Record<string, unknown>;
    expect(snapshot.code).toBe("BM-AUD1");
  });

  it("auditedUpdate journalise uniquement les champs modifiés", async () => {
    const actor = await createTestUser();
    const store = await auditedInsert({ id: actor.id }, stores, {
      code: "BM-AUD2",
      name: "Avant",
      type: "FRANCHISE",
      city: "Lyon",
    });

    await auditedUpdate({ id: actor.id }, stores, store.id, { name: "Après" });

    const logs = await logsFor("stores", store.id);
    const update = logs.find((l) => l.action === "UPDATE");
    expect(update).toBeDefined();
    expect(update?.changes).toEqual({ name: { old: "Avant", new: "Après" } });
  });

  it("auditedUpdate sans changement réel n'écrit AUCUN log", async () => {
    const actor = await createTestUser();
    const store = await auditedInsert({ id: actor.id }, stores, {
      code: "BM-AUD3",
      name: "Stable",
      type: "SUCCURSALE",
    });

    await auditedUpdate({ id: actor.id }, stores, store.id, { name: "Stable" });

    const logs = await logsFor("stores", store.id);
    expect(logs.filter((l) => l.action === "UPDATE")).toHaveLength(0);
  });

  it("auditedDelete journalise l'état supprimé", async () => {
    const actor = await createTestUser();
    const store = await auditedInsert({ id: actor.id }, stores, {
      code: "BM-AUD4",
      name: "À supprimer",
      type: "FRANCHISE",
    });

    await auditedDelete({ id: actor.id }, stores, store.id);

    expect(
      await db.query.stores.findFirst({ where: eq(stores.id, store.id) })
    ).toBeUndefined();
    const logs = await logsFor("stores", store.id);
    const del = logs.find((l) => l.action === "DELETE");
    expect((del?.snapshot as Record<string, unknown>).name).toBe("À supprimer");
  });

  it("le snapshot d'un utilisateur ne contient jamais passwordHash", async () => {
    const actor = await createTestUser();
    const created = await auditedInsert({ id: actor.id }, users, {
      email: "snapshot@test.fr",
      passwordHash: TEST_PASSWORD_HASH,
      firstName: "Sans",
      lastName: "Secret",
      role: "RH",
    });

    const logs = await logsFor("users", created.id);
    const snapshot = logs[0].snapshot as Record<string, unknown>;
    expect(snapshot.passwordHash).toBeUndefined();
    expect(snapshot.email).toBe("snapshot@test.fr");
  });

  it("l'échec de l'écriture annule aussi le log (transaction)", async () => {
    const actor = await createTestUser();
    await auditedInsert({ id: actor.id }, stores, {
      code: "BM-AUD5",
      name: "Unique",
      type: "FRANCHISE",
    });

    // code dupliqué → l'insert échoue → aucun log CREATE supplémentaire
    await expect(
      auditedInsert({ id: actor.id }, stores, {
        code: "BM-AUD5",
        name: "Doublon",
        type: "FRANCHISE",
      })
    ).rejects.toThrow();

    const allLogs = await db.query.auditLogs.findMany({
      where: eq(auditLogs.tableName, "stores"),
    });
    expect(allLogs.filter((l) => l.action === "CREATE")).toHaveLength(1);
  });
});

import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { auditLogs, vaultSecrets } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  createSecret,
  listSecrets,
  revealSecret,
} from "@/services/vault.service";
import {
  createSoftware,
  listSoftware,
  setSoftwareUsers,
} from "@/services/software.service";
import { resetDb } from "./setup/reset-db";
import { createTestUser } from "../helpers/factories";

function asSession(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: SessionUser["role"];
  pole: SessionUser["pole"];
  franchiseeId: string | null;
}): SessionUser {
  return { ...user };
}

beforeAll(() => {
  process.env.VAULT_KEY = Buffer.from(
    "test-key-32-bytes-pour-le-coffre"
  ).toString("base64");
});

afterAll(async () => {
  await pool.end();
});

describe("registre logiciels & coffre-fort", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("coffre : jamais de clair ni de ciphertext exposé, révélation auditée REVEAL", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );

    const { id } = await createSecret(admin, {
      label: "Banque pro",
      username: "bigm-cie",
      url: null,
      notes: null,
      secret: "S3cret!2026",
    });

    // En base : chiffré au format versionné, jamais le clair.
    const row = await db.query.vaultSecrets.findFirst({
      where: eq(vaultSecrets.id, id),
    });
    expect(row?.encrypted.startsWith("v1:")).toBe(true);
    expect(row?.encrypted).not.toContain("S3cret!2026");

    // DTO de liste : ni `encrypted`, ni clair.
    const list = await listSecrets(admin);
    expect(list).toHaveLength(1);
    expect("encrypted" in list[0]).toBe(false);
    expect(JSON.stringify(list)).not.toContain("S3cret!2026");

    // Le snapshot d'audit de la création exclut le ciphertext.
    const createLog = await db.query.auditLogs.findFirst({
      where: and(
        eq(auditLogs.tableName, "vault_secrets"),
        eq(auditLogs.recordId, id),
        eq(auditLogs.action, "CREATE")
      ),
    });
    expect(JSON.stringify(createLog?.snapshot ?? {})).not.toContain("v1:");

    // Révélation unitaire : clair retourné + événement REVEAL journalisé.
    const plaintext = await revealSecret(admin, id);
    expect(plaintext).toBe("S3cret!2026");
    const revealLog = await db.query.auditLogs.findFirst({
      where: and(
        eq(auditLogs.tableName, "vault_secrets"),
        eq(auditLogs.recordId, id),
        eq(auditLogs.action, "REVEAL")
      ),
    });
    expect(revealLog?.userId).toBe(admin.id);

    // La compta n'a AUCUN accès au coffre.
    await expect(listSecrets(compta)).rejects.toThrow(ForbiddenError);
    await expect(revealSecret(compta, id)).rejects.toThrow(ForbiddenError);
  });

  it("registre logiciels : lecture siège, écriture direction, accès par diff", async () => {
    const direction = asSession(
      await createTestUser({ role: "DIRECTION", pole: "DIRECTION" })
    );
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));
    const franchise = asSession(await createTestUser({ role: "FRANCHISE" }));

    const software = await createSoftware(direction, {
      name: "Outil planning",
      purpose: "Plannings du réseau",
      url: null,
      ownerId: direction.id,
      accessLevelNotes: null,
    });
    const alice = await createTestUser({ role: "ANIMATION" });
    const bob = await createTestUser({ role: "RH", pole: "RH" });
    await setSoftwareUsers(direction, software.id, [alice.id, bob.id]);
    await setSoftwareUsers(direction, software.id, [bob.id]); // diff : retire alice

    const list = await listSoftware(animateur); // l'animation LIT le registre
    expect(list).toHaveLength(1);
    expect(list[0].users.map((u) => u.user.id)).toEqual([bob.id]);

    // …mais n'écrit pas ; le franchisé ne voit rien du tout.
    await expect(
      createSoftware(animateur, {
        name: "X",
        purpose: null,
        url: null,
        ownerId: null,
        accessLevelNotes: null,
      })
    ).rejects.toThrow(ForbiddenError);
    await expect(listSoftware(franchise)).rejects.toThrow(ForbiddenError);
  });
});

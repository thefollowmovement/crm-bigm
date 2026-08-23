import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { stat, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { backups, notifications } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  deleteBackup,
  listBackups,
  runBackup,
} from "@/services/backups.service";
import { runDbBackupJob } from "@/lib/jobs/db-backup";
import { resetDb } from "./setup/reset-db";
import { createTestUser } from "../helpers/factories";

const TEST_BACKUP_DIR = "./.backups-test";

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

beforeAll(() => {
  process.env.BACKUP_DIR = TEST_BACKUP_DIR;
});

afterAll(async () => {
  await rm(TEST_BACKUP_DIR, { recursive: true, force: true });
  await pool.end();
});

describe("sauvegardes de la base", () => {
  beforeEach(async () => {
    await resetDb();
    await rm(TEST_BACKUP_DIR, { recursive: true, force: true });
  });

  it("pg_dump manuel : fichier réel, statut OK, réservé à backup:manage", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));

    await expect(runBackup(animateur, "MANUEL")).rejects.toThrow(ForbiddenError);
    await expect(listBackups(animateur)).rejects.toThrow(ForbiddenError);

    const backup = await runBackup(admin, "MANUEL");
    expect(backup.status).toBe("OK");
    expect(backup.filename).toMatch(/^bigm-\d{8}-\d{6}-[0-9a-f]{4}\.dump$/);
    expect(backup.sizeBytes).toBeGreaterThan(0);
    // Pas de FTP configuré dans les tests : aucun statut distant.
    expect(backup.remoteStatus).toBeNull();

    const onDisk = await stat(path.join(TEST_BACKUP_DIR, backup.filename));
    expect(onDisk.size).toBe(backup.sizeBytes);

    const rows = await listBackups(admin);
    expect(rows.map((r) => r.id)).toContain(backup.id);
    expect(rows[0].createdBy?.id).toBe(admin.id);

    // Suppression : la ligne ET le fichier disparaissent.
    await deleteBackup(admin, backup.id);
    expect(await listBackups(admin)).toHaveLength(0);
    await expect(
      stat(path.join(TEST_BACKUP_DIR, backup.filename))
    ).rejects.toThrow();
  });

  it("job quotidien : sauvegarde PLANIFIÉE + purge de rétention (manuelles épargnées)", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Vieilles sauvegardes simulées : une planifiée (à purger), une manuelle.
    await mkdir(TEST_BACKUP_DIR, { recursive: true });
    await writeFile(path.join(TEST_BACKUP_DIR, "vieux-planifie.dump"), "x");
    await writeFile(path.join(TEST_BACKUP_DIR, "vieux-manuel.dump"), "x");
    await db.insert(backups).values([
      {
        filename: "vieux-planifie.dump",
        kind: "PLANIFIE",
        status: "OK",
        createdAt: old,
      },
      { filename: "vieux-manuel.dump", kind: "MANUEL", status: "OK", createdAt: old },
    ]);

    const result = await runDbBackupJob(now);
    expect(result.status).toBe("OK");
    expect(result.pruned).toBe(1);

    const remaining = await db.query.backups.findMany();
    const filenames = remaining.map((r) => r.filename);
    expect(filenames).not.toContain("vieux-planifie.dump");
    expect(filenames).toContain("vieux-manuel.dump");
    await expect(
      stat(path.join(TEST_BACKUP_DIR, "vieux-planifie.dump"))
    ).rejects.toThrow();

    // Rejouable : une deuxième exécution crée simplement une sauvegarde de plus.
    const again = await runDbBackupJob(now);
    expect(again.status).toBe("OK");
  });

  it("échec de pg_dump : statut ERREUR tracé et admins alertés (dédupliqué par jour)", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const originalUrl = process.env.DATABASE_URL;
    // Cible invalide UNIQUEMENT pour pg_dump : le client db garde sa connexion.
    process.env.DATABASE_URL = "postgresql://bad:bad@127.0.0.1:9/inexistant";
    try {
      const result = await runDbBackupJob();
      expect(result.status).toBe("ERREUR");
    } finally {
      process.env.DATABASE_URL = originalUrl;
    }

    const row = await db.query.backups.findFirst({
      where: eq(backups.status, "ERREUR"),
    });
    expect(row?.error).toBeTruthy();

    const alerts = await db.query.notifications.findMany({
      where: eq(notifications.userId, admin.id),
    });
    expect(
      alerts.some((n) => n.title.includes("Échec de la sauvegarde"))
    ).toBe(true);
  });
});

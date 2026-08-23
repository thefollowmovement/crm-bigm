import "server-only";

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { desc } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { backups } from "@/db/schema";
import { auditedDelete, auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import {
  backupDir,
  backupFilename,
  ftpConfigFromEnv,
} from "@/lib/backup/config";
import { uploadBackupToFtp } from "@/lib/backup/ftp";

const execFileAsync = promisify(execFile);

type BackupRow = typeof backups.$inferSelect;

// Chemin absolu d'un fichier de sauvegarde, verrouillé dans BACKUP_DIR.
export function backupAbsolutePath(filename: string): string {
  const root = path.resolve(backupDir());
  const absolute = path.resolve(root, filename);
  if (!absolute.startsWith(root + path.sep)) {
    throw new Error("Chemin de sauvegarde invalide.");
  }
  return absolute;
}

export async function listBackups(actor: SessionUser) {
  assertCan(actor, "backup:manage");
  return db.query.backups.findMany({
    orderBy: [desc(backups.createdAt)],
    with: { createdBy: { columns: { id: true, firstName: true, lastName: true } } },
  });
}

// Lance un pg_dump (format custom, restaurable par pg_restore) et journalise
// le résultat. `actor` null = job planifié. L'envoi FTP optionnel est tenté
// après coup : son échec est tracé mais n'invalide pas la sauvegarde locale.
export async function runBackup(
  actor: SessionUser | null,
  kind: BackupRow["kind"]
): Promise<BackupRow> {
  if (actor) assertCan(actor, "backup:manage");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL absent : sauvegarde impossible.");

  const filename = backupFilename(new Date(), randomBytes(2).toString("hex"));
  const absolute = backupAbsolutePath(filename);
  await mkdir(path.dirname(absolute), { recursive: true });

  const auditActor = { id: actor?.id ?? null };
  let row = await auditedInsert(auditActor, backups, {
    filename,
    kind,
    status: "EN_COURS",
    createdById: actor?.id ?? null,
  });

  try {
    await execFileAsync("pg_dump", [
      "--format=custom",
      "--no-owner",
      "--file",
      absolute,
      databaseUrl,
    ]);
    const { size } = await stat(absolute);
    row = await auditedUpdate(auditActor, backups, row.id, {
      status: "OK",
      sizeBytes: size,
    });
  } catch (error) {
    await rm(absolute, { force: true });
    return auditedUpdate(auditActor, backups, row.id, {
      status: "ERREUR",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const ftp = ftpConfigFromEnv(process.env);
  if (ftp) {
    try {
      await uploadBackupToFtp(ftp, absolute, filename);
      row = await auditedUpdate(auditActor, backups, row.id, {
        remoteStatus: "ENVOYE",
      });
    } catch (error) {
      row = await auditedUpdate(auditActor, backups, row.id, {
        remoteStatus: "ERREUR",
        remoteError: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return row;
}

export async function deleteBackup(actor: SessionUser, backupId: string) {
  assertCan(actor, "backup:manage");
  await removeBackupRow({ id: actor.id }, backupId);
}

// Suppression (fichier + ligne) — utilisée aussi par la rétention du job.
export async function removeBackupRow(
  auditActor: { id: string | null },
  backupId: string
) {
  const row = await db.query.backups.findFirst({
    where: (b, { eq }) => eq(b.id, backupId),
  });
  if (!row) return;
  await rm(backupAbsolutePath(row.filename), { force: true });
  await auditedDelete(auditActor, backups, backupId);
}

// Pour la route de téléchargement : la permission est vérifiée, le chemin est
// contenu dans BACKUP_DIR, et seul un dump terminé (OK) est servi.
export async function getBackupForDownload(actor: SessionUser, backupId: string) {
  assertCan(actor, "backup:manage");
  const row = await db.query.backups.findFirst({
    where: (b, { eq }) => eq(b.id, backupId),
  });
  if (!row || row.status !== "OK") return null;
  return { row, absolutePath: backupAbsolutePath(row.filename) };
}

import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { backups, users } from "@/db/schema";
import { isBackupExpired, retentionDays } from "@/lib/backup/config";
import { removeBackupRow, runBackup } from "@/services/backups.service";
import { notify } from "@/services/notifications.service";
import { todayParis } from "@/lib/dates";

// Sauvegarde quotidienne de la base (05h30) + purge des sauvegardes
// PLANIFIÉES au-delà de la rétention. Rejouable : relancer crée simplement
// une sauvegarde de plus ; l'alerte d'échec est dédupliquée par jour.
export async function runDbBackupJob(now: Date = new Date()) {
  const backup = await runBackup(null, "PLANIFIE");

  // Rétention : uniquement les planifiées expirées (jamais les manuelles).
  const retention = retentionDays();
  const rows = await db.query.backups.findMany({
    where: eq(backups.kind, "PLANIFIE"),
  });
  const expired = rows.filter(
    (b) => b.id !== backup.id && isBackupExpired(b, retention, now)
  );
  for (const row of expired) {
    await removeBackupRow({ id: null }, row.id);
  }

  if (backup.status === "ERREUR") {
    const admins = await db.query.users.findMany({
      where: and(eq(users.role, "ADMIN"), eq(users.isActive, true)),
      columns: { id: true },
    });
    await notify(
      admins.map((a) => a.id),
      {
        type: "ALERTE",
        title: "Échec de la sauvegarde quotidienne de la base",
        body: backup.error ?? "Erreur inconnue",
        link: "/admin/sauvegardes",
        dedupeKey: `db-backup-failed:${todayParis(now)}`,
      }
    );
  }

  return {
    status: backup.status,
    filename: backup.filename,
    remoteStatus: backup.remoteStatus,
    pruned: expired.length,
  };
}

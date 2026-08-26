"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { safeFormAction } from "@/lib/actions/safe-action";
import { formatBytes } from "@/lib/backup/config";
import { deleteBackup, runBackup } from "@/services/backups.service";

export const runBackupAction = safeFormAction(
  { permission: "backup:manage", schema: z.object({}) },
  async (_input, actor) => {
    const backup = await runBackup(actor, "MANUEL");
    if (backup.status === "ERREUR") {
      throw new Error(`Échec de la sauvegarde : ${backup.error ?? "erreur inconnue"}`);
    }
    revalidatePath("/hq-18b8ba/sauvegardes");
    const remote =
      backup.remoteStatus === "ENVOYE"
        ? " et envoyée sur le serveur FTP"
        : backup.remoteStatus === "ERREUR"
          ? " (échec de l'envoi FTP — voir le détail)"
          : "";
    return `Sauvegarde créée (${formatBytes(backup.sizeBytes)})${remote}.`;
  }
);

export const deleteBackupAction = safeFormAction(
  {
    permission: "backup:manage",
    schema: z.object({ backupId: z.string().uuid() }),
    prepare: (formData) => ({ backupId: formData.get("backupId") }),
  },
  async ({ backupId }, actor) => {
    await deleteBackup(actor, backupId);
    revalidatePath("/hq-18b8ba/sauvegardes");
    return "Sauvegarde supprimée.";
  }
);

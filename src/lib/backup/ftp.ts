import "server-only";

import { Client } from "basic-ftp";

import type { FtpConfig } from "@/lib/backup/config";

// Dépose le fichier de sauvegarde sur le serveur FTP/FTPS configuré.
// Lève en cas d'échec — l'appelant trace l'erreur sans invalider la
// sauvegarde locale.
export async function uploadBackupToFtp(
  config: FtpConfig,
  localPath: string,
  remoteName: string
): Promise<void> {
  const client = new Client(30_000);
  try {
    await client.access({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      secure: config.secure,
    });
    if (config.dir) {
      await client.ensureDir(config.dir);
    }
    await client.uploadFrom(localPath, remoteName);
  } finally {
    client.close();
  }
}

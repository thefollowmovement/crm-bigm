// Configuration et logique PURE des sauvegardes (testée en unit).
// L'exécution de pg_dump et les écritures en base vivent dans
// src/services/backups.service.ts.

export function backupDir(): string {
  return process.env.BACKUP_DIR ?? "./.backups";
}

export function retentionDays(): number {
  const days = Number(process.env.BACKUP_RETENTION_DAYS ?? 14);
  return Number.isFinite(days) && days > 0 ? days : 14;
}

// Nom de fichier horodaté en heure de Paris : bigm-20260823-061530-ab12.dump
// Le nonce (fourni par l'appelant) évite toute collision de nom : deux
// sauvegardes dans la même seconde restent distinctes.
export function backupFilename(now: Date, nonce: string): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `bigm-${get("year")}${get("month")}${get("day")}-${get("hour")}${get(
    "minute"
  )}${get("second")}-${nonce}.dump`;
}

// La rétention ne purge QUE les sauvegardes planifiées : une sauvegarde
// manuelle est un choix explicite, elle se supprime à la main.
export function isBackupExpired(
  backup: { kind: "MANUEL" | "PLANIFIE"; createdAt: Date },
  retention: number,
  now: Date
): boolean {
  if (backup.kind !== "PLANIFIE") return false;
  const ageMs = now.getTime() - backup.createdAt.getTime();
  return ageMs > retention * 24 * 60 * 60 * 1000;
}

export type FtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  dir: string | null;
  secure: boolean;
};

// Envoi distant optionnel : configuré si hôte + identifiants présents.
export function ftpConfigFromEnv(
  env: Record<string, string | undefined>
): FtpConfig | null {
  const host = env.BACKUP_FTP_HOST?.trim();
  const user = env.BACKUP_FTP_USER?.trim();
  const password = env.BACKUP_FTP_PASSWORD;
  if (!host || !user || !password) return null;
  const port = Number(env.BACKUP_FTP_PORT ?? 21);
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 21,
    user,
    password,
    dir: env.BACKUP_FTP_DIR?.trim() || null,
    secure: env.BACKUP_FTP_SECURE === "true",
  };
}

// Affichage humain : "12,4 Mo" (jamais utilisé pour du calcul).
export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} o`;
  const units = ["Ko", "Mo", "Go"];
  let value = bytes;
  let unit = "o";
  for (const next of units) {
    if (value < 1024) break;
    value /= 1024;
    unit = next;
  }
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${unit}`;
}

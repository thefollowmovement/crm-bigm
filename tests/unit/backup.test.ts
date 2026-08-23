import { describe, expect, it } from "vitest";

import {
  backupFilename,
  formatBytes,
  ftpConfigFromEnv,
  isBackupExpired,
} from "@/lib/backup/config";

describe("sauvegardes — logique pure", () => {
  it("nomme les fichiers en heure de Paris avec un nonce anti-collision", () => {
    // 04h30 UTC un 23 août = 06h30 à Paris (UTC+2 en été).
    expect(backupFilename(new Date("2026-08-23T04:30:00Z"), "ab12")).toBe(
      "bigm-20260823-063000-ab12.dump"
    );
    // 23h30 UTC un 31 décembre = 00h30 le 1er janvier à Paris (UTC+1 en hiver).
    expect(backupFilename(new Date("2026-12-31T23:30:00Z"), "ffff")).toBe(
      "bigm-20270101-003000-ffff.dump"
    );
  });

  it("la rétention n'expire que les sauvegardes PLANIFIÉES", () => {
    const now = new Date("2026-08-23T06:00:00Z");
    const days = (n: number) =>
      new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

    expect(
      isBackupExpired({ kind: "PLANIFIE", createdAt: days(20) }, 14, now)
    ).toBe(true);
    expect(
      isBackupExpired({ kind: "PLANIFIE", createdAt: days(5) }, 14, now)
    ).toBe(false);
    // Une sauvegarde MANUELLE n'expire jamais automatiquement.
    expect(
      isBackupExpired({ kind: "MANUEL", createdAt: days(400) }, 14, now)
    ).toBe(false);
  });

  it("configuration FTP : null si incomplète, valeurs par défaut sinon", () => {
    expect(ftpConfigFromEnv({})).toBeNull();
    expect(
      ftpConfigFromEnv({ BACKUP_FTP_HOST: "ftp.exemple.fr", BACKUP_FTP_USER: "u" })
    ).toBeNull(); // mot de passe manquant

    expect(
      ftpConfigFromEnv({
        BACKUP_FTP_HOST: "ftp.exemple.fr",
        BACKUP_FTP_USER: "bigm",
        BACKUP_FTP_PASSWORD: "s3cret",
      })
    ).toEqual({
      host: "ftp.exemple.fr",
      port: 21,
      user: "bigm",
      password: "s3cret",
      dir: null,
      secure: false,
    });

    expect(
      ftpConfigFromEnv({
        BACKUP_FTP_HOST: "ftp.exemple.fr",
        BACKUP_FTP_PORT: "2121",
        BACKUP_FTP_USER: "bigm",
        BACKUP_FTP_PASSWORD: "s3cret",
        BACKUP_FTP_DIR: "/sauvegardes/bigm",
        BACKUP_FTP_SECURE: "true",
      })
    ).toMatchObject({ port: 2121, dir: "/sauvegardes/bigm", secure: true });
  });

  it("formate les tailles en unités françaises", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(512)).toBe("512 o");
    expect(formatBytes(2048)).toBe("2 Ko");
    expect(formatBytes(13 * 1024 * 1024)).toBe("13 Mo");
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe("1,5 Go");
  });
});

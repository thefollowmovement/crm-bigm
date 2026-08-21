import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { auditedInsert } from "@/lib/db/audited";
import { fileAttachments } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";

// Types de fichiers acceptés dans tout le CRM (contrats, PJ, imports…).
const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  pdf: ["application/pdf"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  doc: ["application/msword"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  csv: ["text/csv", "application/vnd.ms-excel", "text/plain"],
  txt: ["text/plain"],
  eml: ["message/rfc822"],
};

export function maxUploadBytes(): number {
  return Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;
}

export function uploadDir(): string {
  return process.env.UPLOAD_DIR ?? "./.uploads";
}

// Validation pure (testée en unit) : nom + taille.
export function validateUpload(input: {
  originalName: string;
  sizeBytes: number;
}): { ok: true; extension: string } | { ok: false; error: string } {
  if (input.sizeBytes <= 0) {
    return { ok: false, error: "Fichier vide." };
  }
  if (input.sizeBytes > maxUploadBytes()) {
    return {
      ok: false,
      error: `Fichier trop volumineux (maximum ${process.env.MAX_UPLOAD_MB ?? 25} Mo).`,
    };
  }
  const extension = path.extname(input.originalName).slice(1).toLowerCase();
  if (!extension || !(extension in ALLOWED_EXTENSIONS)) {
    return {
      ok: false,
      error: `Type de fichier non autorisé (.${extension || "?"}). Formats acceptés : ${Object.keys(ALLOWED_EXTENSIONS).join(", ")}.`,
    };
  }
  return { ok: true, extension };
}

// Chemin disque relatif : "2026/08/<uuid>.pdf" — jamais le nom d'origine.
export function buildStoragePath(extension: string, now = new Date()): string {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}/${month}/${randomUUID()}.${extension}`;
}

export type SavedFile = typeof fileAttachments.$inferSelect;

// Enregistre un fichier uploadé : validation, écriture disque, ligne en base.
// Le rattachement métier (entityType/entityId) est fourni par le service appelant.
export async function saveUpload(
  actor: SessionUser,
  file: File,
  options: {
    entityType?: (typeof fileAttachments.$inferInsert)["entityType"];
    entityId?: string | null;
  } = {}
): Promise<SavedFile> {
  const validation = validateUpload({
    originalName: file.name,
    sizeBytes: file.size,
  });
  if (!validation.ok) throw new Error(validation.error);

  const buffer = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const storagePath = buildStoragePath(validation.extension);

  const absolute = path.join(uploadDir(), storagePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, buffer);

  return auditedInsert({ id: actor.id }, fileAttachments, {
    originalName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    sha256,
    storagePath,
    entityType: options.entityType ?? null,
    entityId: options.entityId ?? null,
    uploadedById: actor.id,
  });
}

export function fileReadStream(storagePath: string) {
  // storagePath vient de la base (généré par buildStoragePath) — jamais du
  // client — donc pas de traversal possible ; on verrouille quand même.
  const absolute = path.resolve(uploadDir(), storagePath);
  const root = path.resolve(uploadDir());
  if (!absolute.startsWith(root + path.sep)) {
    throw new Error("Chemin de fichier invalide.");
  }
  return createReadStream(absolute);
}

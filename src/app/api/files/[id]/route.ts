import { Readable } from "node:stream";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { fileAttachments } from "@/db/schema";
import { SESSION_COOKIE, validateSessionToken } from "@/lib/auth/session";
import { canDownloadFile } from "@/lib/files/access";
import { fileReadStream } from "@/lib/files/storage";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

// Téléchargement sécurisé : session + permission de l'entité parente.
// Les fichiers ne sont JAMAIS servis statiquement.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const user = token ? await validateSessionToken(token) : null;
  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const { id } = await params;
  const attachment = await db.query.fileAttachments.findFirst({
    where: eq(fileAttachments.id, id),
  });
  if (!attachment) {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }

  const { allowed, audit } = await canDownloadFile(user, attachment);
  if (!allowed) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  if (audit) {
    await logAuditEvent({
      userId: user.id,
      action: "DOWNLOAD",
      tableName: "file_attachments",
      recordId: attachment.id,
      snapshot: { originalName: attachment.originalName },
    });
  }

  const stream = fileReadStream(attachment.storagePath);
  const encodedName = encodeURIComponent(attachment.originalName);

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.sizeBytes),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE, validateSessionToken } from "@/lib/auth/session";
import { getBackupForDownload } from "@/services/backups.service";
import { logAuditEvent } from "@/lib/audit/log";
import { ForbiddenError } from "@/lib/authz/guards";

export const dynamic = "force-dynamic";

// Téléchargement d'un dump complet de la base : permission backup:manage,
// jamais servi statiquement, chaque téléchargement est audité.
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
  let backup;
  try {
    backup = await getBackupForDownload(user, id);
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }
    throw e;
  }
  if (!backup) {
    return NextResponse.json({ error: "Sauvegarde introuvable." }, { status: 404 });
  }

  await logAuditEvent({
    userId: user.id,
    action: "DOWNLOAD",
    tableName: "backups",
    recordId: backup.row.id,
    snapshot: { filename: backup.row.filename },
  });

  const stream = createReadStream(backup.absolutePath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      ...(backup.row.sizeBytes
        ? { "Content-Length": String(backup.row.sizeBytes) }
        : {}),
      "Content-Disposition": `attachment; filename="${backup.row.filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

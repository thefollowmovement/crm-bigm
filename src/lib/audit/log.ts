import "server-only";

import { db } from "@/lib/db/client";
import { auditLogs } from "@/db/schema";

type AuditAction = (typeof auditLogs.$inferInsert)["action"];

// Écriture directe d'un événement d'audit (connexions, téléchargements,
// imports…). Les écritures CRUD passent par les helpers audités (étape 4).
export async function logAuditEvent(input: {
  userId: string | null;
  action: AuditAction;
  tableName: string;
  recordId: string;
  changes?: unknown;
  snapshot?: unknown;
  ip?: string | null;
}) {
  await db.insert(auditLogs).values({
    userId: input.userId,
    action: input.action,
    tableName: input.tableName,
    recordId: input.recordId,
    changes: input.changes ?? null,
    snapshot: input.snapshot ?? null,
    ip: input.ip ?? null,
  });
}

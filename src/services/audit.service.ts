import "server-only";

import { and, desc, eq, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { auditLogs } from "@/db/schema";
import { assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";

const PAGE_SIZE = 50;

export type AuditFilters = {
  tableName?: string;
  action?: (typeof auditLogs.$inferSelect)["action"];
  userId?: string;
  recordId?: string;
  page?: number;
};

export async function listAuditLogs(actor: SessionUser, filters: AuditFilters = {}) {
  assertCan(actor, "audit:read");

  const conditions: SQL[] = [];
  if (filters.tableName) conditions.push(eq(auditLogs.tableName, filters.tableName));
  if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
  if (filters.userId) conditions.push(eq(auditLogs.userId, filters.userId));
  if (filters.recordId) conditions.push(eq(auditLogs.recordId, filters.recordId));
  const where = conditions.length ? and(...conditions) : undefined;

  const page = Math.max(1, filters.page ?? 1);
  const [rows, [{ count }]] = await Promise.all([
    db.query.auditLogs.findMany({
      where,
      orderBy: [desc(auditLogs.createdAt)],
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      with: {
        user: { columns: { firstName: true, lastName: true, email: true } },
      },
    }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(where ?? sql`true`),
  ]);

  return { rows, page, pageCount: Math.max(1, Math.ceil(count / PAGE_SIZE)), total: count };
}

// Historique d'un enregistrement précis (onglet « Historique » des fiches).
export async function listRecordHistory(
  actor: SessionUser,
  tableName: string,
  recordId: string
) {
  assertCan(actor, "audit:read");
  return db.query.auditLogs.findMany({
    where: and(eq(auditLogs.tableName, tableName), eq(auditLogs.recordId, recordId)),
    orderBy: [desc(auditLogs.createdAt)],
    limit: 100,
    with: { user: { columns: { firstName: true, lastName: true, email: true } } },
  });
}

// Tables présentes dans le journal (pour le filtre de la page d'audit).
export async function listAuditedTables(actor: SessionUser): Promise<string[]> {
  assertCan(actor, "audit:read");
  const rows = await db
    .selectDistinct({ tableName: auditLogs.tableName })
    .from(auditLogs);
  return rows.map((r) => r.tableName).sort();
}

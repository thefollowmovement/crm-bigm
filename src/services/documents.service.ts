import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { documentVersions, documents } from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { assertCan, ForbiddenError } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { saveUpload } from "@/lib/files/storage";

type Role = SessionUser["role"];
type DocumentRow = typeof documents.$inferSelect;

// Un document est visible si :
// - visibleToRoles vide → tous les rôles SIÈGE (jamais FRANCHISE) ;
// - sinon → rôles listés uniquement (FRANCHISE inclus s'il est listé).
export function isDocumentVisible(doc: Pick<DocumentRow, "visibleToRoles">, role: Role) {
  if (role === "ADMIN" || role === "DIRECTION") return true;
  if (doc.visibleToRoles.length === 0) return role !== "FRANCHISE";
  return doc.visibleToRoles.includes(role);
}

export async function listDocuments(
  actor: SessionUser,
  filters: { category?: DocumentRow["category"]; includeArchived?: boolean } = {}
) {
  assertCan(actor, "document:read");
  const conditions = [
    filters.category ? eq(documents.category, filters.category) : undefined,
    filters.includeArchived ? undefined : eq(documents.isArchived, false),
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  const rows = await db.query.documents.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [asc(documents.title)],
    with: {
      currentVersion: {
        with: { file: { columns: { id: true, originalName: true, sizeBytes: true } } },
      },
    },
  });
  return rows.filter((d) => isDocumentVisible(d, actor.role));
}

export async function getDocument(actor: SessionUser, documentId: string) {
  assertCan(actor, "document:read");
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, documentId),
    with: {
      versions: {
        orderBy: [desc(documentVersions.versionNumber)],
        with: {
          file: { columns: { id: true, originalName: true, sizeBytes: true } },
          uploadedBy: { columns: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!doc) return null;
  if (!isDocumentVisible(doc, actor.role)) {
    throw new ForbiddenError("Document hors de votre périmètre.");
  }
  return doc;
}

export async function createDocument(
  actor: SessionUser,
  input: {
    title: string;
    category: DocumentRow["category"];
    notes: string | null;
    visibleToRoles: Role[];
    effectiveDate: string | null;
    changeNote: string | null;
    file: File;
  }
) {
  assertCan(actor, "document:write");
  const file = await saveUpload(actor, input.file);
  const doc = await auditedInsert({ id: actor.id }, documents, {
    title: input.title,
    category: input.category,
    notes: input.notes,
    visibleToRoles: input.visibleToRoles,
  });
  const version = await auditedInsert({ id: actor.id }, documentVersions, {
    documentId: doc.id,
    versionNumber: 1,
    fileId: file.id,
    changeNote: input.changeNote,
    effectiveDate: input.effectiveDate,
    uploadedById: actor.id,
  });
  return auditedUpdate({ id: actor.id }, documents, doc.id, {
    currentVersionId: version.id,
  });
}

export async function addDocumentVersion(
  actor: SessionUser,
  documentId: string,
  input: { file: File; changeNote: string | null; effectiveDate: string | null }
) {
  assertCan(actor, "document:write");
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, documentId),
    with: { versions: { orderBy: [desc(documentVersions.versionNumber)], limit: 1 } },
  });
  if (!doc) throw new Error("Document introuvable.");

  const file = await saveUpload(actor, input.file);
  const nextNumber = (doc.versions[0]?.versionNumber ?? 0) + 1;
  const version = await auditedInsert({ id: actor.id }, documentVersions, {
    documentId,
    versionNumber: nextNumber,
    fileId: file.id,
    changeNote: input.changeNote,
    effectiveDate: input.effectiveDate,
    uploadedById: actor.id,
  });
  // La nouvelle version devient la version applicable.
  return auditedUpdate({ id: actor.id }, documents, documentId, {
    currentVersionId: version.id,
  });
}

export async function updateDocumentMeta(
  actor: SessionUser,
  documentId: string,
  input: {
    title?: string;
    category?: DocumentRow["category"];
    notes?: string | null;
    visibleToRoles?: Role[];
    isArchived?: boolean;
  }
) {
  assertCan(actor, "document:write");
  return auditedUpdate({ id: actor.id }, documents, documentId, input);
}

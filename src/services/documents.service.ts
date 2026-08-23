import "server-only";

import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { documentFolders, documentVersions, documents } from "@/db/schema";
import { auditedDelete, auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { assertCan, ForbiddenError } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { saveUpload } from "@/lib/files/storage";

type Role = SessionUser["role"];
type DocumentRow = typeof documents.$inferSelect;

// Un document est visible si :
// - visibleToRoles vide → tous les rôles SIÈGE (jamais FRANCHISE ni SALARIE) ;
// - sinon → rôles listés uniquement (FRANCHISE inclus s'il est listé).
export function isDocumentVisible(doc: Pick<DocumentRow, "visibleToRoles">, role: Role) {
  if (role === "ADMIN" || role === "DIRECTION") return true;
  if (doc.visibleToRoles.length === 0) {
    return role !== "FRANCHISE" && role !== "SALARIE";
  }
  return doc.visibleToRoles.includes(role);
}

export async function listDocuments(
  actor: SessionUser,
  filters: {
    category?: DocumentRow["category"];
    includeArchived?: boolean;
    // undefined = tous les dossiers ; null = racine ; id = ce dossier.
    folderId?: string | null;
  } = {}
) {
  assertCan(actor, "document:read");
  const conditions = [
    filters.category ? eq(documents.category, filters.category) : undefined,
    filters.includeArchived ? undefined : eq(documents.isArchived, false),
    filters.folderId === undefined
      ? undefined
      : filters.folderId === null
        ? isNull(documents.folderId)
        : eq(documents.folderId, filters.folderId),
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
    folderId?: string | null;
    file: File;
  }
) {
  assertCan(actor, "document:write");
  if (input.folderId) await assertFolderExists(input.folderId);
  const file = await saveUpload(actor, input.file);
  const doc = await auditedInsert({ id: actor.id }, documents, {
    title: input.title,
    category: input.category,
    notes: input.notes,
    visibleToRoles: input.visibleToRoles,
    folderId: input.folderId ?? null,
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

// ── Dossiers de classement (étape 32) ────────────────────────────

async function assertFolderExists(folderId: string) {
  const folder = await db.query.documentFolders.findFirst({
    where: eq(documentFolders.id, folderId),
  });
  if (!folder) throw new Error("Dossier introuvable.");
  return folder;
}

async function assertNameFree(name: string, parentId: string | null) {
  const dup = await db.query.documentFolders.findFirst({
    where: and(
      eq(documentFolders.name, name),
      parentId === null
        ? isNull(documentFolders.parentId)
        : eq(documentFolders.parentId, parentId)
    ),
  });
  if (dup) throw new Error("Un dossier de ce nom existe déjà à cet endroit.");
}

// Les dossiers sont une structure de classement : visibles de quiconque lit la
// bibliothèque (les documents, eux, restent filtrés par rôle).
export async function listFolders(actor: SessionUser) {
  assertCan(actor, "document:read");
  return db.query.documentFolders.findMany({
    orderBy: [asc(documentFolders.name)],
  });
}

export async function createFolder(
  actor: SessionUser,
  input: { name: string; parentId: string | null }
) {
  assertCan(actor, "document:folder");
  if (input.parentId) await assertFolderExists(input.parentId);
  await assertNameFree(input.name, input.parentId);
  return auditedInsert({ id: actor.id }, documentFolders, {
    name: input.name,
    parentId: input.parentId,
    createdById: actor.id,
  });
}

export async function renameFolder(
  actor: SessionUser,
  folderId: string,
  name: string
) {
  assertCan(actor, "document:folder");
  const folder = await assertFolderExists(folderId);
  if (folder.name !== name) await assertNameFree(name, folder.parentId);
  return auditedUpdate({ id: actor.id }, documentFolders, folderId, { name });
}

// Suppression uniquement à vide : ni sous-dossier, ni document (pas de
// suppression en cascade silencieuse dans une bibliothèque de référence).
export async function deleteFolder(actor: SessionUser, folderId: string) {
  assertCan(actor, "document:folder");
  await assertFolderExists(folderId);
  const [child, doc] = await Promise.all([
    db.query.documentFolders.findFirst({
      where: eq(documentFolders.parentId, folderId),
    }),
    db.query.documents.findFirst({ where: eq(documents.folderId, folderId) }),
  ]);
  if (child || doc) {
    throw new Error(
      "Le dossier n'est pas vide : déplacez d'abord son contenu."
    );
  }
  await auditedDelete({ id: actor.id }, documentFolders, folderId);
}

export async function moveDocument(
  actor: SessionUser,
  documentId: string,
  folderId: string | null
) {
  assertCan(actor, "document:write");
  if (folderId) await assertFolderExists(folderId);
  return auditedUpdate({ id: actor.id }, documents, documentId, { folderId });
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

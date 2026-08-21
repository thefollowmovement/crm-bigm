import { beforeEach, afterAll, describe, expect, it } from "vitest";

import { pool } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import { canDownloadFile } from "@/lib/files/access";
import {
  addDocumentVersion,
  createDocument,
  getDocument,
  isDocumentVisible,
  listDocuments,
} from "@/services/documents.service";
import { resetDb } from "./setup/reset-db";
import { createTestUser } from "../helpers/factories";

function pdfFile(name = "test.pdf"): File {
  return new File([Buffer.from("%PDF-1.4 contenu de test")], name, {
    type: "application/pdf",
  });
}

function asSession(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: SessionUser["role"];
  pole: SessionUser["pole"];
  franchiseeId: string | null;
}): SessionUser {
  return { ...user };
}

describe("bibliothèque documentaire", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("crée un document : la v1 devient la version applicable", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const doc = await createDocument(admin, {
      title: "Procédure ouverture",
      category: "PROCEDURE",
      notes: null,
      visibleToRoles: [],
      effectiveDate: "2026-01-01",
      changeNote: null,
      file: pdfFile(),
    });

    const detail = await getDocument(admin, doc.id);
    expect(detail?.versions).toHaveLength(1);
    expect(detail?.currentVersionId).toBe(detail?.versions[0].id);
    expect(detail?.versions[0].versionNumber).toBe(1);
  });

  it("ajoute une v2 qui devient applicable, la v1 restant consultable", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const doc = await createDocument(admin, {
      title: "Charte graphique",
      category: "COMMUNICATION",
      notes: null,
      visibleToRoles: [],
      effectiveDate: null,
      changeNote: null,
      file: pdfFile("v1.pdf"),
    });

    await addDocumentVersion(admin, doc.id, {
      file: pdfFile("v2.pdf"),
      changeNote: "Nouveau logo",
      effectiveDate: "2026-09-01",
    });

    const detail = await getDocument(admin, doc.id);
    expect(detail?.versions.map((v) => v.versionNumber)).toEqual([2, 1]);
    const current = detail?.versions.find((v) => v.id === detail.currentVersionId);
    expect(current?.versionNumber).toBe(2);
    expect(current?.file.originalName).toBe("v2.pdf");
  });

  it("applique les règles de visibilité par rôle", () => {
    // vide = tout le siège, jamais les franchisés
    expect(isDocumentVisible({ visibleToRoles: [] }, "RH")).toBe(true);
    expect(isDocumentVisible({ visibleToRoles: [] }, "FRANCHISE")).toBe(false);
    // restreint = rôles listés + direction/admin
    expect(isDocumentVisible({ visibleToRoles: ["RH"] }, "ANIMATION")).toBe(false);
    expect(isDocumentVisible({ visibleToRoles: ["RH"] }, "RH")).toBe(true);
    expect(isDocumentVisible({ visibleToRoles: ["RH"] }, "ADMIN")).toBe(true);
    // partagé franchisés
    expect(isDocumentVisible({ visibleToRoles: ["FRANCHISE"] }, "FRANCHISE")).toBe(true);
  });

  it("filtre la liste et bloque la fiche selon la visibilité", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const rhOnly = await createDocument(admin, {
      title: "Grille salaires",
      category: "RH",
      notes: null,
      visibleToRoles: ["RH"],
      effectiveDate: null,
      changeNote: null,
      file: pdfFile(),
    });

    const animation = asSession(await createTestUser({ role: "ANIMATION" }));
    const rh = asSession(await createTestUser({ role: "RH" }));

    expect((await listDocuments(animation)).map((d) => d.id)).not.toContain(rhOnly.id);
    expect((await listDocuments(rh)).map((d) => d.id)).toContain(rhOnly.id);
    await expect(getDocument(animation, rhOnly.id)).rejects.toThrow(ForbiddenError);
  });

  it("contrôle le téléchargement des fichiers de versions", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const siege = await createDocument(admin, {
      title: "Doc interne siège",
      category: "PROCEDURE",
      notes: null,
      visibleToRoles: [],
      effectiveDate: null,
      changeNote: null,
      file: pdfFile(),
    });
    const partage = await createDocument(admin, {
      title: "Doc partagé franchisés",
      category: "FORMATION",
      notes: null,
      visibleToRoles: ["FRANCHISE"],
      effectiveDate: null,
      changeNote: null,
      file: pdfFile(),
    });

    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: null })
    );

    const siegeDetail = await getDocument(admin, siege.id);
    const partageDetail = await getDocument(admin, partage.id);
    const siegeFile = siegeDetail!.versions[0].file;
    const partageFile = partageDetail!.versions[0].file;

    const { db } = await import("@/lib/db/client");
    const { fileAttachments } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const [siegeAttachment] = await db
      .select()
      .from(fileAttachments)
      .where(eq(fileAttachments.id, siegeFile.id));
    const [partageAttachment] = await db
      .select()
      .from(fileAttachments)
      .where(eq(fileAttachments.id, partageFile.id));

    expect((await canDownloadFile(franchise, siegeAttachment)).allowed).toBe(false);
    expect((await canDownloadFile(franchise, partageAttachment)).allowed).toBe(true);
    expect((await canDownloadFile(admin, siegeAttachment))).toEqual({
      allowed: true,
      audit: true,
    });
  });
});

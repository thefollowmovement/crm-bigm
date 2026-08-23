import { beforeEach, afterAll, describe, expect, it } from "vitest";

import { pool } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  createDocument,
  createFolder,
  deleteFolder,
  listDocuments,
  listFolders,
  moveDocument,
  renameFolder,
} from "@/services/documents.service";
import { resetDb } from "./setup/reset-db";
import { createTestUser } from "../helpers/factories";

function asSession(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: SessionUser["role"];
  pole: SessionUser["pole"];
  franchiseeId: string | null;
}): SessionUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    pole: user.pole,
    franchiseeId: user.franchiseeId,
  };
}

function pdf(name = "doc.pdf") {
  return new File([Buffer.from("%PDF-1.4\n")], name, { type: "application/pdf" });
}

const baseDoc = {
  category: "PROCEDURE" as const,
  notes: null,
  visibleToRoles: [],
  effectiveDate: null,
  changeNote: null,
};

describe("dossiers documentaires", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("création réservée à document:folder ; unicité du nom par niveau", async () => {
    const direction = asSession(
      await createTestUser({ role: "DIRECTION", pole: "DIRECTION" })
    );
    const communication = asSession(
      await createTestUser({ role: "COMMUNICATION", pole: "COMMUNICATION" })
    );

    // La communication publie des documents mais ne crée pas de dossiers.
    await expect(
      createFolder(communication, { name: "Interdit", parentId: null })
    ).rejects.toThrow(ForbiddenError);

    const racine = await createFolder(direction, {
      name: "Juridique",
      parentId: null,
    });
    await expect(
      createFolder(direction, { name: "Juridique", parentId: null })
    ).rejects.toThrow(/existe déjà/);

    // Le même nom est permis à un AUTRE niveau.
    const sous = await createFolder(direction, {
      name: "Juridique",
      parentId: racine.id,
    });
    expect(sous.parentId).toBe(racine.id);

    await expect(
      renameFolder(direction, sous.id, "Juridique")
    ).resolves.toBeDefined(); // renommer vers son propre nom : sans effet
    const autre = await createFolder(direction, {
      name: "Baux",
      parentId: racine.id,
    });
    await expect(renameFolder(direction, autre.id, "Juridique")).rejects.toThrow(
      /existe déjà/
    );

    // La lecture des dossiers suit document:read (structure visible de tous).
    expect(await listFolders(communication)).toHaveLength(3);
  });

  it("classement des documents : filtre par dossier, déplacement, suppression à vide", async () => {
    const direction = asSession(
      await createTestUser({ role: "DIRECTION", pole: "DIRECTION" })
    );
    const dossier = await createFolder(direction, {
      name: "Procédures",
      parentId: null,
    });

    const range = await createDocument(direction, {
      ...baseDoc,
      title: "Ouverture caisse",
      folderId: dossier.id,
      file: pdf(),
    });
    const racineDoc = await createDocument(direction, {
      ...baseDoc,
      title: "Note générale",
      file: pdf(),
    });

    // Racine : seul le document non classé ; dossier : seul le document rangé.
    const atRoot = await listDocuments(direction, { folderId: null });
    expect(atRoot.map((d) => d.id)).toEqual([racineDoc.id]);
    const inFolder = await listDocuments(direction, { folderId: dossier.id });
    expect(inFolder.map((d) => d.id)).toEqual([range.id]);
    // Sans filtre : tout.
    expect(await listDocuments(direction)).toHaveLength(2);

    // Impossible de supprimer un dossier non vide (document ou sous-dossier).
    await expect(deleteFolder(direction, dossier.id)).rejects.toThrow(
      /n'est pas vide/
    );

    await moveDocument(direction, range.id, null);
    expect(await listDocuments(direction, { folderId: dossier.id })).toHaveLength(0);

    const sous = await createFolder(direction, {
      name: "Sous-dossier",
      parentId: dossier.id,
    });
    await expect(deleteFolder(direction, dossier.id)).rejects.toThrow(
      /n'est pas vide/
    );
    await deleteFolder(direction, sous.id);
    await deleteFolder(direction, dossier.id);
    expect(await listFolders(direction)).toHaveLength(0);
  });
});

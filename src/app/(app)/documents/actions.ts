"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  addDocumentVersion,
  createDocument,
  updateDocumentMeta,
} from "@/services/documents.service";

const categorySchema = z.enum([
  "JURIDIQUE",
  "PROCEDURE",
  "RH",
  "COMPTABILITE",
  "COMMUNICATION",
  "FORMATION",
  "MARKETING",
  "AUTRE",
]);

const roleSchema = z.enum([
  "ADMIN",
  "DIRECTION",
  "COMPTABILITE",
  "RH",
  "ANIMATION",
  "COMMUNICATION",
  "DEVELOPPEMENT",
  "FRANCHISE",
]);

const fileSchema = z.custom<File>(
  (v) => v instanceof File && v.size > 0,
  "Fichier requis"
);

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
  .nullable();

export const createDocumentAction = safeFormAction(
  {
    permission: "document:write",
    schema: z.object({
      title: z.string().trim().min(1, "Titre requis"),
      category: categorySchema,
      notes: z.string().nullable(),
      visibleToRoles: z.array(roleSchema),
      effectiveDate: dateString,
      changeNote: z.string().nullable(),
      file: fileSchema,
    }),
    prepare: (formData) => ({
      title: formData.get("title"),
      category: formData.get("category"),
      notes: nullable(formData.get("notes")),
      visibleToRoles: formData.getAll("visibleToRoles"),
      effectiveDate: nullable(formData.get("effectiveDate")),
      changeNote: nullable(formData.get("changeNote")),
      file: formData.get("file"),
    }),
  },
  async (input, actor) => {
    await createDocument(actor, input);
    revalidatePath("/documents");
    return `Document « ${input.title} » ajouté.`;
  }
);

export const addVersionAction = safeFormAction(
  {
    permission: "document:write",
    schema: z.object({
      documentId: z.string().uuid(),
      changeNote: z.string().nullable(),
      effectiveDate: dateString,
      file: fileSchema,
    }),
    prepare: (formData) => ({
      documentId: formData.get("documentId"),
      changeNote: nullable(formData.get("changeNote")),
      effectiveDate: nullable(formData.get("effectiveDate")),
      file: formData.get("file"),
    }),
  },
  async ({ documentId, ...input }, actor) => {
    await addDocumentVersion(actor, documentId, input);
    revalidatePath(`/documents/${documentId}`);
    revalidatePath("/documents");
    return "Nouvelle version ajoutée — elle devient la version applicable.";
  }
);

export const setArchivedAction = safeFormAction(
  {
    permission: "document:write",
    schema: z.object({
      documentId: z.string().uuid(),
      isArchived: z.enum(["true", "false"]),
    }),
    prepare: (formData) => ({
      documentId: formData.get("documentId"),
      isArchived: formData.get("isArchived"),
    }),
  },
  async ({ documentId, isArchived }, actor) => {
    await updateDocumentMeta(actor, documentId, {
      isArchived: isArchived === "true",
    });
    revalidatePath(`/documents/${documentId}`);
    revalidatePath("/documents");
    return isArchived === "true" ? "Document archivé." : "Document restauré.";
  }
);

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import { htmlToText, sanitizeHtml } from "@/lib/html/sanitize";
import {
  addVisitAttachments,
  createCriterion,
  createVisit,
  finalizeVisit,
  setAuditItem,
  updateCriterion,
  updateVisitReport,
} from "@/services/visits.service";
import {
  createExpenseClaim,
  decideExpenseClaim,
} from "@/services/expense-claims.service";

const visitTypeSchema = z.enum([
  "AUDIT",
  "VISITE_COURTOISIE",
  "OUVERTURE",
  "FORMATION",
  "NOUVEAU_PRODUIT",
  "INTERVENTION",
]);

const filesField = z.array(z.custom<File>((v) => v instanceof File));

function extractFiles(formData: FormData): File[] {
  return formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
}

export const createVisitAction = safeFormAction(
  {
    permission: "visit:write",
    schema: z.object({
      storeId: z.string().uuid("Choisissez une boutique"),
      type: visitTypeSchema,
      visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
      report: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      storeId: formData.get("storeId"),
      type: formData.get("type"),
      visitDate: formData.get("visitDate"),
      report: nullable(formData.get("report")),
    }),
  },
  async (input, actor) => {
    await createVisit(actor, input);
    revalidatePath("/animation/visites");
    return "Visite créée — complétez-la puis finalisez-la.";
  }
);

// Compte rendu riche (étape 54) : le HTML de l'éditeur est SANITISÉ ici,
// avant le service — liste blanche stricte, images internes uniquement.
export const updateReportAction = safeFormAction(
  {
    permission: "visit:write",
    schema: z.object({
      visitId: z.string().uuid(),
      report: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      visitId: formData.get("visitId"),
      report: nullable(formData.get("report")),
    }),
  },
  async (input, actor) => {
    const sanitized = input.report ? sanitizeHtml(input.report) : null;
    const isEmpty =
      sanitized !== null &&
      htmlToText(sanitized) === "" &&
      !sanitized.includes("<img ");
    await updateVisitReport(actor, input.visitId, isEmpty ? null : sanitized);
    revalidatePath(`/animation/visites/${input.visitId}`);
    return "Compte rendu enregistré.";
  }
);

// Grille de notation : toutes les lignes saisies d'un coup (boucle auditée
// item par item — règle CLAUDE.md n°3).
export const saveAuditItemsAction = safeFormAction(
  {
    permission: "visit:write",
    schema: z.object({
      visitId: z.string().uuid(),
      items: z
        .array(
          z.object({
            criterionId: z.string().uuid(),
            score: z.number().int().min(0),
            isCompliant: z.boolean(),
            comment: z.string().nullable(),
          })
        )
        .min(1, "Aucune note saisie."),
    }),
    prepare: (formData) => ({
      visitId: formData.get("visitId"),
      items: JSON.parse((formData.get("items") as string) ?? "[]"),
    }),
  },
  async (input, actor) => {
    for (const item of input.items) {
      await setAuditItem(actor, input.visitId, item);
    }
    revalidatePath(`/animation/visites/${input.visitId}`);
    return "Grille d'audit enregistrée.";
  }
);

export const finalizeVisitAction = safeFormAction(
  {
    permission: "visit:write",
    schema: z.object({ visitId: z.string().uuid() }),
  },
  async (input, actor) => {
    await finalizeVisit(actor, input.visitId);
    revalidatePath(`/animation/visites/${input.visitId}`);
    revalidatePath("/animation/visites");
    return "Visite finalisée.";
  }
);

export const addVisitFilesAction = safeFormAction(
  {
    permission: "visit:write",
    schema: z.object({
      visitId: z.string().uuid(),
      // Titre libre (étape 54) affiché à la place du nom de fichier.
      title: z.string().trim().nullable(),
      files: filesField.min(1, "Choisissez au moins un fichier."),
    }),
    prepare: (formData) => ({
      visitId: formData.get("visitId"),
      title: nullable(formData.get("title")),
      files: extractFiles(formData),
    }),
  },
  async (input, actor) => {
    const count = await addVisitAttachments(
      actor,
      input.visitId,
      input.files,
      input.title
    );
    revalidatePath(`/animation/visites/${input.visitId}`);
    return `${count} pièce${count > 1 ? "s" : ""} jointe${count > 1 ? "s" : ""} ajoutée${count > 1 ? "s" : ""}.`;
  }
);

// ── Notes de frais de la visite (étape 54) ───────────────────────

const claimAmount = z
  .string()
  .trim()
  .regex(/^\d{1,10}(?:[.,]\d{1,2})?$/, "Montant invalide (ex. 45,90)")
  .transform((v) => v.replace(",", "."));

export const createExpenseClaimAction = safeFormAction(
  {
    permission: "visit:write",
    schema: z.object({
      visitId: z.string().uuid(),
      title: z.string().trim().min(1, "Titre requis"),
      amountTTC: claimAmount,
      note: z.string().trim().nullable(),
      files: filesField,
    }),
    prepare: (formData) => ({
      visitId: formData.get("visitId"),
      title: formData.get("title"),
      amountTTC: formData.get("amountTTC"),
      note: nullable(formData.get("note")),
      files: extractFiles(formData),
    }),
  },
  async ({ visitId, files, ...input }, actor) => {
    await createExpenseClaim(actor, visitId, input, files);
    revalidatePath(`/animation/visites/${visitId}`);
    return "Note de frais enregistrée — en attente de validation.";
  }
);

export const decideExpenseClaimAction = safeFormAction(
  {
    permission: "visit:write",
    schema: z.object({
      claimId: z.string().uuid(),
      visitId: z.string().uuid(),
      approve: z.enum(["true", "false"]),
    }),
  },
  async (input, actor) => {
    await decideExpenseClaim(actor, input.claimId, input.approve === "true");
    revalidatePath(`/animation/visites/${input.visitId}`);
    return input.approve === "true"
      ? "Note de frais validée — transmise à la comptabilité."
      : "Note de frais refusée.";
  }
);

export const createCriterionAction = safeFormAction(
  {
    permission: "visit:write",
    schema: z.object({
      label: z.string().trim().min(1, "Libellé requis"),
      category: z.string().trim().nullable(),
      maxScore: z.coerce.number().int().min(1, "Barème invalide"),
    }),
    prepare: (formData) => ({
      label: formData.get("label"),
      category: nullable(formData.get("category")),
      maxScore: formData.get("maxScore"),
    }),
  },
  async (input, actor) => {
    await createCriterion(actor, input);
    revalidatePath("/animation/visites");
    return "Critère ajouté à la grille.";
  }
);

export const toggleCriterionAction = safeFormAction(
  {
    permission: "visit:write",
    schema: z.object({
      id: z.string().uuid(),
      isActive: z.enum(["true", "false"]),
    }),
  },
  async (input, actor) => {
    await updateCriterion(actor, input.id, { isActive: input.isActive === "true" });
    revalidatePath("/animation/visites");
    return input.isActive === "true" ? "Critère réactivé." : "Critère désactivé.";
  }
);

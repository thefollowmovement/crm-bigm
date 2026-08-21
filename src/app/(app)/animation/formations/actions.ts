"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  addParticipant,
  attachTrainingDocuments,
  createTraining,
  removeParticipant,
  transitionTraining,
  updateTrainingReport,
} from "@/services/trainings.service";

const trainingTypeSchema = z.enum([
  "INITIALE",
  "CONTINUE",
  "OUVERTURE",
  "NOUVEAU_PRODUIT",
  "HYGIENE",
  "AUTRE",
]);

const filesField = z.array(z.custom<File>((v) => v instanceof File));

function extractFiles(formData: FormData): File[] {
  return formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
}

export const createTrainingAction = safeFormAction(
  {
    permission: "training:write",
    schema: z.object({
      storeId: z.string().uuid("Choisissez une boutique"),
      type: trainingTypeSchema,
      trainingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
      trainerId: z.string().uuid().nullable(),
      notes: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      storeId: formData.get("storeId"),
      type: formData.get("type"),
      trainingDate: formData.get("trainingDate"),
      trainerId: nullable(formData.get("trainerId")),
      notes: nullable(formData.get("notes")),
    }),
  },
  async (input, actor) => {
    await createTraining(actor, input);
    revalidatePath("/animation/formations");
    return "Formation planifiée.";
  }
);

export const updateTrainingReportAction = safeFormAction(
  {
    permission: "training:write",
    schema: z.object({
      trainingId: z.string().uuid(),
      report: z.string().trim().nullable(),
      notes: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      trainingId: formData.get("trainingId"),
      report: nullable(formData.get("report")),
      notes: nullable(formData.get("notes")),
    }),
  },
  async (input, actor) => {
    await updateTrainingReport(actor, input.trainingId, {
      report: input.report,
      notes: input.notes,
    });
    revalidatePath(`/animation/formations/${input.trainingId}`);
    return "Compte rendu enregistré.";
  }
);

export const transitionTrainingAction = safeFormAction(
  {
    permission: "training:write",
    schema: z.object({
      trainingId: z.string().uuid(),
      status: z.enum(["PLANIFIEE", "REALISEE", "VALIDEE", "ANNULEE"]),
    }),
  },
  async (input, actor) => {
    await transitionTraining(actor, input.trainingId, input.status);
    revalidatePath(`/animation/formations/${input.trainingId}`);
    revalidatePath("/animation/formations");
    return "Statut mis à jour.";
  }
);

export const addParticipantAction = safeFormAction(
  {
    permission: "training:write",
    schema: z.object({
      trainingId: z.string().uuid(),
      name: z.string().trim().min(1, "Nom requis"),
    }),
  },
  async (input, actor) => {
    await addParticipant(actor, input.trainingId, input.name);
    revalidatePath(`/animation/formations/${input.trainingId}`);
    return "Participant ajouté.";
  }
);

export const removeParticipantAction = safeFormAction(
  {
    permission: "training:write",
    schema: z.object({ participantId: z.string().uuid() }),
  },
  async (input, actor) => {
    await removeParticipant(actor, input.participantId);
    revalidatePath("/animation/formations");
    return "Participant retiré.";
  }
);

export const attachTrainingDocsAction = safeFormAction(
  {
    permission: "training:write",
    schema: z.object({
      trainingId: z.string().uuid(),
      kind: z.enum(["REMIS", "SIGNE"]),
      files: filesField.min(1, "Choisissez au moins un fichier."),
    }),
    prepare: (formData) => ({
      trainingId: formData.get("trainingId"),
      kind: formData.get("kind"),
      files: extractFiles(formData),
    }),
  },
  async (input, actor) => {
    const count = await attachTrainingDocuments(
      actor,
      input.trainingId,
      input.kind,
      input.files
    );
    revalidatePath(`/animation/formations/${input.trainingId}`);
    return `${count} document${count > 1 ? "s" : ""} rattaché${count > 1 ? "s" : ""}.`;
  }
);

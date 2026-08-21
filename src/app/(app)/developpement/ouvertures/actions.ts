"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  addChecklistItem,
  attachStepFiles,
  createProject,
  deleteChecklistItem,
  setChecklistItemStatus,
  transitionStep,
  updateProject,
  updateStep,
} from "@/services/openings.service";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const isFile = (v: unknown) => v instanceof File;
const filesField = z.array(z.custom<File>(isFile)).min(1, "Fichier requis");

const poleSchema = z.enum([
  "DIRECTION",
  "COMPTABILITE",
  "RH",
  "ANIMATION",
  "COMMUNICATION",
  "DEVELOPPEMENT",
]);

export const createProjectAction = safeFormAction(
  {
    permission: "opening:write",
    schema: z.object({
      storeId: z.string().uuid("Choisissez une boutique"),
      targetOpeningDate: dateString.nullable(),
      notes: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      storeId: nullable(formData.get("storeId")),
      targetOpeningDate: nullable(formData.get("targetOpeningDate")),
      notes: nullable(formData.get("notes")),
    }),
  },
  async (input, actor) => {
    await createProject(actor, input);
    revalidatePath("/developpement/ouvertures");
    return "Projet d'ouverture créé (8 jalons générés).";
  }
);

export const updateProjectAction = safeFormAction(
  {
    permission: "opening:write",
    schema: z.object({
      projectId: z.string().uuid(),
      status: z.enum(["EN_COURS", "TERMINE", "ABANDONNE"]),
      targetOpeningDate: dateString.nullable(),
      notes: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      projectId: formData.get("projectId"),
      status: formData.get("status"),
      targetOpeningDate: nullable(formData.get("targetOpeningDate")),
      notes: nullable(formData.get("notes")),
    }),
  },
  async (input, actor) => {
    const { projectId, ...fields } = input;
    await updateProject(actor, projectId, fields);
    revalidatePath(`/developpement/ouvertures/${projectId}`);
    revalidatePath("/developpement/ouvertures");
    return "Projet mis à jour.";
  }
);

export const updateStepAction = safeFormAction(
  {
    permission: "opening:write",
    schema: z.object({
      projectId: z.string().uuid(),
      stepId: z.string().uuid(),
      plannedDate: dateString.nullable(),
      notes: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      projectId: formData.get("projectId"),
      stepId: formData.get("stepId"),
      plannedDate: nullable(formData.get("plannedDate")),
      notes: nullable(formData.get("notes")),
    }),
  },
  async (input, actor) => {
    await updateStep(actor, input.stepId, {
      plannedDate: input.plannedDate,
      notes: input.notes,
    });
    revalidatePath(`/developpement/ouvertures/${input.projectId}`);
    return "Jalon mis à jour.";
  }
);

export const transitionStepAction = safeFormAction(
  {
    permission: "opening:write",
    schema: z.object({
      projectId: z.string().uuid(),
      stepId: z.string().uuid(),
      status: z.enum(["A_VENIR", "EN_COURS", "TERMINEE", "BLOQUEE"]),
    }),
  },
  async (input, actor) => {
    await transitionStep(actor, input.stepId, input.status);
    revalidatePath(`/developpement/ouvertures/${input.projectId}`);
    revalidatePath("/developpement/ouvertures");
    return "Statut du jalon mis à jour.";
  }
);

export const attachStepFilesAction = safeFormAction(
  {
    permission: "opening:write",
    schema: z.object({
      projectId: z.string().uuid(),
      stepId: z.string().uuid(),
      files: filesField,
    }),
    prepare: (formData) => ({
      projectId: formData.get("projectId"),
      stepId: formData.get("stepId"),
      files: formData
        .getAll("files")
        .filter((f): f is File => f instanceof File && f.size > 0),
    }),
  },
  async (input, actor) => {
    await attachStepFiles(actor, input.stepId, input.files);
    revalidatePath(`/developpement/ouvertures/${input.projectId}`);
    return "Pièce jointe ajoutée au jalon.";
  }
);

export const addChecklistItemAction = safeFormAction(
  {
    permission: "opening:checklist",
    schema: z.object({
      projectId: z.string().uuid(),
      label: z.string().trim().min(1, "Intitulé requis"),
      pole: poleSchema,
      dueDate: dateString.nullable(),
    }),
    prepare: (formData) => ({
      projectId: formData.get("projectId"),
      label: formData.get("label"),
      pole: formData.get("pole"),
      dueDate: nullable(formData.get("dueDate")),
    }),
  },
  async (input, actor) => {
    await addChecklistItem(actor, input.projectId, {
      label: input.label,
      pole: input.pole,
      assigneeId: null,
      dueDate: input.dueDate,
    });
    revalidatePath(`/developpement/ouvertures/${input.projectId}`);
    return "Item ajouté à la checklist.";
  }
);

export const setChecklistItemStatusAction = safeFormAction(
  {
    permission: "opening:checklist",
    schema: z.object({
      projectId: z.string().uuid(),
      itemId: z.string().uuid(),
      status: z.enum(["A_FAIRE", "EN_ATTENTE", "BLOQUE", "TERMINE"]),
    }),
  },
  async (input, actor) => {
    await setChecklistItemStatus(actor, input.itemId, input.status);
    revalidatePath(`/developpement/ouvertures/${input.projectId}`);
    return "Checklist mise à jour.";
  }
);

export const deleteChecklistItemAction = safeFormAction(
  {
    permission: "opening:checklist",
    schema: z.object({
      projectId: z.string().uuid(),
      itemId: z.string().uuid(),
    }),
  },
  async (input, actor) => {
    await deleteChecklistItem(actor, input.itemId);
    revalidatePath(`/developpement/ouvertures/${input.projectId}`);
    return "Item supprimé.";
  }
);

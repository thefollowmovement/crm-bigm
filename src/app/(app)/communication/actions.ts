"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  addCommTaskComment,
  assignCommTask,
  createCommTask,
  formatCommTaskNumber,
  transitionCommTask,
} from "@/services/comm-tasks.service";

const typeSchema = z.enum([
  "DEMANDE",
  "CREATION",
  "CAMPAGNE",
  "VIDEO",
  "RESEAUX_SOCIAUX",
  "ADS",
  "AUTRE",
]);

const statusSchema = z.enum([
  "NOUVEAU",
  "AFFECTE",
  "EN_COURS",
  "EN_ATTENTE",
  "TERMINE",
  "VALIDE",
]);

const filesField = z.array(z.custom<File>((v) => v instanceof File));

function extractFiles(formData: FormData): File[] {
  return formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
}

export const createCommTaskAction = safeFormAction(
  {
    permission: "commtask:request",
    schema: z.object({
      type: typeSchema,
      title: z.string().trim().min(1, "Objet requis"),
      description: z.string().trim().nullable(),
      storeId: z.string().uuid().nullable(),
      partnerId: z.string().uuid().nullable(),
      priority: z.enum(["BASSE", "NORMALE", "HAUTE", "CRITIQUE"]),
      dueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
        .nullable(),
      publicationDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
        .nullable(),
      files: filesField,
    }),
    prepare: (formData) => ({
      type: formData.get("type"),
      title: formData.get("title"),
      description: nullable(formData.get("description")),
      storeId: nullable(formData.get("storeId")),
      partnerId: nullable(formData.get("partnerId")),
      priority: formData.get("priority"),
      dueDate: nullable(formData.get("dueDate")),
      publicationDate: nullable(formData.get("publicationDate")),
      files: extractFiles(formData),
    }),
  },
  async (input, actor) => {
    const task = await createCommTask(actor, input);
    revalidatePath("/communication");
    return `Tâche ${formatCommTaskNumber(task.number)} créée.`;
  }
);

export const assignCommTaskAction = safeFormAction(
  {
    permission: "commtask:write",
    schema: z.object({
      taskId: z.string().uuid(),
      assigneeId: z.string().uuid("Choisissez un responsable"),
    }),
  },
  async (input, actor) => {
    await assignCommTask(actor, input.taskId, input.assigneeId);
    revalidatePath(`/communication/${input.taskId}`);
    return "Responsable affecté.";
  }
);

export const transitionCommTaskAction = safeFormAction(
  {
    // la validation par le demandeur (franchisé compris) passe par
    // commtask:read : la machine à états tranche dans le service
    permission: "commtask:read",
    schema: z.object({
      taskId: z.string().uuid(),
      status: statusSchema,
    }),
  },
  async (input, actor) => {
    await transitionCommTask(actor, input.taskId, input.status);
    revalidatePath(`/communication/${input.taskId}`);
    revalidatePath("/communication");
    return "Statut mis à jour.";
  }
);

export const addCommTaskCommentAction = safeFormAction(
  {
    permission: "commtask:read",
    schema: z.object({
      taskId: z.string().uuid(),
      body: z.string().trim().min(1, "Commentaire vide"),
    }),
  },
  async (input, actor) => {
    await addCommTaskComment(actor, input.taskId, input.body);
    revalidatePath(`/communication/${input.taskId}`);
    return "Commentaire ajouté.";
  }
);

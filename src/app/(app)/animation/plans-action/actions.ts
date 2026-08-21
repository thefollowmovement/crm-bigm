"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  addPlanComment,
  assignPlan,
  createPlan,
  formatPlanNumber,
  transitionPlan,
} from "@/services/action-plans.service";

const statusSchema = z.enum(["A_FAIRE", "EN_COURS", "TERMINE", "VALIDE", "ANNULE"]);

const filesField = z.array(z.custom<File>((v) => v instanceof File));

function extractFiles(formData: FormData): File[] {
  return formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
}

export const createPlanAction = safeFormAction(
  {
    permission: "actionplan:write",
    schema: z.object({
      storeId: z.string().uuid("Choisissez une boutique"),
      visitId: z.string().uuid().nullable(),
      title: z.string().trim().min(1, "Titre requis"),
      description: z.string().trim().nullable(),
      priority: z.enum(["BASSE", "NORMALE", "HAUTE", "CRITIQUE"]),
      assigneeId: z.string().uuid().nullable(),
      dueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
        .nullable(),
      files: filesField,
    }),
    prepare: (formData) => ({
      storeId: formData.get("storeId"),
      visitId: nullable(formData.get("visitId")),
      title: formData.get("title"),
      description: nullable(formData.get("description")),
      priority: formData.get("priority"),
      assigneeId: nullable(formData.get("assigneeId")),
      dueDate: nullable(formData.get("dueDate")),
      files: extractFiles(formData),
    }),
  },
  async (input, actor) => {
    const plan = await createPlan(actor, input);
    revalidatePath("/animation/plans-action");
    return `Plan d'action ${formatPlanNumber(plan.number)} créé.`;
  }
);

export const assignPlanAction = safeFormAction(
  {
    permission: "actionplan:write",
    schema: z.object({
      planId: z.string().uuid(),
      assigneeId: z.string().uuid("Choisissez un responsable"),
    }),
  },
  async (input, actor) => {
    await assignPlan(actor, input.planId, input.assigneeId);
    revalidatePath(`/animation/plans-action/${input.planId}`);
    return "Responsable affecté.";
  }
);

export const transitionPlanAction = safeFormAction(
  {
    permission: "actionplan:write",
    schema: z.object({
      planId: z.string().uuid(),
      status: statusSchema,
    }),
  },
  async (input, actor) => {
    await transitionPlan(actor, input.planId, input.status);
    revalidatePath(`/animation/plans-action/${input.planId}`);
    revalidatePath("/animation/plans-action");
    return "Statut mis à jour.";
  }
);

export const addPlanCommentAction = safeFormAction(
  {
    permission: "actionplan:write",
    schema: z.object({
      planId: z.string().uuid(),
      body: z.string().trim().min(1, "Commentaire vide"),
    }),
  },
  async (input, actor) => {
    await addPlanComment(actor, input.planId, input.body);
    revalidatePath(`/animation/plans-action/${input.planId}`);
    return "Commentaire ajouté.";
  }
);

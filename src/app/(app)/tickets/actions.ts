"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  addTicketComment,
  assignTicket,
  createTicket,
  transitionTicket,
} from "@/services/tickets.service";

const poleSchema = z.enum([
  "DIRECTION",
  "COMPTABILITE",
  "RH",
  "ANIMATION",
  "COMMUNICATION",
  "DEVELOPPEMENT",
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

export const createTicketAction = safeFormAction(
  {
    permission: "ticket:write",
    schema: z.object({
      title: z.string().trim().min(1, "Objet requis"),
      description: z.string().trim().min(1, "Description requise"),
      toPole: poleSchema,
      storeId: z.string().uuid().nullable(),
      priority: z.enum(["BASSE", "NORMALE", "HAUTE", "CRITIQUE"]),
      dueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
        .nullable(),
      assigneeId: z.string().uuid().nullable(),
      files: filesField,
    }),
    prepare: (formData) => ({
      title: formData.get("title"),
      description: formData.get("description"),
      toPole: formData.get("toPole"),
      storeId: nullable(formData.get("storeId")),
      priority: formData.get("priority"),
      dueDate: nullable(formData.get("dueDate")),
      assigneeId: nullable(formData.get("assigneeId")),
      files: extractFiles(formData),
    }),
  },
  async (input, actor) => {
    const ticket = await createTicket(actor, input);
    revalidatePath("/tickets");
    return `Ticket T-${String(ticket.number).padStart(6, "0")} créé.`;
  }
);

export const assignTicketAction = safeFormAction(
  {
    permission: "ticket:write",
    schema: z.object({
      ticketId: z.string().uuid(),
      assigneeId: z.string().uuid("Choisissez un responsable"),
    }),
    prepare: (formData) => ({
      ticketId: formData.get("ticketId"),
      assigneeId: nullable(formData.get("assigneeId")),
    }),
  },
  async ({ ticketId, assigneeId }, actor) => {
    await assignTicket(actor, ticketId, assigneeId);
    revalidatePath(`/tickets/${ticketId}`);
    revalidatePath("/tickets");
    return "Ticket affecté.";
  }
);

export const transitionTicketAction = safeFormAction(
  {
    permission: "ticket:write",
    schema: z.object({ ticketId: z.string().uuid(), status: statusSchema }),
    prepare: (formData) => ({
      ticketId: formData.get("ticketId"),
      status: formData.get("status"),
    }),
  },
  async ({ ticketId, status }, actor) => {
    await transitionTicket(actor, ticketId, status);
    revalidatePath(`/tickets/${ticketId}`);
    revalidatePath("/tickets");
    return "Statut mis à jour.";
  }
);

export const addCommentAction = safeFormAction(
  {
    permission: "ticket:write",
    schema: z.object({
      ticketId: z.string().uuid(),
      body: z.string().trim().min(1, "Commentaire vide"),
    }),
    prepare: (formData) => ({
      ticketId: formData.get("ticketId"),
      body: formData.get("body"),
    }),
  },
  async ({ ticketId, body }, actor) => {
    await addTicketComment(actor, ticketId, body);
    revalidatePath(`/tickets/${ticketId}`);
    return "Commentaire ajouté.";
  }
);

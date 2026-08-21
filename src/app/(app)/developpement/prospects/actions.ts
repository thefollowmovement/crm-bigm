"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  addProspectEvent,
  attachProspectFiles,
  changeProspectStatus,
  createProspect,
  updateProspect,
} from "@/services/prospects.service";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const amountString = z
  .string()
  .trim()
  .regex(/^\d+(?:[.,]\d{1,2})?$/, "Montant invalide (ex. 1234,56)")
  .transform((v) => v.replace(",", "."));
const isFile = (v: unknown) => v instanceof File;
const filesField = z.array(z.custom<File>(isFile)).min(1, "Fichier requis");

const statusSchema = z.enum([
  "NOUVEAU",
  "CONTACTE",
  "QUALIFIE",
  "RDV",
  "DIP",
  "RECHERCHE_LOCAL",
  "CONTRAT",
  "OUVERTURE",
  "ABANDONNE",
]);

const prospectFields = z.object({
  firstName: z.string().trim().min(1, "Prénom requis"),
  lastName: z.string().trim().min(1, "Nom requis"),
  email: z.string().email("E-mail invalide").nullable(),
  phone: z.string().nullable(),
  city: z.string().trim().nullable(),
  targetZone: z.string().trim().nullable(),
  budget: amountString.nullable(),
  personalContribution: amountString.nullable(),
  leadSource: z.string().trim().nullable(),
  interestLevel: z.enum(["FAIBLE", "MOYEN", "FORT"]).nullable(),
  agentId: z.string().uuid().nullable(),
  assigneeId: z.string().uuid().nullable(),
  nextFollowUpDate: dateString.nullable(),
  notes: z.string().trim().nullable(),
});

function prepareProspect(formData: FormData) {
  return {
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: nullable(formData.get("email")),
    phone: nullable(formData.get("phone")),
    city: nullable(formData.get("city")),
    targetZone: nullable(formData.get("targetZone")),
    budget: nullable(formData.get("budget")),
    personalContribution: nullable(formData.get("personalContribution")),
    leadSource: nullable(formData.get("leadSource")),
    interestLevel: nullable(formData.get("interestLevel")),
    agentId: nullable(formData.get("agentId")),
    assigneeId: nullable(formData.get("assigneeId")),
    nextFollowUpDate: nullable(formData.get("nextFollowUpDate")),
    notes: nullable(formData.get("notes")),
  };
}

export const createProspectAction = safeFormAction(
  {
    permission: "development:write",
    schema: prospectFields,
    prepare: prepareProspect,
  },
  async (input, actor) => {
    await createProspect(actor, input);
    revalidatePath("/developpement/prospects");
    return "Prospect créé.";
  }
);

export const updateProspectAction = safeFormAction(
  {
    permission: "development:write",
    schema: prospectFields.extend({ prospectId: z.string().uuid() }),
    prepare: (formData) => ({
      ...prepareProspect(formData),
      prospectId: formData.get("prospectId"),
    }),
  },
  async (input, actor) => {
    const { prospectId, ...fields } = input;
    await updateProspect(actor, prospectId, fields);
    revalidatePath(`/developpement/prospects/${prospectId}`);
    revalidatePath("/developpement/prospects");
    return "Prospect mis à jour.";
  }
);

export const changeProspectStatusAction = safeFormAction(
  {
    permission: "development:write",
    schema: z.object({
      prospectId: z.string().uuid(),
      status: statusSchema,
      note: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      prospectId: formData.get("prospectId"),
      status: formData.get("status"),
      note: nullable(formData.get("note")),
    }),
  },
  async (input, actor) => {
    await changeProspectStatus(actor, input.prospectId, input.status, input.note);
    revalidatePath(`/developpement/prospects/${input.prospectId}`);
    revalidatePath("/developpement/prospects");
    return "Statut mis à jour (événement journalisé).";
  }
);

export const addProspectEventAction = safeFormAction(
  {
    permission: "development:write",
    schema: z.object({
      prospectId: z.string().uuid(),
      type: z.enum(["APPEL", "EMAIL", "RDV", "COURRIER", "NOTE"]),
      eventDate: dateString,
      notes: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      prospectId: formData.get("prospectId"),
      type: formData.get("type"),
      eventDate: formData.get("eventDate"),
      notes: nullable(formData.get("notes")),
    }),
  },
  async (input, actor) => {
    const { prospectId, ...fields } = input;
    await addProspectEvent(actor, prospectId, fields);
    revalidatePath(`/developpement/prospects/${prospectId}`);
    return "Événement ajouté.";
  }
);

export const uploadProspectFilesAction = safeFormAction(
  {
    permission: "development:write",
    schema: z.object({
      prospectId: z.string().uuid(),
      files: filesField,
    }),
    prepare: (formData) => ({
      prospectId: formData.get("prospectId"),
      files: formData
        .getAll("files")
        .filter((f): f is File => f instanceof File && f.size > 0),
    }),
  },
  async (input, actor) => {
    await attachProspectFiles(actor, input.prospectId, input.files);
    revalidatePath(`/developpement/prospects/${input.prospectId}`);
    return "Document ajouté au dossier.";
  }
);

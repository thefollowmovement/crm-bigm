"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  createProviderTicket,
  createProviderTransmission,
  postInvoiceMessage,
} from "@/services/providers.service";

const amountString = z
  .string()
  .trim()
  .regex(/^\d{1,10}(?:[.,]\d{1,2})?$/, "Montant invalide (ex. 1234,56)")
  .transform((v) => v.replace(",", "."));

const filesField = z.array(z.custom<File>((v) => v instanceof File));

const extractFiles = (formData: FormData): File[] =>
  formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);

// Dépôt d'une facture / note de frais / demande vers la comptabilité.
export const createProviderTransmissionAction = safeFormAction(
  {
    permission: "provider:portal",
    schema: z.object({
      type: z.enum(["FACTURE", "DEMANDE"]),
      caseType: z.enum(["FACTURE_FOURNISSEUR", "NOTE_DE_FRAIS", "AUTRE"]),
      subject: z.string().trim().min(1, "Objet requis"),
      amount: amountString.nullable(),
      message: z.string().trim().nullable(),
      files: filesField,
    }),
    prepare: (formData) => ({
      type: formData.get("type"),
      caseType: formData.get("caseType"),
      subject: formData.get("subject"),
      amount: nullable(formData.get("amount")),
      message: nullable(formData.get("message")),
      files: extractFiles(formData),
    }),
  },
  async ({ files, ...input }, actor) => {
    await createProviderTransmission(actor, input, files);
    revalidatePath("/prestataire");
    return "Dépôt transmis à la comptabilité.";
  }
);

// Message sur une facture (fil de discussion avec la compta).
export const postProviderMessageAction = safeFormAction(
  {
    permission: "provider:portal",
    schema: z.object({
      invoiceId: z.string().uuid(),
      body: z.string().trim().min(1, "Message vide"),
    }),
    prepare: (formData) => ({
      invoiceId: formData.get("invoiceId"),
      body: formData.get("body"),
    }),
  },
  async (input, actor) => {
    await postInvoiceMessage(actor, input.invoiceId, input.body);
    revalidatePath(`/prestataire/factures/${input.invoiceId}`);
    return "Message envoyé.";
  }
);

// Ticket de demande vers le pôle comptabilité.
export const createProviderTicketAction = safeFormAction(
  {
    permission: "provider:portal",
    schema: z.object({
      title: z.string().trim().min(1, "Titre requis"),
      description: z.string().trim().min(1, "Description requise"),
    }),
    prepare: (formData) => ({
      title: formData.get("title"),
      description: formData.get("description"),
    }),
  },
  async (input, actor) => {
    await createProviderTicket(actor, input);
    revalidatePath("/prestataire");
    return "Ticket envoyé à la comptabilité.";
  }
);

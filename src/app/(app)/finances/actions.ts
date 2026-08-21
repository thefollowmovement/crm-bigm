"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  addReminder,
  cancelInvoice,
  createInvoice,
  recordPayment,
} from "@/services/invoices.service";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const amountString = z
  .string()
  .trim()
  .regex(/^\d+(?:[.,]\d{1,2})?$/, "Montant invalide (ex. 1234,56)")
  .transform((v) => v.replace(",", "."));

const isNonEmptyFile = (v: unknown) => v instanceof File && v.size > 0;
const optionalFileSchema = z.custom<File>(isNonEmptyFile).nullable();

export const createInvoiceAction = safeFormAction(
  {
    permission: "finance:write",
    schema: z.object({
      storeId: z.string().uuid("Choisissez une boutique"),
      type: z.enum(["DROIT_ENTREE", "REDEVANCE", "REDEVANCE_COMMUNICATION", "AUTRE"]),
      label: z.string().trim().nullable(),
      periodStart: dateString.nullable(),
      periodEnd: dateString.nullable(),
      amountHT: amountString,
      vatRate: amountString,
      issuedAt: dateString,
      dueDate: dateString,
      notes: z.string().nullable(),
    }),
    prepare: (formData) => ({
      storeId: nullable(formData.get("storeId")),
      type: formData.get("type"),
      label: nullable(formData.get("label")),
      periodStart: nullable(formData.get("periodStart")),
      periodEnd: nullable(formData.get("periodEnd")),
      amountHT: formData.get("amountHT"),
      vatRate: formData.get("vatRate") ?? "20.00",
      issuedAt: formData.get("issuedAt"),
      dueDate: formData.get("dueDate"),
      notes: nullable(formData.get("notes")),
    }),
  },
  async (input, actor) => {
    const invoice = await createInvoice(actor, input);
    revalidatePath("/finances");
    return `Facture ${invoice.number} créée.`;
  }
);

export const recordPaymentAction = safeFormAction(
  {
    permission: "finance:write",
    schema: z.object({
      invoiceId: z.string().uuid(),
      amount: amountString,
      paidAt: dateString,
      method: z.enum(["VIREMENT", "PRELEVEMENT", "CHEQUE", "CB", "ESPECES", "AUTRE"]),
      reference: z.string().trim().nullable(),
      notes: z.string().nullable(),
    }),
    prepare: (formData) => ({
      invoiceId: formData.get("invoiceId"),
      amount: formData.get("amount"),
      paidAt: formData.get("paidAt"),
      method: formData.get("method"),
      reference: nullable(formData.get("reference")),
      notes: nullable(formData.get("notes")),
    }),
  },
  async ({ invoiceId, ...input }, actor) => {
    await recordPayment(actor, invoiceId, input);
    revalidatePath(`/finances/${invoiceId}`);
    revalidatePath("/finances");
    return "Paiement enregistré.";
  }
);

export const addReminderAction = safeFormAction(
  {
    permission: "finance:write",
    schema: z.object({
      invoiceId: z.string().uuid(),
      level: z.coerce.number().int().min(1).max(3),
      channel: z.enum(["EMAIL", "TELEPHONE", "COURRIER", "LRAR", "AUTRE"]),
      sentAt: dateString,
      notes: z.string().nullable(),
      file: optionalFileSchema,
    }),
    prepare: (formData) => {
      const file = formData.get("file");
      return {
        invoiceId: formData.get("invoiceId"),
        level: formData.get("level"),
        channel: formData.get("channel"),
        sentAt: formData.get("sentAt"),
        notes: nullable(formData.get("notes")),
        file: file instanceof File && file.size > 0 ? file : null,
      };
    },
  },
  async ({ invoiceId, ...input }, actor) => {
    await addReminder(actor, invoiceId, input);
    revalidatePath(`/finances/${invoiceId}`);
    return `Relance niveau ${input.level} enregistrée.`;
  }
);

export const cancelInvoiceAction = safeFormAction(
  {
    permission: "finance:write",
    schema: z.object({ invoiceId: z.string().uuid() }),
    prepare: (formData) => ({ invoiceId: formData.get("invoiceId") }),
  },
  async ({ invoiceId }, actor) => {
    await cancelInvoice(actor, invoiceId);
    revalidatePath(`/finances/${invoiceId}`);
    revalidatePath("/finances");
    return "Facture annulée.";
  }
);

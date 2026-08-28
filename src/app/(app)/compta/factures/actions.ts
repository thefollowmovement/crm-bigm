"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/current-user";
import { ForbiddenError, assertCan } from "@/lib/authz/guards";
import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  addInvoiceAttachments,
  createInvoice,
  importInvoices,
  sendInvoiceReminder,
  updateInvoice,
} from "@/services/acct-invoices.service";

const amountString = z
  .string()
  .trim()
  .regex(/^-?\d{1,10}(?:[.,]\d{1,2})?$/, "Montant invalide (ex. -1234,56)")
  .transform((v) => v.replace(",", "."));

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");

export const createInvoiceAction = safeFormAction(
  {
    permission: "accounting:write",
    schema: z.object({
      pieceNumber: z.string().trim().min(1, "N° de pièce requis"),
      pieceType: z.enum(["FACTURE", "AVOIR"]),
      invoiceType: z.enum(["STANDARD", "RFA"]),
      accountClass: z.enum(["CHARGE", "PRODUIT"]),
      pieceDate: dateString,
      dueDate: dateString.nullable(),
      structureId: z.string().uuid("Choisissez une structure"),
      amountHT: amountString,
      amountTTC: amountString,
      label: z.string().trim().nullable(),
      notes: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      pieceNumber: formData.get("pieceNumber"),
      pieceType: formData.get("pieceType"),
      invoiceType: formData.get("invoiceType"),
      accountClass: formData.get("accountClass"),
      pieceDate: formData.get("pieceDate"),
      dueDate: nullable(formData.get("dueDate")),
      structureId: formData.get("structureId"),
      amountHT: formData.get("amountHT"),
      amountTTC: formData.get("amountTTC"),
      label: nullable(formData.get("label")),
      notes: nullable(formData.get("notes")),
    }),
  },
  async (input, actor) => {
    await createInvoice(actor, input);
    revalidatePath("/compta/factures");
    revalidatePath("/compta/structures");
    return "Pièce enregistrée.";
  }
);

// Statut + classification : renseignés à la main par la compta (cdc §3.2).
export const updateInvoiceAction = safeFormAction(
  {
    permission: "accounting:write",
    schema: z.object({
      id: z.string().uuid(),
      status: z.enum(["EN_ATTENTE", "PAYEE", "EN_RETARD", "IMPAYEE", "ANNULEE"]),
      invoiceType: z.enum(["STANDARD", "RFA"]),
      accountClass: z.enum(["CHARGE", "PRODUIT"]),
      dueDate: dateString.nullable(),
      notes: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      id: formData.get("id"),
      status: formData.get("status"),
      invoiceType: formData.get("invoiceType"),
      accountClass: formData.get("accountClass"),
      dueDate: nullable(formData.get("dueDate")),
      notes: nullable(formData.get("notes")),
    }),
  },
  async ({ id, ...patch }, actor) => {
    await updateInvoice(actor, id, patch);
    revalidatePath("/compta/factures");
    revalidatePath("/compta/structures");
    return "Pièce mise à jour.";
  }
);

// Relance par e-mail d'une pièce non soldée (étape 52) — modèles de
// l'étape 43, envoyée à l'adresse de la structure.
export const sendInvoiceReminderAction = safeFormAction(
  {
    permission: "accounting:write",
    schema: z.object({
      invoiceId: z.string().uuid(),
      level: z.coerce.number().int().min(1).max(3),
    }),
    prepare: (formData) => ({
      invoiceId: formData.get("invoiceId"),
      level: formData.get("level"),
    }),
  },
  async (input, actor) => {
    const updated = await sendInvoiceReminder(actor, input.invoiceId, input.level);
    revalidatePath("/compta/factures");
    revalidatePath("/compta/structures");
    return `Relance niveau ${input.level} envoyée pour la pièce ${updated.pieceNumber}.`;
  }
);

// PJ d'une pièce du journal (étape 51) : facture scannée, justificatif…
const invoiceFilesField = z.array(z.custom<File>((v) => v instanceof File));

const extractInvoiceFiles = (formData: FormData): File[] =>
  formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);

export const addInvoiceFilesAction = safeFormAction(
  {
    permission: "accounting:write",
    schema: z.object({
      invoiceId: z.string().uuid(),
      files: invoiceFilesField.min(1, "Choisissez au moins un fichier."),
    }),
    prepare: (formData) => ({
      invoiceId: formData.get("invoiceId"),
      files: extractInvoiceFiles(formData),
    }),
  },
  async (input, actor) => {
    const count = await addInvoiceAttachments(actor, input.invoiceId, input.files);
    revalidatePath("/compta/factures");
    revalidatePath("/compta/structures");
    return `${count} document${count > 1 ? "s" : ""} ajouté${count > 1 ? "s" : ""}.`;
  }
);

export type InvoiceImportState = {
  error?: string;
  report?: {
    fileName: string;
    format: string;
    totalRows: number;
    created: number;
    updated: number;
    skipped: number;
    errors: { line: number; message: string }[];
  };
};

export async function importInvoicesAction(
  _prev: InvoiceImportState,
  formData: FormData
): Promise<InvoiceImportState> {
  const actor = await requireUser();
  try {
    assertCan(actor, "accounting:import");
  } catch (e) {
    return { error: e instanceof ForbiddenError ? e.message : "Accès refusé." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choisissez un fichier (.xlsx, .xls, .xlsb ou .csv)." };
  }
  const mode =
    formData.get("mode") === "METTRE_A_JOUR" ? "METTRE_A_JOUR" : "IGNORER";
  const accountClass =
    formData.get("accountClass") === "CHARGE" ? "CHARGE" : "PRODUIT";
  try {
    const report = await importInvoices(actor, file, mode, accountClass);
    revalidatePath("/compta/factures");
    revalidatePath("/compta/structures");
    return {
      report: {
        fileName: report.fileName,
        format: report.format,
        totalRows: report.totalRows,
        created: report.createdRows,
        updated: report.updatedRows,
        skipped: report.skippedRows,
        errors: (report.errors ?? []) as { line: number; message: string }[],
      },
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Erreur pendant l'import.",
    };
  }
}

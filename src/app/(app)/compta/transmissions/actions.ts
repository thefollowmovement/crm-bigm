"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/current-user";
import { ForbiddenError, assertCan } from "@/lib/authz/guards";
import { nullable, safeFormAction, type ActionState } from "@/lib/actions/safe-action";
import {
  changeTransmissionStatus,
  convertTransmissionToInvoice,
  createTransmission,
} from "@/services/transmissions.service";

const amountString = z
  .string()
  .trim()
  .regex(/^-?\d{1,10}(?:[.,]\d{1,2})?$/, "Montant invalide (ex. 1234,56)")
  .transform((v) => v.replace(",", "."));

const createSchema = z.object({
  type: z.enum(["DEMANDE", "FACTURE"]),
  caseType: z.enum([
    "FACTURE_INFLUENCEUR",
    "FACTURE_TICKET",
    "ACHAT_SUCCURSALE",
    "NOTE_DE_FRAIS",
    "QUITTANCE",
    "FACTURE_FOURNISSEUR",
    "AUTRE",
  ]),
  targetPole: z.enum([
    "DIRECTION",
    "COMPTABILITE",
    "RH",
    "ANIMATION",
    "COMMUNICATION",
    "DEVELOPPEMENT",
  ]),
  structureId: z.string().uuid().nullable(),
  storeId: z.string().uuid().nullable(),
  amount: amountString.nullable(),
  subject: z.string().trim().min(1, "Objet requis"),
  message: z.string().trim().nullable(),
});

// Création avec pièces jointes : action « brute » (le wrapper safeFormAction
// ne transporte pas les File), mêmes garde-fous session + permission + Zod.
export async function createTransmissionAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireUser();
  try {
    assertCan(actor, "transmission:create");
    const parsed = createSchema.safeParse({
      type: formData.get("type"),
      caseType: formData.get("caseType"),
      targetPole: formData.get("targetPole") ?? "COMPTABILITE",
      structureId: nullable(formData.get("structureId")),
      storeId: nullable(formData.get("storeId")),
      amount: nullable(formData.get("amount")),
      subject: formData.get("subject"),
      message: nullable(formData.get("message")),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Saisie invalide" };
    }
    const files = formData
      .getAll("files")
      .filter((f): f is File => f instanceof File && f.size > 0);
    await createTransmission(actor, parsed.data, files);
    revalidatePath("/compta/transmissions");
    return { success: "Transmission envoyée." };
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    if (e instanceof Error) return { error: e.message };
    return { error: "Une erreur est survenue." };
  }
}

export const changeTransmissionStatusAction = safeFormAction(
  {
    permission: "transmission:manage",
    schema: z.object({
      id: z.string().uuid(),
      status: z.enum(["EN_ATTENTE", "VALIDEE", "REJETEE", "TRAITEE"]),
      comment: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      id: formData.get("id"),
      status: formData.get("status"),
      comment: nullable(formData.get("comment")),
    }),
  },
  async (input, actor) => {
    await changeTransmissionStatus(actor, input.id, input.status, input.comment);
    revalidatePath("/compta/transmissions");
    revalidatePath(`/compta/transmissions/${input.id}`);
    return "Statut mis à jour.";
  }
);

export const convertTransmissionAction = safeFormAction(
  {
    permission: "accounting:write",
    schema: z.object({
      id: z.string().uuid(),
      pieceNumber: z.string().trim().min(1, "N° de pièce requis"),
      pieceType: z.enum(["FACTURE", "AVOIR"]),
      invoiceType: z.enum(["STANDARD", "RFA"]),
      accountClass: z.enum(["CHARGE", "PRODUIT"]),
      pieceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      structureId: z.string().uuid("Choisissez une structure"),
      amountHT: amountString,
      amountTTC: amountString,
    }),
    prepare: (formData) => ({
      id: formData.get("id"),
      pieceNumber: formData.get("pieceNumber"),
      pieceType: formData.get("pieceType"),
      invoiceType: formData.get("invoiceType"),
      accountClass: formData.get("accountClass"),
      pieceDate: formData.get("pieceDate"),
      dueDate: nullable(formData.get("dueDate")),
      structureId: formData.get("structureId"),
      amountHT: formData.get("amountHT"),
      amountTTC: formData.get("amountTTC"),
    }),
  },
  async ({ id, ...invoice }, actor) => {
    await convertTransmissionToInvoice(actor, id, invoice);
    revalidatePath("/compta/transmissions");
    revalidatePath(`/compta/transmissions/${id}`);
    revalidatePath("/compta/factures");
    return "Facture créée au journal, transmission traitée.";
  }
);

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  addContractAttachment,
  createContract,
  updateContract,
} from "@/services/contracts.service";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
  .nullable();

const fileSchema = z.custom<File>(
  (v) => v instanceof File && v.size > 0,
  "Fichier requis"
);

const contractSchema = z.object({
  storeId: z.string().uuid(),
  type: z.enum(["CONTRAT_FRANCHISE", "DIP", "AVENANT", "BAIL", "AUTRE"]),
  status: z.enum(["BROUILLON", "ACTIF", "EXPIRE", "RESILIE", "RENOUVELE"]),
  reference: z.string().trim().nullable(),
  signedAt: dateString,
  startDate: dateString,
  endDate: dateString,
  alertMonthsBefore: z.coerce.number().int().min(0).max(24),
  parentContractId: z.string().uuid().nullable(),
  notes: z.string().nullable(),
});

function prepareContract(formData: FormData) {
  const value = (k: string) => nullable(formData.get(k));
  return {
    storeId: formData.get("storeId"),
    type: formData.get("type"),
    status: formData.get("status"),
    reference: value("reference"),
    signedAt: value("signedAt"),
    startDate: value("startDate"),
    endDate: value("endDate"),
    alertMonthsBefore: formData.get("alertMonthsBefore") ?? 6,
    parentContractId: value("parentContractId"),
    notes: value("notes"),
  };
}

export const createContractAction = safeFormAction(
  { permission: "contract:write", schema: contractSchema, prepare: prepareContract },
  async (input, actor) => {
    await createContract(actor, input);
    revalidatePath(`/boutiques/${input.storeId}`);
    revalidatePath("/contrats");
    return "Contrat créé.";
  }
);

export const updateContractAction = safeFormAction(
  {
    permission: "contract:write",
    schema: contractSchema.extend({ contractId: z.string().uuid() }),
    prepare: (formData) => ({
      ...prepareContract(formData),
      contractId: formData.get("contractId"),
    }),
  },
  async ({ contractId, ...input }, actor) => {
    await updateContract(actor, contractId, input);
    revalidatePath(`/contrats/${contractId}`);
    revalidatePath("/contrats");
    return "Contrat mis à jour.";
  }
);

export const addContractAttachmentAction = safeFormAction(
  {
    permission: "contract:write",
    schema: z.object({
      contractId: z.string().uuid(),
      file: fileSchema,
    }),
    prepare: (formData) => ({
      contractId: formData.get("contractId"),
      file: formData.get("file"),
    }),
  },
  async ({ contractId, file }, actor) => {
    await addContractAttachment(actor, contractId, file);
    revalidatePath(`/contrats/${contractId}`);
    return "Document ajouté au contrat.";
  }
);

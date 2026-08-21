"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  attachPremisesFiles,
  createPremises,
  updatePremises,
} from "@/services/premises.service";

const amountString = z
  .string()
  .trim()
  .regex(/^\d+(?:[.,]\d{1,2})?$/, "Montant invalide (ex. 1234,56)")
  .transform((v) => v.replace(",", "."))
  .nullable();
const surfaceString = z
  .string()
  .trim()
  .regex(/^\d+(?:[.,]\d)?$/, "Surface invalide (ex. 85,5)")
  .transform((v) => v.replace(",", "."))
  .nullable();
const isFile = (v: unknown) => v instanceof File;
const filesField = z.array(z.custom<File>(isFile)).min(1, "Fichier requis");

const premisesFields = z.object({
  address: z.string().trim().min(1, "Adresse requise"),
  city: z.string().trim().min(1, "Ville requise"),
  postalCode: z.string().trim().nullable(),
  surfaceM2: surfaceString,
  monthlyRent: amountString,
  leaseRights: amountString,
  status: z.enum(["DISPONIBLE", "EN_NEGOCIATION", "RETENU", "ECARTE"]),
  agentId: z.string().uuid().nullable(),
  notes: z.string().trim().nullable(),
});

function preparePremises(formData: FormData) {
  return {
    address: formData.get("address"),
    city: formData.get("city"),
    postalCode: nullable(formData.get("postalCode")),
    surfaceM2: nullable(formData.get("surfaceM2")),
    monthlyRent: nullable(formData.get("monthlyRent")),
    leaseRights: nullable(formData.get("leaseRights")),
    status: formData.get("status") ?? "DISPONIBLE",
    agentId: nullable(formData.get("agentId")),
    notes: nullable(formData.get("notes")),
  };
}

export const createPremisesAction = safeFormAction(
  {
    permission: "development:write",
    schema: premisesFields,
    prepare: preparePremises,
  },
  async (input, actor) => {
    await createPremises(actor, input);
    revalidatePath("/developpement/locaux");
    return "Local ajouté à la base.";
  }
);

export const updatePremisesAction = safeFormAction(
  {
    permission: "development:write",
    schema: premisesFields.extend({ premisesId: z.string().uuid() }),
    prepare: (formData) => ({
      ...preparePremises(formData),
      premisesId: formData.get("premisesId"),
    }),
  },
  async (input, actor) => {
    const { premisesId, ...fields } = input;
    await updatePremises(actor, premisesId, fields);
    revalidatePath(`/developpement/locaux/${premisesId}`);
    revalidatePath("/developpement/locaux");
    return "Local mis à jour.";
  }
);

export const uploadPremisesFilesAction = safeFormAction(
  {
    permission: "development:write",
    schema: z.object({
      premisesId: z.string().uuid(),
      files: filesField,
    }),
    prepare: (formData) => ({
      premisesId: formData.get("premisesId"),
      files: formData
        .getAll("files")
        .filter((f): f is File => f instanceof File && f.size > 0),
    }),
  },
  async (input, actor) => {
    await attachPremisesFiles(actor, input.premisesId, input.files);
    revalidatePath(`/developpement/locaux/${input.premisesId}`);
    return "Photo / document ajouté.";
  }
);

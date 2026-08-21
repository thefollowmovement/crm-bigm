"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import { createFranchisee, updateFranchisee } from "@/services/franchisees.service";

const franchiseeSchema = z.object({
  companyName: z.string().trim().min(1, "Raison sociale requise"),
  legalForm: z.string().trim().nullable(),
  siren: z
    .string()
    .trim()
    .regex(/^\d{9}$/, "SIREN invalide (9 chiffres)")
    .nullable(),
  contactFirstName: z.string().trim().min(1, "Prénom du contact requis"),
  contactLastName: z.string().trim().min(1, "Nom du contact requis"),
  email: z.string().trim().email("E-mail invalide").nullable(),
  phone: z.string().trim().nullable(),
  address: z.string().trim().nullable(),
  postalCode: z.string().trim().nullable(),
  city: z.string().trim().nullable(),
  notes: z.string().nullable().optional(),
});

function prepareFranchisee(formData: FormData) {
  const value = (k: string) => nullable(formData.get(k));
  return {
    companyName: formData.get("companyName"),
    legalForm: value("legalForm"),
    siren: value("siren"),
    contactFirstName: formData.get("contactFirstName"),
    contactLastName: formData.get("contactLastName"),
    email: value("email"),
    phone: value("phone"),
    address: value("address"),
    postalCode: value("postalCode"),
    city: value("city"),
    notes: formData.has("notes")
      ? ((formData.get("notes") as string) || null)
      : undefined,
  };
}

export const createFranchiseeAction = safeFormAction(
  {
    permission: "franchisee:write",
    schema: franchiseeSchema,
    prepare: prepareFranchisee,
  },
  async (input, actor) => {
    await createFranchisee(actor, input);
    revalidatePath("/franchises");
    return `Franchisé « ${input.companyName} » créé.`;
  }
);

export const updateFranchiseeAction = safeFormAction(
  {
    permission: "franchisee:write",
    schema: franchiseeSchema.extend({ franchiseeId: z.string().uuid() }),
    prepare: (formData) => ({
      ...prepareFranchisee(formData),
      franchiseeId: formData.get("franchiseeId"),
    }),
  },
  async ({ franchiseeId, ...input }, actor) => {
    await updateFranchisee(actor, franchiseeId, input);
    revalidatePath("/franchises");
    revalidatePath(`/franchises/${franchiseeId}`);
    return "Fiche franchisé mise à jour.";
  }
);

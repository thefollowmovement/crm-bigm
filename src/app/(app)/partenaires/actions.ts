"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  createPartner,
  setPartnerStores,
  updatePartner,
} from "@/services/partners.service";

const partnerFields = {
  companyName: z.string().trim().min(1, "Raison sociale requise"),
  contactName: z.string().trim().nullable(),
  phone: z.string().trim().nullable(),
  email: z.string().trim().email("E-mail invalide").nullable(),
  domain: z.string().trim().nullable(),
  tariffNotes: z.string().trim().nullable(),
  scopeNotes: z.string().trim().nullable(),
  internalNotes: z.string().trim().nullable(),
};

function preparePartner(formData: FormData) {
  return {
    companyName: formData.get("companyName"),
    contactName: nullable(formData.get("contactName")),
    phone: nullable(formData.get("phone")),
    email: nullable(formData.get("email")),
    domain: nullable(formData.get("domain")),
    tariffNotes: nullable(formData.get("tariffNotes")),
    scopeNotes: nullable(formData.get("scopeNotes")),
    internalNotes: nullable(formData.get("internalNotes")),
  };
}

export const createPartnerAction = safeFormAction(
  {
    permission: "partner:write",
    schema: z.object(partnerFields),
    prepare: preparePartner,
  },
  async (input, actor) => {
    await createPartner(actor, input);
    revalidatePath("/partenaires");
    return "Partenaire créé.";
  }
);

export const updatePartnerAction = safeFormAction(
  {
    permission: "partner:write",
    schema: z.object({ partnerId: z.string().uuid(), ...partnerFields }),
    prepare: (formData) => ({
      partnerId: formData.get("partnerId"),
      ...preparePartner(formData),
    }),
  },
  async ({ partnerId, ...patch }, actor) => {
    await updatePartner(actor, partnerId, patch);
    revalidatePath(`/partenaires/${partnerId}`);
    return "Fiche partenaire enregistrée.";
  }
);

export const setPartnerStoresAction = safeFormAction(
  {
    permission: "partner:write",
    schema: z.object({
      partnerId: z.string().uuid(),
      storeIds: z.array(z.string().uuid()),
    }),
    prepare: (formData) => ({
      partnerId: formData.get("partnerId"),
      storeIds: JSON.parse((formData.get("storeIds") as string) ?? "[]"),
    }),
  },
  async (input, actor) => {
    await setPartnerStores(actor, input.partnerId, input.storeIds);
    revalidatePath(`/partenaires/${input.partnerId}`);
    return "Boutiques concernées mises à jour.";
  }
);

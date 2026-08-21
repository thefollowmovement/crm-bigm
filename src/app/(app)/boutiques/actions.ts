"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  createStore,
  setStorePlatforms,
  updateStore,
} from "@/services/stores.service";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
  .nullable();

const storeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Code requis (ex. BM-001)")
    .regex(/^[A-Za-z0-9-]+$/, "Code invalide : lettres, chiffres et tirets"),
  name: z.string().trim().min(1, "Nom requis"),
  type: z.enum(["FRANCHISE", "SUCCURSALE"]),
  status: z.enum(["EN_PROJET", "OUVERTE", "FERMEE_TEMPORAIREMENT", "FERMEE"]),
  franchiseeId: z.string().uuid().nullable(),
  animateurId: z.string().uuid().nullable(),
  address: z.string().trim().nullable(),
  postalCode: z.string().trim().nullable(),
  city: z.string().trim().nullable(),
  region: z.string().trim().nullable(),
  phone: z.string().trim().nullable(),
  email: z.string().trim().email("E-mail invalide").nullable(),
  siret: z.string().trim().nullable(),
  openingDate: dateString,
  closingDate: dateString,
  internalNotes: z.string().nullable().optional(),
});

function prepareStore(formData: FormData) {
  const value = (k: string) => nullable(formData.get(k));
  return {
    code: formData.get("code"),
    name: formData.get("name"),
    type: formData.get("type"),
    status: formData.get("status"),
    franchiseeId: value("franchiseeId"),
    animateurId: value("animateurId"),
    address: value("address"),
    postalCode: value("postalCode"),
    city: value("city"),
    region: value("region"),
    phone: value("phone"),
    email: value("email"),
    siret: value("siret"),
    openingDate: value("openingDate"),
    closingDate: value("closingDate"),
    // absent du formulaire pour les rôles sans accès aux notes internes
    internalNotes: formData.has("internalNotes")
      ? ((formData.get("internalNotes") as string) || null)
      : undefined,
  };
}

export const createStoreAction = safeFormAction(
  { permission: "store:write", schema: storeSchema, prepare: prepareStore },
  async (input, actor) => {
    const store = await createStore(actor, input);
    revalidatePath("/boutiques");
    return `Boutique ${store.code} créée.`;
  }
);

export const updateStoreAction = safeFormAction(
  {
    permission: "store:write",
    schema: storeSchema.extend({ storeId: z.string().uuid() }),
    prepare: (formData) => ({
      ...prepareStore(formData),
      storeId: formData.get("storeId"),
    }),
  },
  async ({ storeId, ...input }, actor) => {
    await updateStore(actor, storeId, input);
    revalidatePath("/boutiques");
    revalidatePath(`/boutiques/${storeId}`);
    return "Boutique mise à jour.";
  }
);

const platformsSchema = z.object({
  storeId: z.string().uuid(),
  platforms: z.array(
    z.object({
      platform: z.enum(["UBER_EATS", "DELIVEROO", "JUST_EAT", "AUTRE"]),
      label: z.string().nullable(),
      accountRef: z.string().nullable(),
      isActive: z.boolean(),
    })
  ),
});

export const setPlatformsAction = safeFormAction(
  {
    permission: "store:write",
    schema: platformsSchema,
    prepare: (formData) => ({
      storeId: formData.get("storeId"),
      platforms: JSON.parse((formData.get("platforms") as string) ?? "[]"),
    }),
  },
  async ({ storeId, platforms }, actor) => {
    await setStorePlatforms(actor, storeId, platforms);
    revalidatePath(`/boutiques/${storeId}`);
    return "Plateformes mises à jour.";
  }
);
